/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production';

const nextConfig = {
  output: 'standalone',
  ...(isDev ? { basePath: '/wallet' } : {}),
  // Mantém o SDK da Stellar fora do bundle do servidor (tem deps nativas opcionais).
  serverExternalPackages: ['@stellar/stellar-sdk'],
  experimental: {
    serverActions: {
      // Igual a MAX_RECEIPT_BYTES (lib/form-submit.ts) e ao car. Com 10mb, o
      // limite de 64MB do comprovante nunca chegava a valer.
      bodySizeLimit: '64mb',
    },
  },
};

module.exports = nextConfig;
