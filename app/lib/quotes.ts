import 'server-only';
import type { CoinBalance } from './definitions';
import type { RawBalance } from './stellar';
import { getStellarPathPriceInXlm } from './stellar';

// URL do microserviço de cotações (ccxt). No compose, nome do serviço "ccxt".
const CCXT_URL = process.env.CCXT_URL || 'http://ccxt:8000';
// Moeda base do sistema — valor direto, sem conversão.
const BASE_COIN = 'BRL';

// Cache simples em memória por processo (TTL curto) para não bater no serviço
// a cada render.
const PRICE_TTL_MS = 60_000;
const priceCache = new Map<string, { price: number; at: number }>();

// Busca o preço de 1 unidade de `coin` em BRL via microserviço ccxt.
// Retorna null quando indisponível.
async function fetchBrlPrice(coin: string): Promise<number | null> {
  const cached = priceCache.get(coin);
  if (cached && Date.now() - cached.at < PRICE_TTL_MS) {
    return cached.price;
  }
  try {
    const res = await fetch(
      `${CCXT_URL}/price?base=${encodeURIComponent(coin)}&quote=${BASE_COIN}`,
      { cache: 'no-store', signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { price?: number };
    if (typeof data.price !== 'number' || !isFinite(data.price)) return null;
    priceCache.set(coin, { price: data.price, at: Date.now() });
    return data.price;
  } catch (err) {
    console.error(`Falha ao obter cotação ${coin}/BRL:`, err);
    return null;
  }
}

// Preço de 1 unidade em BRL, ou null quando não há cotação disponível.
// `issuer`, quando informado, habilita um fallback via a própria rede Stellar
// (path payment até XLM) para ativos sem par nas exchanges centralizadas —
// caso de tokens nativos do ecossistema Stellar como AQUA.
export async function getBrlPrice(coin: string, issuer?: string): Promise<number | null> {
  if (coin === BASE_COIN) return 1;
  const direct = await fetchBrlPrice(coin);
  if (direct !== null) return direct;
  if (!issuer) return null;

  const priceInXlm = await getStellarPathPriceInXlm(coin, issuer);
  if (priceInXlm === null) return null;
  const xlmBrl = await fetchBrlPrice('XLM');
  if (xlmBrl === null) return null;
  return priceInXlm * xlmBrl;
}

// Valor em BRL de `amount` unidades de `coin`. Moeda sem cotação vale 0 —
// use `getBrlPrice` quando precisar distinguir "vale zero" de "não sei o preço".
export async function getBrlValue(coin: string, amount: number, issuer?: string): Promise<number> {
  const price = await getBrlPrice(coin, issuer);
  if (price === null) return 0;
  return amount * price;
}

// Converte uma lista de saldos brutos em saldos com valor em BRL.
// `unpriced` lista as moedas sem cotação, que entraram como 0 no total — sem
// isso um saldo relevante sumiria do total sem deixar rastro.
export async function valueBalancesInBrl(
  balances: RawBalance[],
  minBrl = 0,
): Promise<{ coins: CoinBalance[]; totalBrl: number; unpriced: string[] }> {
  const coins: CoinBalance[] = [];
  const unpriced: string[] = [];
  let totalBrl = 0;
  for (const b of balances) {
    if (b.balance <= 0) continue;
    const price = await getBrlPrice(b.coin, b.issuer);
    if (price === null && !unpriced.includes(b.coin)) unpriced.push(b.coin);
    const valueBrl = price === null ? 0 : b.balance * price;
    if (valueBrl < minBrl && price !== null) continue;
    coins.push({ coin: b.coin, balance: b.balance, valueBrl });
    totalBrl += valueBrl;
  }
  return { coins, totalBrl, unpriced };
}
