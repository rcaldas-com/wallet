'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

// Mesma ideia do AutoRefresh do Finance (web/app/finance/AutoRefresh.tsx),
// mas com um timer de verdade em vez de só reagir a voltar pra aba — aqui a
// cotação das moedas muda o tempo todo, então vale manter atualizado mesmo
// com a aba aberta e parada. Pausa sozinho quando a aba fica em segundo
// plano (document.visibilityState !== 'visible'), pra não gastar recurso à
// toa; ao voltar, atualiza na hora se já passou tempo suficiente desde a
// última vez, em vez de esperar o próximo tick.
//
// `intervalMs` padrão de 30s: o preço em quotes.ts já fica em cache por 60s
// (PRICE_TTL_MS) — atualizar mais rápido que isso não traz cotação mais
// fresca, só recarrega a mesma cotação em cache à toa.
export default function AutoRefresh({ intervalMs = 30_000 }: { intervalMs?: number }) {
  const router = useRouter();
  const lastRefresh = useRef(Date.now());

  useEffect(() => {
    const refresh = () => {
      lastRefresh.current = Date.now();
      router.refresh();
    };

    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      refresh();
    };

    const interval = setInterval(tick, intervalMs);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRefresh.current >= intervalMs) {
        refresh();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [router, intervalMs]);

  return null;
}
