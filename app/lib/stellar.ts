import 'server-only';
import {
  Horizon,
  Keypair,
  TransactionBuilder,
  Networks,
  Operation,
  Asset,
  BASE_FEE,
} from '@stellar/stellar-sdk';
import { ObjectId } from 'mongodb';
import clientPromise from './mongodb';
import { IssuerDoc, WalletDoc } from './definitions';

// --- Configuração de rede ---
const HORIZON_URL = process.env.STELLAR_HORIZON || 'https://horizon.stellar.org';
const NETWORK_PASSPHRASE =
  (process.env.STELLAR_NETWORK || 'public') === 'testnet'
    ? Networks.TESTNET
    : Networks.PUBLIC;

// Domínio usado no home_domain das contas (igual ao sistema antigo).
const HOME_DOMAIN = process.env.STELLAR_HOME_DOMAIN || 'rcaldas.com';
// XLM inicial ao criar uma conta nova (financiado pela MAIN_WALLET). Cada
// trustline exige 0.5 XLM de reserva; com N issuers a reserva mínima da conta
// é (2+N)*0.5. Valor generoso (igual ao sistema antigo) para não ficar curto
// à medida que novos issuers forem cadastrados.
const INITIAL_BALANCE = process.env.STELLAR_INITIAL_BALANCE || '10';
// Recarga de XLM enviada quando uma conta fica sem reserva para novas trustlines.
const RESERVE_TOPUP = process.env.STELLAR_RESERVE_TOPUP || '3';

export function getServer(): Horizon.Server {
  return new Horizon.Server(HORIZON_URL);
}

export function getMainWallet(): Keypair {
  const secret = process.env.MAIN_WALLET;
  if (!secret) {
    throw new Error('MAIN_WALLET não configurada no ambiente.');
  }
  return Keypair.fromSecret(secret);
}

// Extrai os result_codes de operação de um erro do Horizon.
function operationCodes(err: unknown): string[] {
  const anyErr = err as { response?: { data?: { extras?: { result_codes?: { operations?: string[] } } } } };
  return anyErr?.response?.data?.extras?.result_codes?.operations || [];
}

function isNotFound(err: unknown): boolean {
  const anyErr = err as { response?: { status?: number }; name?: string };
  return anyErr?.response?.status === 404 || anyErr?.name === 'NotFoundError';
}

// Detecta falhas por saldo de XLM insuficiente — seja para abrir uma nova
// trustline (reserva) ou para pagar a taxa da transação. Cobertas por recarga
// automática e transparente a partir da MAIN_WALLET, em qualquer operação
// assinada pela conta do usuário.
function isInsufficientXlm(err: unknown): boolean {
  if (operationCodes(err).some((c) => c === 'op_low_reserve' || c === 'op_underfunded')) {
    return true;
  }
  const anyErr = err as {
    response?: { data?: { extras?: { result_codes?: { transaction?: string } } } };
  };
  return anyErr?.response?.data?.extras?.result_codes?.transaction === 'tx_insufficient_balance';
}

async function baseFee(server: Horizon.Server): Promise<string> {
  try {
    const fee = await server.fetchBaseFee();
    return String(fee);
  } catch {
    return BASE_FEE;
  }
}

// Carrega uma conta com retentativas. O Horizon confirma a transação no
// ledger antes de sua própria indexação terminar de propagar — uma conta
// recém-criada pode devolver 404 por um instante mesmo já existindo on-chain.
async function loadAccountWithRetry(
  server: Horizon.Server,
  publicKey: string,
  attempts = 5,
  delayMs = 1000,
) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await server.loadAccount(publicKey);
    } catch (err) {
      if (isNotFound(err) && i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error('unreachable');
}

// --- Acesso a issuers e wallets (server-only, inclui secrets) ---

async function loadIssuer(name: string): Promise<IssuerDoc | null> {
  const client = await clientPromise;
  const doc = await client.db().collection('issuer').findOne({ name });
  if (!doc) return null;
  return {
    _id: doc._id.toString(),
    name: doc.name,
    public_key: doc.public_key,
    secret: doc.secret ?? null,
    mirror: doc.mirror ?? null,
  };
}

async function getAllIssuers(): Promise<IssuerDoc[]> {
  const client = await clientPromise;
  const docs = await client.db().collection('issuer').find().toArray();
  return docs.map((doc) => ({
    _id: doc._id.toString(),
    name: doc.name,
    public_key: doc.public_key,
    secret: doc.secret ?? null,
    mirror: doc.mirror ?? null,
  }));
}

// Wallet custodiada principal de um usuário (type 'main', fallback 'stellar').
async function getUserMainWallet(userId: string): Promise<WalletDoc | null> {
  const client = await clientPromise;
  const wallets = client.db().collection('wallet');
  const uid = new ObjectId(userId);
  const doc =
    (await wallets.findOne({ user: uid, type: 'main' })) ||
    (await wallets.findOne({ user: uid, type: 'stellar' }));
  if (!doc) return null;
  return {
    _id: doc._id.toString(),
    user: doc.user.toString(),
    type: doc.type,
    key: doc.key,
    secret: doc.secret ?? null,
    updatedAt: doc.updated_at ?? doc.updatedAt ?? null,
  };
}

// Cria a wallet custodiada do usuário: a conta on-chain (financiada pela
// MAIN_WALLET) e, assim que ela existe, a persistência no banco — nessa
// ordem, para nunca gerar uma conta financiada cuja secret se perde se a
// etapa seguinte (trustlines) falhar. Trustlines é best-effort aqui: se
// falhar, a wallet já existe e o fluxo de depósito sabe recuperar (cria a
// trustline da moeda específica quando o pagamento falha por falta dela).
async function createUserWallet(userId: string): Promise<WalletDoc> {
  const server = getServer();
  const keypair = Keypair.random();

  // 1) Cria a conta on-chain a partir da MAIN_WALLET.
  const main = getMainWallet();
  const mainAccount = await server.loadAccount(main.publicKey());
  const fee = await baseFee(server);
  const createTx = new TransactionBuilder(mainAccount, {
    fee,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.createAccount({
        destination: keypair.publicKey(),
        startingBalance: INITIAL_BALANCE,
      }),
    )
    .setTimeout(60)
    .build();
  createTx.sign(main);
  await server.submitTransaction(createTx);

  // 2) Persiste a wallet imediatamente — a partir daqui a secret nunca mais
  // se perde, mesmo que a etapa de trustlines abaixo falhe.
  const client = await clientPromise;
  const insert = await client.db().collection('wallet').insertOne({
    user: new ObjectId(userId),
    type: 'main',
    key: keypair.publicKey(),
    secret: keypair.secret(),
    updated_at: new Date(),
  });

  const wallet: WalletDoc = {
    _id: insert.insertedId.toString(),
    user: userId,
    type: 'main',
    key: keypair.publicKey(),
    secret: keypair.secret(),
  };

  // 3) Estabelece as trustlines para todos os issuers (best-effort).
  try {
    await setTrustlines(keypair);
  } catch (err) {
    console.error(
      `Falha ao estabelecer trustlines iniciais para ${wallet.key} (usuário ${userId}); ` +
        'a wallet já está salva e o depósito tentará criar a trustline específica quando necessário:',
      err,
    );
  }

  return wallet;
}

// Envia uma pequena recarga de XLM da MAIN_WALLET para uma conta (para cobrir reserva).
async function topUpReserve(destination: string): Promise<void> {
  const server = getServer();
  const main = getMainWallet();
  const mainAccount = await server.loadAccount(main.publicKey());
  const fee = await baseFee(server);
  const tx = new TransactionBuilder(mainAccount, {
    fee,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.payment({
        destination,
        asset: Asset.native(),
        amount: RESERVE_TOPUP,
      }),
    )
    .setTimeout(60)
    .build();
  tx.sign(main);
  await server.submitTransaction(tx);
}

// Cria as trustlines faltantes na conta do usuário para os issuers informados
// (ou todos, se não especificado). Assinado pela própria conta do usuário.
async function setTrustlines(userKeypair: Keypair, only?: string[]): Promise<void> {
  const server = getServer();
  const issuers = await getAllIssuers();
  const targets = only ? issuers.filter((i) => only.includes(i.name)) : issuers;
  if (targets.length === 0) return;

  const build = async () => {
    const account = await loadAccountWithRetry(server, userKeypair.publicKey());
    const fee = await baseFee(server);
    let builder = new TransactionBuilder(account, {
      fee,
      networkPassphrase: NETWORK_PASSPHRASE,
    }).addOperation(Operation.setOptions({ homeDomain: HOME_DOMAIN }));
    for (const issuer of targets) {
      builder = builder.addOperation(
        Operation.changeTrust({ asset: new Asset(issuer.name, issuer.public_key) }),
      );
    }
    const tx = builder.setTimeout(60).build();
    tx.sign(userKeypair);
    return tx;
  };

  try {
    await server.submitTransaction(await build());
  } catch (err) {
    // XLM insuficiente (reserva ou taxa): recarrega e tenta de novo — de
    // forma transparente, sem expor esse detalhe operacional ao usuário.
    if (isInsufficientXlm(err)) {
      await topUpReserve(userKeypair.publicKey());
      await server.submitTransaction(await build());
      return;
    }
    throw err;
  }
}

// --- Depósito: o issuer envia o token para a conta do usuário ---

export type DepositResult =
  | { ok: true; publicKey: string }
  | { ok: false; error: string };

export async function depositCoin(params: {
  userId: string;
  coin: string;
  amount: string;
  desc?: string;
}): Promise<DepositResult> {
  const { userId, coin, amount } = params;

  const issuer = await loadIssuer(coin);
  if (!issuer || !issuer.secret) {
    return { ok: false, error: `Issuer "${coin}" não encontrado ou sem chave.` };
  }
  const issuerKp = Keypair.fromSecret(issuer.secret);
  const asset = new Asset(issuer.name, issuerKp.publicKey());

  // Garante que o usuário tenha uma wallet custodiada.
  let wallet = await getUserMainWallet(userId);
  if (!wallet) {
    try {
      wallet = await createUserWallet(userId);
    } catch (err) {
      console.error('Erro ao criar wallet do usuário:', err);
      return { ok: false, error: 'Falha ao criar a conta Stellar do usuário.' };
    }
  }

  const server = getServer();

  const buildPayment = async () => {
    const issuerAccount = await server.loadAccount(issuerKp.publicKey());
    const fee = await baseFee(server);
    const tx = new TransactionBuilder(issuerAccount, {
      fee,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        Operation.payment({
          destination: wallet!.key,
          asset,
          amount,
        }),
      )
      .setTimeout(60)
      .build();
    tx.sign(issuerKp);
    return tx;
  };

  try {
    await server.submitTransaction(await buildPayment());
    return { ok: true, publicKey: wallet.key };
  } catch (err) {
    const codes = operationCodes(err);
    // Conta do usuário não confia no asset: cria a trustline e tenta de novo.
    if (codes.includes('op_no_trust')) {
      if (!wallet.secret) {
        return {
          ok: false,
          error: 'A conta do usuário não confia neste token e não é custodiada.',
        };
      }
      try {
        await setTrustlines(Keypair.fromSecret(wallet.secret), [coin]);
        await server.submitTransaction(await buildPayment());
        return { ok: true, publicKey: wallet.key };
      } catch (retryErr) {
        console.error('Erro no depósito após criar trustline:', retryErr);
        return { ok: false, error: 'Falha ao depositar após estabelecer a trustline.' };
      }
    }
    console.error('Erro no depósito:', err);
    return { ok: false, error: 'Falha ao submeter o depósito na rede Stellar.' };
  }
}

// --- Saque: o usuário devolve o token ao issuer ---

export type WithdrawResult =
  | { ok: true; hash: string }
  | { ok: false; error: string };

export async function withdrawCoin(params: {
  userId: string;
  coin: string;
  amount: string;
}): Promise<WithdrawResult> {
  const { userId, coin, amount } = params;

  const issuer = await loadIssuer(coin);
  if (!issuer) {
    return { ok: false, error: `Issuer "${coin}" não encontrado.` };
  }
  const asset = new Asset(issuer.name, issuer.public_key);

  const wallet = await getUserMainWallet(userId);
  if (!wallet) {
    return { ok: false, error: 'Usuário não possui carteira custodiada.' };
  }
  if (!wallet.secret) {
    return { ok: false, error: 'Carteira não custodiada — saque on-chain indisponível.' };
  }
  const userKp = Keypair.fromSecret(wallet.secret);

  const server = getServer();
  let account;
  try {
    account = await server.loadAccount(wallet.key);
  } catch (err) {
    if (isNotFound(err)) {
      return { ok: false, error: 'A conta Stellar do usuário não existe.' };
    }
    console.error('Erro ao carregar conta do usuário:', err);
    return { ok: false, error: 'Falha ao consultar a conta do usuário.' };
  }

  // Confere trustline e saldo disponível do token.
  let available: number | null = null;
  for (const b of account.balances) {
    if ('asset_code' in b && b.asset_code === coin && b.asset_issuer === issuer.public_key) {
      available = parseFloat(b.balance);
    }
  }
  if (available === null) {
    return { ok: false, error: 'A conta do usuário não confia neste token.' };
  }
  if (available < Number(amount)) {
    return {
      ok: false,
      error: `Saldo insuficiente: disponível ${available} ${coin}.`,
    };
  }

  const buildWithdraw = async () => {
    // Recarrega a conta a cada tentativa — a sequence não muda com a
    // recarga de XLM (paga pela MAIN_WALLET), mas mantém o padrão do
    // restante do arquivo e cobre qualquer atraso de indexação do Horizon.
    const acc = await loadAccountWithRetry(server, wallet.key);
    const fee = await baseFee(server);
    const t = new TransactionBuilder(acc, {
      fee,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(Operation.payment({ destination: issuer.public_key, asset, amount }))
      .setTimeout(60)
      .build();
    t.sign(userKp);
    return t;
  };

  try {
    const res = await server.submitTransaction(await buildWithdraw());
    return { ok: true, hash: res.hash };
  } catch (err) {
    // XLM insuficiente para a taxa: recarrega a conta do usuário a partir da
    // MAIN_WALLET e tenta de novo — transparente, sem falhar para o usuário.
    if (isInsufficientXlm(err)) {
      try {
        await topUpReserve(wallet.key);
        const res = await server.submitTransaction(await buildWithdraw());
        return { ok: true, hash: res.hash };
      } catch (retryErr) {
        console.error('Erro no saque após recarregar a conta:', retryErr);
        return { ok: false, error: 'Falha ao submeter o saque após recarregar a conta.' };
      }
    }
    console.error('Erro no saque:', err);
    return { ok: false, error: 'Falha ao submeter o saque na rede Stellar.' };
  }
}

// --- Preço via a própria rede Stellar (fallback para ativos sem par nas
// exchanges centralizadas, ex.: AQUA e outros tokens do ecossistema) ---

// Preço de 1 unidade de um ativo Stellar em XLM, pela melhor rota de path
// payment disponível no DEX (inclusive rotas indiretas) — mesma técnica do
// `convert_balances` do sistema antigo, usada aqui só para cotação.
export async function getStellarPathPriceInXlm(
  assetCode: string,
  assetIssuer: string,
): Promise<number | null> {
  try {
    const server = getServer();
    const sourceAsset = new Asset(assetCode, assetIssuer);
    const paths = await server.strictSendPaths(sourceAsset, '1', [Asset.native()]).call();
    let best = 0;
    for (const p of paths.records) {
      const amount = parseFloat(p.destination_amount);
      if (amount > best) best = amount;
    }
    return best > 0 ? best : null;
  } catch (err) {
    console.error(`Falha ao consultar path payment Stellar para ${assetCode}:`, err);
    return null;
  }
}

// --- Leitura de saldos on-chain ---

export type RawBalance = { coin: string; balance: number; issuer?: string };

// Lê os saldos brutos de uma conta Stellar. Retorna [] se a conta não existir.
export async function getAccountBalances(publicKey: string): Promise<RawBalance[]> {
  const server = getServer();
  try {
    const account = await server.loadAccount(publicKey);
    const result: RawBalance[] = [];
    for (const b of account.balances) {
      const balance = parseFloat(b.balance);
      if (b.asset_type === 'native') {
        result.push({ coin: 'XLM', balance });
      } else if ('asset_code' in b) {
        result.push({ coin: b.asset_code, balance, issuer: b.asset_issuer });
      }
    }
    return result;
  } catch (err) {
    if (isNotFound(err)) return [];
    console.error(`Erro ao ler saldos de ${publicKey}:`, err);
    return [];
  }
}
