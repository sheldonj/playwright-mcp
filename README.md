# playwright-mcp

A small [MCP](https://modelcontextprotocol.io) server that drives headless Chromium with Playwright, built to deploy on Vercel Functions.

- **Endpoint:** `/api/mcp` (Streamable HTTP, stateless, via [`mcp-handler`](https://github.com/vercel/mcp-handler) v2)
- **Auth:** a static bearer token (`MCP_API_TOKEN`) for now
- **Browser:** `playwright-core` + [`@sparticuz/chromium-min`](https://github.com/Sparticuz/chromium) on Vercel; any local Chromium in development

## Tools

| Tool | What it does |
|---|---|
| `get_page` | Opens a URL and returns the title, final URL and visible text (capped at 20k chars). |
| `screenshot` | Opens a URL and returns a JPEG screenshot. Optional `fullPage`, `width`, `height`. |

Both tools only reach public `http(s)` addresses. Every request the page makes is checked, so redirects and subresources can't reach localhost, private networks or cloud metadata endpoints.

## Run locally

```bash
npm install
npx playwright install chromium        # or set CHROMIUM_EXECUTABLE_PATH
cp .env.example .env.local             # then set MCP_API_TOKEN
npm run dev
```

Test with the MCP Inspector (`npm run inspector`): choose **Streamable HTTP**, URL `http://localhost:3000/api/mcp`, and add the header `Authorization: Bearer <MCP_API_TOKEN>`.

## Deploy to Vercel

1. Import this repo at [vercel.com/new](https://vercel.com/new) (or run `npx vercel link`).
2. Add the environment variable `MCP_API_TOKEN` (generate with `openssl rand -hex 32`).
3. Deploy. Fluid compute is on by default; the default 2 GB memory is enough.

The first request on a cold instance downloads the Chromium pack (~70 MB) from GitHub into `/tmp`, which takes a few seconds. Warm requests reuse it. To host the pack yourself (for example on Vercel Blob), set `CHROMIUM_PACK_URL`. It must match the `@sparticuz/chromium-min` version in `package.json`, so upgrade the two together.

## Connect a client

Claude Code:

```bash
claude mcp add --transport http playwright https://<your-project>.vercel.app/api/mcp \
  --header "Authorization: Bearer <MCP_API_TOKEN>"
```

An [eve](https://vercel.com/docs/eve) agent, in `agent/connections/browser.ts`:

```ts
import { defineMcpClientConnection } from 'eve/connections';

export default defineMcpClientConnection({
  url: 'https://<your-project>.vercel.app/api/mcp',
  description: 'Headless browser: read page text and take screenshots.',
  auth: {
    credentialOwner: 'app',
    getToken: async () => ({ token: process.env.BROWSER_MCP_TOKEN! }),
  },
  tools: { allow: ['get_page', 'screenshot'] },
});
```

## Next: OAuth

To use this as a multi-user Claude.ai connector, replace `verifyToken` in `app/api/mcp/route.ts` with JWT verification against your authorization server (for example WorkOS AuthKit), and add `app/.well-known/oauth-protected-resource/route.ts` using `protectedResourceHandler` from `mcp-handler`.
