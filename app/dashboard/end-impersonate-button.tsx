'use client';

import { useState } from 'react';

export default function EndImpersonateButton() {
  const [isLoading, setIsLoading] = useState(false);

  const handleEndImpersonate = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/impersonate/end', { method: 'POST' });
      if (!response.ok) {
        throw new Error('Erro ao encerrar visualização');
      }
      window.location.href = '/dashboard';
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Erro ao encerrar visualização');
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleEndImpersonate}
      disabled={isLoading}
      className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
    >
      {isLoading ? 'Voltando…' : 'Voltar ao admin'}
    </button>
  );
}
