/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Only use assetPrefix in development (when running behind nginx proxy)
  assetPrefix: process.env.NODE_ENV === 'production' ? '' : '/wallet',
};

module.exports = nextConfig;
