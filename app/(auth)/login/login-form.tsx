'use client';

import {
  AtSymbolIcon,
  KeyIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import { ArrowRightIcon } from '@heroicons/react/20/solid';
import { useFormStatus } from 'react-dom';
import { loginAction } from '@/app/lib/actions/users';
import { useActionState } from 'react';

function LoginButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="mt-4 w-full flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition disabled:opacity-50"
      disabled={pending}
    >
      {pending ? 'Entrando...' : 'Entrar'}
      <ArrowRightIcon className="h-5 w-5" />
    </button>
  );
}

export default function LoginForm() {
  const initialState = { message: '', errors: {} as Record<string, string[]> };
  const [state, dispatch] = useActionState(loginAction, initialState);

  return (
    <form action={dispatch} className="space-y-3">
      <div className="flex-1 rounded-lg bg-white px-6 pb-4 pt-8 shadow-sm">
        <h1 className="mb-3 text-2xl font-semibold">
          Entre para continuar
        </h1>
        <div className="w-full">
          <div>
            <label
              className="mb-2 mt-4 block text-xs font-medium text-gray-900"
              htmlFor="email"
            >
              Email
            </label>
            <div className="relative">
              <input
                className="peer block w-full rounded-md border border-gray-200 py-[9px] pl-10 text-sm outline-2 placeholder:text-gray-500"
                id="email"
                type="email"
                name="email"
                placeholder="Digite seu email"
                required
              />
              <AtSymbolIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900" />
            </div>
          </div>

          <div className="mt-4">
            <label
              className="mb-2 mt-4 block text-xs font-medium text-gray-900"
              htmlFor="password"
            >
              Senha
            </label>
            <div className="relative">
              <input
                className="peer block w-full rounded-md border border-gray-200 py-[9px] pl-10 text-sm outline-2 placeholder:text-gray-500"
                id="password"
                type="password"
                name="password"
                placeholder="Digite sua senha"
                minLength={6}
                required
              />
              <KeyIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900" />
            </div>
          </div>
        </div>
        <LoginButton />
        <div
          className="flex h-8 items-end space-x-1"
          aria-live="polite"
          aria-atomic="true"
        >
          {state.message && (
            <>
              <ExclamationCircleIcon className="h-5 w-5 text-red-500" />
              <p className="text-sm text-red-500">{state.message}</p>
            </>
          )}
        </div>
      </div>
    </form>
  );
}
