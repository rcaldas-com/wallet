import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, canUseWallet, hasRole } from '@/app/lib/auth';
import { logoutAction } from '@/app/lib/actions/users';
import { getUserMovements } from '@/app/lib/data-wallet';
import { listWalletsForReading, readWallets } from '@/app/lib/wallets';
import type { RawBalance } from '@/app/lib/stellar';
import { valueBalancesInBrl } from '@/app/lib/quotes';
import type { CoinBalance } from '@/app/lib/definitions';
import WithdrawForm from './withdraw-form';

export const dynamic = 'force-dynamic';

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (v: number) =>
  v.toLocaleString('pt-BR', { maximumFractionDigits: 7 });
const dateTime = (d: Date) =>
  new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

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

  const { coins, totalBrl } = await valueBalancesInBrl(aggregated);
  coins.sort((a: CoinBalance, b: CoinBalance) => b.valueBrl - a.valueBrl);

  const movements = await getUserMovements(user._id);
  const isEmpty = coins.length === 0 && movements.length === 0;

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-emerald-600 text-white shadow">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">💰 Wallet</h1>
          <div className="flex items-center gap-4">
            {isAdmin && (
              <>
                <Link
                  href="/dashboard/admin/overview"
                  className="text-sm bg-white/15 hover:bg-white/25 px-3 py-1 rounded transition"
                >
                  Visão geral
                </Link>
                <Link
                  href="/dashboard/admin/deposit"
                  className="text-sm bg-white/15 hover:bg-white/25 px-3 py-1 rounded transition"
                >
                  Depósito
                </Link>
                <Link
                  href="/dashboard/admin/withdraw"
                  className="text-sm bg-white/15 hover:bg-white/25 px-3 py-1 rounded transition"
                >
                  Saques
                </Link>
              </>
            )}
            {/* O wallet não tem tela de perfil própria nem outro link de volta
                ao site principal — o nome vira o caminho de retorno. */}
            <a
              href={`${process.env.AUTH_TRUST_HOST || ''}/dashboard`}
              className="text-sm hover:underline"
              title="Voltar para o RCaldas"
            >
              {user.name}
            </a>
            <form action={logoutAction}>
              <button
                type="submit"
                className="text-sm bg-emerald-700 hover:bg-emerald-800 px-3 py-1 rounded transition"
              >
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
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

        {pendingWallets.length > 0 && (
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold mb-1">Carteiras não somadas ao saldo</p>
            <ul className="space-y-0.5">
              {pendingWallets.map((w) => (
                <li key={w.key} className="break-all">
                  <strong>{w.type}</strong> · {w.key.slice(0, 12)}…{' '}
                  <span className="text-amber-700">
                    {w.status === 'sem-leitor'
                      ? '(consulta ainda não implementada)'
                      : '(falha ao consultar)'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {isEmpty ? (
          <EmptyState />
        ) : (
          <>
            {/* Saldos por moeda */}
            <section>
              <h2 className="text-lg font-semibold text-gray-800 mb-3">Suas moedas</h2>
              {coins.length === 0 ? (
                <p className="text-gray-500 text-sm">Nenhum saldo em carteira.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {coins.map((c) => (
                    <div
                      key={c.coin}
                      className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center justify-between"
                    >
                      <div>
                        <p className="font-semibold text-gray-800">{c.coin}</p>
                        <p className="text-gray-500 text-sm">{num(c.balance)}</p>
                      </div>
                      <p className="text-gray-900 font-medium">{brl(c.valueBrl)}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Solicitar saque */}
            <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h2 className="text-lg font-semibold text-gray-800 mb-1">Solicitar saque</h2>
              <p className="text-gray-500 text-sm mb-4">
                Envie um pedido de saque. Você será avisado quando for processado.
              </p>
              <WithdrawForm holdings={coins} />
            </section>

            {/* Histórico */}
            <section>
              <h2 className="text-lg font-semibold text-gray-800 mb-3">Movimentações</h2>
              {movements.length === 0 ? (
                <p className="text-gray-500 text-sm">Nenhuma movimentação ainda.</p>
              ) : (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-500 text-left">
                        <tr>
                          <th className="px-4 py-3 font-medium">Tipo</th>
                          <th className="px-4 py-3 font-medium">Valor</th>
                          <th className="px-4 py-3 font-medium hidden sm:table-cell">Descrição</th>
                          <th className="px-4 py-3 font-medium">Data</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {movements.map((m) => (
                          <tr key={m._id}>
                            <td className="px-4 py-3">
                              {m.kind === 'deposit' ? (
                                <span className="inline-flex items-center gap-1 text-emerald-700">
                                  <span className="text-lg leading-none">↓</span> Depósito
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-amber-700">
                                  <span className="text-lg leading-none">↑</span> Saque
                                  <WithdrawBadge status={m.status} />
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 font-medium text-gray-800">
                              {m.kind === 'deposit' ? '+' : '−'}
                              {num(Number(m.amount))} {m.coin}
                            </td>
                            <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                              {m.desc || '—'}
                            </td>
                            <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                              {dateTime(m.timestamp)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

// Selo de situação do saque no histórico.
function WithdrawBadge({ status }: { status?: string | null }) {
  const badges: Record<string, { label: string; className: string }> = {
    requested: { label: 'solicitado', className: 'bg-amber-100 text-amber-700' },
    rejected: { label: 'recusado', className: 'bg-red-100 text-red-700' },
    completed: { label: 'concluído', className: 'bg-emerald-100 text-emerald-700' },
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
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center max-w-md">
        <div className="mx-auto w-32 h-32 mb-6">
          <FinanceIllustration />
        </div>
        <h1 className="text-xl font-semibold text-gray-800">Acesso não liberado</h1>
        <p className="text-gray-500 mt-2">
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
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center">
      <div className="mx-auto w-40 h-40 mb-6">
        <FinanceIllustration />
      </div>
      <h2 className="text-xl font-semibold text-gray-800">Sua carteira está pronta</h2>
      <p className="text-gray-500 mt-2 max-w-md mx-auto">
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
