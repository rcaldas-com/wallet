import { S3Client } from '@aws-sdk/client-s3';

// Configuração de ambiente
export const isProduction = process.env.NODE_ENV === 'production';
export const isLocalMinIO = process.env.S3_HOST?.includes('minio');
export const hasCustomEndpoint = !!process.env.S3_HOST;

// Configuração base do S3
export const getS3Config = () => {
  const baseConfig = {
    region: process.env.S3_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.S3_KEY!,
      secretAccessKey: process.env.S3_SECRET!,
    },
  };

  if (process.env.S3_HOST) {
    // Usa endpoint customizado (MinIO, Storj, outros S3-compatible)
    return {
      ...baseConfig,
      endpoint: process.env.S3_HOST,
      forcePathStyle: true, // Necessário para endpoints customizados
    };
  } else {
    // AWS S3 padrão apenas se S3_HOST não estiver definido
    return {
      ...baseConfig,
      forcePathStyle: false,
    };
  }
};

// Cliente S3 padrão para operações internas
export const createS3Client = () => new S3Client(getS3Config());

// Configuração específica para URLs assinadas (ajustada para o navegador)
export const getExternalS3Config = (requestHost?: string) => {
  const baseConfig = getS3Config();

  if (isLocalMinIO && !isProduction) {
    // Desenvolvimento local: usar host da requisição se disponível, senão localhost
    const host = requestHost ? requestHost.split(':')[0] : 'localhost';
    return {
      ...baseConfig,
      endpoint: process.env.S3_HOST?.replace('minio', host),
    };
  }

  // Para todos os outros casos (incluindo Storj em produção): usar endpoint tal como está
  return baseConfig;
};

// Cliente S3 para URLs assinadas (com host dinâmico)
export const createExternalS3Client = (requestHost?: string) =>
  new S3Client(getExternalS3Config(requestHost));

// Constantes para cache e URLs
export const CACHE_DURATION = 3600000; // 1 hora em ms
export const URL_EXPIRES = 3600; // URLs assinadas válidas por 1 hora
