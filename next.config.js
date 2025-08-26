/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  basePath: process.env.NODE_ENV === 'production' ? '' : '/wallet',
  // Disable useFileSystemPublicRoutes in production for better security
  useFileSystemPublicRoutes: process.env.NODE_ENV !== 'production',
};

module.exports = nextConfig;
