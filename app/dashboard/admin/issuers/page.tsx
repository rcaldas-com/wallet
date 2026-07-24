import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, hasRole } from '@/app/lib/auth';
import { listIssuersAdmin } from '@/app/lib/data-wallet';
import { getAccountBalances } from '@/app/lib/stellar';
import ThemeToggle from '@/app/components/theme-toggle';
import IssuersManager, { type IssuerRow } from './issuers-manager';

export const dynamic = 'force-dynamic';

export default async function AdminIssuersPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!hasRole(user, 'admin')) redirect('/dashboard');

  const issuers = await listIssuersAdmin();
  const rows: IssuerRow[] = await Promise.all(
    issuers.map(async (i) => {
      const balances = await getAccountBalances(i.publicKey);
      const native = balances.find((b) => b.coin === 'XLM nativo');
      return {
        ...i,
        onchain: { exists: balances.length > 0, nativeXlm: native ? native.balance : null },
      };
    }),
  );

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-zinc-950">
      <header className="bg-emerald-600 text-white shadow">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold hover:opacity-90 transition">💰 Wallet · Issuers</Link>
          <div className="flex items-center gap-3">
            <ThemeToggle loggedIn />
            <Link href="/dashboard/admin/overview" className="text-sm bg-white/15 hover:bg-white/25 px-3 py-1 rounded transition">
              Visão geral
            </Link>
            <Link href="/dashboard" className="text-sm bg-emerald-700 hover:bg-emerald-800 px-3 py-1 rounded transition">
              Voltar
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-semibold text-gray-800 dark:text-zinc-100 mb-1">Issuers</h2>
        <p className="text-gray-500 dark:text-zinc-400 text-sm mb-6">
          Emissores dos tokens da carteira. Ao cadastrar, a conta on-chain é criada e
          financiada a partir da carteira principal.
        </p>
        <IssuersManager rows={rows} />
      </div>
    </main>
  );
}
