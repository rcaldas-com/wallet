import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const publicPaths = ['/'];

const authPaths = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
];

const protectedPaths = ['/dashboard'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublicPath = publicPaths.includes(pathname);
  if (isPublicPath) {
    return NextResponse.next();
  }

  const userId = request.cookies.get('walletUserId')?.value;

  const isAuthPath = authPaths.some((path) => pathname.startsWith(path));

  if (isAuthPath) {
    if (userId) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return NextResponse.next();
  }

  const isProtectedPath = protectedPaths.some((path) => pathname.startsWith(path));

  if (isProtectedPath) {
    if (!userId) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
