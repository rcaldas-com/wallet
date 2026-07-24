import { ImageResponse } from 'next/og';
import { readFile } from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

// Ícone próprio do wallet (diferente do favicon do web) — mesma cor de marca
// usada no cabeçalho e na og-image (emerald), pra diferenciar as abas dos
// dois domínios em produção. Usa a mesma fonte embutida da og-image (sem
// emoji): next/og tentaria baixar uma fonte padrão da internet pra
// renderizar emoji, o que trava sem proxy configurado.
export default async function Icon() {
  const fontPath = path.join(process.cwd(), 'public', 'fonts', 'inter.ttf');
  const fontData = await readFile(fontPath);

  return new ImageResponse(
    (
      <div
        style={{
          width: '32px',
          height: '32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#059669',
          borderRadius: '8px',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        <span style={{ color: '#ffffff', fontSize: '20px', fontWeight: 900 }}>W</span>
      </div>
    ),
    { width: 32, height: 32, fonts: [{ name: 'Inter', data: fontData, weight: 900, style: 'normal' }] },
  );
}
