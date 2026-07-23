import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, hasRole } from '@/app/lib/auth';
import { buildOverview } from '@/app/lib/overview';

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
    <main className="min-h-screen bg-gray-50">
      <header className="bg-emerald-600 text-white shadow">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">💰 Wallet · Visão geral</h1>
          <div className="flex items-center gap-3">
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
        {o.unreadable.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
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

        {o.unpriced.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <p className="font-semibold mb-1">Moedas sem cotação</p>
            <p>
              Não foi possível cotar {o.unpriced.join(', ')} — entraram como R$ 0, então
              os totais abaixo estão subestimados.
            </p>
          </div>
        )}

        {/* Resumo */}
        <section className="grid gap-4 sm:grid-cols-3">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <p className="text-sm text-gray-500">Meu saldo real</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{brl(o.myRealBrl)}</p>
            <p className="text-xs text-gray-400 mt-1">Ativos que não emiti</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <p className="text-sm text-gray-500">Passivo total</p>
            <p className="text-2xl font-bold text-amber-700 mt-1">{brl(o.totalLiabilityBrl)}</p>
            <p className="text-xs text-gray-400 mt-1">Meus tokens na mão dos usuários</p>
          </div>
          <div
            className={`rounded-xl shadow-sm border p-5 ${
              negative ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'
            }`}
          >
            <p className="text-sm text-gray-600">Saldo líquido</p>
            <p className={`text-2xl font-bold mt-1 ${negative ? 'text-red-700' : 'text-emerald-700'}`}>
              {brl(o.netBrl)}
            </p>
            <p className="text-xs text-gray-500 mt-1">Real − passivo</p>
          </div>
        </section>

        {/* Exposição por moeda */}
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Exposição por moeda</h2>
          <p className="text-gray-500 text-sm mb-3">
            Quanto foi prometido aos usuários contra quanto você tem do ativo real.
            Descoberto positivo = risco se a cotação subir.
          </p>
          {o.positions.length === 0 ? (
            <p className="text-gray-500 text-sm">Nenhum token emitido em circulação.</p>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-left">
                    <tr>
                      <th className="px-4 py-3 font-medium">Moeda</th>
                      <th className="px-4 py-3 font-medium text-right">Devido</th>
                      <th className="px-4 py-3 font-medium text-right">Tenho</th>
                      <th className="px-4 py-3 font-medium text-right">Descoberto</th>
                      <th className="px-4 py-3 font-medium text-right">Valor descoberto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {o.positions.map((p) => (
                      <tr key={p.coin}>
                        <td className="px-4 py-3 font-medium text-gray-800">{p.coin}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{num(p.owed)}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{num(p.held)}</td>
                        <td
                          className={`px-4 py-3 text-right font-medium ${
                            p.uncovered > 0 ? 'text-red-700' : 'text-emerald-700'
                          }`}
                        >
                          {num(p.uncovered)}
                        </td>
                        <td
                          className={`px-4 py-3 text-right ${
                            p.uncovered > 0 ? 'text-red-700' : 'text-gray-400'
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
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Saldo por usuário</h2>
          {o.users.length === 0 ? (
            <p className="text-gray-500 text-sm">Nenhum usuário com saldo.</p>
          ) : (
            <div className="space-y-3">
              {o.users.map((u) => (
                <div key={u.userId} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <p className="font-medium text-gray-800">
                        {u.name}
                        {u.userId === user._id && (
                          <span className="ml-2 text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">
                            você
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-gray-400">{u.email}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-amber-700 font-medium">{brl(u.liabilityBrl)}</p>
                      <p className="text-xs text-gray-400">em tokens meus</p>
                    </div>
                  </div>

                  {u.liabilities.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {u.liabilities.map((c) => (
                        <span
                          key={c.coin}
                          className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded px-2 py-1"
                        >
                          {num(c.amount)} {c.coin} · {brl(c.brl)}
                        </span>
                      ))}
                    </div>
                  )}

                  {u.external.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs text-gray-400 mb-1">
                        Externo (não é meu passivo) · {brl(u.externalBrl)}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {u.external.map((c) => (
                          <span
                            key={c.coin}
                            className="text-xs bg-gray-50 border border-gray-200 text-gray-600 rounded px-2 py-1"
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
      </div>
    </main>
  );
}
