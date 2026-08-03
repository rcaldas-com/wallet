import 'server-only';
import clientPromise from './mongodb';
import { getAdminEmails } from './data-wallet';
import { sendPriceAnomalyEmail } from './email';

// Disjuntor de cotação: protege contra uma exchange devolvendo um preço
// totalmente irreal — seja um glitch de segundos (orderbook vazio por um
// instante) ou um bug que persiste minutos (rota cross-exchange decompensada,
// erro no provedor). Comparar só contra a última leitura (ou confirmar com
// uma segunda consulta imediata) NÃO protege contra o segundo caso: um bug
// que dura minutos "confirma" a si mesmo em qualquer checagem rápida.
//
// Por isso guardamos um histórico curto (HISTORY_SIZE leituras) de preços já
// validados como normais, e comparamos toda leitura nova contra a MÉDIA desse
// histórico — não contra o último valor isolado. Uma leitura muito fora da
// média dispara o disjuntor: para de alimentar o histórico com valores
// suspeitos (protege a média de ser contaminada) e passa a bloquear operações
// dessa moeda (ver getPriceStatus / isTripped, usado em convert.ts e
// withdraw.ts). Só volta sozinho quando uma leitura nova voltar perto da
// média capturada no momento do disparo, ou quando o admin liberar manualmente
// (resetBreaker). O admin é notificado por email quando dispara.
//
// Persistido no Mongo (não em memória): o estado "travado" precisa sobreviver
// a um restart/redeploy do servidor — perder essa informação silenciosamente
// voltaria a liberar operações contra uma cotação ainda não confirmada como
// normal.

const HISTORY_SIZE = 10;
// Desvio (fração da média histórica) que dispara o disjuntor.
const TRIP_DEVIATION = 0.15;
// Para destravar sozinho, a leitura precisa voltar mais perto da média do que
// isso — mais rígido que o limiar de disparo (histerese), evita ficar
// oscilando destravando/travando bem em cima do limiar.
const RECOVERY_DEVIATION = 0.08;
// Com menos leituras normais que isso acumuladas, não há base confiável pra
// julgar anomalia — só acumula histórico.
const MIN_HISTORY_FOR_CHECK = 3;

type PriceMonitorDoc = {
  coin: string;
  history: { price: number; at: Date }[];
  tripped: boolean;
  trippedAt: Date | null;
  trippedPrice: number | null;
  baselineAvg: number | null;
  notifiedAt: Date | null;
  resetAt: Date | null;
  resetBy: string | null;
  updatedAt: Date;
};

export type PriceStatus = {
  coin: string;
  tripped: boolean;
  trippedAt: Date | null;
  trippedPrice: number | null;
  baselineAvg: number | null;
};

async function getCollection() {
  const client = await clientPromise;
  return client.db().collection<PriceMonitorDoc>('priceMonitor');
}

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function toStatus(doc: PriceMonitorDoc | null, coin: string): PriceStatus {
  if (!doc) return { coin, tripped: false, trippedAt: null, trippedPrice: null, baselineAvg: null };
  return {
    coin,
    tripped: doc.tripped,
    trippedAt: doc.trippedAt,
    trippedPrice: doc.trippedPrice,
    baselineAvg: doc.baselineAvg,
  };
}

/**
 * Registra uma leitura nova de preço e devolve o preço "efetivo" a usar
 * (o próprio valor, se aceito; o baseline congelado, se o disjuntor estiver
 * travado) junto com o estado do disjuntor. Chamado pelo quotes.ts a cada
 * consulta de preço bem-sucedida ao ccxt — nunca lança, best-effort.
 */
export async function recordPrice(coin: string, price: number): Promise<{ price: number; tripped: boolean }> {
  try {
    const col = await getCollection();
    const doc = await col.findOne({ coin });
    const now = new Date();

    // Disjuntor já travado: só destrava se a leitura voltar perto do baseline.
    if (doc?.tripped) {
      const baseline = doc.baselineAvg ?? doc.trippedPrice ?? price;
      const deviation = Math.abs(price - baseline) / baseline;
      if (deviation <= RECOVERY_DEVIATION) {
        const history = [...doc.history, { price, at: now }].slice(-HISTORY_SIZE);
        await col.updateOne(
          { coin },
          { $set: { history, tripped: false, notifiedAt: null, updatedAt: now } },
        );
        console.warn(`Disjuntor de cotação ${coin}/BRL normalizado sozinho: voltou a R$${price} (baseline R$${baseline.toFixed(4)}).`);
        notifyAdmins(coin, 'recovered', { price, baselineAvg: baseline }).catch(() => {});
        return { price, tripped: false };
      }
      // Ainda fora da faixa: não alimenta o histórico, mantém travado.
      await col.updateOne({ coin }, { $set: { updatedAt: now } });
      return { price: baseline, tripped: true };
    }

    const history = doc?.history ?? [];
    if (history.length >= MIN_HISTORY_FOR_CHECK) {
      const baseline = average(history.map((h) => h.price));
      const deviation = Math.abs(price - baseline) / baseline;
      if (deviation > TRIP_DEVIATION) {
        await col.updateOne(
          { coin },
          {
            $set: {
              coin,
              tripped: true,
              trippedAt: now,
              trippedPrice: price,
              baselineAvg: baseline,
              notifiedAt: now,
              updatedAt: now,
            },
          },
          { upsert: true },
        );
        console.error(
          `Disjuntor de cotação ${coin}/BRL ACIONADO: R$${price} desvia ${(deviation * 100).toFixed(1)}% ` +
            `da média histórica R$${baseline.toFixed(4)}. Operações de conversão/saque bloqueadas até normalizar.`,
        );
        notifyAdmins(coin, 'tripped', { price, baselineAvg: baseline, deviationPct: deviation * 100 }).catch(() => {});
        return { price: baseline, tripped: true };
      }
    }

    const newHistory = [...history, { price, at: now }].slice(-HISTORY_SIZE);
    await col.updateOne(
      { coin },
      { $set: { coin, history: newHistory, tripped: false, updatedAt: now } },
      { upsert: true },
    );
    return { price, tripped: false };
  } catch (err) {
    // Falha no Mongo não pode travar a leitura de preço — segue sem o
    // disjuntor pra essa consulta específica.
    console.error(`Falha ao registrar preço no disjuntor (${coin}):`, err);
    return { price, tripped: false };
  }
}

async function notifyAdmins(
  coin: string,
  kind: 'tripped' | 'recovered',
  data: { price: number; baselineAvg: number; deviationPct?: number },
) {
  const admins = await getAdminEmails();
  if (admins.length === 0) return;
  await sendPriceAnomalyEmail({ admins, coin, kind, ...data });
}

/** Estado atual do disjuntor de uma moeda — usado por convert.ts/withdraw.ts
 * para bloquear operações, e pela UI para mostrar o aviso. */
export async function getPriceStatus(coin: string): Promise<PriceStatus> {
  try {
    const col = await getCollection();
    const doc = await col.findOne({ coin });
    return toStatus(doc, coin);
  } catch (err) {
    console.error(`Falha ao ler status do disjuntor (${coin}):`, err);
    return toStatus(null, coin);
  }
}

/** Todas as moedas com o disjuntor travado agora — para a tela de admin. */
export async function listTrippedCoins(): Promise<PriceStatus[]> {
  try {
    const col = await getCollection();
    const docs = await col.find({ tripped: true }).toArray();
    return docs.map((d) => toStatus(d, d.coin));
  } catch (err) {
    console.error('Falha ao listar disjuntores travados:', err);
    return [];
  }
}

/** Libera manualmente o disjuntor de uma moeda (admin). Mantém o histórico —
 * só limpa o estado de travado. */
export async function resetBreaker(coin: string, adminId: string): Promise<boolean> {
  const col = await getCollection();
  const res = await col.updateOne(
    { coin, tripped: true },
    { $set: { tripped: false, notifiedAt: null, resetAt: new Date(), resetBy: adminId, updatedAt: new Date() } },
  );
  return res.modifiedCount > 0;
}
