import 'server-only';
import type { CoinBalance } from './definitions';
import type { RawBalance } from './stellar';

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

// Valor em BRL de `amount` unidades de `coin`.
export async function getBrlValue(coin: string, amount: number): Promise<number> {
  if (coin === BASE_COIN) return amount;
  const price = await fetchBrlPrice(coin);
  if (price === null) return 0;
  return amount * price;
}

// Converte uma lista de saldos brutos em saldos com valor em BRL.
// Ignora poeira (valor desprezível) opcionalmente via `minBrl`.
export async function valueBalancesInBrl(
  balances: RawBalance[],
  minBrl = 0,
): Promise<{ coins: CoinBalance[]; totalBrl: number }> {
  const coins: CoinBalance[] = [];
  let totalBrl = 0;
  for (const b of balances) {
    if (b.balance <= 0) continue;
    const valueBrl = await getBrlValue(b.coin, b.balance);
    if (valueBrl < minBrl) continue;
    coins.push({ coin: b.coin, balance: b.balance, valueBrl });
    totalBrl += valueBrl;
  }
  return { coins, totalBrl };
}
