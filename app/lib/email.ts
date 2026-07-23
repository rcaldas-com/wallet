'use server';

import redis from '@/app/lib/redis';

const APP_URL = process.env.AUTH_TRUST_HOST || 'http://localhost:8001';
const BASE_PATH = process.env.NODE_ENV === 'production' ? '' : '/wallet';
const APP_NAME = process.env.TITLE || 'RCaldas';
const QUEUE_NAME = 'email:send';

async function enqueueEmail(
  to: string,
  subject: string,
  template: string,
  variables: Record<string, string>,
) {
  const payload = JSON.stringify({ to, subject, template, variables });
  await redis.lpush(QUEUE_NAME, payload);
}

export async function sendVerificationEmail(email: string, token: string, name: string) {
  const verificationUrl = `${APP_URL}${BASE_PATH}/verify-email?token=${token}`;

  console.log('\n=== EMAIL DE VERIFICAÇÃO (DEV MODE) ===');
  console.log('Para:', email);
  console.log('Nome:', name);
  console.log('Link:', verificationUrl);
  console.log('========================================\n');

  return { success: true, devMode: true };
}

export async function sendPasswordResetEmail(email: string, token: string, name: string) {
  const resetUrl = `${APP_URL}${BASE_PATH}/reset-password?token=${token}`;

  console.log('\n=== EMAIL DE REDEFINIÇÃO DE SENHA (DEV MODE) ===');
  console.log('Para:', email);
  console.log('Nome:', name);
  console.log('Link:', resetUrl);
  console.log('=================================================\n');

  return { success: true, devMode: true };
}

type DepositEmailData = {
  email: string;
  name: string;
  amount: string;
  coin: string;
  totalBrl: number;
  desc?: string;
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
    app: APP_NAME,
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
    reason: data.reason || '',
    app: APP_NAME,
  });
}
