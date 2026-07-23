'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireWalletAccess, requireAdmin } from '@/app/lib/auth';
import { withdrawCoin } from '@/app/lib/stellar';
import {
  recordWithdrawRequest,
  getAdminEmails,
  getWithdrawById,
  completeWithdraw,
  rejectWithdraw,
  getUserName,
} from '@/app/lib/data-wallet';
import { sendWithdrawRequestEmail, sendWithdrawProcessedEmail } from '@/app/lib/email';

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

  await recordWithdrawRequest({ userId: user._id, amount, coin, destination, desc });

  // Notifica os administradores (best-effort).
  try {
    const admins = await getAdminEmails();
    if (admins.length > 0) {
      await sendWithdrawRequestEmail({
        admins,
        userName: user.name,
        userEmail: user.email,
        amount,
        coin,
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

  await completeWithdraw({ id, adminId: admin._id, txHash: result.hash, proof });

  try {
    const user = await getUserName(userId);
    if (user) {
      await sendWithdrawProcessedEmail({
        email: user.email,
        name: user.name,
        status: 'completed',
        amount,
        coin,
        destination: doc.destination || '',
        txHash: result.hash,
        proof,
      });
    }
  } catch (err) {
    console.error('Saque concluído, mas falhou ao enviar o email:', err);
  }

  revalidatePath('/dashboard/admin/withdraw');
  revalidatePath('/dashboard');
  return { success: true, message: `Saque de ${amount} ${coin} concluído.` };
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
      await sendWithdrawProcessedEmail({
        email: user.email,
        name: user.name,
        status: 'rejected',
        amount: String(doc.amount),
        coin: doc.coin,
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
