// Posição por moeda (custo médio), derivada do histórico de movimentos.
//
// "Operação" = ciclo de vida da posição numa moeda: abre na primeira entrada,
// cresce com novas entradas a custo médio (uma posição só por moeda — juntar,
// não lotes separados) e fecha quando o saldo dela zera. Sair de uma parte
// realiza o resultado só daquela fração, sem regra de "qual lote saiu".
//
// Derivada por replay do histórico (fonte única da verdade, sem estado
// duplicado pra ficar defasado) — puro, sem banco, pra poder ser testado.
// BRL é a moeda base: não tem posição nem resultado, só serve de valor.

export type LedgerEvent =
  | { kind: 'deposit'; id: string; at: Date; coin: string; qty: number; valueBrl: number | null }
  | { kind: 'withdraw'; id: string; at: Date; coin: string; qty: number; valueBrl: number | null }
  | {
      kind: 'conversion';
      id: string;
      at: Date;
      fromCoin: string;
      qtyFrom: number;
      toCoin: string;
      qtyTo: number;
      valueBrl: number | null;
      // Resultado realizado gravado no momento da conversão (só informativo
      // aqui — o replay recalcula o custo; isto alimenta o total realizado).
      realizedBrl: number | null;
    };

export type Position = {
  coin: string;
  qty: number;
  // null = alguma entrada sem valor registrado (movimento anterior ao campo
  // existir): sem custo confiável até a posição zerar e reabrir.
  costBrl: number | null;
  openedAt: Date | null;
};

export type ExitResult = {
  costBasisBrl: number | null;
  realizedBrl: number | null;
  realizedPct: number | null;
  closed: boolean;
};

const BASE_COIN = 'BRL';
// Precisão on-chain (7 casas): abaixo disso é resíduo de ponto flutuante.
const EPS = 1e-7;

function applyEntry(
  positions: Map<string, Position>,
  coin: string,
  qty: number,
  valueBrl: number | null,
  at: Date,
) {
  if (coin === BASE_COIN || !(qty > 0)) return;
  const p = positions.get(coin) ?? { coin, qty: 0, costBrl: 0, openedAt: null };
  if (p.qty <= EPS) {
    p.qty = 0;
    p.costBrl = 0;
    p.openedAt = at;
  }
  p.qty += qty;
  p.costBrl = p.costBrl !== null && valueBrl !== null ? p.costBrl + valueBrl : null;
  positions.set(coin, p);
}

// Tira `qty` da posição (custo proporcional à fração que saiu) e devolve o
// resultado. null pra BRL (sem posição). Custo/resultado ficam null quando não
// dá pra afirmar: sem posição registrada, custo desconhecido, ou saiu mais do
// que o histórico sabe que existia (histórico incompleto — melhor não mostrar
// número do que mostrar um errado).
export function applyExit(
  positions: Map<string, Position>,
  coin: string,
  qty: number,
  proceedsBrl: number | null,
): ExitResult | null {
  if (coin === BASE_COIN) return null;
  const p = positions.get(coin);
  if (!p || p.qty <= EPS) {
    return { costBasisBrl: null, realizedBrl: null, realizedPct: null, closed: false };
  }

  const covered = qty <= p.qty + EPS;
  const fraction = Math.min(1, qty / p.qty);
  const costBasisBrl = covered && p.costBrl !== null ? p.costBrl * fraction : null;
  const realizedBrl =
    costBasisBrl !== null && proceedsBrl !== null ? proceedsBrl - costBasisBrl : null;
  const realizedPct =
    realizedBrl !== null && costBasisBrl! > 0 ? (realizedBrl / costBasisBrl!) * 100 : null;

  p.qty -= qty;
  if (p.qty <= EPS) {
    p.qty = 0;
    p.costBrl = 0;
    p.openedAt = null;
  } else if (p.costBrl !== null) {
    p.costBrl -= p.costBrl * fraction;
  }

  return { costBasisBrl, realizedBrl, realizedPct, closed: p.qty === 0 };
}

export function computePositions(events: LedgerEvent[]): Map<string, Position> {
  const positions = new Map<string, Position>();
  const sorted = [...events].sort(
    (a, b) => a.at.getTime() - b.at.getTime() || a.id.localeCompare(b.id),
  );

  for (const e of sorted) {
    if (e.kind === 'deposit') {
      applyEntry(positions, e.coin, e.qty, e.valueBrl, e.at);
    } else if (e.kind === 'withdraw') {
      applyExit(positions, e.coin, e.qty, e.valueBrl);
    } else {
      // Sem valor gravado (conversão anterior ao campo), o lado em BRL é o
      // próprio valor: BRL->X custou exatamente `qtyFrom`, X->BRL rendeu `qtyTo`.
      const value =
        e.valueBrl ??
        (e.fromCoin === BASE_COIN ? e.qtyFrom : e.toCoin === BASE_COIN ? e.qtyTo : null);
      applyExit(positions, e.fromCoin, e.qtyFrom, value);
      applyEntry(positions, e.toCoin, e.qtyTo, value, e.at);
    }
  }
  return positions;
}

// Resultado que teria sair `qty` da moeda agora, sem alterar as posições —
// usado antes de executar uma conversão, pra gravar o resultado junto dela.
export function previewExit(
  positions: Map<string, Position>,
  coin: string,
  qty: number,
  proceedsBrl: number | null,
): ExitResult | null {
  const p = positions.get(coin);
  return applyExit(new Map(p ? [[coin, { ...p }]] : []), coin, qty, proceedsBrl);
}
