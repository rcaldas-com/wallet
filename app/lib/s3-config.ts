import { S3Client } from '@aws-sdk/client-s3';

// Configuração de ambiente
export const isProduction = process.env.NODE_ENV === 'production';
// Hostnames que so' existem dentro da rede docker/host local e nunca sao
// alcancaveis pelo navegador (servico do compose como "garage", localhost,
// host.docker.internal, IP privado). Antes isto checava a palavra 'minio'
// em S3_HOST -- quebrou com a troca do MinIO pelo Garage no dev, e o car ja
// tinha o mesmo bug corrigido (ver car/app/lib/s3-config.ts).
const isNonPublicHostname = (hostname: string): boolean => {
  if (['localhost', '127.0.0.1', 'host.docker.internal'].includes(hostname)) return true;
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(hostname)) return true;
  // sem ponto = nome de servico docker-compose (ex: "garage")
  if (!hostname.includes('.')) return true;
  return false;
};

export const isLocalMinIO = (() => {
  if (!process.env.S3_HOST) return false;
  try {
    return isNonPublicHostname(new URL(process.env.S3_HOST).hostname);
  } catch {
    return false;
  }
})();
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
    // Usa endpoint customizado (Garage em dev, Storj em producao, outros S3)
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
    // Troca so' o hostname (mantem esquema e porta). O replace('minio', ...)
    // de antes so' funcionava se o host contivesse essa palavra.
    const externalUrl = new URL(process.env.S3_HOST!);
    externalUrl.hostname = host;
    return {
      ...baseConfig,
      endpoint: externalUrl.toString().replace(/\/$/, ''),
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
