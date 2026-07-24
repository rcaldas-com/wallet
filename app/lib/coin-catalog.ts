import 'server-only';
import clientPromise from './mongodb';

export type CoinCatalogEntry = { symbol: string; displayName: string | null };

// Ordem fixa pedida: BRL, USD, BTC, XLM primeiro (nessa ordem), depois o
// resto em ordem alfabética. Usado em toda listagem de moeda do app
// (depósito, saque, conversão, "Suas moedas").
const PRIORITY_ORDER = ['BRL', 'USD', 'BTC', 'XLM'];

// XLM não é um doc `issuer` (é o ativo nativo da rede) — nome fica fixo aqui.
const XLM_DISPLAY_NAME = 'Lumens';

export function coinSortKey(symbol: string): [number, string] {
  const idx = PRIORITY_ORDER.indexOf(symbol);
  return [idx === -1 ? PRIORITY_ORDER.length : idx, symbol];
}

// Reordena qualquer lista com campo `coin` (ex.: CoinBalance[]) na ordem
// combinada, sem precisar buscar o catálogo completo — só usa o próprio
// símbolo que já está na lista.
export function sortCoins<T extends { coin: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const [ai, an] = coinSortKey(a.coin);
    const [bi, bn] = coinSortKey(b.coin);
    return ai !== bi ? ai - bi : an.localeCompare(bn);
  });
}

// Catálogo completo (todos os issuers + XLM), já separado em "principais"
// (BRL/USD/BTC/XLM, nessa ordem) e "outras" (alfabética) — pensado pra
// alimentar <optgroup> nos selects de depósito/conversão.
export async function getCoinCatalog(): Promise<{
  priority: CoinCatalogEntry[];
  others: CoinCatalogEntry[];
}> {
  const client = await clientPromise;
  const issuerDocs = await client
    .db()
    .collection('issuer')
    .find({}, { projection: { name: 1, displayName: 1 } })
    .toArray();

  const bySymbol = new Map<string, CoinCatalogEntry>();
  bySymbol.set('XLM', { symbol: 'XLM', displayName: XLM_DISPLAY_NAME });
  for (const d of issuerDocs) {
    bySymbol.set(d.name as string, {
      symbol: d.name as string,
      displayName: (d.displayName as string | undefined) ?? null,
    });
  }

  const priority = PRIORITY_ORDER.filter((s) => bySymbol.has(s)).map((s) => bySymbol.get(s)!);
  const others = [...bySymbol.values()]
    .filter((c) => !PRIORITY_ORDER.includes(c.symbol))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

  return { priority, others };
}
