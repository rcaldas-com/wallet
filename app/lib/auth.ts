import { cookies } from 'next/headers';
import { getUserById } from './data';
import { UserSession } from './definitions';

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export async function getCurrentUser(): Promise<UserSession | null> {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get('walletUserId')?.value;

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
      isActive: user.isActive,
    };
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

export async function requireAuth(): Promise<UserSession> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AuthError('Authentication required');
  }
  return user;
}

export async function requireAdmin(): Promise<UserSession> {
  const user = await requireAuth();
  if (user.globalRole !== 'admin') {
    throw new AuthError('Admin access required');
  }
  return user;
}

export async function setUserSessionCookie(userId: string) {
  try {
    const cookieStore = await cookies();

    cookieStore.set('walletUserId', userId, {
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });
  } catch (error) {
    console.error('Error setting user session cookie:', error);
    throw error;
  }
}

export async function clearUserSessionCookie() {
  try {
    const cookieStore = await cookies();
    cookieStore.set('walletUserId', '', {
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
      maxAge: 0,
      path: '/',
    });
  } catch (error) {
    console.error('Error clearing user session cookie:', error);
    throw error;
  }
}
