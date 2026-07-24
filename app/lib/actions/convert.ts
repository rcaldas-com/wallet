'use server';

import { revalidatePath } from 'next/cache';
import { requireWalletAccess } from '@/app/lib/auth';
import { executeConversion } from '@/app/lib/stellar';
import { getBrlPrice, getBrlValue } from '@/app/lib/quotes';
import { listIssuerKeys, recordConversion } from '@/app/lib/data-wallet';

export type ConvertState = {
  success: boolean;
  message: string;
};

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

// Mesmo corte de casas decimais aceito pela rede, sem zeros sobrando.
function formatAmount(n: number): string {
  const fixed = n.toFixed(7);
  return fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
}

export async function requestConversion(
  _prevState: ConvertState,
  formData: FormData,
): Promise<ConvertState> {
  let user;
  try {
    user = await requireWalletAccess();
  } catch {
    return { success: false, message: 'Sessão expirada ou sem acesso à carteira.' };
  }

  const fromCoin = String(formData.get('fromCoin') || '');
  const toCoin = String(formData.get('toCoin') || '');
  if (!fromCoin || !toCoin) {
    return { success: false, message: 'Selecione as moedas.' };
  }
  if (fromCoin === toCoin) {
    return { success: false, message: 'Escolha moedas diferentes.' };
  }

  const normalized = normalizeAmount(String(formData.get('amount') || ''));
  if ('error' in normalized) {
    return { success: false, message: normalized.error };
  }
  const amountFrom = normalized.value;

  // Preço de referência recalculado aqui no servidor — a prévia mostrada no
  // formulário é só informativa, o valor final de verdade sai desta conta.
  const issuers = await listIssuerKeys();
  const issuerByName = new Map(issuers.map((i) => [i.name, i.publicKey]));

  const amountFromBrl = await getBrlValue(fromCoin, Number(amountFrom), issuerByName.get(fromCoin));
  const toPrice = await getBrlPrice(toCoin, issuerByName.get(toCoin));
  if (toPrice === null || toPrice <= 0) {
    return { success: false, message: `Não foi possível cotar ${toCoin} no momento. Tente novamente.` };
  }
  const amountTo = formatAmount(amountFromBrl / toPrice);

  const result = await executeConversion({
    userId: user._id,
    fromCoin,
    toCoin,
    amountFrom,
    amountTo,
  });
  if (!result.ok) {
    return { success: false, message: result.error };
  }

  await recordConversion({ userId: user._id, fromCoin, amountFrom, toCoin, amountTo });

  revalidatePath('/dashboard');
  return {
    success: true,
    message: `Convertido ${amountFrom} ${fromCoin} para ${amountTo} ${toCoin}.`,
  };
}
