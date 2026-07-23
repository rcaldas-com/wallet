import { ImageResponse } from 'next/og';
import { readFile } from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Wallet – Carteira digital RCaldas';

export default async function OgImage() {
  const fontPath = path.join(process.cwd(), 'public', 'fonts', 'inter.ttf');
  const logoPath = path.join(process.cwd(), 'public', 'logo.png');
  const [fontData, logoData] = await Promise.all([readFile(fontPath), readFile(logoPath)]);
  const logoSrc = `data:image/png;base64,${logoData.toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          background: 'linear-gradient(135deg, #022c22 0%, #064e3b 55%, #09090b 100%)',
          fontFamily: 'Inter, sans-serif',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '-140px',
            right: '-80px',
            width: '480px',
            height: '480px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(52,211,153,0.28) 0%, transparent 70%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-120px',
            left: '25%',
            width: '360px',
            height: '360px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(5,150,105,0.3) 0%, transparent 70%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '40%',
            left: '62%',
            width: '160px',
            height: '160px',
            borderRadius: '50%',
            background: 'rgba(52,211,153,0.08)',
          }}
        />

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: '64px',
            padding: '64px 80px',
            width: '1200px',
            height: '630px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '56px' }}>
            <img
              src={logoSrc}
              width={220}
              height={220}
              style={{ borderRadius: '24px', flexShrink: 0 }}
              alt="Wallet"
            />
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <span
                style={{
                  color: '#ffffff',
                  fontSize: '110px',
                  fontWeight: 900,
                  lineHeight: 1.0,
                  letterSpacing: '-4px',
                  display: 'block',
                }}
              >
                Wallet
              </span>
              <span
                style={{
                  color: '#6ee7b7',
                  fontSize: '68px',
                  fontWeight: 800,
                  lineHeight: 1.1,
                  letterSpacing: '-2px',
                  display: 'block',
                }}
              >
                RCaldas
              </span>
            </div>
          </div>
          <span
            style={{
              color: '#d1fae5',
              fontSize: '52px',
              fontWeight: 500,
              lineHeight: 1.1,
              display: 'block',
            }}
          >
            Sua carteira digital, na palma da mão.
          </span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'Inter', data: fontData, weight: 400, style: 'normal' },
        { name: 'Inter', data: fontData, weight: 700, style: 'normal' },
        { name: 'Inter', data: fontData, weight: 900, style: 'normal' },
      ],
    },
  );
}
