import 'server-only';
import { ObjectId } from 'mongodb';
import clientPromise from './mongodb';
import { Movement, PendingWithdraw, UserOption } from './definitions';

// Usuários para o seletor do admin (sem dados sensíveis).
export async function listUsers(): Promise<UserOption[]> {
  const client = await clientPromise;
  const docs = await client
    .db()
    .collection('user')
    .find({ isActive: { $ne: false } }, { projection: { name: 1, email: 1 } })
    .sort({ name: 1 })
    .toArray();
  return docs.map((d) => ({
    _id: d._id.toString(),
    name: d.name,
    email: d.email,
  }));
}

// Nome de um usuário por id.
export async function getUserName(userId: string): Promise<{ name: string; email: string } | null> {
  const client = await clientPromise;
  const d = await client
    .db()
    .collection('user')
    .findOne({ _id: new ObjectId(userId) }, { projection: { name: 1, email: 1 } });
  if (!d) return null;
  return { name: d.name, email: d.email };
}

// Todas as wallets cadastradas (sem secrets) — usado na visão geral do admin.
export async function listAllWallets(): Promise<
  { userId: string; key: string; type: string }[]
> {
  const client = await clientPromise;
  const docs = await client
    .db()
    .collection('wallet')
    .find({}, { projection: { user: 1, key: 1, type: 1 } })
    .toArray();
  return docs
    .filter((d) => d.user && d.key)
    .map((d) => ({
      userId: d.user.toString(),
      key: d.key as string,
      type: (d.type as string) || 'desconhecido',
    }));
}

// Usuários por lista de ids (nome/email apenas).
export async function getUsersByIds(ids: string[]): Promise<UserOption[]> {
  if (ids.length === 0) return [];
  const client = await clientPromise;
  const docs = await client
    .db()
    .collection('user')
    .find(
      { _id: { $in: ids.map((id) => new ObjectId(id)) } },
      { projection: { name: 1, email: 1 } },
    )
    .toArray();
  return docs.map((d) => ({
    _id: d._id.toString(),
    name: d.name || '(sem nome)',
    email: d.email || '',
  }));
}

// Issuers com nome e chave pública — identifica quais ativos são emitidos por nós.
export async function listIssuerKeys(): Promise<{ name: string; publicKey: string }[]> {
  const client = await clientPromise;
  const docs = await client
    .db()
    .collection('issuer')
    .find({}, { projection: { name: 1, public_key: 1 } })
    .toArray();
  return docs
    .filter((d) => d.public_key)
    .map((d) => ({ name: d.name as string, publicKey: d.public_key as string }));
}

// Emails dos administradores (para notificações de pedidos).
export async function getAdminEmails(): Promise<string[]> {
  const client = await clientPromise;
  const docs = await client
    .db()
    .collection('user')
    .find({ globalRole: 'admin' }, { projection: { email: 1 } })
    .toArray();
  return docs.map((d) => d.email as string).filter(Boolean);
}

// Registra um pedido de saque (status 'requested') — cumprido depois pelo admin.
// `destination` é a chave PIX (BRL) ou o endereço da cripto informado pelo usuário.
export async function recordWithdrawRequest(params: {
  userId: string;
  amount: string;
  coin: string;
  destination: string;
  desc?: string;
}): Promise<void> {
  const client = await clientPromise;
  await client.db().collection('withdraw').insertOne({
    user: new ObjectId(params.userId),
    amount: params.amount,
    coin: params.coin,
    destination: params.destination,
    desc: params.desc || null,
    status: 'requested',
    timestamp: new Date(),
  });
}

// Pedidos de saque pendentes, com dados do solicitante.
export async function listPendingWithdrawals(): Promise<PendingWithdraw[]> {
  const client = await clientPromise;
  const db = client.db();
  const docs = await db
    .collection('withdraw')
    .find({ status: 'requested' })
    .sort({ timestamp: 1 })
    .toArray();

  const userIds = [...new Set(docs.map((d) => d.user?.toString()).filter(Boolean))];
  const users = await db
    .collection('user')
    .find(
      { _id: { $in: userIds.map((id) => new ObjectId(id as string)) } },
      { projection: { name: 1, email: 1 } },
    )
    .toArray();
  const byId = new Map(users.map((u) => [u._id.toString(), u]));

  return docs.map((d) => {
    const uid = d.user?.toString() ?? '';
    const u = byId.get(uid);
    return {
      _id: d._id.toString(),
      userId: uid,
      userName: u?.name || '(usuário removido)',
      userEmail: u?.email || '',
      amount: String(d.amount),
      coin: d.coin,
      destination: d.destination || null,
      desc: d.desc ?? null,
      timestamp: d.timestamp ?? d._id.getTimestamp(),
    };
  });
}

export async function getWithdrawById(id: string) {
  const client = await clientPromise;
  return client.db().collection('withdraw').findOne({ _id: new ObjectId(id) });
}

// Conclui um saque: guarda o hash da transação Stellar e o comprovante externo.
export async function completeWithdraw(params: {
  id: string;
  adminId: string;
  txHash: string;
  proof?: string;
}): Promise<void> {
  const client = await clientPromise;
  await client.db().collection('withdraw').updateOne(
    { _id: new ObjectId(params.id) },
    {
      $set: {
        status: 'completed',
        txHash: params.txHash,
        proof: params.proof || null,
        completedAt: new Date(),
        completedBy: new ObjectId(params.adminId),
      },
    },
  );
}

export async function rejectWithdraw(params: {
  id: string;
  adminId: string;
  reason: string;
}): Promise<void> {
  const client = await clientPromise;
  await client.db().collection('withdraw').updateOne(
    { _id: new ObjectId(params.id) },
    {
      $set: {
        status: 'rejected',
        rejectionReason: params.reason,
        completedAt: new Date(),
        completedBy: new ObjectId(params.adminId),
      },
    },
  );
}

// Códigos dos tokens disponíveis (issuers cadastrados).
export async function listIssuerNames(): Promise<string[]> {
  const client = await clientPromise;
  const docs = await client
    .db()
    .collection('issuer')
    .find({}, { projection: { name: 1 } })
    .sort({ name: 1 })
    .toArray();
  return docs.map((d) => d.name as string);
}

// Registra um depósito no histórico (coleção `deposit`).
export async function recordDeposit(params: {
  userId: string;
  amount: string;
  coin: string;
  desc?: string;
}): Promise<void> {
  const client = await clientPromise;
  await client.db().collection('deposit').insertOne({
    user: new ObjectId(params.userId),
    amount: params.amount,
    coin: params.coin,
    desc: params.desc || null,
    timestamp: new Date(),
  });
}

// Chaves públicas de todas as wallets de um usuário (custodiadas + somente leitura).
export async function getUserWalletKeys(userId: string): Promise<
  { key: string; type: string; readOnly: boolean; label: string | null }[]
> {
  const client = await clientPromise;
  const docs = await client
    .db()
    .collection('wallet')
    .find({ user: new ObjectId(userId) }, { projection: { key: 1, type: 1, readOnly: 1, label: 1 } })
    .toArray();
  return docs.map((d) => ({
    key: d.key,
    type: d.type,
    readOnly: d.readOnly ?? false,
    label: d.label ?? null,
  }));
}

// Histórico de movimentações (depósitos + saques) de um usuário, mais recente primeiro.
export async function getUserMovements(userId: string, limit = 100): Promise<Movement[]> {
  const client = await clientPromise;
  const db = client.db();
  const uid = new ObjectId(userId);

  const [deposits, withdraws] = await Promise.all([
    db.collection('deposit').find({ user: uid }).sort({ timestamp: -1 }).limit(limit).toArray(),
    db.collection('withdraw').find({ user: uid }).sort({ timestamp: -1 }).limit(limit).toArray(),
  ]);

  const movements: Movement[] = [
    ...deposits.map((d) => ({
      _id: d._id.toString(),
      kind: 'deposit' as const,
      amount: String(d.amount),
      coin: d.coin,
      desc: d.desc ?? null,
      status: d.status ?? null,
      timestamp: d.timestamp ?? d._id.getTimestamp(),
    })),
    ...withdraws.map((w) => ({
      _id: w._id.toString(),
      kind: 'withdraw' as const,
      amount: String(w.amount),
      coin: w.coin,
      desc: w.desc ?? null,
      status: w.status ?? null,
      timestamp: w.timestamp ?? w._id.getTimestamp(),
    })),
  ];

  movements.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return movements.slice(0, limit);
}
