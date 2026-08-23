import { redirect } from 'next/navigation';
import { getCurrentUser, hasRole } from '@/app/lib/auth';
import { listPendingWithdrawals } from '@/app/lib/data-wallet';
import WithdrawQueue from './withdraw-queue';
import Header from '@/app/components/header';

export const dynamic = 'force-dynamic';

export default async function AdminWithdrawPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!hasRole(user, 'admin')) redirect('/dashboard');

  const pending = await listPendingWithdrawals();

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-zinc-950">
      <Header user={user} isAdmin active="withdraw" />

      <div className="max-w-4xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-semibold text-gray-800 dark:text-zinc-100 mb-1">Saques pendentes</h2>
        <p className="text-gray-500 dark:text-zinc-400 text-sm mb-6">
          Ao confirmar, o token volta da carteira do usuário para o issuer na rede Stellar.
          A transferência externa (PIX/cripto) você faz por fora e registra o comprovante aqui.
        </p>

        {pending.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-100 dark:border-zinc-800 p-10 text-center">
            <p className="text-gray-500 dark:text-zinc-400">Nenhum pedido de saque pendente.</p>
          </div>
        ) : (
          <WithdrawQueue items={pending} />
        )}
      </div>
    </main>
  );
}
