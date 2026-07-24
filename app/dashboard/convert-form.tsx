'use client';

import { useActionState, useEffect, useState } from 'react';
import { requestConversion, type ConvertState } from '@/app/lib/actions/convert';
import type { CoinBalance } from '@/app/lib/definitions';
import type { CoinCatalogEntry } from '@/app/lib/coin-catalog';

type Toast = { id: number; message: string; success: boolean };

const initialState: ConvertState = { success: false, message: '' };

function formatAmount(n: number): string {
  const fixed = n.toFixed(7);
  return fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
}

function optionLabel(c: CoinCatalogEntry) {
  return c.displayName ? `${c.symbol} (${c.displayName})` : c.symbol;
}

export default function ConvertForm({
  holdings,
  catalog,
  priceMap,
}: {
  holdings: CoinBalance[];
  catalog: { priority: CoinCatalogEntry[]; others: CoinCatalogEntry[] };
  priceMap: Record<string, number>;
}) {
  const [state, formAction, isPending] = useActionState(requestConversion, initialState);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [fromCoin, setFromCoin] = useState(holdings[0]?.coin || '');
  const [toCoin, setToCoin] = useState('');
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

  if (holdings.length === 0) return null;

  const toOptions = [...catalog.priority, ...catalog.others].filter((c) => c.symbol !== fromCoin);
  const toPriorityOptions = catalog.priority.filter((c) => c.symbol !== fromCoin);
  const toOtherOptions = catalog.others.filter((c) => c.symbol !== fromCoin);

  // Garante que "Para" nunca fique igual a "De" quando a pessoa troca a
  // moeda de origem.
  const effectiveToCoin = toCoin && toOptions.some((c) => c.symbol === toCoin) ? toCoin : toOptions[0]?.symbol || '';

  const handleMax = () => {
    const h = holdings.find((x) => x.coin === fromCoin);
    if (h) setAmount(formatAmount(h.balance));
  };

  const preview = (() => {
    const fromPrice = priceMap[fromCoin];
    const toPrice = priceMap[effectiveToCoin];
    const n = Number(amount.trim().replace(',', '.'));
    if (!fromPrice || !toPrice || amount.trim() === '' || !isFinite(n)) return null;
    return formatAmount((n * fromPrice) / toPrice);
  })();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!fromCoin || !effectiveToCoin || !amount) return;
    const approx = preview ? ` (≈ ${preview} ${effectiveToCoin})` : '';
    if (
      !confirm(
        `Converter ${amount} ${fromCoin} para ${effectiveToCoin}${approx}?\n\n` +
          `Esta operação é feita na rede Stellar e é irreversível.`,
      )
    ) {
      e.preventDefault();
    }
  }

  return (
    <section className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-100 dark:border-zinc-800 p-5">
      <h2 className="text-lg font-semibold text-gray-800 dark:text-zinc-100 mb-1">Converter moedas</h2>
      <p className="text-gray-500 dark:text-zinc-400 text-sm mb-4">
        Troque uma moeda que você tem por outra disponível na carteira.
      </p>

      <form action={formAction} onSubmit={handleSubmit} className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="w-full sm:w-40">
            <label htmlFor="fromCoin" className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
              De
            </label>
            <select
              id="fromCoin"
              name="fromCoin"
              required
              value={fromCoin}
              onChange={(e) => setFromCoin(e.target.value)}
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
            <label htmlFor="camount" className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
              Quantidade
            </label>
            <div className="relative">
              <input
                id="camount"
                name="amount"
                type="text"
                inputMode="decimal"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                className="w-full border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 rounded-md px-3 py-2 pr-14 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={handleMax}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 hover:bg-emerald-100 dark:hover:bg-emerald-900 px-2 py-1 rounded transition"
              >
                MAX
              </button>
            </div>
          </div>

          <div className="w-full sm:w-48">
            <label htmlFor="toCoin" className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
              Para
            </label>
            <select
              id="toCoin"
              name="toCoin"
              required
              value={effectiveToCoin}
              onChange={(e) => setToCoin(e.target.value)}
              className="w-full border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {toPriorityOptions.length > 0 && (
                <optgroup label="Principais">
                  {toPriorityOptions.map((c) => (
                    <option key={c.symbol} value={c.symbol}>
                      {optionLabel(c)}
                    </option>
                  ))}
                </optgroup>
              )}
              {toOtherOptions.length > 0 && (
                <optgroup label="Outras moedas">
                  {toOtherOptions.map((c) => (
                    <option key={c.symbol} value={c.symbol}>
                      {optionLabel(c)}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        </div>

        {preview && (
          <p className="text-sm text-gray-500 dark:text-zinc-400">
            ≈ {preview} {effectiveToCoin} <span className="text-gray-400 dark:text-zinc-500">(valor aproximado — a cotação final é confirmada na hora da troca)</span>
          </p>
        )}

        <button
          type="submit"
          disabled={isPending || !effectiveToCoin}
          className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-medium px-5 py-2 rounded-md transition"
        >
          {isPending ? 'Convertendo…' : 'Converter'}
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
    </section>
  );
}
