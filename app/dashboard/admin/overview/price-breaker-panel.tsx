'use client';

import { useActionState, useEffect } from 'react';
import { resetPriceBreakerAction, type PriceMonitorState } from '@/app/lib/actions/price-monitor';
import type { PriceStatus } from '@/app/lib/price-monitor';
import Spinner from '@/app/components/spinner';

const initialState: PriceMonitorState = { success: false, message: '' };

const num = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 8 });
const dateTime = (d: Date) =>
  new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

export default function PriceBreakerPanel({ items }: { items: PriceStatus[] }) {
  if (items.length === 0) return null;

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-800 dark:text-zinc-100 mb-1">Cotações suspeitas</h2>
      <p className="text-gray-500 dark:text-zinc-400 text-sm mb-3">
        Disjuntor acionado — a cotação desviou demais da média histórica recente.
        Conversões e saques dessa moeda estão bloqueados até normalizar ou até liberação manual.
      </p>
      <div className="space-y-3">
        {items.map((item) => (
          <BreakerRow key={item.coin} item={item} />
        ))}
      </div>
    </section>
  );
}

function BreakerRow({ item }: { item: PriceStatus }) {
  const [state, action, pending] = useActionState(resetPriceBreakerAction, initialState);

  useEffect(() => {
    if (state.message && !state.success) {
      alert(state.message);
    }
  }, [state]);

  return (
    <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="font-semibold text-red-800 dark:text-red-300">{item.coin}</p>
        <p className="text-sm text-red-700 dark:text-red-400">
          Preço suspeito: R$ {item.trippedPrice != null ? num(item.trippedPrice) : '—'} · Média histórica: R${' '}
          {item.baselineAvg != null ? num(item.baselineAvg) : '—'}
        </p>
        {item.trippedAt && (
          <p className="text-xs text-red-500 dark:text-red-500/80 mt-0.5">Desde {dateTime(item.trippedAt)}</p>
        )}
      </div>
      <form action={action}>
        <input type="hidden" name="coin" value={item.coin} />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-1.5 rounded-md transition"
        >
          {pending && <Spinner className="h-3.5 w-3.5" />}
          {pending ? 'Liberando…' : 'Reativar'}
        </button>
      </form>
    </div>
  );
}
