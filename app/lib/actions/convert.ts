'use server';

import { revalidatePath } from 'next/cache';
import { requireWalletAccess } from '@/app/lib/auth';
import { executeConversion } from '@/app/lib/stellar';
import { getBrlPrice, getBrlValue } from '@/app/lib/quotes';
import { getPriceStatus } from '@/app/lib/price-monitor';
import { getUserLedger, listIssuerKeys, recordConversion } from '@/app/lib/data-wallet';
import { computePositions, previewExit, type ExitResult } from '@/app/lib/positions';

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

  const [fromStatus, toStatus] = await Promise.all([
    getPriceStatus(fromCoin),
    getPriceStatus(toCoin),
  ]);
  const trippedCoin = fromStatus.tripped ? fromCoin : toStatus.tripped ? toCoin : null;
  if (trippedCoin) {
    return {
      success: false,
      message: `Conversão de ${trippedCoin} temporariamente bloqueada: cotação com variação anômala. Aguarde a normalização ou a liberação de um admin.`,
    };
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

  // Fecha (total ou parcialmente) a operação da moeda que está saindo: custo
  // médio da posição x o que ela vale nesta troca. Calculado ANTES de
  // executar, com o histórico ainda sem esta conversão. Best-effort — se
  // falhar, a troca segue sem o resultado gravado.
  const valueBrl = amountFromBrl > 0 ? amountFromBrl : null;
  let exit: ExitResult | null = null;
  try {
    const positions = computePositions(await getUserLedger(user._id));
    exit = previewExit(positions, fromCoin, Number(amountFrom), valueBrl);
  } catch (err) {
    console.error('Falha ao calcular o resultado da operação:', err);
  }

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

  await recordConversion({
    userId: user._id,
    fromCoin,
    amountFrom,
    toCoin,
    amountTo,
    valueBrl,
    costBasisBrl: exit?.costBasisBrl ?? null,
    realizedBrl: exit?.realizedBrl ?? null,
    positionClosed: exit?.closed ?? null,
  });

  revalidatePath('/dashboard');
  return {
    success: true,
    message: `Convertido ${amountFrom} ${fromCoin} para ${amountTo} ${toCoin}.${realizedNote(fromCoin, exit)}`,
  };
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Frase curta do resultado realizado, pra mostrar já na confirmação da troca.
function realizedNote(fromCoin: string, exit: ExitResult | null): string {
  if (!exit || exit.realizedBrl === null) return '';
  const sign = exit.realizedBrl >= 0 ? '+' : '−';
  const pct = exit.realizedPct !== null ? ` (${sign}${Math.abs(exit.realizedPct).toFixed(1)}%)` : '';
  const label = exit.closed ? `Operação em ${fromCoin} encerrada` : `Resultado realizado em ${fromCoin}`;
  return ` ${label}: ${sign}${brl(Math.abs(exit.realizedBrl))}${pct}.`;
}
