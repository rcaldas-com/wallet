import 'server-only';

// APIs compatíveis com Esplora (mesmo formato de resposta em /address/<addr>).
// BTC_API (se definida) entra como primária — trocar por um host próprio é só
// apontar essa env para a sua instância. mempool.space é sempre tentada como
// fallback: single-source (só Blockstream) deixava uma wallet inteira
// marcada como "falha ao consultar" só por uma instabilidade pontual da
// Blockstream, sem alternativa nenhuma — mesmo problema que o ccxt já
// resolve pras cotações (Binance/kraken/okx).
const BTC_APIS = [...new Set([process.env.BTC_API || 'https://blockstream.info/api', 'https://mempool.space/api'])];

async function fetchAddressBalance(base: string, address: string): Promise<number | null> {
  const res = await fetch(`${base}/address/${encodeURIComponent(address)}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = (await res.json()) as {
    chain_stats?: { funded_txo_sum: number; spent_txo_sum: number };
    mempool_stats?: { funded_txo_sum: number; spent_txo_sum: number };
  };
  const chain = d.chain_stats;
  if (!chain) throw new Error('resposta sem chain_stats');
  const mem = d.mempool_stats;
  const sats =
    chain.funded_txo_sum -
    chain.spent_txo_sum +
    (mem ? mem.funded_txo_sum - mem.spent_txo_sum : 0);
  return sats / 1e8;
}

// Saldo em BTC de um endereço (confirmado + mempool). null se todas as fontes
// falharem, para conseguirmos distinguir "sem saldo" de "não consegui ler".
export async function getBitcoinBalance(address: string): Promise<number | null> {
  const errors: string[] = [];
  for (const base of BTC_APIS) {
    try {
      return await fetchAddressBalance(base, address);
    } catch (err) {
      errors.push(`${base}: ${err}`);
    }
  }
  console.error(`Falha ao ler saldo BTC de ${address} em todas as fontes:\n${errors.join('\n')}`);
  return null;
}
