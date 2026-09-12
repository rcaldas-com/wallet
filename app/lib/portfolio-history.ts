import 'server-only';
import { ObjectId } from 'mongodb';
import clientPromise from './mongodb';
import { listWalletsForReading, readWallets, type WalletRead } from './wallets';
import { valueBalancesInBrl } from './quotes';
import type { RawBalance } from './stellar';

// Uma leitura periódica do valor total (e por moeda) da carteira de um
// usuário, em BRL. Alimenta o histórico "quanto valia ao longo do tempo" no
// dashboard — sem isso, só dá pra comparar "quanto investi" (valor no
// depósito) com "quanto vale agora" (preço atual), nunca ver a curva entre
// os dois pontos.
export type PortfolioSnapshot = {
  _id: string;
  userId: string;
  at: Date;
  totalBrl: number;
  coins: { coin: string; balance: number; valueBrl: number }[];
  // true se alguma carteira falhou a consulta neste ciclo (ver readWallets)
  // — o total deste ponto está subestimado, não é uma queda real. Guardado
  // pra quem for desenhar o gráfico decidir se marca/esconde o ponto, sem
  // precisar recalcular nada.
  incomplete: boolean;
};

async function getCollection() {
  const client = await clientPromise;
  return client.db().collection('portfolioSnapshot');
}

function aggregateByCoin(reads: WalletRead[]): RawBalance[] {
  const byCoin = new Map<string, RawBalance>();
  for (const r of reads) {
    for (const b of r.balances) {
      const prev = byCoin.get(b.coin);
      byCoin.set(b.coin, { coin: b.coin, balance: (prev?.balance || 0) + b.balance, issuer: prev?.issuer ?? b.issuer });
    }
  }
  return [...byCoin.values()];
}

// Chamado pela rotina agendada (ver app/api/internal/tick) — um snapshot por
// usuário com pelo menos uma carteira cadastrada. Sequencial entre usuários
// de propósito (cada readWallets já paraleliza as carteiras DE UM usuário
// internamente) — evita martelar Horizon/exchanges/ccxt com todo mundo de
// uma vez só num sistema de poucos usuários.
export async function capturePortfolioSnapshots(): Promise<{ users: number }> {
  const wallets = await listWalletsForReading();
  const byUser = new Map<string, typeof wallets>();
  for (const w of wallets) {
    const arr = byUser.get(w.userId) ?? [];
    arr.push(w);
    byUser.set(w.userId, arr);
  }

  const col = await getCollection();
  const at = new Date();
  let count = 0;

  for (const [userId, userWallets] of byUser) {
    const reads = await readWallets(userWallets);
    // 'sem-leitor' é permanente (tipo ainda não suportado) e não deve marcar
    // o ponto como incompleto pra sempre — só 'erro' (falha real da consulta).
    const incomplete = reads.some((r) => r.status === 'erro');
    const raw = aggregateByCoin(reads);
    const { coins, totalBrl } = await valueBalancesInBrl(raw, 0);

    await col.insertOne({
      user: new ObjectId(userId),
      at,
      totalBrl,
      coins,
      incomplete,
    });
    count++;
  }

  return { users: count };
}

// Histórico de um usuário, mais antigo primeiro (ordem natural pra um
// gráfico de linha). Ainda sem consumidor — a UI de gráfico é um próximo
// passo, depois que a rotina agendada acumular alguns dias de pontos.
export async function getUserPortfolioHistory(
  userId: string,
  opts?: { since?: Date; limit?: number },
): Promise<PortfolioSnapshot[]> {
  const col = await getCollection();
  const query: Record<string, unknown> = { user: new ObjectId(userId) };
  if (opts?.since) query.at = { $gte: opts.since };

  const docs = await col
    .find(query)
    .sort({ at: 1 })
    .limit(opts?.limit ?? 1000)
    .toArray();

  return docs.map((d) => ({
    _id: d._id.toString(),
    userId: d.user.toString(),
    at: d.at,
    totalBrl: d.totalBrl,
    coins: d.coins ?? [],
    incomplete: d.incomplete ?? false,
  }));
}
