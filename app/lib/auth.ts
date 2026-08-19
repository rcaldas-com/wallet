import { cache } from 'react';
import { cookies } from 'next/headers';
import { getUserById } from './data';
import { signSessionToken, verifySessionToken } from './session';
import { UserRole, UserSession } from './definitions';

// Sessão compartilhada com o app web: mesmo cookie, mesmo secret de
// assinatura. Estar logado no rcaldas dá acesso ao wallet sem novo login.
const SESSION_COOKIE = 'userId';

export const MASTER_ADMIN_EMAIL = 'rclgsm@gmail.com';

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

// Id da sessão real, ignorando qualquer impersonation ativa. Só deve ser
// usado para autorizar o INÍCIO de uma impersonation — para tudo mais, use
// getSessionUserId() ou getCurrentUser(), que respeitam impersonation.
//
// cache() do React: memoiza por request, não entre requests diferentes. Cada
// ponto que chama isso na mesma renderização (layout raiz, cada page.tsx
// embaixo dele) reaproveita o mesmo resultado em vez de reler cookie +
// reverificar o token do zero. Seguro porque no wallet o único fluxo que troca
// o cookie de sessão é o logout (clearUserSessionCookie em
// lib/actions/users.ts), que sempre termina em redirect() — a impersonation é
// iniciada e encerrada no app web ou via app/api/impersonate/end/route.ts, que
// devolve uma Response nova; nenhum desses relê a sessão no mesmo request
// depois de trocar o cookie. Conferido antes de aplicar.
export const getRealSessionUserId = cache(async (): Promise<string | null> => {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value, 'session');
});

// Id do usuário "efetivo" — o alvo da impersonation, se houver uma ativa
// (só vale com os dois tokens válidos; iniciada no app web, compartilhada
// aqui via cookie de domínio .rcaldas.com); senão, a sessão real.
export const getSessionUserId = cache(async (): Promise<string | null> => {
  const cookieStore = await cookies();

  const targetId = await verifySessionToken(
    cookieStore.get('impersonate_target_user')?.value,
    'impersonate-target',
  );
  const originalId = await verifySessionToken(
    cookieStore.get('impersonate_original_user')?.value,
    'impersonate-original',
  );
  if (targetId && originalId) {
    return targetId;
  }

  return getRealSessionUserId();
});

// A chamada mais cara da cadeia (getUserById bate no Mongo) e a mais
// repetida: o layout raiz chama isto uma vez, e quase toda page.tsx embaixo
// dele chama de novo, de forma independente, na mesma requisição. Sem cache()
// aqui, cada navegação vira múltiplas consultas ao banco em vez de uma.
export const getCurrentUser = cache(async (): Promise<UserSession | null> => {
  try {
    const userId = await getSessionUserId();

    if (!userId) {
      return null;
    }

    const user = await getUserById(userId);
    if (!user) {
      return null;
    }

    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      globalRole: user.globalRole,
      roles: user.roles,
      isActive: user.isActive,
      theme: user.theme,
    };
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
});

export function hasRole(user: UserSession | null | undefined, role: UserRole): boolean {
  if (!user) return false;
  if (role === 'admin' && user.email.toLowerCase() === MASTER_ADMIN_EMAIL) return true;
  if (role === 'admin' && user.globalRole === 'admin') return true;
  return user.roles.includes(role);
}

// Acesso ao wallet: quem tem o papel 'wallet' ou é administrador.
export function canUseWallet(user: UserSession | null | undefined): boolean {
  return hasRole(user, 'wallet') || hasRole(user, 'admin');
}

export async function requireAuth(): Promise<UserSession> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AuthError('Authentication required');
  }
  return user;
}

export async function requireWalletAccess(): Promise<UserSession> {
  const user = await requireAuth();
  if (!canUseWallet(user)) {
    throw new AuthError('Wallet access required');
  }
  return user;
}

export async function requireAdmin(): Promise<UserSession> {
  const user = await requireAuth();
  if (!hasRole(user, 'admin')) {
    throw new AuthError('Admin access required');
  }
  return user;
}

export async function setUserSessionCookie(userId: string) {
  try {
    const cookieStore = await cookies();
    const isProd = process.env.NODE_ENV === 'production';
    const token = await signSessionToken(userId);

    cookieStore.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 dias
      path: '/',
      ...(isProd ? { domain: '.rcaldas.com' } : {}),
    });
  } catch (error) {
    console.error('Error setting user session cookie:', error);
    throw error;
  }
}

export async function clearUserSessionCookie() {
  try {
    const cookieStore = await cookies();
    const isProd = process.env.NODE_ENV === 'production';

    cookieStore.set(SESSION_COOKIE, '', {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
      ...(isProd ? { domain: '.rcaldas.com' } : {}),
    });
  } catch (error) {
    console.error('Error clearing user session cookie:', error);
    throw error;
  }
}
