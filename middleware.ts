import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionToken } from '@/app/lib/session';

// O wallet não tem autenticação própria: login, cadastro e verificação de email
// vivem no app principal (rcaldas) e a sessão é compartilhada pelo cookie.
const authPaths = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
];

// URL do app principal. Sem ela, cai num caminho relativo (mesmo host).
const MAIN_APP = process.env.AUTH_TRUST_HOST || '';
// URL pública deste app. Não dá para usar a origem do request: atrás do proxy
// ela é o host interno do container (localhost:3000), não o endereço público.
// Em dev é o subcaminho '/wallet'; em produção, o domínio próprio.
const WALLET_URL = process.env.WALLET_URL || '/wallet';

function mainAppUrl(pathname: string, search = '') {
  return `${MAIN_APP}${pathname}${search}`;
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Rotas de autenticação são delegadas ao app principal, preservando query
  // (ex.: /verify-email?token=…).
  if (authPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.redirect(mainAppUrl(pathname, search));
  }

  // A raiz decide sozinha para onde mandar (page.tsx).
  if (pathname === '/') {
    return NextResponse.next();
  }

  // Um cookie presente mas adulterado conta como não autenticado.
  const userId = await verifySessionToken(request.cookies.get('userId')?.value);

  if (!userId) {
    const callback = `${WALLET_URL}${pathname}${search}`;
    return NextResponse.redirect(
      mainAppUrl('/login', `?callbackUrl=${encodeURIComponent(callback)}`),
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|logo.png|opengraph-image).*)',
  ],
};
