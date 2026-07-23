/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production';

const nextConfig = {
  output: 'standalone',
  ...(isDev ? { basePath: '/wallet' } : {}),
  // Mantém o SDK da Stellar fora do bundle do servidor (tem deps nativas opcionais).
  serverExternalPackages: ['@stellar/stellar-sdk'],
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

module.exports = nextConfig;
