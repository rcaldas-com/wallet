'use client';

import { useActionState, useEffect, useState } from 'react';
import { createDeposit, type DepositState } from '@/app/lib/actions/deposit';
import type { UserOption } from '@/app/lib/definitions';

type Toast = { id: number; message: string; success: boolean };

const initialState: DepositState = { success: false, message: '' };

export default function DepositForm({
  users,
  coins,
}: {
  users: UserOption[];
  coins: string[];
}) {
  const [state, formAction, isPending] = useActionState(createDeposit, initialState);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [coin, setCoin] = useState(coins[0] || '');
  const [amount, setAmount] = useState('');

  // Empurra cada resultado da action para a lista de toasts fixos.
  useEffect(() => {
    if (state.message) {
      const id = Date.now();
      setToasts((prev) => [...prev, { id, message: state.message, success: state.success }]);
      const timer = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [state]);

  const selectedUserName = users.find((u) => u._id === selectedUser)?.name;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!selectedUser || !coin || !amount) return;
    const ok = confirm(
      `Confirmar depósito de ${amount} ${coin} para ${selectedUserName || 'usuário'}?\n\n` +
        `Esta operação envia o token na rede Stellar e é irreversível.`,
    );
    if (!ok) {
      e.preventDefault();
    }
  }

  return (
    <>
      <form action={formAction} onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="userId" className="block text-sm font-medium text-gray-700 mb-1">
            Usuário
          </label>
          <select
            id="userId"
            name="userId"
            required
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">Selecione…</option>
            {users.map((u) => (
              <option key={u._id} value={u._id}>
                {u.name} ({u.email})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="coin" className="block text-sm font-medium text-gray-700 mb-1">
              Moeda
            </label>
            <select
              id="coin"
              name="coin"
              required
              value={coin}
              onChange={(e) => setCoin(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {coins.length === 0 && <option value="">Nenhum issuer</option>}
              {coins.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-1">
              Quantidade
            </label>
            <input
              id="amount"
              name="amount"
              type="text"
              inputMode="decimal"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        <div>
          <label htmlFor="desc" className="block text-sm font-medium text-gray-700 mb-1">
            Descrição <span className="text-gray-400">(opcional)</span>
          </label>
          <input
            id="desc"
            name="desc"
            type="text"
            placeholder="Ex.: transferência recebida em 22/07"
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-md transition"
        >
          {isPending ? 'Processando…' : 'Registrar depósito'}
        </button>
      </form>

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
