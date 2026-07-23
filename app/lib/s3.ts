import { PutObjectCommand, DeleteObjectCommand, CreateBucketCommand, HeadBucketCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { createS3Client } from './s3-config';

// Tipo de retorno para upload com suporte a CID opcional (IPFS/Filebase)
export interface UploadResult {
  url: string;
  key: string;
  cid?: string; // CID do IPFS (disponível apenas com Filebase IPFS buckets)
}

let s3: ReturnType<typeof createS3Client> | null = null;

// Inicializar cliente S3 se as variáveis de ambiente estiverem definidas
if (process.env.S3_HOST && process.env.S3_KEY && process.env.S3_SECRET) {
  s3 = createS3Client();
} else {
  console.warn('[S3] Variáveis de ambiente não definidas. Usando modo fake para upload.');
}

// Função para garantir que o bucket existe, criando se necessário
async function ensureBucketExists(bucket: string): Promise<void> {
  if (!s3) return;

  try {
    // Tentar acessar o bucket para verificar se existe
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (error: any) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      try {
        // Criar o bucket se não existir
        await s3.send(new CreateBucketCommand({ Bucket: bucket }));
      } catch (createError) {
        console.error(`[S3] Erro ao criar bucket '${bucket}':`, createError);
        throw createError;
      }
    } else {
      console.error(`[S3] Erro ao verificar bucket '${bucket}':`, error);
      throw error;
    }
  }
}

export async function uploadToS3(file: File, bucket: string, key?: string): Promise<UploadResult> {
  if (!s3 || !process.env.S3_HOST) {
    // Modo fake: retorna uma URL simulada quando S3 não está configurado
    const fileKey = key || file.name;
    return {
      url: `https://fake-s3/${bucket}/${fileKey}`,
      key: fileKey,
    };
  }

  // Garantir que o bucket existe antes de fazer upload
  await ensureBucketExists(bucket);

  // Fazer upload do arquivo
  const arrayBuffer = await file.arrayBuffer();
  const fileKey = key || `${Date.now()}-${file.name}`;
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: fileKey,
      Body: Buffer.from(arrayBuffer),
      ContentType: file.type,
      ACL: 'public-read',
    })
  );

  // Tentar obter CID do IPFS (disponível apenas com Filebase IPFS buckets)
  let cid: string | undefined;
  try {
    const headResponse = await s3.send(new HeadObjectCommand({
      Bucket: bucket,
      Key: fileKey,
    }));
    // Filebase retorna o CID no metadata
    cid = headResponse.Metadata?.cid;
  } catch {
    // CID não disponível (Storj, MinIO, etc.) - continua sem erro
  }

  // Retorna a URL pública do arquivo e CID se disponível
  const url = `${process.env.S3_HOST!.replace(/\/$/, '')}/${bucket}/${fileKey}`;
  return { url, key: fileKey, cid };
}

export async function deleteFromS3(bucket: string, key: string): Promise<void> {
  if (!s3 || !process.env.S3_HOST) {
    // Modo fake: apenas simula a deleção quando S3 não está configurado
    return Promise.resolve();
  }

  await s3.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
}
