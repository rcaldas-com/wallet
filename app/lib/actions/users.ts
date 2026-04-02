'use server';

import { redirect } from 'next/navigation';
import { authenticateUser, getUserByEmail } from '@/app/lib/data';
import { setUserSessionCookie, clearUserSessionCookie } from '@/app/lib/auth';

export async function loginAction(prevState: { message: string; errors: Record<string, string[]> }, formData: FormData) {
  try {
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    if (!email || !password) {
      return {
        message: 'Email e senha são obrigatórios',
        errors: {},
      };
    }

    const user = await authenticateUser(email, password);
    if (!user) {
      const existingUser = await getUserByEmail(email);
      if (existingUser && !existingUser.emailVerified) {
        return {
          message: 'Verifique seu email antes de fazer login.',
          errors: {},
        };
      }

      return {
        message: 'Email ou senha inválidos',
        errors: {},
      };
    }

    await setUserSessionCookie(user._id.toString());
  } catch (error: unknown) {
    if (error instanceof Error && 'digest' in error && typeof (error as { digest?: string }).digest === 'string' && (error as { digest: string }).digest.startsWith('NEXT_REDIRECT')) {
      throw error;
    }
    console.error('Login error:', error);
    return {
      message: 'Erro interno do servidor',
      errors: {},
    };
  }

  redirect('/dashboard');
}

export async function logoutAction() {
  try {
    await clearUserSessionCookie();
  } catch (error: unknown) {
    if (error instanceof Error && 'digest' in error && typeof (error as { digest?: string }).digest === 'string' && (error as { digest: string }).digest.startsWith('NEXT_REDIRECT')) {
      throw error;
    }
    console.error('Logout error:', error);
  }

  redirect('/login');
}
