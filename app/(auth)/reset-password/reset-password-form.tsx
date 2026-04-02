'use client';

import { AtSymbolIcon, KeyIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import { ArrowRightIcon } from '@heroicons/react/20/solid';
import { useFormStatus } from 'react-dom';
import { useActionState, useEffect } from 'react';
import { resetPassword } from '@/app/lib/actions/auth';
import { useRouter } from 'next/navigation';

function ResetButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="mt-4 w-full flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition disabled:opacity-50"
      disabled={pending}
    >
      Redefinir senha <ArrowRightIcon className="h-5 w-5" />
    </button>
  );
}

export default function ResetForm({ email }: { email: string }) {
  const initialState = { message: '', errors: {} as Record<string, string[] | undefined>, success: false };
  const [state, dispatch] = useActionState(resetPassword, initialState);
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      const timeout = setTimeout(() => {
        router.push('/login');
      }, 3000);
      return () => clearTimeout(timeout);
    }
  }, [state.success, router]);

  return (
    <form action={dispatch} className="w-full max-w-[400px] space-y-3 p-4">
      <input type="hidden" name="email" value={email} />
      <div className="flex-1 rounded-lg bg-white px-6 pb-4 pt-8 shadow-sm">
        <h1 className="mb-3 text-2xl font-semibold">Defina sua nova senha</h1>
        <div className="w-full">
          <label className="mb-2 mt-4 block text-xs font-medium text-gray-900" htmlFor="email">
            Email
          </label>
          <div className="relative mb-4">
            <input
              className="peer block w-full rounded-md border border-gray-200 py-[9px] pl-10 text-sm bg-gray-100 text-gray-500 outline-2"
              id="email"
              type="email"
              name="email"
              value={email}
              disabled
              readOnly
            />
            <AtSymbolIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-400" />
          </div>

          <label className="mb-2 mt-4 block text-xs font-medium text-gray-900" htmlFor="password">
            Nova senha
          </label>
          <div className="relative mb-4">
            <input
              className="peer block w-full rounded-md border border-gray-200 py-[9px] pl-10 text-sm outline-2 placeholder:text-gray-500"
              id="password"
              type="password"
              name="password"
              placeholder="Digite a nova senha"
              minLength={6}
              required
            />
            <KeyIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900" />
          </div>
          <div aria-live="polite" aria-atomic="true">
            {state.errors?.password?.map((error: string) => (
              <p className="mt-2 text-sm text-red-500" key={error}>{error}</p>
            ))}
          </div>

          <label className="mb-2 mt-4 block text-xs font-medium text-gray-900" htmlFor="confirm">
            Confirmar nova senha
          </label>
          <div className="relative mb-4">
            <input
              className="peer block w-full rounded-md border border-gray-200 py-[9px] pl-10 text-sm outline-2 placeholder:text-gray-500"
              id="confirm"
              type="password"
              name="confirm"
              placeholder="Confirme a nova senha"
              minLength={6}
              required
            />
            <KeyIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900" />
          </div>
          <div aria-live="polite" aria-atomic="true">
            {state.errors?.confirm?.map((error: string) => (
              <p className="mt-2 text-sm text-red-500" key={error}>{error}</p>
            ))}
          </div>
        </div>
        <ResetButton />
        <div className="flex h-8 items-end space-x-1" aria-live="polite" aria-atomic="true">
          {state.message && (
            <>
              <ExclamationCircleIcon className="h-5 w-5 text-red-500" />
              <p className="text-sm text-red-500">{state.message}</p>
            </>
          )}
          {state.success && (
            <p className="text-sm text-green-600">
              Senha redefinida com sucesso! Redirecionando para o login...
            </p>
          )}
        </div>
      </div>
    </form>
  );
}
