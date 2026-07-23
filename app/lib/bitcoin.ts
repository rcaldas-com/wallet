import 'server-only';

// API compatível com Esplora (Blockstream por padrão). Trocar por um host
// próprio é só apontar BTC_API para a sua instância.
const BTC_API = process.env.BTC_API || 'https://blockstream.info/api';

// Saldo em BTC de um endereço (confirmado + mempool). null se a consulta falhar,
// para conseguirmos distinguir "sem saldo" de "não consegui ler".
export async function getBitcoinBalance(address: string): Promise<number | null> {
  try {
    const res = await fetch(`${BTC_API}/address/${encodeURIComponent(address)}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as {
      chain_stats?: { funded_txo_sum: number; spent_txo_sum: number };
      mempool_stats?: { funded_txo_sum: number; spent_txo_sum: number };
    };
    const chain = d.chain_stats;
    if (!chain) return null;
    const mem = d.mempool_stats;
    const sats =
      chain.funded_txo_sum -
      chain.spent_txo_sum +
      (mem ? mem.funded_txo_sum - mem.spent_txo_sum : 0);
    return sats / 1e8;
  } catch (err) {
    console.error(`Falha ao ler saldo BTC de ${address}:`, err);
    return null;
  }
}
