import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, hasRole } from '@/app/lib/auth';
import { listPendingWithdrawals } from '@/app/lib/data-wallet';
import WithdrawQueue from './withdraw-queue';

export const dynamic = 'force-dynamic';

export default async function AdminWithdrawPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!hasRole(user, 'admin')) redirect('/dashboard');

  const pending = await listPendingWithdrawals();

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-emerald-600 text-white shadow">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold hover:opacity-90 transition">💰 Wallet · Admin</Link>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/admin/deposit"
              className="text-sm bg-white/15 hover:bg-white/25 px-3 py-1 rounded transition"
            >
              Depósito
            </Link>
            <Link
              href="/dashboard"
              className="text-sm bg-emerald-700 hover:bg-emerald-800 px-3 py-1 rounded transition"
            >
              Voltar
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-semibold text-gray-800 mb-1">Saques pendentes</h2>
        <p className="text-gray-500 text-sm mb-6">
          Ao confirmar, o token volta da carteira do usuário para o issuer na rede Stellar.
          A transferência externa (PIX/cripto) você faz por fora e registra o comprovante aqui.
        </p>

        {pending.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center">
            <p className="text-gray-500">Nenhum pedido de saque pendente.</p>
          </div>
        ) : (
          <WithdrawQueue items={pending} />
        )}
      </div>
    </main>
  );
}
