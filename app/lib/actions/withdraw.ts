'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireWalletAccess, requireAdmin } from '@/app/lib/auth';
import { withdrawCoin, getCustodialCoinBalance } from '@/app/lib/stellar';
import {
  recordWithdrawRequest,
  getAdminEmails,
  getWithdrawById,
  completeWithdraw,
  rejectWithdraw,
  getUserName,
  getPendingWithdrawTotal,
  cancelWithdrawRequest,
} from '@/app/lib/data-wallet';
import { sendWithdrawRequestEmail, sendWithdrawProcessedEmail } from '@/app/lib/email';
import { uploadReceiptFile } from '@/app/lib/file-upload';
import { getCoinDisplayName } from '@/app/lib/coin-catalog';

export type WithdrawState = {
  success: boolean;
  message: string;
};

const WithdrawSchema = z.object({
  coin: z.string().min(1, { message: 'Selecione a moeda.' }),
  amount: z.string().min(1, { message: 'Informe a quantidade.' }),
  destination: z.string().min(3, { message: 'Informe o destino do saque.' }),
  desc: z.string().optional(),
});

function normalizeAmount(raw: string): { value: string } | { error: string } {
  const amount = raw.trim().replace(',', '.');
  if (amount.includes('.') && amount.split('.')[1].length > 7) {
    return { error: 'Máximo de 7 casas decimais.' };
  }
  const n = Number(amount);
  if (!isFinite(n) || n <= 0) {
    return { error: 'Quantidade inválida.' };
  }
  return { value: amount };
}

// --- Usuário: solicita o saque ---

export async function requestWithdraw(
  _prevState: WithdrawState,
  formData: FormData,
): Promise<WithdrawState> {
  let user;
  try {
    user = await requireWalletAccess();
  } catch {
    return { success: false, message: 'Sessão expirada ou sem acesso à carteira.' };
  }

  const parsed = WithdrawSchema.safeParse({
    coin: formData.get('coin'),
    amount: formData.get('amount'),
    destination: formData.get('destination'),
    desc: formData.get('desc') || undefined,
  });
  if (!parsed.success) {
    return { success: false, message: parsed.error.errors[0]?.message || 'Dados inválidos.' };
  }

  const normalized = normalizeAmount(parsed.data.amount);
  if ('error' in normalized) {
    return { success: false, message: normalized.error };
  }
  const amount = normalized.value;
  const { coin, destination, desc } = parsed.data;

  // Impede pedir mais do que o saldo disponível, já descontando outros pedidos
  // ainda pendentes da mesma moeda — sem isso dava pra solicitar o mesmo valor
  // várias vezes (cada pedido é independente e não reserva o saldo). Se o saldo
  // on-chain não puder ser lido (rede), segue: a baixa on-chain na confirmação
  // é a proteção final contra saque a descoberto.
  const balance = await getCustodialCoinBalance(user._id, coin);
  if (balance !== null) {
    const pending = await getPendingWithdrawTotal(user._id, coin);
    const available = balance - pending;
    const fmt = (n: number) => Number(n.toFixed(7)).toLocaleString('pt-BR', { maximumFractionDigits: 7 });
    if (Number(amount) > available + 1e-7) {
      const msg =
        pending > 0
          ? `Saldo insuficiente: você tem ${fmt(balance)} ${coin}, mas ${fmt(pending)} já está em pedidos de saque pendentes (disponível: ${fmt(Math.max(available, 0))} ${coin}).`
          : `Saldo insuficiente: disponível ${fmt(Math.max(available, 0))} ${coin}.`;
      return { success: false, message: msg };
    }
  }

  await recordWithdrawRequest({ userId: user._id, amount, coin, destination, desc });

  // Notifica os administradores (best-effort).
  try {
    const admins = await getAdminEmails();
    if (admins.length > 0) {
      const coinName = await getCoinDisplayName(coin);
      await sendWithdrawRequestEmail({
        admins,
        userName: user.name,
        userEmail: user.email,
        amount,
        coin,
        coinName,
        destination,
        desc,
      });
    }
  } catch (err) {
    console.error('Pedido de saque registrado, mas falhou ao notificar admin:', err);
  }

  revalidatePath('/dashboard');
  return {
    success: true,
    message: `Pedido de saque de ${amount} ${coin} enviado. Você será avisado quando for processado.`,
  };
}

// --- Usuário: cancela o próprio pedido enquanto ainda está pendente ---

export async function cancelWithdraw(id: string): Promise<WithdrawState> {
  let user;
  try {
    user = await requireWalletAccess();
  } catch {
    return { success: false, message: 'Sessão expirada ou sem acesso à carteira.' };
  }
  if (!id) return { success: false, message: 'Pedido inválido.' };

  const ok = await cancelWithdrawRequest({ id, userId: user._id });
  if (!ok) {
    return { success: false, message: 'Não foi possível cancelar — o pedido já pode ter sido processado.' };
  }

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/admin/withdraw');
  return { success: true, message: 'Pedido de saque cancelado.' };
}

// --- Admin: confirma o saque (devolve o token ao issuer) ---

export async function confirmWithdraw(
  _prevState: WithdrawState,
  formData: FormData,
): Promise<WithdrawState> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return { success: false, message: 'Acesso restrito ao administrador.' };
  }

  const id = String(formData.get('id') || '');
  const proof = String(formData.get('proof') || '').trim();
  if (!id) return { success: false, message: 'Pedido inválido.' };

  const doc = await getWithdrawById(id);
  if (!doc) return { success: false, message: 'Pedido não encontrado.' };
  if (doc.status !== 'requested') {
    return { success: false, message: 'Este pedido já foi processado.' };
  }

  const userId = doc.user?.toString();
  if (!userId) {
    return { success: false, message: 'Pedido sem usuário associado.' };
  }
  const amount = String(doc.amount);
  const coin = doc.coin as string;

  // Baixa on-chain: token volta do usuário para o issuer.
  const result = await withdrawCoin({ userId, coin, amount });
  if (!result.ok) {
    return { success: false, message: result.error };
  }

  const proofFileInput = formData.get('proofFile');
  const { attachment: proofFile, error: uploadError } = await uploadReceiptFile(
    proofFileInput instanceof File ? proofFileInput : null,
    `withdraw-${id}`,
  );

  await completeWithdraw({ id, adminId: admin._id, txHash: result.hash, proof, proofFile });

  try {
    const user = await getUserName(userId);
    if (user) {
      const coinName = await getCoinDisplayName(coin);
      await sendWithdrawProcessedEmail({
        email: user.email,
        name: user.name,
        status: 'completed',
        amount,
        coin,
        coinName,
        destination: doc.destination || '',
        txHash: result.hash,
        proof,
        proofFileUrl: proofFile?.url,
      });
    }
  } catch (err) {
    console.error('Saque concluído, mas falhou ao enviar o email:', err);
  }

  revalidatePath('/dashboard/admin/withdraw');
  revalidatePath('/dashboard');
  return {
    success: true,
    message: `Saque de ${amount} ${coin} concluído.${uploadError ? ` (${uploadError})` : ''}`,
  };
}

// --- Admin: rejeita o pedido (nada acontece on-chain) ---

export async function declineWithdraw(
  _prevState: WithdrawState,
  formData: FormData,
): Promise<WithdrawState> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return { success: false, message: 'Acesso restrito ao administrador.' };
  }

  const id = String(formData.get('id') || '');
  const reason = String(formData.get('reason') || '').trim();
  if (!id) return { success: false, message: 'Pedido inválido.' };
  if (!reason) return { success: false, message: 'Informe o motivo da recusa.' };

  const doc = await getWithdrawById(id);
  if (!doc) return { success: false, message: 'Pedido não encontrado.' };
  if (doc.status !== 'requested') {
    return { success: false, message: 'Este pedido já foi processado.' };
  }

  await rejectWithdraw({ id, adminId: admin._id, reason });

  try {
    const userId = doc.user?.toString();
    const user = userId ? await getUserName(userId) : null;
    if (user) {
      const coinName = await getCoinDisplayName(doc.coin);
      await sendWithdrawProcessedEmail({
        email: user.email,
        name: user.name,
        status: 'rejected',
        amount: String(doc.amount),
        coin: doc.coin,
        coinName,
        destination: doc.destination || '',
        reason,
      });
    }
  } catch (err) {
    console.error('Saque recusado, mas falhou ao enviar o email:', err);
  }

  revalidatePath('/dashboard/admin/withdraw');
  return { success: true, message: 'Pedido recusado.' };
}
