import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, hasRole } from '@/app/lib/auth';
import { buildOverview } from '@/app/lib/overview';
import ThemeToggle from '@/app/components/theme-toggle';

export const dynamic = 'force-dynamic';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 7 });

export default async function AdminOverviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!hasRole(user, 'admin')) redirect('/dashboard');

  const o = await buildOverview(user._id);
  const negative = o.netBrl < 0;

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-zinc-950">
      <header className="bg-emerald-600 text-white shadow">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold hover:opacity-90 transition">💰 Wallet · Visão geral</Link>
          <div className="flex items-center gap-3">
            <ThemeToggle loggedIn />
            <Link href="/dashboard/admin/deposit" className="text-sm bg-white/15 hover:bg-white/25 px-3 py-1 rounded transition">
              Depósito
            </Link>
            <Link href="/dashboard/admin/withdraw" className="text-sm bg-white/15 hover:bg-white/25 px-3 py-1 rounded transition">
              Saques
            </Link>
            <Link href="/dashboard" className="text-sm bg-emerald-700 hover:bg-emerald-800 px-3 py-1 rounded transition">
              Voltar
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {o.unpriced.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
            <p className="font-semibold mb-1">Moedas sem cotação</p>
            <p>
              Não foi possível cotar {o.unpriced.join(', ')} — entraram como R$ 0, então
              os totais abaixo estão subestimados.
            </p>
          </div>
        )}

        {/* Resumo */}
        <section className="grid gap-4 sm:grid-cols-3">
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-100 dark:border-zinc-800 p-5">
            <p className="text-sm text-gray-500 dark:text-zinc-400">Meu saldo real</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-zinc-50 mt-1">{brl(o.myRealBrl)}</p>
            <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">Ativos que não emiti</p>
          </div>
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-100 dark:border-zinc-800 p-5">
            <p className="text-sm text-gray-500 dark:text-zinc-400">Passivo total</p>
            <p className="text-2xl font-bold text-amber-700 dark:text-amber-400 mt-1">{brl(o.totalLiabilityBrl)}</p>
            <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">Meus tokens na mão dos usuários</p>
          </div>
          <div
            className={`rounded-xl shadow-sm border p-5 ${
              negative
                ? 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900/60'
                : 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/60'
            }`}
          >
            <p className="text-sm text-gray-600 dark:text-zinc-300">Saldo líquido</p>
            <p className={`text-2xl font-bold mt-1 ${negative ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
              {brl(o.netBrl)}
            </p>
            <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1">Real − passivo</p>
          </div>
        </section>

        {/* Exposição por moeda */}
        <section>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-zinc-100 mb-1">Exposição por moeda</h2>
          <p className="text-gray-500 dark:text-zinc-400 text-sm mb-3">
            Quanto foi prometido aos usuários contra quanto você tem do ativo real.
            Descoberto positivo = risco se a cotação subir.
          </p>
          {o.positions.length === 0 ? (
            <p className="text-gray-500 dark:text-zinc-400 text-sm">Nenhum token emitido em circulação.</p>
          ) : (
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-100 dark:border-zinc-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 text-left">
                    <tr>
                      <th className="px-4 py-3 font-medium">Moeda</th>
                      <th className="px-4 py-3 font-medium text-right">Devido</th>
                      <th className="px-4 py-3 font-medium text-right">Tenho</th>
                      <th className="px-4 py-3 font-medium text-right">Descoberto</th>
                      <th className="px-4 py-3 font-medium text-right">Valor descoberto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                    {o.positions.map((p) => (
                      <tr key={p.coin}>
                        <td className="px-4 py-3 font-medium text-gray-800 dark:text-zinc-100">{p.coin}</td>
                        <td className="px-4 py-3 text-right text-gray-700 dark:text-zinc-300">{num(p.owed)}</td>
                        <td className="px-4 py-3 text-right text-gray-700 dark:text-zinc-300">{num(p.held)}</td>
                        <td
                          className={`px-4 py-3 text-right font-medium ${
                            p.uncovered > 0 ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'
                          }`}
                        >
                          {num(p.uncovered)}
                        </td>
                        <td
                          className={`px-4 py-3 text-right ${
                            p.uncovered > 0 ? 'text-red-700 dark:text-red-400' : 'text-gray-400 dark:text-zinc-500'
                          }`}
                        >
                          {p.uncovered > 0 ? brl(p.uncoveredBrl) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* Por usuário */}
        <section>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-zinc-100 mb-3">Saldo por usuário</h2>
          {o.users.length === 0 ? (
            <p className="text-gray-500 dark:text-zinc-400 text-sm">Nenhum usuário com saldo.</p>
          ) : (
            <div className="space-y-3">
              {o.users.map((u) => (
                <div key={u.userId} className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-100 dark:border-zinc-800 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <p className="font-medium text-gray-800 dark:text-zinc-100">
                        {u.name}
                        {u.userId === user._id && (
                          <span className="ml-2 text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 px-1.5 py-0.5 rounded">
                            você
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-gray-400 dark:text-zinc-500">{u.email}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">{brl(u.liabilityBrl)}</p>
                      <p className="text-xs text-gray-400 dark:text-zinc-500">em tokens meus</p>
                    </div>
                  </div>

                  {u.liabilities.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {u.liabilities.map((c) => (
                        <span
                          key={c.coin}
                          className="text-xs bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-900/60 dark:text-amber-300 rounded px-2 py-1"
                        >
                          {num(c.amount)} {c.coin} · {brl(c.brl)}
                        </span>
                      ))}
                    </div>
                  )}

                  {u.external.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs text-gray-400 dark:text-zinc-500 mb-1">
                        Externo (não é meu passivo) · {brl(u.externalBrl)}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {u.external.map((c) => (
                          <span
                            key={c.coin}
                            className="text-xs bg-gray-50 border border-gray-200 text-gray-600 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300 rounded px-2 py-1"
                          >
                            {num(c.amount)} {c.coin} · {brl(c.brl)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {o.unreadable.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="font-semibold mb-1">Números incompletos</p>
            <p className="mb-2">
              Estas carteiras estão cadastradas mas não entraram nos totais, então o
              saldo real está subestimado:
            </p>
            <ul className="list-disc list-inside space-y-0.5">
              {o.unreadable.map((u) => (
                <li key={`${u.type}-${u.reason}`}>
                  {u.count}× <strong>{u.type}</strong> —{' '}
                  {u.reason === 'sem-leitor'
                    ? 'ainda não temos leitor para esse tipo'
                    : 'a consulta falhou (credencial revogada ou API fora do ar)'}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
