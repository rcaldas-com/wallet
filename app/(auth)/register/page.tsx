import RegisterForm from '@/app/(auth)/register/register-form';
import Link from 'next/link';

export default function RegisterPage() {
  return (
    <main className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="relative mx-auto flex w-full max-w-[400px] flex-col space-y-2.5 p-4">
        <div className="flex h-24 w-full items-center justify-center rounded-lg bg-emerald-600 p-3">
          <span className="text-2xl font-bold text-white">💰 Wallet</span>
        </div>
        <RegisterForm />
        <div className="flex justify-center pt-2">
          <Link
            href="/login"
            className="text-sm text-emerald-600 hover:underline font-medium transition"
          >
            Já tem uma conta? Entre aqui
          </Link>
        </div>
      </div>
    </main>
  );
}
