'use server';

import { Keypair } from '@stellar/stellar-sdk';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/app/lib/auth';
import clientPromise from '@/app/lib/mongodb';
import { provisionAccount } from '@/app/lib/stellar';

export type IssuerActionState = {
  success: boolean;
  message: string;
};

// Cadastra um novo issuer e provisiona a conta on-chain a partir da MAIN_WALLET
// (se ainda não existir), deixando-a pronta pra emitir. Só a chave SECRETA é
// pedida — a pública é derivada dela (não faz sentido pedir as duas e arriscar
// um par errado). O secret fica só no servidor, necessário pra o issuer assinar
// as emissões (depósito/conversão).
export async function createIssuer(
  _prevState: IssuerActionState,
  formData: FormData,
): Promise<IssuerActionState> {
  try {
    await requireAdmin();
  } catch {
    return { success: false, message: 'Acesso restrito ao administrador.' };
  }

  const name = String(formData.get('name') || '').trim().toUpperCase();
  const secret = String(formData.get('secret') || '').trim();
  const displayName = String(formData.get('displayName') || '').trim();
  const mirror = String(formData.get('mirror') || '').trim();

  if (!/^[A-Z0-9]{1,12}$/.test(name)) {
    return { success: false, message: 'Código inválido (use letras/números, até 12 caracteres).' };
  }
  if (!secret) {
    return { success: false, message: 'Informe a chave secreta do issuer (necessária para emitir).' };
  }
  // Deriva a pública da secret — se a secret for inválida, falha aqui.
  let publicKey: string;
  try {
    publicKey = Keypair.fromSecret(secret).publicKey();
  } catch {
    return { success: false, message: 'Chave secreta inválida.' };
  }

  const client = await clientPromise;
  const db = client.db();

  const existing = await db.collection('issuer').findOne({ name });
  if (existing) {
    return { success: false, message: `Já existe um issuer com o código "${name}".` };
  }

  await db.collection('issuer').insertOne({
    name,
    public_key: publicKey,
    secret,
    displayName: displayName || null,
    mirror: mirror || null,
  });

  // Provisiona a conta on-chain (idempotente). Falha aqui não desfaz o
  // cadastro — o admin pode reprovisionar pelo botão na lista.
  const provisioned = await provisionAccount(publicKey);
  revalidatePath('/dashboard/admin/issuers');

  // Mostra a chave pública derivada pra o admin conferir o sufixo vanity.
  if (!provisioned.ok) {
    return {
      success: true,
      message: `Issuer "${name}" (${publicKey}) cadastrado, mas a conta on-chain não pôde ser provisionada (${provisioned.error}). Use "Provisionar" na lista.`,
    };
  }
  return {
    success: true,
    message: provisioned.created
      ? `Issuer "${name}" (${publicKey}) cadastrado e conta on-chain criada.`
      : `Issuer "${name}" (${publicKey}) cadastrado (conta on-chain já existia).`,
  };
}

// Edita só o nome amigável e o mirror. name/public_key/secret são identidade
// imutável — trocá-los orfanaria os saldos de token dos usuários.
export async function updateIssuerDisplay(
  _prevState: IssuerActionState,
  formData: FormData,
): Promise<IssuerActionState> {
  try {
    await requireAdmin();
  } catch {
    return { success: false, message: 'Acesso restrito ao administrador.' };
  }

  const name = String(formData.get('name') || '').trim().toUpperCase();
  const displayName = String(formData.get('displayName') || '').trim();
  const mirror = String(formData.get('mirror') || '').trim();
  if (!name) return { success: false, message: 'Issuer inválido.' };

  const client = await clientPromise;
  const res = await client.db().collection('issuer').updateOne(
    { name },
    { $set: { displayName: displayName || null, mirror: mirror || null } },
  );
  if (res.matchedCount === 0) {
    return { success: false, message: 'Issuer não encontrado.' };
  }
  revalidatePath('/dashboard/admin/issuers');
  return { success: true, message: 'Salvo.' };
}

// Cria+financia a conta on-chain do issuer a partir da MAIN_WALLET (botão da
// lista quando o status mostra "conta não existe"). Idempotente.
export async function provisionIssuerAccount(name: string): Promise<IssuerActionState> {
  try {
    await requireAdmin();
  } catch {
    return { success: false, message: 'Acesso restrito ao administrador.' };
  }

  const client = await clientPromise;
  const issuer = await client.db().collection('issuer').findOne(
    { name },
    { projection: { public_key: 1 } },
  );
  if (!issuer?.public_key) {
    return { success: false, message: 'Issuer não encontrado.' };
  }

  const result = await provisionAccount(issuer.public_key as string);
  revalidatePath('/dashboard/admin/issuers');
  if (!result.ok) {
    return { success: false, message: result.error };
  }
  return {
    success: true,
    message: result.created ? 'Conta on-chain criada.' : 'Conta on-chain já existia.',
  };
}
