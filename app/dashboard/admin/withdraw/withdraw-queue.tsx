'use client';

import { useActionState, useCallback, useEffect, useState } from 'react';
import { confirmWithdraw, declineWithdraw, type WithdrawState } from '@/app/lib/actions/withdraw';
import type { PendingWithdraw } from '@/app/lib/definitions';

type Toast = { id: number; message: string; success: boolean };
type PushToast = (message: string, success: boolean) => void;

const initialState: WithdrawState = { success: false, message: '' };

const num = (v: string) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 7 });
const dateTime = (d: Date) =>
  new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

export default function WithdrawQueue({ items }: { items: PendingWithdraw[] }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = useCallback<PushToast>((message, success) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, success }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000);
  }, []);

  return (
    <>
      <div className="space-y-3">
        {items.map((item) => (
          <WithdrawRow key={item._id} item={item} onResult={pushToast} />
        ))}
      </div>

      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`p-3 rounded-lg text-sm shadow-lg border ${
                t.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border-red-200 text-red-700'
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

function WithdrawRow({ item, onResult }: { item: PendingWithdraw; onResult: PushToast }) {
  const [mode, setMode] = useState<'idle' | 'confirm' | 'decline'>('idle');
  const [confirmState, confirmAction, confirming] = useActionState(confirmWithdraw, initialState);
  const [declineState, declineAction, declining] = useActionState(declineWithdraw, initialState);

  useEffect(() => {
    if (confirmState.message) {
      onResult(confirmState.message, confirmState.success);
      if (confirmState.success) setMode('idle');
    }
  }, [confirmState, onResult]);

  useEffect(() => {
    if (declineState.message) {
      onResult(declineState.message, declineState.success);
      if (declineState.success) setMode('idle');
    }
  }, [declineState, onResult]);

  const busy = confirming || declining;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-gray-800">
            {num(item.amount)} {item.coin}
          </p>
          <p className="text-sm text-gray-600">
            {item.userName} <span className="text-gray-400">· {item.userEmail}</span>
          </p>
          {item.destination && (
            <p className="text-sm text-gray-500 mt-1 break-all">
              <span className="text-gray-400">Destino:</span> {item.destination}
            </p>
          )}
          {item.desc && (
            <p className="text-sm text-gray-500 break-all">
              <span className="text-gray-400">Obs.:</span> {item.desc}
            </p>
          )}
        </div>
        <p className="text-xs text-gray-400 whitespace-nowrap">{dateTime(item.timestamp)}</p>
      </div>

      {mode === 'idle' && (
        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={() => setMode('confirm')}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-1.5 rounded-md transition"
          >
            Confirmar saque
          </button>
          <button
            type="button"
            onClick={() => setMode('decline')}
            className="border border-gray-300 text-gray-600 hover:bg-gray-50 text-sm font-medium px-4 py-1.5 rounded-md transition"
          >
            Recusar
          </button>
        </div>
      )}

      {mode === 'confirm' && (
        <form
          action={confirmAction}
          onSubmit={(e) => {
            if (
              !confirm(
                `Confirmar o saque de ${num(item.amount)} ${item.coin} de ${item.userName}?\n\n` +
                  `O token volta para o issuer na rede Stellar. Esta operação é irreversível.`,
              )
            ) {
              e.preventDefault();
            }
          }}
          className="mt-4 border-t border-gray-100 pt-4 space-y-3"
        >
          <input type="hidden" name="id" value={item._id} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Comprovante da transferência <span className="text-gray-400">(opcional)</span>
            </label>
            <input
              name="proof"
              type="text"
              placeholder="Ex.: E2E do PIX, txid da rede, nº do comprovante"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Arquivo do comprovante <span className="text-gray-400">(opcional)</span>
            </label>
            <input
              name="proofFile"
              type="file"
              accept="image/*,application/pdf"
              className="w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-emerald-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-emerald-700 hover:file:bg-emerald-100"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-1.5 rounded-md transition"
            >
              {confirming ? 'Processando…' : 'Confirmar'}
            </button>
            <button
              type="button"
              onClick={() => setMode('idle')}
              className="text-sm text-gray-500 hover:text-gray-700 px-2"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {mode === 'decline' && (
        <form action={declineAction} className="mt-4 border-t border-gray-100 pt-4 space-y-3">
          <input type="hidden" name="id" value={item._id} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Motivo da recusa</label>
            <input
              name="reason"
              type="text"
              required
              placeholder="Explique o motivo — o usuário recebe por email"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-1.5 rounded-md transition"
            >
              {declining ? 'Enviando…' : 'Recusar pedido'}
            </button>
            <button
              type="button"
              onClick={() => setMode('idle')}
              className="text-sm text-gray-500 hover:text-gray-700 px-2"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
