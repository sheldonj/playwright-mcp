import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Load these from node_modules at runtime instead of bundling them.
  serverExternalPackages: ['@sparticuz/chromium-min', 'playwright-core'],
};

export default nextConfig;
