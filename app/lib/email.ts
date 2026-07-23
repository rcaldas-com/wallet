'use server';

import redis from '@/app/lib/redis';

// Emails de autenticação (verificação, reset de senha) são enviados pelo app
// principal — aqui só saem notificações da carteira.
const APP_NAME = process.env.TITLE || 'RCaldas';
const QUEUE_NAME = 'email:send';
// URL pública do próprio wallet — usada para linkar de volta ao app nos emails.
const WALLET_URL = process.env.WALLET_URL || '/wallet';

async function enqueueEmail(
  to: string,
  subject: string,
  template: string,
  variables: Record<string, string>,
) {
  const payload = JSON.stringify({ to, subject, template, variables });
  await redis.lpush(QUEUE_NAME, payload);
}

type DepositEmailData = {
  email: string;
  name: string;
  amount: string;
  coin: string;
  totalBrl: number;
  desc?: string;
  receiptUrl?: string;
};

export async function sendDepositEmail(data: DepositEmailData) {
  await enqueueEmail(data.email, 'Novo depósito na sua carteira', 'deposit', {
    name: data.name,
    amount: data.amount,
    coin: data.coin,
    total: data.totalBrl.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }),
    desc: data.desc || '',
    receiptUrl: data.receiptUrl || '',
    app: APP_NAME,
    walletUrl: WALLET_URL,
  });
}

type WithdrawRequestEmailData = {
  admins: string[];
  userName: string;
  userEmail: string;
  amount: string;
  coin: string;
  destination?: string;
  desc?: string;
};

export async function sendWithdrawRequestEmail(data: WithdrawRequestEmailData) {
  for (const admin of data.admins) {
    await enqueueEmail(admin, 'Novo pedido de saque', 'withdraw-request', {
      userName: data.userName,
      userEmail: data.userEmail,
      amount: data.amount,
      coin: data.coin,
      destination: data.destination || '',
      desc: data.desc || '',
      app: APP_NAME,
      walletUrl: `${WALLET_URL}/dashboard/admin/withdraw`,
    });
  }
}

type WithdrawProcessedEmailData = {
  email: string;
  name: string;
  status: 'completed' | 'rejected';
  amount: string;
  coin: string;
  destination?: string;
  txHash?: string;
  proof?: string;
  proofFileUrl?: string;
  reason?: string;
};

export async function sendWithdrawProcessedEmail(data: WithdrawProcessedEmailData) {
  const subject =
    data.status === 'completed' ? 'Seu saque foi concluído' : 'Seu pedido de saque foi recusado';

  await enqueueEmail(data.email, subject, 'withdraw-processed', {
    name: data.name,
    status: data.status,
    amount: data.amount,
    coin: data.coin,
    destination: data.destination || '',
    txHash: data.txHash || '',
    proof: data.proof || '',
    proofFileUrl: data.proofFileUrl || '',
    reason: data.reason || '',
    app: APP_NAME,
    walletUrl: WALLET_URL,
  });
}
