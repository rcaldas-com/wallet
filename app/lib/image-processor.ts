import sharp from 'sharp';

// Configurações de redimensionamento
const IMAGE_CONFIG = {
  maxWidth: 2560,
  maxHeight: 1440,
  quality: 85,
  // Formatos aceitos para processamento
  supportedFormats: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
};

/**
 * Verifica se o arquivo é uma imagem que deve ser processada
 */
export function shouldProcessImage(file: File): boolean {
  return IMAGE_CONFIG.supportedFormats.includes(file.type.toLowerCase());
}

/**
 * Redimensiona uma imagem mantendo a proporção e otimizando a qualidade
 * @param file - Arquivo de imagem original
 * @returns Promise<File> - Arquivo processado
 */
export async function processImage(file: File): Promise<File> {
  if (!shouldProcessImage(file)) {
    return file; // Retorna o arquivo original se não for uma imagem suportada
  }

  try {
    // Converter File para ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    // Obter metadados da imagem
    const metadata = await sharp(buffer).metadata();
    const { width = 0, height = 0 } = metadata;

    // Verificar se a imagem precisa ser redimensionada
    const needsResize = width > IMAGE_CONFIG.maxWidth || height > IMAGE_CONFIG.maxHeight;

    let processedBuffer: ArrayBuffer;

    if (needsResize) {
      // Calcular novas dimensões mantendo a proporção
      const aspectRatio = width / height;
      let newWidth = IMAGE_CONFIG.maxWidth;
      let newHeight = IMAGE_CONFIG.maxHeight;

      if (aspectRatio > 1) {
        // Imagem é mais larga que alta
        newHeight = Math.round(newWidth / aspectRatio);
      } else {
        // Imagem é mais alta que larga
        newWidth = Math.round(newHeight * aspectRatio);
      }

      // Redimensionar e otimizar
      processedBuffer = await sharp(buffer)
        .resize(newWidth, newHeight, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: IMAGE_CONFIG.quality, progressive: true })
        .toBuffer()
        .then((buf: any) => buf.buffer);
    } else {
      // Apenas otimizar a qualidade sem redimensionar
      processedBuffer = await sharp(buffer)
        .jpeg({ quality: IMAGE_CONFIG.quality, progressive: true })
        .toBuffer()
        .then((buf: any) => buf.buffer);
    }

    // Criar novo File com a imagem processada
    const processedFile = new File(
      [processedBuffer],
      file.name.replace(/\.(png|webp)$/i, '.jpg'), // Converter para JPEG
      {
        type: 'image/jpeg',
        lastModified: Date.now(),
      }
    );

    // Log do processamento
    const originalSize = (file.size / 1024 / 1024).toFixed(2);
    const processedSize = (processedFile.size / 1024 / 1024).toFixed(2);
    const reduction = ((1 - processedFile.size / file.size) * 100).toFixed(1);

    console.log(`[Image Processor] ${file.name}: ${originalSize}MB → ${processedSize}MB (${reduction}% reduction)`);
    if (needsResize) {
      console.log(`[Image Processor] Resized from ${width}x${height} to max ${IMAGE_CONFIG.maxWidth}x${IMAGE_CONFIG.maxHeight}`);
    }

    return processedFile;
  } catch (error) {
    console.error('[Image Processor] Erro ao processar imagem:', error);
    // Em caso de erro, retorna o arquivo original
    return file;
  }
}

/**
 * Processa múltiplas imagens em paralelo
 * @param files - Array de arquivos
 * @returns Promise<File[]> - Array de arquivos processados
 */
export async function processImages(files: File[]): Promise<File[]> {
  const promises = files.map(file => processImage(file));
  return Promise.all(promises);
}
