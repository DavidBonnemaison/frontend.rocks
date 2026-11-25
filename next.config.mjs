/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  poweredByHeader: false,
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ['@mdn/browser-compat-data', 'web-features'],
};

export default nextConfig;
