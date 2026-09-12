import { NextRequest, NextResponse } from 'next/server';
import { refreshAllPrices } from '@/app/lib/quotes';
import { capturePortfolioSnapshots } from '@/app/lib/portfolio-history';

// Chamado por uma rotina externa agendada (fora deste app — Next.js não tem
// cron embutido), não por usuário nenhum. Existe pra manter o disjuntor de
// cotação (price-monitor.ts) alimentado com leituras regulares mesmo sem
// ninguém abrir o dashboard por dias, e pra capturar o histórico de valor da
// carteira ao longo do tempo (portfolio-history.ts) — ver wallet/CLAUDE.md
// pra quem/o que chama isto e com que intervalo.
//
// INTERNAL_TICK_SECRET precisa estar configurado — sem ele, recusa por
// padrão (fail closed) em vez de aceitar chamada sem autenticação nenhuma.
export async function POST(request: NextRequest) {
  const expected = process.env.INTERNAL_TICK_SECRET;
  const provided = request.headers.get('x-internal-secret');
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const [prices, snapshots] = await Promise.allSettled([
    refreshAllPrices(),
    capturePortfolioSnapshots(),
  ]);

  if (prices.status === 'rejected') {
    console.error('tick: falha ao atualizar cotações:', prices.reason);
  }
  if (snapshots.status === 'rejected') {
    console.error('tick: falha ao capturar snapshot de carteiras:', snapshots.reason);
  }

  return NextResponse.json({
    ok: true,
    prices: prices.status === 'fulfilled' ? prices.value : { error: String(prices.reason) },
    snapshots: snapshots.status === 'fulfilled' ? snapshots.value : { error: String(snapshots.reason) },
  });
}
