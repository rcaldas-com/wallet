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

// Id do usuário autenticado, já verificado (cookie assinado).
export async function getSessionUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function getCurrentUser(): Promise<UserSession | null> {
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
    };
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

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
