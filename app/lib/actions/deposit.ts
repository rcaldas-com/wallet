'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/app/lib/auth';
import { depositCoin, getAccountBalances } from '@/app/lib/stellar';
import { valueBalancesInBrl } from '@/app/lib/quotes';
import { recordDeposit, getUserName, getUserWalletKeys } from '@/app/lib/data-wallet';
import { sendDepositEmail } from '@/app/lib/email';

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

  // Registra no histórico.
  await recordDeposit({ userId, amount, coin, desc });

  // Envia o email de confirmação com o total atualizado (best-effort).
  try {
    const user = await getUserName(userId);
    if (user) {
      const keys = await getUserWalletKeys(userId);
      const allBalances = (
        await Promise.all(keys.map((k) => getAccountBalances(k.key)))
      ).flat();
      const { totalBrl } = await valueBalancesInBrl(allBalances);
      await sendDepositEmail({
        email: user.email,
        name: user.name,
        amount,
        coin,
        totalBrl,
        desc,
      });
    }
  } catch (err) {
    console.error('Depósito concluído, mas falhou ao enviar o email:', err);
  }

  revalidatePath('/dashboard');
  return {
    success: true,
    message: `Depósito de ${amount} ${coin} realizado com sucesso.`,
  };
}
