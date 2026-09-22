'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import {
  addExternalWalletAction,
  removeExternalWalletAction,
  type ExternalWalletState,
} from '@/app/lib/actions/external-wallet';
import type { ExternalWallet } from '@/app/lib/data-wallet';

const initialState: ExternalWalletState = { success: false, message: '' };

const TYPE_LABEL: Record<ExternalWallet['type'], string> = { stellar: 'Stellar', bitcoin: 'Bitcoin' };

const truncateKey = (key: string) => (key.length > 20 ? `${key.slice(0, 10)}…${key.slice(-8)}` : key);

// Cadastro de carteira externa (somente leitura) pelo próprio usuário — chave
// pública de uma conta que ele já tem por fora, só pra ser monitorada e
// contabilizada no saldo, igual às que já existem hoje (cadastradas à mão no
// banco). Nunca pede secret: isto nunca pode movimentar nada, só ler.
export default function ExternalWallets({ wallets }: { wallets: ExternalWallet[] }) {
  const [state, formAction, isPending] = useActionState(addExternalWalletAction, initialState);
  const [open, setOpen] = useState(wallets.length === 0);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state]);

  return (
    <section className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-100 dark:border-zinc-800 p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-zinc-100">Carteiras externas</h2>
          <p className="text-gray-500 dark:text-zinc-400 text-sm">
            Endereços que você já tem por fora — só leitura, entram no seu saldo total.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:underline shrink-0"
        >
          {open ? 'Fechar' : '+ Adicionar'}
        </button>
      </div>

      {wallets.length > 0 && (
        <ul className="mt-4 space-y-2">
          {wallets.map((w) => (
            <ExternalWalletRow key={w.id} wallet={w} />
          ))}
        </ul>
      )}

      {open && (
        <form ref={formRef} action={formAction} className="mt-4 pt-4 border-t border-gray-100 dark:border-zinc-800 space-y-3">
          <div className="flex flex-wrap gap-3">
            <select
              name="type"
              defaultValue="bitcoin"
              className="rounded-md border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-800 dark:text-zinc-100"
            >
              <option value="bitcoin">Bitcoin</option>
              <option value="stellar">Stellar</option>
            </select>
            <input
              name="key"
              placeholder="Chave pública / endereço"
              required
              className="flex-1 min-w-[200px] rounded-md border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-800 dark:text-zinc-100 font-mono"
            />
          </div>
          <input
            name="label"
            placeholder="Apelido (opcional)"
            className="w-full rounded-md border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-800 dark:text-zinc-100"
          />
          <button
            type="submit"
            disabled={isPending}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-md transition"
          >
            {isPending ? 'Cadastrando…' : 'Cadastrar'}
          </button>
          {state.message && (
            <p className={`text-sm ${state.success ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {state.message}
            </p>
          )}
        </form>
      )}
    </section>
  );
}

function ExternalWalletRow({ wallet }: { wallet: ExternalWallet }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');

  const handleRemove = () => {
    if (!confirm(`Remover a carteira ${TYPE_LABEL[wallet.type]} ${truncateKey(wallet.key)}?`)) return;
    setError('');
    startTransition(async () => {
      const res = await removeExternalWalletAction(wallet.id);
      if (!res.success) setError(res.message);
    });
  };

  return (
    <li className="flex items-center justify-between gap-2 text-sm">
      <div className="min-w-0">
        <span className="font-medium text-gray-800 dark:text-zinc-100">{TYPE_LABEL[wallet.type]}</span>
        {wallet.label && <span className="ml-1.5 text-gray-500 dark:text-zinc-400">{wallet.label}</span>}
        <span className="block font-mono text-xs text-gray-400 dark:text-zinc-500 break-all">{wallet.key}</span>
        {error && <span className="block text-xs text-red-600 dark:text-red-400">{error}</span>}
      </div>
      <button
        type="button"
        onClick={handleRemove}
        disabled={pending}
        className="text-xs font-medium text-gray-400 dark:text-zinc-500 hover:text-red-600 dark:hover:text-red-400 underline decoration-dotted disabled:opacity-60 shrink-0"
      >
        {pending ? 'Removendo…' : 'Remover'}
      </button>
    </li>
  );
}
