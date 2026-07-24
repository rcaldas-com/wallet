'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/app/lib/auth';
import { depositCoin } from '@/app/lib/stellar';
import { listWalletsForReading, readWallets } from '@/app/lib/wallets';
import { valueBalancesInBrl } from '@/app/lib/quotes';
import { recordDeposit, getUserName } from '@/app/lib/data-wallet';
import { sendDepositEmail } from '@/app/lib/email';
import { uploadReceiptFile } from '@/app/lib/file-upload';

export type DepositState = {
  success: boolean;
  message: string;
};

const DepositSchema = z.object({
  userId: z.string().min(1, { message: 'Selecione um usuário.' }),
  coin: z.string().min(1, { message: 'Selecione a moeda.' }),
  amount: z.string().min(1, { message: 'Informe a quantidade.' }),
  desc: z.string().optional(),
});

// Normaliza a quantidade: vírgula -> ponto, valida número positivo com até 7 casas.
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

export async function createDeposit(
  _prevState: DepositState,
  formData: FormData,
): Promise<DepositState> {
  try {
    await requireAdmin();
  } catch {
    return { success: false, message: 'Acesso restrito ao administrador.' };
  }

  const parsed = DepositSchema.safeParse({
    userId: formData.get('userId'),
    coin: formData.get('coin'),
    amount: formData.get('amount'),
    desc: formData.get('desc') || undefined,
  });
  if (!parsed.success) {
    const first = parsed.error.errors[0]?.message || 'Dados inválidos.';
    return { success: false, message: first };
  }

  const { userId, coin, desc } = parsed.data;
  const normalized = normalizeAmount(parsed.data.amount);
  if ('error' in normalized) {
    return { success: false, message: normalized.error };
  }
  const amount = normalized.value;

  // Executa o depósito on-chain (issuer -> usuário).
  const result = await depositCoin({ userId, coin, amount, desc });
  if (!result.ok) {
    return { success: false, message: result.error };
  }

  // Anexa o comprovante enviado pelo admin, se houver (best-effort).
  const receiptFileInput = formData.get('receiptFile');
  const { attachment: receiptFile, error: uploadError } = await uploadReceiptFile(
    receiptFileInput instanceof File ? receiptFileInput : null,
    `deposit-${userId}`,
  );

  // Registra no histórico.
  await recordDeposit({ userId, amount, coin, desc, receiptFile });

  // Envia o email de confirmação com o total atualizado (best-effort).
  try {
    const user = await getUserName(userId);
    if (user) {
      const reads = await readWallets(await listWalletsForReading({ userId }));
      // Mesmo corte de poeira (< R$5) usado no dashboard, pra "saldo total"
      // do email bater com o que o usuário vê no app.
      const { totalBrl } = await valueBalancesInBrl(reads.flatMap((r) => r.balances), 5);
      await sendDepositEmail({
        email: user.email,
        name: user.name,
        amount,
        coin,
        totalBrl,
        desc,
        receiptUrl: receiptFile?.url,
      });
    }
  } catch (err) {
    console.error('Depósito concluído, mas falhou ao enviar o email:', err);
  }

  revalidatePath('/dashboard');
  return {
    success: true,
    message: `Depósito de ${amount} ${coin} realizado com sucesso.${uploadError ? ` (${uploadError})` : ''}`,
  };
}
