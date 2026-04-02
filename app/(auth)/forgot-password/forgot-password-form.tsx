'use client';

import { AtSymbolIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import { ArrowPathIcon } from '@heroicons/react/20/solid';
import { useFormStatus } from 'react-dom';
import { requestPasswordReset } from '@/app/lib/actions/auth';
import { useActionState } from 'react';

function ForgotPasswordButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="mt-4 w-full flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition disabled:opacity-50"
      disabled={pending || disabled}
    >
      Enviar link <ArrowPathIcon className="h-5 w-5" />
    </button>
  );
}

export default function ForgotPasswordForm() {
  const initialState = { message: '', errors: {} as Record<string, string[] | undefined> };
  const [state, dispatch] = useActionState(requestPasswordReset, initialState);

  const sent = !!state.message && Object.keys(state.errors).length === 0;

  return (
    <form action={dispatch} className="space-y-3">
      <div className="flex-1 rounded-lg bg-white px-6 pb-4 pt-8 shadow-sm">
        <h1 className="mb-3 text-2xl font-semibold">Redefinição de Senha</h1>
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
                disabled={sent}
              />
              <AtSymbolIcon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900" />
            </div>
          </div>
        </div>
        <ForgotPasswordButton disabled={sent} />
        <div className="mt-3 flex h-8 items-start space-x-1" aria-live="polite" aria-atomic="true">
          {state.message && (
            <>
              <ExclamationCircleIcon className="h-5 w-5 text-emerald-500" />
              <p className="text-sm text-emerald-600">{state.message}</p>
            </>
          )}
        </div>
      </div>
    </form>
  );
}
