'use client';

import { useActionState, useEffect, useState } from 'react';
import { requestWithdraw, type WithdrawState } from '@/app/lib/actions/withdraw';
import type { CoinBalance } from '@/app/lib/definitions';

type Toast = { id: number; message: string; success: boolean };

const initialState: WithdrawState = { success: false, message: '' };

export default function WithdrawForm({ holdings }: { holdings: CoinBalance[] }) {
  const [state, formAction, isPending] = useActionState(requestWithdraw, initialState);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [coin, setCoin] = useState(holdings[0]?.coin || '');
  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (state.message) {
      const id = Date.now();
      setToasts((prev) => [...prev, { id, message: state.message, success: state.success }]);
      if (state.success) setAmount('');
      const timer = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [state]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!coin || !amount) return;
    if (!confirm(`Solicitar saque de ${amount} ${coin}?`)) {
      e.preventDefault();
    }
  }

  if (holdings.length === 0) return null;

  // BRL sai por PIX; as demais moedas, por endereço on-chain.
  const isBrl = coin === 'BRL';
  const destinationLabel = isBrl ? 'Chave PIX' : `Endereço ${coin}`;
  const destinationPlaceholder = isBrl
    ? 'CPF, e-mail, telefone ou chave aleatória'
    : `Endereço de destino ${coin}`;

  return (
    <>
      <form action={formAction} onSubmit={handleSubmit} className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
        <div className="w-full sm:w-32">
          <label htmlFor="wcoin" className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
            Moeda
          </label>
          <select
            id="wcoin"
            name="coin"
            required
            value={coin}
            onChange={(e) => setCoin(e.target.value)}
            className="w-full border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {holdings.map((h) => (
              <option key={h.coin} value={h.coin}>
                {h.coin}
              </option>
            ))}
          </select>
        </div>
        <div className="w-full sm:flex-1">
          <label htmlFor="wamount" className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
            Quantidade
          </label>
          <input
            id="wamount"
            name="amount"
            type="text"
            inputMode="decimal"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0,00"
            className="w-full border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        </div>

        <div>
          <label htmlFor="destination" className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
            {destinationLabel}
          </label>
          <input
            id="destination"
            name="destination"
            type="text"
            required
            placeholder={destinationPlaceholder}
            className="w-full border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div>
          <label htmlFor="wdesc" className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
            Observação <span className="text-gray-400 dark:text-zinc-500">(opcional)</span>
          </label>
          <input
            id="wdesc"
            name="desc"
            type="text"
            className="w-full border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full sm:w-auto bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-medium px-5 py-2 rounded-md transition"
        >
          {isPending ? 'Enviando…' : 'Solicitar saque'}
        </button>
      </form>

      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`p-3 rounded-lg text-sm shadow-lg border ${
                t.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950 dark:border-emerald-900 dark:text-emerald-200'
                  : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950 dark:border-red-900 dark:text-red-200'
              }`}
            >
              {t.message}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
