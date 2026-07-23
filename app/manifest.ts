import type { MetadataRoute } from 'next';

// Mesmo padrão do app principal (start_url fixo em /finance lá): abre direto
// no dashboard do wallet quando instalado como PWA, sem passar pela tela
// inicial de redirecionamento.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Wallet - RCaldas',
    short_name: 'Wallet',
    description: 'Carteira digital RCaldas',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#f9fafb',
    theme_color: '#059669',
    icons: [
      { src: '/logo.png', sizes: '192x192', type: 'image/png' },
      { src: '/logo.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
