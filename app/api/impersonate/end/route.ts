import { NextResponse } from 'next/server';

// O wallet não inicia impersonation (isso vive no app principal), mas como o
// cookie é compartilhado por domínio (.rcaldas.com em produção), qualquer um
// dos dois apps pode encerrá-la.
export async function POST() {
  try {
    const response = NextResponse.json({ success: true });
    const isProd = process.env.NODE_ENV === 'production';

    // .delete() sem domain não remove um cookie setado com domain explícito
    // — reescreve com o mesmo domain e maxAge 0.
    for (const name of ['impersonate_original_user', 'impersonate_target_user']) {
      response.cookies.set(name, '', {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        maxAge: 0,
        path: '/',
        ...(isProd ? { domain: '.rcaldas.com' } : {}),
      });
    }

    return response;
  } catch (error) {
    console.error('Erro ao encerrar impersonate:', error);
    return NextResponse.json({ error: 'Erro ao processar solicitação' }, { status: 500 });
  }
}
