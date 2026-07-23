import 'server-only';
import { ObjectId } from 'mongodb';
import clientPromise from './mongodb';
import { getAccountBalances, type RawBalance } from './stellar';
import { getBitcoinBalance } from './bitcoin';

const CCXT_URL = process.env.CCXT_URL || 'http://ccxt:8000';

// Carteiras Stellar (a principal e as secundárias, criadas para separar saldos).
const STELLAR_TYPES = ['main', 'stellar'];
// Tipos ainda sem leitor. Ficam visíveis no app para não serem esquecidos.
const NOT_IMPLEMENTED = ['ethereum'];

export type WalletRead = {
  key: string;
  type: string;
  userId: string;
  balances: RawBalance[];
  // 'ok' = lida; 'erro' = falhou a consulta; 'sem-leitor' = tipo não suportado ainda
  status: 'ok' | 'erro' | 'sem-leitor';
};

type WalletDocLite = { userId: string; key: string; type: string; secret?: string | null };

// Wallets com secret — server-only, nunca exposto ao client. O secret só é
// necessário para exchanges (Binance), não para chaves públicas.
export async function listWalletsForReading(filter?: { userId?: string }): Promise<WalletDocLite[]> {
  const client = await clientPromise;
  const query = filter?.userId ? { user: new ObjectId(filter.userId) } : {};
  const docs = await client
    .db()
    .collection('wallet')
    .find(query, { projection: { user: 1, key: 1, type: 1, secret: 1 } })
    .toArray();
  return docs
    .filter((d) => d.user && d.key)
    .map((d) => ({
      userId: d.user.toString(),
      key: d.key as string,
      type: (d.type as string) || 'desconhecido',
      secret: d.secret ?? null,
    }));
}

async function readExchangeBalance(
  exchange: string,
  apiKey: string,
  secret: string,
): Promise<RawBalance[] | null> {
  try {
    const res = await fetch(`${CCXT_URL}/balance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exchange, apiKey, secret }),
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { balances?: Record<string, number> };
    if (!data.balances) return null;
    return Object.entries(data.balances).map(([coin, balance]) => ({ coin, balance }));
  } catch (err) {
    console.error(`Falha ao ler saldo da exchange ${exchange}:`, err);
    return null;
  }
}

// Lê os saldos de uma carteira conforme o tipo.
export async function readWallet(w: WalletDocLite): Promise<WalletRead> {
  const base = { key: w.key, type: w.type, userId: w.userId };

  if (STELLAR_TYPES.includes(w.type)) {
    return { ...base, balances: await getAccountBalances(w.key), status: 'ok' };
  }

  if (w.type === 'bitcoin') {
    const btc = await getBitcoinBalance(w.key);
    if (btc === null) return { ...base, balances: [], status: 'erro' };
    return { ...base, balances: btc > 0 ? [{ coin: 'BTC', balance: btc }] : [], status: 'ok' };
  }

  if (w.type === 'binance' || w.type === 'bybit' || w.type === 'okx') {
    if (!w.secret) return { ...base, balances: [], status: 'erro' };
    const balances = await readExchangeBalance(w.type, w.key, w.secret);
    if (balances === null) return { ...base, balances: [], status: 'erro' };
    return { ...base, balances, status: 'ok' };
  }

  if (NOT_IMPLEMENTED.includes(w.type)) {
    return { ...base, balances: [], status: 'sem-leitor' };
  }

  return { ...base, balances: [], status: 'sem-leitor' };
}

export async function readWallets(wallets: WalletDocLite[]): Promise<WalletRead[]> {
  return Promise.all(wallets.map(readWallet));
}
