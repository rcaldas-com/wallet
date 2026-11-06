import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

// Link de comprovante que abre sem login — é o que vai no email, aberto quase
// sempre num navegador sem sessão. Quem tem o link vê o arquivo (decisão do
// dono do sistema: só o próprio usuário recebe esse link). O `t` é um HMAC da
// chave, então o link não dá pra adivinhar nem derivar outro a partir dele;
// sem `t` (link dentro do app), a rota exige sessão e dono do arquivo.
//
// Mesmo AUTH_SECRET da sessão, com prefixo próprio na mensagem pra separar do
// JWT. Trocar o secret invalida os links dos emails antigos — eles caem no
// login e continuam abrindo para o dono.
const secret = process.env.AUTH_SECRET || '';

function tokenFor(key: string): string {
  return createHmac('sha256', secret).update(`wallet-file:${key}`).digest('base64url');
}

export function signedFileUrl(file: { url: string; s3Key: string }): string {
  return `${file.url}?t=${tokenFor(file.s3Key)}`;
}

export function isValidFileToken(key: string, token: string | null): boolean {
  if (!secret || !token) return false;
  const expected = Buffer.from(tokenFor(key));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

// Chaves montadas em uploadReceiptFile: `${keyPrefix}-${Date.now()}-${nome}`,
// com keyPrefix `deposit-<userId>` (actions/deposit.ts) ou `withdraw-<id do
// pedido>` (actions/withdraw.ts). A chave é gerada só no servidor, então dá
// pra confiar no dono que vem nela. Fora desse formato: null (só admin vê).
const RECEIPT_KEY = /^(deposit|withdraw)-([0-9a-f]{24})-\d+-(.+)$/;

export type ReceiptKey = { kind: 'deposit' | 'withdraw'; id: string; filename: string };

export function parseReceiptKey(key: string): ReceiptKey | null {
  const m = RECEIPT_KEY.exec(key);
  return m ? { kind: m[1] as ReceiptKey['kind'], id: m[2], filename: m[3] } : null;
}
