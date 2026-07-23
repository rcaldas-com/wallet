import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { createS3Client } from '@/app/lib/s3-config';

// Serve o arquivo autenticado com nossas credenciais S3, em vez de depender
// da URL pública direta do bucket — o Storj não honra o ACL 'public-read' do
// S3 padrão (objeto some com "Access Denied" mesmo enviado com esse ACL), só
// os owners das credenciais conseguem ler. Isso vira o link permanente usado
// tanto na exibição no app quanto no link externo do email.
const s3 = createS3Client();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path } = await params;
    const [bucket, ...keyParts] = path;
    const key = keyParts.join('/');

    if (!bucket || !key) {
      return new NextResponse('Invalid path', { status: 400 });
    }

    const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!response.Body) {
      return new NextResponse('File not found', { status: 404 });
    }

    const chunks: Uint8Array[] = [];
    const reader = response.Body.transformToWebStream().getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const fileBuffer = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      fileBuffer.set(chunk, offset);
      offset += chunk.length;
    }

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': response.ContentType || 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000',
        'Content-Length': response.ContentLength?.toString() || fileBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Erro ao buscar arquivo do S3:', error);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
