import { chromium, type Browser, type BrowserContext } from 'playwright-core';
import { isAllowedUrl } from './url-guard';

// Must match the installed @sparticuz/chromium-min version (see package.json).
const DEFAULT_PACK_URL =
  'https://github.com/Sparticuz/chromium/releases/download/v153.0.0/chromium-v153.0.0-pack.x64.tar';

let browserPromise: Promise<Browser> | null = null;

async function launch(): Promise<Browser> {
  // Deployed on Vercel: download the Chromium pack to /tmp on cold start.
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'development') {
    const { default: sparticuz } = await import('@sparticuz/chromium-min');
    return chromium.launch({
      args: sparticuz.args,
      executablePath: await sparticuz.executablePath(
        process.env.CHROMIUM_PACK_URL ?? DEFAULT_PACK_URL,
      ),
      headless: true,
    });
  }

  // Local: use CHROMIUM_EXECUTABLE_PATH, or a browser installed with `npx playwright install chromium`.
  return chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
    args: process.env.CHROMIUM_EXTRA_ARGS?.split(' ').filter(Boolean),
    headless: true,
  });
}

/** One browser per warm instance, relaunched if it crashes. */
export async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = launch().then((browser) => {
      browser.on('disconnected', () => {
        browserPromise = null;
      });
      return browser;
    });
    browserPromise.catch(() => {
      browserPromise = null;
    });
  }
  return browserPromise;
}

/**
 * Runs `fn` in a fresh browser context and always closes it, so concurrent
 * requests on a Fluid compute instance don't leak pages or fill /tmp.
 * Every request the page makes is checked against the URL guard.
 */
export async function withPage<T>(
  fn: (page: Awaited<ReturnType<BrowserContext['newPage']>>) => Promise<T>,
  options: { viewport?: { width: number; height: number } } = {},
): Promise<T> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: options.viewport ?? { width: 1280, height: 800 },
  });
  try {
    await context.route('**/*', async (route) => {
      if (await isAllowedUrl(route.request().url())) return route.continue();
      return route.abort('blockedbyclient');
    });
    const page = await context.newPage();
    return await fn(page);
  } finally {
    await context.close();
  }
}
