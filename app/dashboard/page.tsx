import { getCurrentUser } from '@/app/lib/auth';
import { logoutAction } from '@/app/lib/actions/users';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-emerald-600 text-white shadow">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">💰 Wallet</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm">{user.name}</span>
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
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-semibold text-gray-800 mb-4">Dashboard</h2>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-gray-600">
            Bem-vindo, <strong>{user.name}</strong>!
          </p>
          <p className="text-gray-500 text-sm mt-2">{user.email}</p>
        </div>
      </div>
    </main>
  );
}
