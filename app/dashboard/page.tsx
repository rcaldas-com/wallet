import { redirect } from 'next/navigation';
import { getCurrentUser, canUseWallet, hasRole } from '@/app/lib/auth';
import { getUserLedger, getUserMovements, listIssuerKeys } from '@/app/lib/data-wallet';
import { computePositions } from '@/app/lib/positions';
import { listWalletsForReading, readWallets } from '@/app/lib/wallets';
import type { RawBalance } from '@/app/lib/stellar';
import { valueBalancesInBrl, getBrlPrice } from '@/app/lib/quotes';
import { listTrippedCoins } from '@/app/lib/price-monitor';
import type { CoinBalance, Movement } from '@/app/lib/definitions';
import { getCoinCatalog, sortCoins } from '@/app/lib/coin-catalog';
import WithdrawForm from './withdraw-form';
import ConvertForm from './convert-form';
import CoinCard, { type CoinSource } from './coin-card';
import CancelWithdrawButton from './cancel-withdraw-button';
import Header from '@/app/components/header';
import AutoRefresh from '@/app/components/auto-refresh';

export const dynamic = 'force-dynamic';

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (v: number) =>
  v.toLocaleString('pt-BR', { maximumFractionDigits: 7 });
const dateTime = (d: Date) =>
  new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

// Quanto a mesma quantidade depositada vale hoje, pra comparar com o valor
// em BRL registrado no momento do depósito. null quando falta um dos dois
// lados (depósito anterior a este campo existir, ou moeda sem cotação hoje).
function depositPerformance(
  m: Movement,
  priceMap: Record<string, number>,
): { todayValueBrl: number; deltaPct: number | null } | null {
  if (m.kind !== 'deposit' || m.valueBrl == null || m.coin === 'BRL') return null;
  const price = priceMap[m.coin];
  if (price == null) return null;
  const todayValueBrl = Number(m.amount) * price;
  const deltaPct = m.valueBrl > 0 ? ((todayValueBrl - m.valueBrl) / m.valueBrl) * 100 : null;
  return { todayValueBrl, deltaPct };
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!canUseWallet(user)) return <NoWalletAccess />;

  const isAdmin = hasRole(user, 'admin');

  // Agrega saldos de todas as wallets do usuário (custodiadas + somente leitura).
  const reads = await readWallets(await listWalletsForReading({ userId: user._id }));
  const raw: RawBalance[] = reads.flatMap((r) => r.balances);
  // Carteiras cadastradas que não estão sendo consultadas — mostradas para não
  // passarem despercebidas.
  const pendingWallets = reads.filter((r) => r.status !== 'ok');
  // Mantém o issuer junto do saldo agregado — necessário para o fallback de
  // cotação via rede Stellar (path payment) em ativos sem par nas exchanges.
  const byCoin = new Map<string, RawBalance>();
  for (const b of raw) {
    const prev = byCoin.get(b.coin);
    byCoin.set(b.coin, { coin: b.coin, balance: (prev?.balance || 0) + b.balance, issuer: prev?.issuer ?? b.issuer });
  }
  const aggregated = [...byCoin.values()];

  // Origem de cada saldo (carteira do app, externa, exchange) — mostrado sob
  // demanda em "Suas moedas", sem alterar o total agregado por moeda.
  const sourcesByCoin = new Map<string, CoinSource[]>();
  for (const r of reads) {
    if (r.status !== 'ok') continue;
    for (const b of r.balances) {
      if (b.balance <= 0) continue;
      const arr = sourcesByCoin.get(b.coin) ?? [];
      arr.push({ type: r.type, key: r.key, balance: b.balance });
      sourcesByCoin.set(b.coin, arr);
    }
  }

  // Saldos residuais (< R$5) são ignorados, mesmo tratamento dado à reserva
  // operacional de XLM (hideOperationalXlmReserve) — poeira sem cotação
  // nunca some (valueBalancesInBrl mantém moedas sem preço mesmo abaixo do
  // mínimo, pra não esconder um saldo real por falta de cotação).
  const { coins: unsortedCoins, totalBrl } = await valueBalancesInBrl(aggregated, 5);
  const coins: CoinBalance[] = sortCoins(unsortedCoins);

  // Só o que está na carteira custodiada ('main') é convertível/sacável — o app
  // tem a chave e move on-chain. BTC de carteira externa, XLM nativo e saldos de
  // exchange são somente leitura (aparecem em "Suas moedas", mas não como origem
  // de conversão/saque). O servidor também barra, mas oferecer aqui só geraria
  // erro confuso.
  const custodialByCoin = new Map<string, number>();
  for (const r of reads) {
    if (r.status !== 'ok' || r.type !== 'main') continue;
    for (const b of r.balances) {
      if (b.balance <= 0) continue;
      custodialByCoin.set(b.coin, (custodialByCoin.get(b.coin) ?? 0) + b.balance);
    }
  }
  // Deriva os saldos custodiados a partir da lista já cotada: valueBrl é
  // proporcional ao saldo (mesmo preço unitário), então escala sem reconsultar.
  const custodialCoins: CoinBalance[] = coins
    .filter((c) => (custodialByCoin.get(c.coin) ?? 0) > 0)
    .map((c) => {
      const custodial = custodialByCoin.get(c.coin)!;
      return { coin: c.coin, balance: custodial, valueBrl: c.balance > 0 ? c.valueBrl * (custodial / c.balance) : 0 };
    });

  const movements = await getUserMovements(user._id);
  const isEmpty = coins.length === 0 && movements.length === 0;

  // Disjuntor de cotação: avisa se alguma moeda que o usuário tem está com a
  // cotação suspensa por variação anômala — conversão/saque dela ficam
  // bloqueados até normalizar ou o admin liberar (ver price-monitor.ts).
  const heldCoins = new Set(coins.map((c) => c.coin));
  const trippedHeld = (await listTrippedCoins()).filter((t) => heldCoins.has(t.coin));

  // Catálogo completo (issuers + XLM) e o preço unitário em BRL de cada um —
  // alimenta o select "Para" da conversão e a prévia "≈ X moeda", inclusive
  // pra moedas que o usuário ainda não tem.
  const catalog = await getCoinCatalog();
  const nameBySymbol = new Map(
    [...catalog.priority, ...catalog.others].map((c) => [c.symbol, c.displayName]),
  );
  const issuers = await listIssuerKeys();
  const issuerByName = new Map(issuers.map((i) => [i.name, i.publicKey]));
  const catalogSymbols = [...catalog.priority, ...catalog.others].map((c) => c.symbol);
  const priceEntries = await Promise.all(
    catalogSymbols.map(async (symbol) => [symbol, await getBrlPrice(symbol, issuerByName.get(symbol))] as const),
  );
  const priceMap: Record<string, number> = {};
  for (const [symbol, price] of priceEntries) {
    if (price !== null) priceMap[symbol] = price;
  }

  // Posição (custo médio) de cada moeda, derivada do histórico completo. Só
  // é mostrada no card quando bate com o saldo custodiado — se o histórico
  // estiver incompleto (movimento antigo que não conhecemos), é melhor não
  // mostrar custo do que mostrar um errado.
  const ledger = await getUserLedger(user._id);
  const positions = computePositions(ledger);
  const positionFor = (coin: string) => {
    const p = positions.get(coin);
    const price = priceMap[coin];
    const custodial = custodialByCoin.get(coin) ?? 0;
    if (!p || p.qty <= 0 || p.costBrl === null || price == null) return undefined;
    if (Math.abs(p.qty - custodial) > Math.max(1e-6, custodial * 1e-6)) return undefined;
    return { costBrl: p.costBrl, valueBrl: p.qty * price, since: p.openedAt ? p.openedAt.toISOString() : null };
  };
  // Só conversões gravam resultado realizado (é o fechamento de operação).
  const realizedEvents = ledger.filter((e) => e.kind === 'conversion' && e.realizedBrl != null);
  const totalRealizedBrl = realizedEvents.reduce(
    (s, e) => s + (e.kind === 'conversion' ? (e.realizedBrl ?? 0) : 0),
    0,
  );

  // Resultado (investido vs. valor atual): só soma o que tem valueBrl
  // registrado (depósitos/saques de antes deste campo existir ficam de
  // fora — não dá pra reconstruir a cotação histórica). Saque só entra
  // depois de 'completed' — 'requested' ainda não saiu da carteira on-chain
  // (a baixa só acontece na confirmação do admin), continuaria contando no
  // saldo atual.
  const totalInvestedBrl = movements
    .filter((m) => m.kind === 'deposit' && m.valueBrl != null)
    .reduce((s, m) => s + (m.valueBrl ?? 0), 0);
  const totalWithdrawnBrl = movements
    .filter((m) => m.kind === 'withdraw' && m.status === 'completed' && m.valueBrl != null)
    .reduce((s, m) => s + (m.valueBrl ?? 0), 0);
  const netContributedBrl = totalInvestedBrl - totalWithdrawnBrl;
  const resultBrl = totalBrl - netContributedBrl;
  const resultPct = netContributedBrl > 0 ? (resultBrl / netContributedBrl) * 100 : null;
  const hasPnlData = totalInvestedBrl > 0;

  return (
    <>
      <AutoRefresh />
      <main className="min-h-screen bg-gray-50 dark:bg-zinc-950">
      <Header user={user} isAdmin={isAdmin} active="dashboard" />

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {trippedHeld.length > 0 && (
          <section className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
            <p className="font-semibold mb-1">⚠ Cotação suspensa</p>
            <p>
              {trippedHeld.map((t) => t.coin).join(', ')} com variação de preço anômala —
              conversão e saque {trippedHeld.length > 1 ? 'dessas moedas estão' : 'dessa moeda está'} temporariamente
              bloqueados até a cotação normalizar ou um admin liberar manualmente.
            </p>
          </section>
        )}

        {/* Saldo total */}
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-lg p-6 sm:p-8">
          <div className="relative z-10">
            <p className="text-emerald-100 text-sm">Saldo total estimado</p>
            <p className="text-4xl sm:text-5xl font-bold mt-1">{brl(totalBrl)}</p>
            <p className="text-emerald-100 text-xs mt-2">
              Convertido em tempo real pela cotação de mercado.
            </p>
          </div>
          <FinanceArt />
        </section>

        {(hasPnlData || realizedEvents.length > 0) && (
          <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex flex-wrap items-center justify-between gap-4">
              {hasPnlData && (
                <>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-zinc-400">Investido (histórico)</p>
                    <p className="text-lg font-semibold text-gray-800 dark:text-zinc-100">{brl(netContributedBrl)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-zinc-400">Valor atual</p>
                    <p className="text-lg font-semibold text-gray-800 dark:text-zinc-100">{brl(totalBrl)}</p>
                  </div>
                </>
              )}
              {realizedEvents.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 dark:text-zinc-400">Já realizado</p>
                  <p
                    className={`text-lg font-semibold ${
                      totalRealizedBrl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {totalRealizedBrl >= 0 ? '+' : '−'}
                    {brl(Math.abs(totalRealizedBrl))}
                  </p>
                </div>
              )}
              {hasPnlData && (
                <div>
                  <p className="text-xs text-gray-500 dark:text-zinc-400">Resultado</p>
                  <p
                    className={`text-lg font-semibold ${
                      resultBrl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {resultBrl >= 0 ? '+' : ''}
                    {brl(resultBrl)}
                    {resultPct !== null && ` (${resultBrl >= 0 ? '+' : ''}${resultPct.toFixed(1)}%)`}
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        {isEmpty ? (
          <EmptyState />
        ) : (
          <>
            {/* Saldos por moeda */}
            <section>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-zinc-100 mb-3">Suas moedas</h2>
              {coins.length === 0 ? (
                <p className="text-gray-500 dark:text-zinc-400 text-sm">Nenhum saldo em carteira.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {coins.map((c) => (
                    <CoinCard
                      key={c.coin}
                      coin={c.coin}
                      displayName={nameBySymbol.get(c.coin) ?? null}
                      balance={c.balance}
                      valueBrl={c.valueBrl}
                      sources={sourcesByCoin.get(c.coin) ?? []}
                      position={positionFor(c.coin)}
                    />
                  ))}
                </div>
              )}
            </section>

            {custodialCoins.length > 0 ? (
              <>
                <ConvertForm holdings={custodialCoins} catalog={catalog} priceMap={priceMap} />

                {/* Solicitar saque */}
                <section className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-100 dark:border-zinc-800 p-5">
                  <h2 className="text-lg font-semibold text-gray-800 dark:text-zinc-100 mb-1">Solicitar saque</h2>
                  <p className="text-gray-500 dark:text-zinc-400 text-sm mb-4">
                    Envie um pedido de saque. Você será avisado quando for processado.
                  </p>
                  <WithdrawForm holdings={custodialCoins} catalog={catalog} />
                </section>
              </>
            ) : (
              <section className="rounded-xl border border-gray-200 bg-gray-50 p-5 text-sm text-gray-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
                Seus saldos estão em carteiras externas (somente leitura), então não há o que
                converter ou sacar por aqui — o app só movimenta o que está na carteira da
                RCaldas. Faça um depósito para ter saldo disponível para conversão e saque.
              </section>
            )}

            {/* Histórico */}
            <section>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-zinc-100 mb-3">Movimentações</h2>
              {movements.length === 0 ? (
                <p className="text-gray-500 dark:text-zinc-400 text-sm">Nenhuma movimentação ainda.</p>
              ) : (
                <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-100 dark:border-zinc-800 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 text-left">
                        <tr>
                          <th className="px-4 py-3 font-medium">Tipo</th>
                          <th className="px-4 py-3 font-medium">Valor</th>
                          <th className="px-4 py-3 font-medium hidden sm:table-cell">Descrição</th>
                          <th className="px-4 py-3 font-medium">Data</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                        {movements.map((m) => {
                          const perf = depositPerformance(m, priceMap);
                          return (
                          <tr key={m._id}>
                            <td className="px-4 py-3">
                              {m.kind === 'deposit' ? (
                                <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                                  <span className="text-lg leading-none">↓</span> Depósito
                                </span>
                              ) : m.kind === 'withdraw' ? (
                                <span className="inline-flex flex-wrap items-center gap-1 text-amber-700 dark:text-amber-400">
                                  <span className="text-lg leading-none">↑</span> Saque
                                  <WithdrawBadge status={m.status} />
                                  {m.status === 'requested' && <CancelWithdrawButton id={m._id} />}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-sky-700 dark:text-sky-400">
                                  <span className="text-lg leading-none">🔄</span> Conversão
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 font-medium text-gray-800 dark:text-zinc-100">
                              <div>
                                {m.kind === 'conversion'
                                  ? `${num(Number(m.amount))} ${m.coin} → ${num(Number(m.amountTo))} ${m.toCoin}`
                                  : `${m.kind === 'deposit' ? '+' : '−'}${num(Number(m.amount))} ${m.coin}`}
                              </div>
                              {m.kind === 'conversion' && m.valueBrl != null && (
                                <div className="text-xs font-normal text-gray-400 dark:text-zinc-500 mt-0.5">
                                  {brl(m.valueBrl)} no momento
                                </div>
                              )}
                              {m.kind === 'conversion' && m.realizedBrl != null && (
                                <div
                                  className={`text-xs font-normal mt-0.5 ${
                                    m.realizedBrl >= 0
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : 'text-red-600 dark:text-red-400'
                                  }`}
                                >
                                  {m.positionClosed
                                    ? `Operação em ${m.coin} encerrada`
                                    : `Resultado realizado em ${m.coin}`}
                                  : {m.realizedBrl >= 0 ? '+' : '−'}
                                  {brl(Math.abs(m.realizedBrl))}
                                  {m.costBasisBrl != null && m.costBasisBrl > 0 && (
                                    <>
                                      {' '}({m.realizedBrl >= 0 ? '+' : '−'}
                                      {Math.abs((m.realizedBrl / m.costBasisBrl) * 100).toFixed(1)}%)
                                    </>
                                  )}
                                  {m.costBasisBrl != null && <> · custo {brl(m.costBasisBrl)}</>}
                                </div>
                              )}
                              {(m.kind === 'deposit' || m.kind === 'withdraw') && m.valueBrl != null && (
                                <div className="text-xs font-normal text-gray-400 dark:text-zinc-500 mt-0.5">
                                  {brl(m.valueBrl)} no momento
                                  {perf?.deltaPct != null && (
                                    <span
                                      className={
                                        perf.deltaPct >= 0
                                          ? 'text-emerald-600 dark:text-emerald-400'
                                          : 'text-red-600 dark:text-red-400'
                                      }
                                    >
                                      {' '}
                                      · hoje {brl(perf.todayValueBrl)} ({perf.deltaPct >= 0 ? '+' : ''}
                                      {perf.deltaPct.toFixed(1)}%)
                                    </span>
                                  )}
                                </div>
                              )}
                              {m.fileUrl && (
                                <a
                                  href={m.fileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block text-xs font-normal text-emerald-600 dark:text-emerald-400 hover:underline mt-0.5"
                                >
                                  Ver comprovante
                                </a>
                              )}
                            </td>
                            <td className="px-4 py-3 text-gray-500 dark:text-zinc-400 hidden sm:table-cell">
                              {m.desc || '—'}
                            </td>
                            <td className="px-4 py-3 text-gray-500 dark:text-zinc-400 whitespace-nowrap">
                              {dateTime(m.timestamp)}
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          </>
        )}

        {pendingWallets.length > 0 && (
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="font-semibold mb-1">Carteiras não somadas ao saldo</p>
            <ul className="space-y-0.5">
              {pendingWallets.map((w) => (
                <li key={w.key} className="break-all">
                  <strong>{w.type}</strong> · {w.key.slice(0, 12)}…{' '}
                  <span className="text-amber-700 dark:text-amber-400">
                    {w.status === 'sem-leitor'
                      ? '(consulta ainda não implementada)'
                      : '(falha ao consultar)'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      </main>
    </>
  );
}

// Selo de situação do saque no histórico.
function WithdrawBadge({ status }: { status?: string | null }) {
  const badges: Record<string, { label: string; className: string }> = {
    requested: { label: 'solicitado', className: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
    rejected: { label: 'recusado', className: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' },
    completed: { label: 'concluído', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
    cancelled: { label: 'cancelado', className: 'bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400' },
  };
  const badge = status ? badges[status] : undefined;
  if (!badge) return null;
  return (
    <span className={`ml-1 text-xs px-1.5 py-0.5 rounded ${badge.className}`}>{badge.label}</span>
  );
}

// Usuário logado, mas sem o papel `wallet`. O retorno aponta para o app
// principal por URL absoluta: em dev o wallet vive sob /wallet e em produção
// num domínio próprio, então um href relativo cairia no lugar errado.
function NoWalletAccess() {
  const mainApp = process.env.AUTH_TRUST_HOST || '/';
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-zinc-950 flex items-center justify-center px-4">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 p-10 text-center max-w-md">
        <div className="mx-auto w-32 h-32 mb-6">
          <FinanceIllustration />
        </div>
        <h1 className="text-xl font-semibold text-gray-800 dark:text-zinc-100">Acesso não liberado</h1>
        <p className="text-gray-500 dark:text-zinc-400 mt-2">
          Sua conta ainda não tem acesso à carteira. Fale com o administrador para
          liberar.
        </p>
        <a
          href={mainApp}
          className="inline-block mt-6 bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-5 py-2 rounded-md transition"
        >
          Voltar ao início
        </a>
      </div>
    </main>
  );
}

function EmptyState() {
  return (
    <section className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 p-10 text-center">
      <div className="mx-auto w-40 h-40 mb-6">
        <FinanceIllustration />
      </div>
      <h2 className="text-xl font-semibold text-gray-800 dark:text-zinc-100">Sua carteira está pronta</h2>
      <p className="text-gray-500 dark:text-zinc-400 mt-2 max-w-md mx-auto">
        Assim que um depósito for creditado, seu saldo e histórico aparecem aqui,
        sempre atualizados pela cotação de mercado.
      </p>
    </section>
  );
}

// Arte decorativa sutil no card de saldo.
function FinanceArt() {
  return (
    <svg
      className="absolute right-0 bottom-0 h-32 w-64 opacity-20"
      viewBox="0 0 200 100"
      fill="none"
      aria-hidden="true"
    >
      <polyline
        points="0,80 30,60 60,68 90,40 120,50 150,22 200,30"
        stroke="white"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="150" cy="22" r="6" fill="white" />
    </svg>
  );
}

// Ilustração para o estado vazio (finanças).
function FinanceIllustration() {
  return (
    <svg viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="80" cy="80" r="76" fill="#ecfdf5" />
      <rect x="36" y="58" width="88" height="60" rx="10" fill="#10b981" />
      <rect x="36" y="58" width="88" height="18" rx="10" fill="#059669" />
      <circle cx="104" cy="94" r="10" fill="#a7f3d0" />
      <path d="M70 44 L118 58" stroke="#34d399" strokeWidth="6" strokeLinecap="round" />
      <text x="80" y="100" textAnchor="middle" fontSize="20" fontWeight="700" fill="#065f46">
        R$
      </text>
    </svg>
  );
}
