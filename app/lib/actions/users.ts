'use server';

import { redirect } from 'next/navigation';
import { clearUserSessionCookie } from '@/app/lib/auth';

// Login e cadastro ficam no app principal (rcaldas) — aqui só encerramos a
// sessão compartilhada e devolvemos o usuário para lá.
export async function logoutAction() {
  try {
    await clearUserSessionCookie();
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      'digest' in error &&
      typeof (error as { digest?: string }).digest === 'string' &&
      (error as { digest: string }).digest.startsWith('NEXT_REDIRECT')
    ) {
      throw error;
    }
    console.error('Logout error:', error);
  }

  redirect(`${process.env.AUTH_TRUST_HOST || ''}/login`);
}
