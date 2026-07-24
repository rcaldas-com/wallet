'use client';

import { useActionState, useEffect, useState } from 'react';
import { requestWithdraw, type WithdrawState } from '@/app/lib/actions/withdraw';
import type { CoinBalance } from '@/app/lib/definitions';

type Toast = { id: number; message: string; success: boolean };

const initialState: WithdrawState = { success: false, message: '' };

// Remove zeros (e ponto) sobrando do toFixed, sem virar notação científica
// nem estourar as 7 casas decimais aceitas pelo backend.
function formatMaxAmount(n: number): string {
  const fixed = n.toFixed(7);
  return fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
}

export default function WithdrawForm({ holdings }: { holdings: CoinBalance[] }) {
  const [state, formAction, isPending] = useActionState(requestWithdraw, initialState);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [coin, setCoin] = useState(holdings[0]?.coin || '');
  const [amount, setAmount] = useState('');
  const [totalBrl, setTotalBrl] = useState('');

  useEffect(() => {
    if (state.message) {
      const id = Date.now();
      setToasts((prev) => [...prev, { id, message: state.message, success: state.success }]);
      if (state.success) {
        setAmount('');
        setTotalBrl('');
      }
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

  // Preço unitário derivado do próprio saldo já convertido em R$ que a tela
  // mostra em "Suas moedas" — permite calcular nos dois sentidos sem
  // precisar de uma nova consulta de cotação.
  function unitPriceFor(c: string): number | null {
    const h = holdings.find((x) => x.coin === c);
    return h && h.balance > 0 ? h.valueBrl / h.balance : null;
  }

  function totalFromAmount(rawAmount: string, price: number | null): string {
    const n = Number(rawAmount.trim().replace(',', '.'));
    if (price === null || rawAmount.trim() === '' || !isFinite(n)) return '';
    return (n * price).toFixed(2).replace('.', ',');
  }

  function amountFromTotal(rawTotal: string, price: number | null): string {
    const n = Number(rawTotal.trim().replace(',', '.'));
    if (!price || rawTotal.trim() === '' || !isFinite(n)) return '';
    return formatMaxAmount(n / price);
  }

  function handleAmountChange(value: string) {
    setAmount(value);
    setTotalBrl(totalFromAmount(value, unitPriceFor(coin)));
  }

  function handleTotalChange(value: string) {
    setTotalBrl(value);
    setAmount(amountFromTotal(value, unitPriceFor(coin)));
  }

  function handleCoinChange(newCoin: string) {
    setCoin(newCoin);
    // Mantém a quantidade já digitada, só recalcula o total pro preço da
    // moeda nova (o inverso — recalcular quantidade a partir do total —
    // mudaria o que a pessoa pediu pra sacar, não faz sentido aqui).
    setTotalBrl(totalFromAmount(amount, unitPriceFor(newCoin)));
  }

  function handleMax() {
    const h = holdings.find((x) => x.coin === coin);
    if (!h) return;
    const formatted = formatMaxAmount(h.balance);
    setAmount(formatted);
    setTotalBrl(totalFromAmount(formatted, unitPriceFor(coin)));
  }

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
        <div className="w-full sm:w-28">
          <label htmlFor="wcoin" className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
            Moeda
          </label>
          <select
            id="wcoin"
            name="coin"
            required
            value={coin}
            onChange={(e) => handleCoinChange(e.target.value)}
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
          <div className="relative">
            <input
              id="wamount"
              name="amount"
              type="text"
              inputMode="decimal"
              required
              value={amount}
              onChange={(e) => handleAmountChange(e.target.value)}
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
        <div className="w-full sm:w-40">
          <label htmlFor="wtotal" className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
            Valor total (R$)
          </label>
          <input
            id="wtotal"
            type="text"
            inputMode="decimal"
            value={totalBrl}
            onChange={(e) => handleTotalChange(e.target.value)}
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
