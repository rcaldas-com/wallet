import 'server-only';
import { cache } from 'react';
import type { CoinBalance } from './definitions';
import type { RawBalance } from './stellar';
import { getStellarPathPriceInXlm } from './stellar';
import { recordPrice } from './price-monitor';
import { getCoinCatalog } from './coin-catalog';
import { listIssuerKeys } from './data-wallet';

// URL do microserviço de cotações (ccxt). No compose, nome do serviço "ccxt".
const CCXT_URL = process.env.CCXT_URL || 'http://ccxt:8000';
// Moeda base do sistema — valor direto, sem conversão.
const BASE_COIN = 'BRL';
// "XLM nativo" (saldo nativo lido de carteira externa) cota pelo mesmo preço
// de XLM — o ccxt não conhece esse rótulo, então mapeamos antes de consultar.
const PRICE_ALIAS: Record<string, string> = { 'XLM nativo': 'XLM' };

// Cache simples em memória por processo (TTL curto) para não bater no serviço
// a cada render. Alinhado ao intervalo do auto-refresh (auto-refresh.tsx) —
// um TTL maior que o refresh só mostraria a mesma cotação em metade das
// atualizações, sem ganho nenhum de carga (o auto-refresh já é o que define
// a frequência real de consulta).
const PRICE_TTL_MS = 30_000;
const priceCache = new Map<string, { price: number; at: number }>();

// Backoff do lado NEGATIVO: uma moeda que o ccxt não resolve (AQUA, só tem
// preço via path payment na Stellar) falharia em TODA chamada, pra sempre —
// com auto-refresh a cada 30s e o tick agendado, isso é consulta repetida à
// toa. Mas o 404 do ccxt significa "preço indisponível" nos DOIS casos (moeda
// não listada OU todas as exchanges falhando por um instante), então não dá
// pra distinguir pelo status. Por isso o backoff é crescente por falhas
// CONSECUTIVAS (30s, 1min, 2min... até 10min) e zera no primeiro sucesso: uma
// falha isolada (ex.: arranque a frio) volta a tentar em 30s, e só quem falha
// sempre chega no teto. (Uma versão anterior usava 10min fixos já na primeira
// falha e deixava a moeda "sem preço" por 10min depois de um único soluço.)
const NEGATIVE_PRICE_MAX_MS = 10 * 60_000;
const negativePriceCache = new Map<string, { at: number; failures: number }>();

function negativeBackoffMs(failures: number): number {
  return Math.min(NEGATIVE_PRICE_MAX_MS, PRICE_TTL_MS * 2 ** (failures - 1));
}

// Busca o preço de 1 unidade de `coin` em BRL via microserviço ccxt, com
// cache e proteção contra cotação anômala (ver price-monitor.ts — histórico
// curto de leituras validadas, disjuntor por desvio da média, não por
// comparação isolada com a última leitura). Retorna null só quando
// indisponível e sem nenhum preço anterior (nem em cache, nem no histórico
// do disjuntor) para cair de volta.
async function fetchBrlPrice(coin: string): Promise<number | null> {
  const cached = priceCache.get(coin);
  if (cached && Date.now() - cached.at < PRICE_TTL_MS) {
    return cached.price;
  }

  const failed = negativePriceCache.get(coin);
  if (failed && Date.now() - failed.at < negativeBackoffMs(failed.failures)) {
    return cached?.price ?? null;
  }

  try {
    const res = await fetch(
      `${CCXT_URL}/price?base=${encodeURIComponent(coin)}&quote=${BASE_COIN}`,
      { cache: 'no-store', signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { price?: number };
    if (typeof data.price !== 'number' || !isFinite(data.price) || data.price <= 0) {
      throw new Error('preço inválido na resposta');
    }

    // O disjuntor decide o preço "efetivo": o próprio valor se aceito, ou o
    // baseline congelado se a leitura estiver fora da faixa histórica normal.
    const { price: effective } = await recordPrice(coin, data.price);
    priceCache.set(coin, { price: effective, at: Date.now() });
    negativePriceCache.delete(coin);
    return effective;
  } catch {
    // Silencioso de propósito: muita moeda (qualquer token só líquido na DEX
    // da Stellar, ex. AQUA) nunca vai aparecer no ccxt, e isso é normal —
    // getBrlPrice tenta o fallback via Stellar em seguida e só loga de
    // verdade (lá embaixo) se TODAS as fontes falharem. Logar aqui
    // incondicionalmente foi o que gerou log sustentado o suficiente pra
    // abrir incidente de monitoramento sozinho, mesmo quando o fallback
    // resolvia a cotação igual (visto em produção: AQUA sempre resolvia via
    // Stellar, e mesmo assim cada tentativa de ccxt gerava uma linha de erro).
    negativePriceCache.set(coin, { at: Date.now(), failures: (failed?.failures ?? 0) + 1 });
    // Falha transitória de rede/serviço: mantém servindo o último preço em
    // cache (mesmo expirado) em vez de propagar "sem cotação" por uma falha
    // de um único ciclo.
    return cached?.price ?? null;
  }
}

// Debounce do log de falha FINAL (nenhuma fonte resolveu) — mesmo raciocínio
// do cache negativo acima, um nível acima: sem isso, uma moeda genuinamente
// sem preço em lugar nenhum voltaria a logar a cada chamada.
const unresolvedLoggedAt = new Map<string, number>();

// Preço de 1 unidade em BRL, ou null quando não há cotação disponível.
// `issuer`, quando informado, habilita um fallback via a própria rede Stellar
// (path payment até XLM) para ativos sem par nas exchanges centralizadas —
// caso de tokens nativos do ecossistema Stellar como AQUA.
//
// cache() do React: memoiza por (coin, issuer) dentro do mesmo request. O
// fetchBrlPrice acima já tem seu próprio cache em memória (TTL 30s, todo o
// processo), então isto não muda nada pro caminho direto — mas o fallback via
// Stellar (getStellarPathPriceInXlm, consulta on-chain ao Horizon) não é
// cacheado, e é chamado de novo do zero a cada getBrlPrice repetido. Isso
// acontecia de verdade: dashboard/page.tsx cota os saldos do usuário
// (valueBalancesInBrl) e depois cota o catálogo inteiro pra prévia de
// conversão — os dois passam pelas mesmas moedas que o usuário já tem; e em
// overview.ts, uma moeda detida por vários usuários tem seu preço recalculado
// uma vez por usuário. Não recalcula nada pós-escrita: getBrlPrice não lê
// nenhum estado que as ações do wallet (depósito/saque/conversão) escrevam —
// preço é cotação externa, e o disjuntor (recordPrice/listTrippedCoins) é
// gravação e leitura de estados diferentes, não afetados por este cache.
export const getBrlPrice = cache(async (coin: string, issuer?: string): Promise<number | null> => {
  coin = PRICE_ALIAS[coin] ?? coin;
  if (coin === BASE_COIN) return 1;

  const direct = await fetchBrlPrice(coin);
  if (direct !== null) return direct;

  if (issuer) {
    const priceInXlm = await getStellarPathPriceInXlm(coin, issuer);
    if (priceInXlm !== null) {
      const xlmBrl = await fetchBrlPrice('XLM');
      if (xlmBrl !== null) return priceInXlm * xlmBrl;
    }
  }

  // Só chega aqui se NENHUMA fonte resolveu (nem ccxt, nem o fallback via
  // Stellar quando havia issuer) — isso sim é falha real de cotação, ao
  // contrário de só o ccxt falhar (silencioso em fetchBrlPrice, porque tem
  // fallback pra tentar). Debounce pra não repetir a cada chamada.
  const loggedAt = unresolvedLoggedAt.get(coin);
  if (!loggedAt || Date.now() - loggedAt >= NEGATIVE_PRICE_MAX_MS) {
    console.error(`Sem cotação disponível para ${coin}/BRL (ccxt e fallback Stellar, se houver, esgotados)`);
    unresolvedLoggedAt.set(coin, Date.now());
  }
  return null;
});

// Valor em BRL de `amount` unidades de `coin`. Moeda sem cotação vale 0 —
// use `getBrlPrice` quando precisar distinguir "vale zero" de "não sei o preço".
export async function getBrlValue(coin: string, amount: number, issuer?: string): Promise<number> {
  const price = await getBrlPrice(coin, issuer);
  if (price === null) return 0;
  return amount * price;
}

// Consulta o preço de toda moeda do catálogo, uma vez cada — chamado pela
// rotina agendada (ver app/api/internal/tick), não por uma página. Existe
// porque o disjuntor (price-monitor.ts) só recebia leitura quando alguém
// abria o dashboard: sem visita por vários dias, o histórico de preços
// "normais" ficava velho, e a primeira visita depois disso comparava o
// preço de hoje contra uma média de dias atrás — variação real e gradual
// parecia anomalia repentina, disparando o disjuntor de várias moedas de
// uma vez só. Rodar isto num intervalo curto e regular mantém a janela do
// disjuntor sempre recente, então só sobra como "anomalia" o que de fato
// saltou dentro da janela.
export async function refreshAllPrices(): Promise<{ checked: number; unpriced: string[] }> {
  const [catalog, issuers] = await Promise.all([getCoinCatalog(), listIssuerKeys()]);
  const issuerByName = new Map(issuers.map((i) => [i.name, i.publicKey]));
  const symbols = [...catalog.priority, ...catalog.others].map((c) => c.symbol);

  const unpriced: string[] = [];
  for (const symbol of symbols) {
    const price = await getBrlPrice(symbol, issuerByName.get(symbol));
    if (price === null) unpriced.push(symbol);
  }
  return { checked: symbols.length, unpriced };
}

// Converte uma lista de saldos brutos em saldos com valor em BRL.
// `unpriced` lista as moedas sem cotação, que entraram como 0 no total — sem
// isso um saldo relevante sumiria do total sem deixar rastro.
export async function valueBalancesInBrl(
  balances: RawBalance[],
  minBrl = 0,
): Promise<{ coins: CoinBalance[]; totalBrl: number; unpriced: string[] }> {
  const coins: CoinBalance[] = [];
  const unpriced: string[] = [];
  let totalBrl = 0;
  for (const b of balances) {
    if (b.balance <= 0) continue;
    const price = await getBrlPrice(b.coin, b.issuer);
    if (price === null && !unpriced.includes(b.coin)) unpriced.push(b.coin);
    const valueBrl = price === null ? 0 : b.balance * price;
    if (valueBrl < minBrl && price !== null) continue;
    coins.push({ coin: b.coin, balance: b.balance, valueBrl });
    totalBrl += valueBrl;
  }
  return { coins, totalBrl, unpriced };
}
