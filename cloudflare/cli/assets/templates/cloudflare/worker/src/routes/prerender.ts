/**
 * Prerender route — serves cached HTML to bots.
 *
 * GET /api/prerender?path=/some/page
 *   1. Check D1 cache
 *   2. Cache HIT  → return HTML immediately (< 5ms)
 *   3. Cache MISS → return 404 (middleware falls back to SPA)
 *                   The cron job in cron.ts fills the cache proactively.
 *
 * POST /api/prerender  — manually push HTML (for CI/CD or custom pipelines)
 * DELETE /api/prerender — remove cache entry (path=X or all=true)
 * GET /api/prerender/stats — cache statistics
 *
 * ── On-demand rendering (optional, paid plan) ────────────────────────────────
 * If you have a Workers Paid plan and want to render uncached pages on-demand
 * via headless Chrome, uncomment the [[browser]] binding in wrangler.toml and
 * add @cloudflare/puppeteer to your dependencies.
 */

import type { Env } from '../index.js';
import {
  getPrerenderedPage,
  incrementHitCount,
  upsertPrerenderedPage,
  deletePrerenderedPage,
  clearAllPrerenderedPages,
  getPrerenderedPageStats,
} from '../lib/db.js';

const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

export async function handlePrerender(
  req: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(req.url);

  // ── Stats ──────────────────────────────────────────────────────────────────
  if (req.method === 'GET' && url.pathname === '/api/prerender/stats') {
    return json(await getPrerenderedPageStats(env.DB));
  }

  // ── GET: serve cached HTML (render on miss) ────────────────────────────────
  if (req.method === 'GET') {
    const path = url.searchParams.get('path') || '/';
    const page = await getPrerenderedPage(env.DB, path);

    const isExpired =
      page?.expires_at !== null && page?.expires_at !== undefined
        ? page.expires_at < new Date().toISOString()
        : false;

    // Cache hit (fresh)
    if (page?.html && !isExpired) {
      ctx.waitUntil(incrementHitCount(env.DB, path).catch(() => {}));
      return htmlResponse(page.html, 'hit');
    }

    // Serve stale if we have it (better than 404 for bots)
    if (page?.html) {
      ctx.waitUntil(incrementHitCount(env.DB, path).catch(() => {}));
      return htmlResponse(page.html, 'stale');
    }

    // Cache miss — bot gets 404, middleware falls back to SPA
    // The cron job (src/routes/cron.ts) populates the cache proactively.
    // Googlebot can execute JavaScript so it will still index your SPA.
    return json({ error: 'not_cached', path }, 404, { 'X-Cache': 'miss' });
  }

  // ── POST /api/prerender/import — bulk upload from CLI prerender command ───────
  if (req.method === 'POST' && url.pathname === '/api/prerender/import') {
    const body = await req.json<{
      pages: Array<{ path: string; html: string; title?: string; description?: string }>;
      ttl_hours?: number;
    }>();

    if (!Array.isArray(body.pages) || body.pages.length === 0) {
      return json({ error: 'pages array is required' }, 400);
    }

    const ttlMs = (body.ttl_hours ?? 24) * 60 * 60 * 1000;
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();
    let imported = 0;

    for (const page of body.pages) {
      if (!page.path || !page.html) continue;
      await upsertPrerenderedPage(env.DB, {
        path: page.path,
        html: page.html,
        title: page.title ?? '',
        description: page.description ?? '',
        expires_at: expiresAt,
      });
      imported++;
    }

    return json({ success: true, imported, expires_at: expiresAt });
  }

  // ── POST: manually push single HTML page into cache ────────────────────────
  if (req.method === 'POST') {
    const data = await req.json<{
      path: string;
      html: string;
      title?: string;
      description?: string;
      og_image?: string;
      source_table?: string;
      source_id?: string;
      expires_at?: string;
    }>();

    if (!data.path || !data.html) {
      return json({ error: 'path and html are required' }, 400);
    }

    await upsertPrerenderedPage(env.DB, data);
    return json({ success: true, path: data.path });
  }

  // ── DELETE: clear cache ────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const path = url.searchParams.get('path');
    const all = url.searchParams.get('all') === 'true';

    if (all) {
      const count = await clearAllPrerenderedPages(env.DB);
      return json({ success: true, cleared: count });
    }

    if (!path) {
      return json({ error: 'path or all=true required' }, 400);
    }

    const deleted = await deletePrerenderedPage(env.DB, path);
    return json({ success: deleted, path });
  }

  return json({ error: 'Method not allowed' }, 405);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function htmlResponse(html: string, cacheStatus: string): Response {
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Prerendered': 'true',
      'X-Cache': cacheStatus,
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}

function json(data: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}
