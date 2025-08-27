/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Only assetPrefix to ensure CSS/JS have /wallet prefix
  assetPrefix: '/wallet',
};

module.exports = nextConfig;
