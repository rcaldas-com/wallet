import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/app/lib/auth';

// A raiz do wallet não tem conteúdo próprio: o login é unificado no rcaldas.
// Quem já tem sessão vai direto para a carteira; quem não tem é mandado para o
// login do app principal (fora do basePath), e volta para cá depois.
export default async function Home() {
  const user = await getCurrentUser();

  if (user) {
    redirect('/dashboard');
  }

  const loginUrl = process.env.AUTH_TRUST_HOST
    ? `${process.env.AUTH_TRUST_HOST}/login`
    : '/login';

  redirect(loginUrl);
}
