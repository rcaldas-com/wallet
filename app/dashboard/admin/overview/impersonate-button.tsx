'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { EyeIcon } from '@heroicons/react/24/outline';
import { startImpersonation } from '@/app/lib/actions/impersonate';

// Mesmo botão de olho do app web (configurações de usuário). Depois de
// iniciar, recarrega a página inteira em vez de navegar por dentro do app:
// o layout raiz (banner amarelo, tema do usuário) só é refeito num load
// completo, e uma navegação suave manteria o layout antigo.
export default function ImpersonateButton({
  userId,
  userName,
  userEmail,
}: {
  userId: string;
  userName: string;
  userEmail: string;
}) {
  const pathname = usePathname(); // sem o basePath
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (
      !confirm(
        `Ver o sistema como ${userName} (${userEmail})?\n\nVocê poderá navegar como este usuário por até 2 horas. Para voltar, use o botão no aviso amarelo no topo da página.`,
      )
    ) {
      return;
    }

    setLoading(true);
    const result = await startImpersonation(userId);
    if (!result.ok) {
      alert(result.error ?? 'Erro ao iniciar visualização');
      setLoading(false);
      return;
    }

    // window.location.pathname inclui o basePath (/wallet em dev, nada em
    // produção); usePathname() não — a diferença é o prefixo.
    const basePath = window.location.pathname.slice(0, window.location.pathname.length - pathname.length);
    window.location.assign(`${basePath}/dashboard`);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="inline-flex items-center rounded px-1.5 py-1 text-gray-400 hover:text-gray-800 disabled:opacity-50 dark:text-zinc-500 dark:hover:text-zinc-100"
      title={`Ver como ${userName}`}
      aria-label={`Ver como ${userName}`}
    >
      <EyeIcon className="h-5 w-5" />
      {loading && <span className="ml-1 text-xs">...</span>}
    </button>
  );
}
