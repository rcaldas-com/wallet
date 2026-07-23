import 'server-only';
import { processImage } from './image-processor';
import { uploadToS3 } from './s3';
import { sanitizeFilenameForKey } from './utils';
import type { FileAttachment } from './definitions';

const MAX_FILE_SIZE = 64 * 1024 * 1024; // 64MB, mesmo limite do car/web
const ACCEPTED_TYPE = /^image\/|^application\/pdf$/;
// URL pública do próprio wallet (ver middleware.ts / next.config.js) — usada
// pra montar o link do proxy de arquivos, não a URL direta do bucket (o
// Storj não serve objetos como público mesmo com ACL 'public-read').
const WALLET_URL = process.env.WALLET_URL || '/wallet';

export type ReceiptUploadResult = {
  attachment: FileAttachment | null;
  error?: string;
};

// Valida, otimiza (se for imagem) e envia um comprovante para o S3 (bucket
// 'wallet'). Usado tanto na confirmação de saque quanto no registro de
// depósito — falha aqui não deve derrubar a operação financeira em si, só
// retorna um `error` pro chamador decidir como reportar.
export async function uploadReceiptFile(
  file: File | null,
  keyPrefix: string,
): Promise<ReceiptUploadResult> {
  if (!file || file.size === 0) {
    return { attachment: null };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { attachment: null, error: 'Arquivo maior que 64MB — comprovante não anexado.' };
  }
  if (!ACCEPTED_TYPE.test(file.type)) {
    return { attachment: null, error: 'Tipo de arquivo não suportado (use imagem ou PDF) — comprovante não anexado.' };
  }

  try {
    const processed = await processImage(file);
    const key = `${keyPrefix}-${Date.now()}-${sanitizeFilenameForKey(processed.name)}`;
    const result = await uploadToS3(processed, 'wallet', key);
    const proxyUrl = `${WALLET_URL.replace(/\/$/, '')}/api/files/wallet/${result.key}`;
    return {
      attachment: {
        originalName: file.name,
        s3Key: result.key,
        url: proxyUrl,
        contentType: processed.type,
        size: processed.size,
        createdAt: new Date(),
      },
    };
  } catch (err) {
    console.error('Falha ao enviar comprovante para o S3:', err);
    return { attachment: null, error: 'Falha ao enviar o comprovante — a operação foi concluída sem ele.' };
  }
}
