import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Load these from node_modules at runtime instead of bundling them.
  serverExternalPackages: ['@sparticuz/chromium-min', 'playwright-core'],
  // File tracing misses files these packages read at runtime (e.g. playwright-core/browsers.json),
  // so ship the whole packages with the MCP route.
  outputFileTracingIncludes: {
    '/api/mcp': [
      './node_modules/playwright-core/**/*',
      './node_modules/@sparticuz/chromium-min/**/*',
    ],
  },
};

export default nextConfig;
