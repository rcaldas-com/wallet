import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center space-y-6 p-8">
        <h1 className="text-4xl font-bold text-emerald-600">💰 Wallet</h1>
        <p className="text-gray-600 max-w-md">
          Carteira digital para gerenciar suas finanças de forma simples e segura.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/login"
            className="bg-emerald-600 text-white px-6 py-2 rounded-md hover:bg-emerald-700 transition font-medium"
          >
            Entrar
          </Link>
          <Link
            href="/register"
            className="border border-emerald-600 text-emerald-600 px-6 py-2 rounded-md hover:bg-emerald-50 transition font-medium"
          >
            Criar Conta
          </Link>
        </div>
      </div>
    </div>
  );
}
