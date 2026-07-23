import { SignJWT, jwtVerify } from 'jose';

// Sem dependências de banco — pode rodar no middleware (Edge runtime).
// Mesma implementação usada em rcaldas/web e car/web; mesmo AUTH_SECRET
// compartilhado entre wallet e web (env_file .env comum), permitindo SSO.
const secret = new TextEncoder().encode(process.env.AUTH_SECRET);

// `purpose` distingue tokens de sessão normal dos de impersonation, para que
// um token de um tipo não possa ser reaproveitado como o outro. Mesmo esquema
// usado em rcaldas/web e car/web (a impersonation iniciada no web precisa ser
// verificável aqui, pois o cookie é compartilhado via SSO).
export async function signSessionToken(
  userId: string,
  opts: { expiresIn?: string; purpose?: string } = {},
): Promise<string> {
  const { expiresIn = '30d', purpose = 'session' } = opts;
  return new SignJWT({ sub: userId, purpose })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
}

// Verifica e decodifica o token. Retorna null se ausente, expirado, adulterado
// ou de um `purpose` diferente do esperado.
export async function verifySessionToken(
  token: string | undefined | null,
  purpose = 'session',
): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    if (payload.purpose !== purpose) return null;
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}
