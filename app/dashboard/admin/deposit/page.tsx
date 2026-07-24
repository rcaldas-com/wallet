import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, hasRole } from '@/app/lib/auth';
import { listUsers, listIssuerNames } from '@/app/lib/data-wallet';
import DepositForm from './deposit-form';
import ThemeToggle from '@/app/components/theme-toggle';

export default async function AdminDepositPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!hasRole(user, 'admin')) redirect('/dashboard');

  const [users, coins] = await Promise.all([listUsers(), listIssuerNames()]);

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-zinc-950">
      <header className="bg-emerald-600 text-white shadow">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold hover:opacity-90 transition">💰 Wallet · Admin</Link>
          <div className="flex items-center gap-3">
            <ThemeToggle loggedIn />
            <Link href="/dashboard" className="text-sm bg-emerald-700 hover:bg-emerald-800 px-3 py-1 rounded transition">
              Voltar
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-semibold text-gray-800 dark:text-zinc-100 mb-1">Registrar depósito</h2>
        <p className="text-gray-500 dark:text-zinc-400 text-sm mb-6">
          Credita um token na carteira Stellar do usuário. A operação é enviada à rede e é irreversível.
        </p>

        <div className="bg-white dark:bg-zinc-900 rounded-lg shadow p-6">
          <DepositForm users={users} coins={coins} />
        </div>
      </div>
    </main>
  );
}
