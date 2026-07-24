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

  // Mesmo callback que o middleware anexa pras demais rotas — a raiz é um
  // caso especial ali (não passa pela checagem de sessão do middleware) e
  // por isso precisa montar o próprio callbackUrl aqui. Sem isso, os links
  // de email que apontam pra raiz do wallet perdem o destino: caem no login
  // do web sem callbackUrl e, depois de logar, ficam lá em vez de voltar.
  const walletUrl = process.env.WALLET_URL || '/wallet';
  const callback = `${walletUrl}/dashboard`;
  const loginUrl = process.env.AUTH_TRUST_HOST
    ? `${process.env.AUTH_TRUST_HOST}/login?callbackUrl=${encodeURIComponent(callback)}`
    : `/login?callbackUrl=${encodeURIComponent(callback)}`;

  redirect(loginUrl);
}
