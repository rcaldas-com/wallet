'use client';

import { useState } from 'react';
import { walletTypeLabel } from '@/app/lib/wallet-labels';

export type CoinSource = { type: string; key: string; balance: number };

// Posição em aberto na moeda (custo médio no app x quanto vale agora) — só
// vem preenchida quando o histórico bate com o saldo custodiado.
export type CoinPosition = { costBrl: number; valueBrl: number; since: string | null };

const num = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 7 });
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Truncada só o suficiente pra reconhecer sem ocupar a linha inteira — não
// precisa da chave completa aqui, é só contexto de origem.
const truncateKey = (key: string) => (key.length > 16 ? `${key.slice(0, 8)}…${key.slice(-6)}` : key);

export default function CoinCard({
  coin,
  displayName,
  balance,
  valueBrl,
  sources,
  position,
}: {
  coin: string;
  displayName: string | null;
  balance: number;
  valueBrl: number;
  sources: CoinSource[];
  position?: CoinPosition;
}) {
  const [open, setOpen] = useState(false);

  const hint =
    sources.length > 0
      ? `Origem: ${sources.map((s) => walletTypeLabel(s.type)).join(', ')}`
      : undefined;

  return (
    <div
      className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-100 dark:border-zinc-800 p-4 cursor-pointer"
      onClick={() => setOpen((v) => !v)}
      title={hint}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-gray-800 dark:text-zinc-100">
            {coin}
            {displayName && (
              <span className="ml-1.5 font-normal text-gray-500 dark:text-zinc-400">({displayName})</span>
            )}
          </p>
          <p className="text-gray-500 dark:text-zinc-400 text-sm">{num(balance)}</p>
          {position && position.costBrl > 0 && (
            <p
              className={`text-xs mt-0.5 ${
                position.valueBrl >= position.costBrl
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              Custo {brl(position.costBrl)} ·{' '}
              {position.valueBrl >= position.costBrl ? '+' : '−'}
              {brl(Math.abs(position.valueBrl - position.costBrl))} (
              {position.valueBrl >= position.costBrl ? '+' : '−'}
              {Math.abs(((position.valueBrl - position.costBrl) / position.costBrl) * 100).toFixed(1)}%)
              {position.since && ` desde ${new Date(position.since).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })}`}
            </p>
          )}
        </div>
        <p className="text-gray-900 dark:text-zinc-50 font-medium">{brl(valueBrl)}</p>
      </div>

      {open && sources.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-zinc-800 space-y-1">
          <p className="text-xs font-medium text-gray-400 dark:text-zinc-500">Origem</p>
          {sources.map((s, i) => (
            <div key={i} className="flex items-center justify-between text-xs text-gray-500 dark:text-zinc-400">
              <span>
                {walletTypeLabel(s.type)}
                {s.type !== 'binance' && s.type !== 'bybit' && s.type !== 'okx' && (
                  <span className="font-mono ml-1">({truncateKey(s.key)})</span>
                )}
              </span>
              <span>{num(s.balance)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
