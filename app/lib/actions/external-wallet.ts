'use server';

import { revalidatePath } from 'next/cache';
import { StrKey } from '@stellar/stellar-sdk';
import { requireWalletAccess } from '@/app/lib/auth';
import { addExternalWallet, removeExternalWallet } from '@/app/lib/data-wallet';
import { getAccountBalances } from '@/app/lib/stellar';
import { getBitcoinBalance } from '@/app/lib/bitcoin';

export type ExternalWalletState = { success: boolean; message: string };

// Formatos de endereço Bitcoin aceitos: legado (1...), P2SH (3...) e bech32
// (bc1...). Checa só a forma — a sondagem abaixo é quem de fato confirma que
// o endereço existe na rede.
const BTC_ADDRESS_RE = /^(?:[13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-z0-9]{25,59})$/;

export async function addExternalWalletAction(
  _prevState: ExternalWalletState,
  formData: FormData,
): Promise<ExternalWalletState> {
  let user;
  try {
    user = await requireWalletAccess();
  } catch {
    return { success: false, message: 'Sessão expirada ou sem acesso à carteira.' };
  }

  const type = String(formData.get('type') || '');
  const key = String(formData.get('key') || '').trim();
  const label = String(formData.get('label') || '').trim();

  if (type !== 'stellar' && type !== 'bitcoin') {
    return { success: false, message: 'Tipo inválido.' };
  }
  if (!key) {
    return { success: false, message: 'Informe a chave pública / endereço.' };
  }
  if (type === 'stellar' && !StrKey.isValidEd25519PublicKey(key)) {
    return {
      success: false,
      message: 'Chave pública Stellar inválida — precisa começar com G e ter 56 caracteres.',
    };
  }
  if (type === 'bitcoin' && !BTC_ADDRESS_RE.test(key)) {
    return { success: false, message: 'Endereço Bitcoin inválido.' };
  }

  // Sondagem best-effort: confirma que dá pra ler algo daquele endereço antes
  // de salvar, pra pegar um typo na hora em vez da carteira só aparecer
  // depois em "carteiras não somadas". Nunca BLOQUEIA o cadastro — uma conta
  // Stellar legítima mas nunca recebeu nada (0 saldo, ainda não "ativada" na
  // rede) e uma falha passageira das fontes de BTC (ver bitcoin.ts, já tem
  // fallback) são casos válidos de "endereço bom, sem confirmação agora".
  let probeNote = '';
  try {
    if (type === 'stellar') {
      const balances = await getAccountBalances(key);
      if (balances.length === 0) {
        probeNote = ' A conta não tem saldo na rede ainda — confira se o endereço está certo.';
      }
    } else {
      const btc = await getBitcoinBalance(key);
      if (btc === null) {
        probeNote = ' Não consegui confirmar o endereço agora (fonte de consulta instável) — cadastrado mesmo assim.';
      }
    }
  } catch (err) {
    console.error('Falha ao sondar carteira externa antes de cadastrar:', err);
  }

  try {
    await addExternalWallet({ userId: user._id, type, key, label: label || null });
  } catch (err: unknown) {
    // Índice único em `key` (coleção wallet) — chave já cadastrada, deste ou
    // de outro usuário.
    if (err && typeof err === 'object' && 'code' in err && err.code === 11000) {
      return { success: false, message: 'Esta chave já está cadastrada.' };
    }
    console.error('Falha ao cadastrar carteira externa:', err);
    return { success: false, message: 'Erro ao cadastrar. Tente novamente.' };
  }

  revalidatePath('/dashboard');
  return { success: true, message: `Carteira cadastrada.${probeNote}` };
}

export async function removeExternalWalletAction(id: string): Promise<ExternalWalletState> {
  let user;
  try {
    user = await requireWalletAccess();
  } catch {
    return { success: false, message: 'Sessão expirada ou sem acesso à carteira.' };
  }
  if (!id) return { success: false, message: 'Carteira inválida.' };

  const ok = await removeExternalWallet({ id, userId: user._id });
  if (!ok) {
    return { success: false, message: 'Não foi possível remover — já pode ter sido removida.' };
  }

  revalidatePath('/dashboard');
  return { success: true, message: 'Carteira removida.' };
}
