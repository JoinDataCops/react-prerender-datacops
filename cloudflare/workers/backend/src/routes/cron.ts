/**
 * Cache generation — Cloudflare Worker
 *
 * Triggered by:
 *   - Cloudflare Cron Trigger  (0 * * * *  — every hour, configured in wrangler.toml)
 *   - Manual POST /api/cache/generate
 *
 * ── How it works (FREE PLAN) ─────────────────────────────────────────────────
 *
 * 1. Fetches your live site's /sitemap.xml  → discovers every page URL
 * 2. For each URL, fetches the actual live page  → reads <title>, <meta>, <og:>
 *    tags directly from your real HTML (the same tags your SPA sets via
 *    react-helmet / @vueuse/head / document.title, etc.)
 * 3. Builds a complete, standards-compliant HTML document  → stores in D1
 * 4. Bot visits → middleware serves this cached HTML instantly
 *
 * No headless browser needed. No manual content entry. Works on free plan.
 *
 * ── What if my SPA doesn't set per-page meta? ────────────────────────────────
 * If your app uses react-helmet / react-router with dynamic titles, the static
 * shell at each URL already has the correct <title> and <meta> in the HTML
 * (set by your bundler / build tool in index.html).
 *
 * If every page returns the SAME title (common with plain Vite/CRA), the
 * worker derives a per-page title from the URL path automatically.
 * e.g.  /pricing  →  "Pricing — YourBrand"
 *
 * ── Dynamic pages from your DB ────────────────────────────────────────────────
 * If you have database-driven pages (blog posts, products, etc.) that aren't
 * in your sitemap, add them in buildDynamicPages() below.
 *
 * ── Optional: on-demand rendering (Paid plan) ─────────────────────────────────
 * Uncomment the [[browser]] binding in wrangler.toml for headless Chrome
 * rendering on cache miss — but this is NOT required for the free plan.
 */

import type { Env } from '../index.js';
import {
  createCronRun,
  updateCronRun,
  clearStuckCronRuns,
  getCronRuns,
  upsertPrerenderedPage,
  getPrerenderedPage,
} from '../lib/db.js';

const JOB_NAME = 'prerender-cache-refresh';
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const FETCH_TIMEOUT_MS = 8_000;
const MAX_PAGES_PER_RUN = 500; // guard against huge sitemaps

// ── Route handlers ─────────────────────────────────────────────────────────────

export async function handleCronRoutes(
  req: Request,
  env: Env,
  _ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === 'POST' && url.pathname === '/api/cache/generate') {
    const body = await req.json<{ force?: boolean }>().catch((): { force?: boolean } => ({}));
    const result = await generateCache(env, body.force ?? false);
    return json(result, result.success ? 200 : 500);
  }

  if (req.method === 'GET' && url.pathname === '/api/cron/runs') {
    const jobName = url.searchParams.get('job') ?? undefined;
    const limit = Math.min(Number(url.searchParams.get('limit') ?? '20'), 100);
    const runs = await getCronRuns(env.DB, jobName, limit);
    return json({ runs });
  }

  if (req.method === 'DELETE' && url.pathname === '/api/cron/runs/stuck') {
    const body = await req.json<{ job_name?: string }>().catch((): { job_name?: string } => ({}));
    const cleared = await clearStuckCronRuns(env.DB, body.job_name ?? JOB_NAME);
    return json({ success: true, cleared });
  }

  return json({ error: 'Not found' }, 404);
}

// ── Core cache generation ──────────────────────────────────────────────────────

export async function generateCache(
  env: Env,
  force = false,
): Promise<{ success: boolean; time_ms: number; pages_synced: number; pages_failed: number; error?: string }> {
  const start = Date.now();
  const runId = await createCronRun(env.DB, JOB_NAME);
  let pagesSynced = 0;
  let pagesFailed = 0;

  try {
    const siteUrl = (env.SITE_URL || '').replace(/\/$/, '');
    if (!siteUrl) {
      throw new Error('SITE_URL env var is not set');
    }

    // ── Step 1: Fetch global site metadata from the live homepage ────────────
    const siteMeta = await fetchPageMeta(siteUrl, '/');
    console.log(`[cron] site: ${siteUrl}  title: "${siteMeta.title}"`);

    // ── Step 2: Discover all pages from sitemap ──────────────────────────────
    const sitemapPaths = await discoverSitemapPaths(siteUrl);
    console.log(`[cron] sitemap discovered ${sitemapPaths.length} paths`);

    // ── Step 3: Add dynamic DB pages ────────────────────────────────────────
    const dynamicPages = await buildDynamicPages(env, siteUrl, siteMeta);
    const dynamicPaths = new Set(dynamicPages.map((p) => p.path));
    console.log(`[cron] ${dynamicPages.length} dynamic pages from DB`);

    // ── Step 4: Build page list — sitemap paths first, then dynamic ──────────
    const allPaths: string[] = [
      ...sitemapPaths.filter((p) => !dynamicPaths.has(p)),
      ...dynamicPages.map((p) => p.path),
    ].slice(0, MAX_PAGES_PER_RUN);

    // Ensure homepage is always included
    if (!allPaths.includes('/')) allPaths.unshift('/');

    console.log(`[cron] building cache for ${allPaths.length} pages`);

    // ── Step 5: Generate + store HTML for every page ─────────────────────────
    for (const path of allPaths) {
      // Skip fresh cache unless force=true
      if (!force) {
        try {
          const existing = await getPrerenderedPage(env.DB, path);
          if (existing?.html && existing.expires_at && new Date(existing.expires_at) > new Date()) {
            continue;
          }
        } catch {}
      }

      try {
        // Check if this is a dynamic page (already has HTML built)
        const dynamic = dynamicPages.find((p) => p.path === path);
        if (dynamic) {
          await upsertPrerenderedPage(env.DB, {
            path: dynamic.path,
            html: dynamic.html,
            title: dynamic.title,
            description: dynamic.description,
            expires_at: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
          });
          pagesSynced++;
          continue;
        }

        // For sitemap-discovered pages: fetch live metadata + build HTML
        const meta = await fetchPageMeta(siteUrl, path, siteMeta);
        const html = generateHtmlPage({
          path,
          siteUrl,
          title: meta.title,
          description: meta.description,
          ogImage: meta.ogImage || siteMeta.ogImage,
          themeColor: meta.themeColor || siteMeta.themeColor,
          favicon: siteMeta.favicon,
          content: `<h1>${esc(meta.title)}</h1>`,
          schemas: buildSchemas(path, meta.title, meta.description, siteUrl),
        });

        await upsertPrerenderedPage(env.DB, {
          path,
          html,
          title: meta.title,
          description: meta.description,
          expires_at: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
        });
        pagesSynced++;
        console.log(`[cron] cached ${path}`);
      } catch (err) {
        console.error(`[cron] failed ${path}:`, err);
        pagesFailed++;
      }
    }

    await updateCronRun(env.DB, runId, {
      status: 'completed',
      pages_synced: pagesSynced,
      pages_failed: pagesFailed,
      details: { time_ms: Date.now() - start },
    });

    return { success: true, time_ms: Date.now() - start, pages_synced: pagesSynced, pages_failed: pagesFailed };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[cron] fatal:', message);
    await updateCronRun(env.DB, runId, {
      status: 'failed',
      pages_synced: pagesSynced,
      pages_failed: pagesFailed,
      error_message: message,
    });
    return { success: false, time_ms: Date.now() - start, pages_synced: pagesSynced, pages_failed: pagesFailed, error: message };
  }
}

// ── ✏️  OPTIONAL: Add DB-driven dynamic pages ──────────────────────────────────
//
// If you have pages that aren't in your sitemap (e.g. /blog/[slug], /market/[id])
// add them here by querying your D1 tables.
//
// The worker already handles sitemap-discovered pages automatically.
// Only add here if those pages are NOT in your sitemap.xml.

interface PageData {
  path: string;
  html: string;
  title?: string;
  description?: string;
}

async function buildDynamicPages(
  env: Env,
  siteUrl: string,
  siteMeta: PageMeta,
): Promise<PageData[]> {
  const pages: PageData[] = [];

  // ── Example: blog posts from a `posts` D1 table ────────────────────────────
  //
  // try {
  //   const { results } = await env.DB
  //     .prepare('SELECT slug, title, excerpt FROM posts WHERE status = ? ORDER BY created_at DESC')
  //     .bind('published')
  //     .all<{ slug: string; title: string; excerpt: string }>();
  //
  //   for (const post of results) {
  //     const path = `/blog/${post.slug}`;
  //     pages.push({
  //       path,
  //       title: post.title,
  //       description: post.excerpt,
  //       html: generateHtmlPage({
  //         path,
  //         siteUrl,
  //         title: post.title,
  //         description: post.excerpt,
  //         ogImage: siteMeta.ogImage,
  //         favicon: siteMeta.favicon,
  //         content: `<article><h1>${esc(post.title)}</h1><p>${esc(post.excerpt)}</p></article>`,
  //         schemas: [{
  //           '@context': 'https://schema.org',
  //           '@type': 'BlogPosting',
  //           headline: post.title,
  //           description: post.excerpt,
  //           url: `${siteUrl}${path}`,
  //         }],
  //       }),
  //     });
  //   }
  // } catch (err) {
  //   console.error('[cron] dynamic pages failed:', err);
  // }

  return pages;
}

// ── Fetch real metadata from the live site ─────────────────────────────────────

interface PageMeta {
  title: string;
  description: string;
  ogImage: string;
  favicon: string;
  themeColor: string;
  /** True if the page returns a non-generic title (per-page meta is set) */
  hasCustomTitle: boolean;
}

/**
 * Fetches the live page and extracts all <meta> tags.
 * Falls back to deriving the page name from the URL path.
 *
 * For pure SPAs (Vite/CRA), every route returns the same index.html.
 * In that case `homeMeta` is passed and the title is derived from the path.
 */
async function fetchPageMeta(
  siteUrl: string,
  path: string,
  homeMeta?: PageMeta,
): Promise<PageMeta> {
  const url = `${siteUrl}${path}`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'prerender-edge/1.0 (cache-builder)',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    const title = extractMeta(html, 'title') || extractMeta(html, 'og:title') || '';
    const description =
      extractMeta(html, 'description') ||
      extractMeta(html, 'og:description') ||
      '';
    const ogImage =
      extractMeta(html, 'og:image') ||
      extractMeta(html, 'twitter:image') ||
      `${siteUrl}/og-image.png`;
    const favicon = extractFavicon(html, siteUrl);
    const themeColor = extractMeta(html, 'theme-color') || '';

    // Detect if this is a per-page title or the generic homepage title
    const isGeneric = homeMeta ? title === homeMeta.title : false;

    // For SPAs: if every route returns the same title, derive per-page title from path
    const finalTitle =
      isGeneric && path !== '/'
        ? `${pathToLabel(path)} — ${brandFromTitle(homeMeta?.title || title)}`
        : title || pathToLabel(path);

    return {
      title: finalTitle,
      description: description || (homeMeta?.description ?? ''),
      ogImage,
      favicon,
      themeColor,
      hasCustomTitle: !isGeneric,
    };
  } catch (err) {
    console.warn(`[cron] fetchPageMeta failed for ${path}:`, err);
    // Fallback: use home meta + derive title from path
    return {
      title:
        path === '/'
          ? (homeMeta?.title ?? siteUrl)
          : `${pathToLabel(path)} — ${brandFromTitle(homeMeta?.title ?? '')}`,
      description: homeMeta?.description ?? '',
      ogImage: homeMeta?.ogImage ?? `${siteUrl}/og-image.png`,
      favicon: homeMeta?.favicon ?? `${siteUrl}/favicon.ico`,
      themeColor: homeMeta?.themeColor ?? '',
      hasCustomTitle: false,
    };
  }
}

// ── Sitemap discovery ──────────────────────────────────────────────────────────

async function discoverSitemapPaths(siteUrl: string): Promise<string[]> {
  const paths: string[] = [];
  const seen = new Set<string>();

  const tryFetch = async (url: string): Promise<string | null> => {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'prerender-edge/1.0 (sitemap-reader)' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      return res.ok ? res.text() : null;
    } catch {
      return null;
    }
  };

  const addLoc = (loc: string) => {
    try {
      const p = new URL(loc).pathname;
      if (!seen.has(p)) { seen.add(p); paths.push(p); }
    } catch {}
  };

  for (const candidate of [`${siteUrl}/sitemap.xml`, `${siteUrl}/sitemap_index.xml`]) {
    const text = await tryFetch(candidate);
    if (!text) continue;

    if (text.includes('<sitemapindex')) {
      // sitemap index: collect child sitemaps
      const childUrls = [...text.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)].map((m) => m[1].trim());
      for (const childUrl of childUrls) {
        const childText = await tryFetch(childUrl);
        if (childText) {
          [...childText.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)].forEach((m) => addLoc(m[1].trim()));
        }
      }
      break;
    }

    if (text.includes('<urlset')) {
      [...text.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)].forEach((m) => addLoc(m[1].trim()));
      break;
    }
  }

  return paths;
}

// ── HTML generator ─────────────────────────────────────────────────────────────

function generateHtmlPage(opts: {
  path: string;
  siteUrl: string;
  title: string;
  description: string;
  content: string;
  ogImage?: string;
  favicon?: string;
  themeColor?: string;
  schemas?: object[];
}): string {
  const siteUrl = opts.siteUrl.replace(/\/$/, '');
  const canonical = `${siteUrl}${opts.path}`;
  const ogImage = opts.ogImage ?? `${siteUrl}/og-image.png`;
  const favicon = opts.favicon ?? `${siteUrl}/favicon.ico`;
  const desc = opts.description.length > 160
    ? opts.description.slice(0, 157) + '...'
    : opts.description;

  const schemaScripts = (opts.schemas ?? [])
    .map((s) => `  <script type="application/ld+json">${JSON.stringify(s)}</script>`)
    .join('\n');

  const themeColorMeta = opts.themeColor
    ? `\n  <meta name="theme-color" content="${esc(opts.themeColor)}">`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(opts.title)}</title>
  <meta name="description" content="${esc(desc)}">
  <link rel="canonical" href="${canonical}">
  <link rel="icon" href="${favicon}">${themeColorMeta}

  <!-- Open Graph -->
  <meta property="og:title" content="${esc(opts.title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:image" content="${ogImage}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:type" content="website">

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(opts.title)}">
  <meta name="twitter:description" content="${esc(desc)}">
  <meta name="twitter:image" content="${ogImage}">

  <!-- Prerender marker -->
  <meta name="prerender-status" content="success">
  <meta name="prerender-date" content="${new Date().toISOString()}">

${schemaScripts}
</head>
<body>
  <main id="content">
    ${opts.content}
  </main>
</body>
</html>`;
}

// ── Schema.org structured data ─────────────────────────────────────────────────

function buildSchemas(
  path: string,
  title: string,
  description: string,
  siteUrl: string,
): object[] {
  if (path === '/') {
    return [
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: brandFromTitle(title),
        url: siteUrl,
        description,
      },
    ];
  }
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: title,
      description,
      url: `${siteUrl}${path}`,
    },
  ];
}

// ── HTML parsing helpers ───────────────────────────────────────────────────────

function extractMeta(html: string, name: string): string {
  // <title>...</title>
  if (name === 'title') {
    const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return m ? m[1].trim() : '';
  }

  // <meta name="..." content="...">  or  <meta property="..." content="...">
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${escapeRegex(name)}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escapeRegex(name)}["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[1].trim();
  }
  return '';
}

function extractFavicon(html: string, siteUrl: string): string {
  const m = html.match(/<link[^>]+rel=["'](?:icon|shortcut icon)["'][^>]+href=["']([^"']+)["']/i)
    || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:icon|shortcut icon)["']/i);
  if (!m) return `${siteUrl}/favicon.ico`;
  const href = m[1];
  if (href.startsWith('http')) return href;
  return `${siteUrl}/${href.replace(/^\//, '')}`;
}

function pathToLabel(path: string): string {
  if (path === '/') return '';
  return path
    .replace(/^\//, '')
    .split('/')
    .pop()!
    .replace(/-/g, ' ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function brandFromTitle(title: string): string {
  // "DataCops | The Cleanest..." → "DataCops"
  // "PillarLab AI - Chat With..." → "PillarLab AI"
  const m = title.match(/^([^|—\-]+)/);
  return m ? m[1].trim() : title;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
