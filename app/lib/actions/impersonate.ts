'use server';

import { cookies } from 'next/headers';
import { ObjectId } from 'mongodb';
import { getRealSessionUserId, hasRole, MASTER_ADMIN_EMAIL } from '@/app/lib/auth';
import { getUserById } from '@/app/lib/data';
import { signSessionToken } from '@/app/lib/session';

// Mesma personificação do app web (app/api/impersonate/route.ts): dois
// cookies assinados de 2h, no domínio compartilhado, que os dois apps já
// sabem ler. Aqui é Server Action e não fetch numa rota porque em dev o
// wallet vive sob basePath /wallet — um fetch('/api/impersonate') cairia na
// rota do WEB, não na daqui.
const IMPERSONATION_TTL_SEC = 60 * 60 * 2;

export type ImpersonateState = { ok: boolean; error?: string };

export async function startImpersonation(userId: string): Promise<ImpersonateState> {
  try {
    // Deliberadamente a sessão REAL, não a "efetiva": quem inicia precisa ser
    // o admin de verdade, mesmo que já esteja vendo como outra pessoa.
    const currentUserId = await getRealSessionUserId();
    if (!currentUserId) return { ok: false, error: 'Não autenticado' };

    const currentUser = await getUserById(currentUserId);
    if (!hasRole(currentUser, 'admin')) {
      return { ok: false, error: 'Apenas administradores podem usar esta funcionalidade' };
    }

    if (typeof userId !== 'string' || !ObjectId.isValid(userId)) {
      return { ok: false, error: 'Usuário inválido' };
    }
    if (userId === currentUserId) {
      return { ok: false, error: 'Você já está nesta conta' };
    }

    const target = await getUserById(userId);
    if (!target) return { ok: false, error: 'Usuário não encontrado' };
    // O web esconde o botão pro admin principal só na tela; aqui a recusa
    // também vale no servidor, já que Server Action é chamável direto.
    if (target.email.toLowerCase() === MASTER_ADMIN_EMAIL) {
      return { ok: false, error: 'Não é possível ver como o administrador principal' };
    }

    const isProd = process.env.NODE_ENV === 'production';
    const opts = {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax' as const,
      maxAge: IMPERSONATION_TTL_SEC,
      path: '/',
      ...(isProd ? { domain: '.rcaldas.com' } : {}),
    };

    const cookieStore = await cookies();
    cookieStore.set(
      'impersonate_original_user',
      await signSessionToken(currentUserId, { expiresIn: '2h', purpose: 'impersonate-original' }),
      opts,
    );
    cookieStore.set(
      'impersonate_target_user',
      await signSessionToken(userId, { expiresIn: '2h', purpose: 'impersonate-target' }),
      opts,
    );

    return { ok: true };
  } catch (error) {
    console.error('Erro ao iniciar visualização como usuário:', error);
    return { ok: false, error: 'Erro ao processar solicitação' };
  }
}
