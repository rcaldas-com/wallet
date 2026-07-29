'use client';

import { useState, useTransition } from 'react';
import { cancelWithdraw } from '@/app/lib/actions/withdraw';

// Botão para o usuário cancelar o próprio pedido de saque enquanto está
// pendente (aparece na lista de movimentações). Nada foi movido on-chain no
// pedido, então cancelar é só desistir antes do admin processar.
export default function CancelWithdrawButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');

  const handleClick = () => {
    if (!confirm('Cancelar este pedido de saque?')) return;
    setError('');
    startTransition(async () => {
      const res = await cancelWithdraw(id);
      if (!res.success) setError(res.message);
    });
  };

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="text-xs font-medium text-gray-500 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 underline decoration-dotted disabled:opacity-60"
      >
        {pending ? 'Cancelando…' : 'Cancelar'}
      </button>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </span>
  );
}
