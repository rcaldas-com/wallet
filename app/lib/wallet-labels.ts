// Rótulos amigáveis do tipo de carteira, usados sempre que a origem de um
// saldo precisa aparecer para o usuário (ex.: origem de cada moeda em "Suas
// moedas"). Sem `server-only` — importado também por componente client.
const WALLET_TYPE_LABELS: Record<string, string> = {
  main: 'Carteira RCaldas',
  stellar: 'Carteira Stellar externa',
  bitcoin: 'Carteira Bitcoin externa',
  ethereum: 'Carteira Ethereum externa',
  binance: 'Binance',
  bybit: 'Bybit',
  okx: 'OKX',
};

export function walletTypeLabel(type: string): string {
  return WALLET_TYPE_LABELS[type] ?? type;
}
