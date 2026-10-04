import { timingSafeEqual } from 'node:crypto';
import type { AuthInfo } from '@modelcontextprotocol/server';
import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { z } from 'zod';
import { withPage } from '@/lib/browser';
import { isAllowedUrl } from '@/lib/url-guard';

export const runtime = 'nodejs';
export const maxDuration = 60;

const NAV_TIMEOUT_MS = 30_000;
const MAX_TEXT_CHARS = 20_000;

const urlInput = z
  .string()
  .url()
  .describe('Absolute http(s) URL of a public web page.');

function errorResult(message: string) {
  return { isError: true, content: [{ type: 'text' as const, text: message }] };
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      'get_page',
      {
        title: 'Get page',
        description:
          'Open a URL in headless Chromium, wait for it to render, and return the page title, final URL and visible text.',
        inputSchema: z.object({ url: urlInput }),
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ url }) => {
        if (!(await isAllowedUrl(url))) return errorResult(`URL not allowed: ${url}`);
        try {
          return await withPage(async (page) => {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
            await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
            const title = await page.title();
            let text = (await page.locator('body').innerText()).trim();
            if (text.length > MAX_TEXT_CHARS) text = `${text.slice(0, MAX_TEXT_CHARS)}\n\n[truncated]`;
            return {
              content: [{ type: 'text' as const, text: `# ${title}\n${page.url()}\n\n${text}` }],
            };
          });
        } catch (err) {
          return errorResult(`Failed to load ${url}: ${(err as Error).message}`);
        }
      },
    );

    server.registerTool(
      'screenshot',
      {
        title: 'Screenshot',
        description: 'Open a URL in headless Chromium and return a JPEG screenshot of the viewport.',
        inputSchema: z.object({
          url: urlInput,
          fullPage: z.boolean().optional().describe('Capture the full scrollable page. Defaults to false.'),
          width: z.number().int().min(320).max(1920).optional().describe('Viewport width. Defaults to 1280.'),
          height: z.number().int().min(320).max(1600).optional().describe('Viewport height. Defaults to 800.'),
        }),
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ url, fullPage, width, height }) => {
        if (!(await isAllowedUrl(url))) return errorResult(`URL not allowed: ${url}`);
        try {
          return await withPage(
            async (page) => {
              await page.goto(url, { waitUntil: 'load', timeout: NAV_TIMEOUT_MS });
              // JPEG at quality 60 keeps responses well under Vercel's 4.5 MB limit.
              const image = await page.screenshot({ type: 'jpeg', quality: 60, fullPage: fullPage ?? false });
              return {
                content: [
                  { type: 'image' as const, data: image.toString('base64'), mimeType: 'image/jpeg' },
                ],
              };
            },
            { viewport: { width: width ?? 1280, height: height ?? 800 } },
          );
        } catch (err) {
          return errorResult(`Failed to screenshot ${url}: ${(err as Error).message}`);
        }
      },
    );
  },
  { serverInfo: { name: 'playwright-mcp', version: '0.1.0' } },
);

// Static bearer token for now. Swap this for JWT verification when adding OAuth.
function verifyToken(_req: Request, bearerToken?: string): AuthInfo | undefined {
  const expected = process.env.MCP_API_TOKEN;
  if (!expected || !bearerToken) return undefined;
  const a = Buffer.from(bearerToken);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return undefined;
  return { token: bearerToken, clientId: 'static-token', scopes: [] };
}

const authHandler = withMcpAuth(handler, verifyToken, { required: true });

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
