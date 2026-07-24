import 'server-only';
import { getUsersByIds, listIssuerKeys } from './data-wallet';
import { listWalletsForReading, readWallets } from './wallets';
import { getBrlPrice, getBrlValue } from './quotes';

export type CoinAmount = { coin: string; amount: number; brl: number };

// Exposição por moeda: quanto devo aos usuários vs quanto tenho de fato.
export type CoinPosition = {
  coin: string;
  owed: number; // total que os usuários têm dos meus tokens
  held: number; // quanto eu tenho do ativo real correspondente
  uncovered: number; // owed - held (positivo = descoberto)
  uncoveredBrl: number;
  owedBrl: number;
};

export type UserHolding = {
  userId: string;
  name: string;
  email: string;
  liabilities: CoinAmount[]; // meus tokens na mão dele (passivo meu)
  external: CoinAmount[]; // ativos que não emiti (não entram no meu passivo)
  liabilityBrl: number;
  externalBrl: number;
};

export type Overview = {
  users: UserHolding[];
  totalLiabilityBrl: number; // passivo: tudo que devo aos usuários
  myRealBrl: number; // ativo real: minhas posições externas
  netBrl: number; // líquido = real - passivo
  positions: CoinPosition[];
  // Carteiras cadastradas que não entraram nos totais, por motivo.
  unreadable: { type: string; count: number; reason: 'sem-leitor' | 'erro' }[];
  // Moedas sem cotação: entraram como R$ 0 e distorcem os totais para baixo.
  unpriced: string[];
};

// Acumulador por moeda que também guarda o issuer — necessário para o
// fallback de cotação via rede Stellar em ativos sem par nas exchanges.
type CoinAccum = Map<string, { amount: number; issuer?: string }>;

function addTo(map: CoinAccum, coin: string, amount: number, issuer?: string) {
  const prev = map.get(coin);
  map.set(coin, { amount: (prev?.amount || 0) + amount, issuer: prev?.issuer ?? issuer });
}

export async function buildOverview(adminUserId: string): Promise<Overview> {
  const [wallets, issuers] = await Promise.all([listWalletsForReading(), listIssuerKeys()]);

  // Chaves públicas dos meus issuers — o que sai delas é passivo meu.
  const myIssuerKeys = new Set(issuers.map((i) => i.publicKey));

  const reads = await readWallets(wallets);

  // Agrupa o que ficou de fora dos totais, separando "sem leitor" de "falhou".
  const gaps = new Map<string, { type: string; count: number; reason: 'sem-leitor' | 'erro' }>();
  for (const r of reads) {
    if (r.status === 'ok') continue;
    const k = `${r.type}:${r.status}`;
    const prev = gaps.get(k);
    if (prev) prev.count++;
    else gaps.set(k, { type: r.type, count: 1, reason: r.status });
  }
  const unreadable = [...gaps.values()];

  const balancesPerWallet = reads.map((r) => ({
    wallet: { userId: r.userId, key: r.key, type: r.type },
    balances: r.balances,
  }));

  // Acumuladores por usuário e globais.
  const perUser = new Map<string, { liab: CoinAccum; ext: CoinAccum }>();
  const owedByCoin: CoinAccum = new Map();
  const myHeldByCoin: CoinAccum = new Map();

  for (const { wallet, balances } of balancesPerWallet) {
    if (!perUser.has(wallet.userId)) {
      perUser.set(wallet.userId, { liab: new Map(), ext: new Map() });
    }
    const bucket = perUser.get(wallet.userId)!;

    for (const b of balances) {
      if (b.balance <= 0) continue;
      // Emitido por mim? então é dívida minha com esse usuário.
      const isMine = b.issuer !== undefined && myIssuerKeys.has(b.issuer);
      if (isMine) {
        addTo(bucket.liab, b.coin, b.balance, b.issuer);
        addTo(owedByCoin, b.coin, b.balance, b.issuer);
      } else {
        addTo(bucket.ext, b.coin, b.balance, b.issuer);
        // Só o que está nas MINHAS wallets conta como lastro real.
        if (wallet.userId === adminUserId) {
          addTo(myHeldByCoin, b.coin, b.balance, b.issuer);
        }
      }
    }
  }

  const users = await getUsersByIds([...perUser.keys()]);
  const userById = new Map(users.map((u) => [u._id, u]));

  // Converte para BRL, anotando as moedas sem cotação. Saldos residuais
  // (< R$5) são ignorados, mesmo corte já aplicado no dashboard do usuário
  // e no total do email de depósito — moeda sem cotação nunca some (não dá
  // pra saber se é poeira ou um saldo real sem preço).
  const MIN_BRL = 5;
  const unpricedSet = new Set<string>();
  const toCoinAmounts = async (m: CoinAccum): Promise<CoinAmount[]> => {
    const withPrice = await Promise.all(
      [...m].map(async ([coin, { amount, issuer }]) => {
        const price = await getBrlPrice(coin, issuer);
        if (price === null) unpricedSet.add(coin);
        return { coin, amount, brl: price === null ? 0 : amount * price, unpriced: price === null };
      }),
    );
    return withPrice
      .filter((c) => c.unpriced || c.brl >= MIN_BRL)
      .map(({ coin, amount, brl }) => ({ coin, amount, brl }));
  };

  const holdings: UserHolding[] = [];
  for (const [userId, bucket] of perUser) {
    const [liabilities, external] = await Promise.all([
      toCoinAmounts(bucket.liab),
      toCoinAmounts(bucket.ext),
    ]);
    if (liabilities.length === 0 && external.length === 0) continue;
    const u = userById.get(userId);
    holdings.push({
      userId,
      name: u?.name || '(usuário removido)',
      email: u?.email || '',
      liabilities: liabilities.sort((a, b) => b.brl - a.brl),
      external: external.sort((a, b) => b.brl - a.brl),
      liabilityBrl: liabilities.reduce((s, c) => s + c.brl, 0),
      externalBrl: external.reduce((s, c) => s + c.brl, 0),
    });
  }
  holdings.sort((a, b) => b.liabilityBrl - a.liabilityBrl);

  // Exposição por moeda: o que devo menos o que tenho do mesmo ativo.
  const positions: CoinPosition[] = await Promise.all(
    [...owedByCoin].map(async ([coin, { amount: owed, issuer }]) => {
      const held = myHeldByCoin.get(coin)?.amount || 0;
      const uncovered = owed - held;
      const [owedBrl, uncoveredBrl] = await Promise.all([
        getBrlValue(coin, owed, issuer),
        getBrlValue(coin, Math.max(uncovered, 0), issuer),
      ]);
      return { coin, owed, held, uncovered, owedBrl, uncoveredBrl };
    }),
  );
  positions.sort((a, b) => b.uncoveredBrl - a.uncoveredBrl);

  const totalLiabilityBrl = holdings.reduce((s, h) => s + h.liabilityBrl, 0);
  const myRealBrl =
    holdings.find((h) => h.userId === adminUserId)?.externalBrl ?? 0;

  return {
    users: holdings,
    totalLiabilityBrl,
    myRealBrl,
    netBrl: myRealBrl - totalLiabilityBrl,
    positions,
    unreadable,
    unpriced: [...unpricedSet],
  };
}
