/**
 * Cloudflare Workers Backend — Prerender Engine
 *
 * How it works:
 *   1. A bot visits your SPA (e.g. Googlebot hits /pricing)
 *   2. _middleware.ts detects the bot and calls GET /api/prerender?path=/pricing
 *   3. This worker checks D1 cache:
 *        HIT  → returns cached HTML immediately
 *        MISS → launches Cloudflare Browser Rendering (headless Chrome)
 *             → loads your React app at SITE_URL/pricing
 *             → waits for React to render (networkidle0)
 *             → caches the full HTML in D1
 *             → returns HTML to middleware → middleware serves bot
 *   4. Cron trigger runs every hour → fetches your sitemap.xml
 *      → re-renders all pages → keeps cache fresh
 *
 * Routes:
 *   GET  /api/prerender           — lookup cache (renders on miss via Browser Rendering)
 *   POST /api/prerender           — manually push HTML into cache
 *   DELETE /api/prerender         — delete cache entry
 *   GET  /api/prerender/stats     — cache statistics
 *   GET  /api/sitemap             — dynamic sitemap
 *   GET  /api/sitemap/static      — stored sitemap shards
 *   POST /api/sitemap/static      — store a sitemap shard
 *   GET  /api/scripts             — script injection tags
 *   POST /api/cache/generate      — trigger bulk cache generation
 *   GET  /api/cron/runs           — cron run history
 *   DELETE /api/cron/runs/stuck   — clear stuck jobs
 *   GET  /api/health              — health check
 *
 * Auth: Authorization: Bearer <WORKER_SECRET>  (except /api/health)
 */

import { handlePrerender } from './routes/prerender.js';
import { handleGenerateSitemap, handleStaticSitemap } from './routes/sitemap.js';
import { handleScripts } from './routes/scripts.js';
import { handleCronRoutes, generateCache } from './routes/cron.js';

export interface Env {
  DB: D1Database;
  WORKER_SECRET: string;
  SITE_URL: string;
  /** Cloudflare Browser Rendering binding — headless Chrome for SPA rendering */
  BROWSER?: Fetcher; // optional — only if [[browser]] binding is added (paid plan)
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Health check — public, no auth
    if (path === '/api/health') {
      return json({
        status: 'ok',
        worker: 'prerender-backend',
        hasBrowserBinding: !!env.BROWSER,
        timestamp: new Date().toISOString(),
      });
    }

    // Auth gate
    const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!env.WORKER_SECRET || token !== env.WORKER_SECRET) {
      return json({ error: 'Unauthorized' }, 401);
    }

    try {
      if (path.startsWith('/api/prerender')) {
        return addCors(await handlePrerender(request, env, ctx));
      }
      if (path === '/api/sitemap') {
        return addCors(await handleGenerateSitemap(request, env.DB, env.SITE_URL));
      }
      if (path === '/api/sitemap/static') {
        return addCors(await handleStaticSitemap(request, env.DB));
      }
      if (path === '/api/scripts') {
        return addCors(handleScripts(request));
      }
      if (
        path === '/api/cache/generate' ||
        path === '/api/cron/runs' ||
        path === '/api/cron/runs/stuck'
      ) {
        return addCors(await handleCronRoutes(request, env, ctx));
      }

      return json({ error: 'Not found', path }, 404);
    } catch (err) {
      console.error('Worker error:', err);
      return json({ error: err instanceof Error ? err.message : 'Internal error' }, 500);
    }
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('Cron trigger fired — refreshing prerender cache');
    ctx.waitUntil(
      generateCache(env, false).then((result) => {
        console.log('Cache refresh complete:', result);
      }),
    );
  },
} satisfies ExportedHandler<Env>;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function addCors(res: Response): Response {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) h.set(k, v);
  return new Response(res.body, { status: res.status, headers: h });
}
