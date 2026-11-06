import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand, S3ServiceException } from '@aws-sdk/client-s3';
import { createS3Client } from '@/app/lib/s3-config';
import { getCurrentUser, hasRole } from '@/app/lib/auth';
import { getWithdrawById } from '@/app/lib/data-wallet';
import { isValidFileToken, parseReceiptKey } from '@/app/lib/file-link';

// Serve o arquivo autenticado com nossas credenciais S3, em vez de depender
// da URL pública direta do bucket — o Storj não honra o ACL 'public-read' do
// S3 padrão (objeto some com "Access Denied" mesmo enviado com esse ACL), só
// os owners das credenciais conseguem ler.
//
// Fora do middleware (o matcher ignora /api), então a autorização é toda
// daqui: só o bucket do wallet (as credenciais do .env compartilhado também
// leem os buckets do car); link assinado do email abre sem login
// (lib/file-link.ts); sem ele, precisa de sessão e ser o dono ou admin.
const s3 = createS3Client();

const BUCKET = 'wallet';
const MAIN_APP = process.env.AUTH_TRUST_HOST || '';
const WALLET_URL = process.env.WALLET_URL || '/wallet';

// Nunca em cache compartilhado (Cloudflare): `private` deixa só o navegador
// guardar. O objeto não muda (a chave tem timestamp), então 1h no navegador
// é seguro e evita rebaixar ao reabrir.
const CACHE_OK = 'private, max-age=3600';
const CACHE_NONE = 'private, no-store';

function notFound() {
  return new NextResponse('Arquivo não encontrado', {
    status: 404,
    headers: { 'Cache-Control': CACHE_NONE },
  });
}

async function canRead(key: string, token: string | null): Promise<'ok' | 'login' | 'denied'> {
  if (isValidFileToken(key, token)) return 'ok';

  const user = await getCurrentUser();
  if (!user) return 'login';
  if (hasRole(user, 'admin')) return 'ok';

  const receipt = parseReceiptKey(key);
  if (!receipt) return 'denied';
  // Depósito: o dono está na própria chave, sem consulta. Saque: a chave tem
  // o id do pedido, uma busca por _id.
  if (receipt.kind === 'deposit') return receipt.id === user._id ? 'ok' : 'denied';
  const withdraw = await getWithdrawById(receipt.id);
  return withdraw?.user?.toString() === user._id ? 'ok' : 'denied';
}

// Só o que o upload aceita abre inline; SVG (pode ter script) e qualquer
// outra coisa vai como download, pra não executar na origem do wallet.
function disposition(contentType: string, filename: string) {
  const inline = contentType === 'application/pdf' || (/^image\//.test(contentType) && contentType !== 'image/svg+xml');
  return `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const [bucket, ...keyParts] = path;
  const key = keyParts.join('/');

  if (bucket !== BUCKET || !key) return notFound();

  let access: Awaited<ReturnType<typeof canRead>>;
  try {
    access = await canRead(key, request.nextUrl.searchParams.get('t'));
  } catch (error) {
    console.error('Erro ao verificar acesso ao arquivo:', error);
    return new NextResponse('Erro ao verificar acesso', { status: 500, headers: { 'Cache-Control': CACHE_NONE } });
  }
  if (access === 'login') {
    const callback = `${WALLET_URL}${request.nextUrl.pathname}${request.nextUrl.search}`;
    const res = NextResponse.redirect(`${MAIN_APP}/login?callbackUrl=${encodeURIComponent(callback)}`);
    res.headers.set('Cache-Control', CACHE_NONE);
    return res;
  }
  // 404 e não 403: não confirma que o arquivo existe pra quem não é o dono.
  if (access === 'denied') return notFound();

  // Range (visualizador de PDF e <video> pedem pedaços) e If-None-Match vão
  // direto pro S3; o corpo é repassado em stream, sem carregar o arquivo
  // inteiro (até 64MB) na memória.
  try {
    const response = await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        Range: request.headers.get('range') ?? undefined,
        IfNoneMatch: request.headers.get('if-none-match') ?? undefined,
      }),
    );
    if (!response.Body) return notFound();

    const contentType = response.ContentType || 'application/octet-stream';
    const headers = new Headers({
      'Content-Type': contentType,
      'Content-Disposition': disposition(contentType, parseReceiptKey(key)?.filename ?? key),
      'Cache-Control': CACHE_OK,
      'Accept-Ranges': 'bytes',
      'X-Content-Type-Options': 'nosniff',
    });
    if (response.ContentLength !== undefined) headers.set('Content-Length', String(response.ContentLength));
    if (response.ContentRange) headers.set('Content-Range', response.ContentRange);
    if (response.ETag) headers.set('ETag', response.ETag);
    if (response.LastModified) headers.set('Last-Modified', response.LastModified.toUTCString());

    return new NextResponse(response.Body.transformToWebStream(), {
      status: response.ContentRange ? 206 : 200,
      headers,
    });
  } catch (error) {
    const status = error instanceof S3ServiceException ? error.$metadata.httpStatusCode : undefined;
    if (status === 304) {
      return new NextResponse(null, { status: 304, headers: { 'Cache-Control': CACHE_OK } });
    }
    if (status === 404 || (error instanceof S3ServiceException && ['NoSuchKey', 'NoSuchBucket'].includes(error.name))) {
      return notFound();
    }
    if (status === 416) {
      return new NextResponse('Intervalo inválido', { status: 416, headers: { 'Cache-Control': CACHE_NONE } });
    }
    console.error('Erro ao buscar arquivo do S3:', error);
    return new NextResponse('Falha ao buscar o arquivo, tente de novo', {
      status: 502,
      headers: { 'Cache-Control': CACHE_NONE },
    });
  }
}
