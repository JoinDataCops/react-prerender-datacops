/**
 * Cache generation — Cloudflare Worker
 *
 * Triggered by:
 *   - Cloudflare Cron Trigger  (0 * * * *  — every hour, configured in wrangler.toml)
 *   - Manual POST /api/cache/generate
 *
 * ── How it works (FREE PLAN) ─────────────────────────────────────────────────
 *
 * 1. Fetches SITE_URL/prerender-content.json  → your page content definitions
 *    (drop this file in your public/ folder — no worker redeployment needed)
 * 2. Fetches your live site's /sitemap.xml  → discovers every page URL
 * 3. For each URL, reads <title>/<meta> from live site + content from JSON
 * 4. Builds a complete, standards-compliant HTML document  → stores in D1
 * 5. Bot visits → middleware serves this cached HTML instantly
 *
 * No headless browser. No manual TypeScript editing. Works on free plan.
 *
 * ── prerender-content.json ────────────────────────────────────────────────────
 * Put this file in your project's public/ folder.
 * The worker fetches it automatically on every cron run.
 *
 * Run:  prerender-edge content  to get a starter template for your site.
 *
 * ── Dynamic pages from your DB ────────────────────────────────────────────────
 * If you have database-driven pages (blog posts, products, etc.) that aren't
 * in your sitemap, add them in buildDynamicPages() below.
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
const MAX_PAGES_PER_RUN = 500;

// ── prerender-content.json schema ──────────────────────────────────────────────
//
// This is what the user puts in their public/ folder.
// All fields are optional — the worker fills in gaps from live meta tags.
//
interface ContentJson {
  brand?: string;
  tagline?: string;
  nav?: Array<{ label: string; href: string }>;
  pages?: Record<string, PageContent>;
  /** Applied to any page not listed in `pages` */
  fallback?: PageContent;
}

interface PageContent {
  title?: string;
  description?: string;
  sections?: Section[];
}

type Section =
  | HeroSection
  | TextSection
  | FeaturesSection
  | PricingSection
  | FaqSection
  | CtaSection
  | TableSection
  | StepsSection;

interface HeroSection     { type: 'hero';     heading: string; subheading?: string; text?: string; cta?: { label: string; href: string } }
interface TextSection     { type: 'text';     heading?: string; paragraphs: string[] }
interface FeaturesSection { type: 'features'; heading?: string; items: string[] | Array<{ title: string; text?: string }> }
interface PricingSection  { type: 'pricing';  heading?: string; tiers: Array<{ name: string; price: string; period?: string; features?: string[] }> }
interface FaqSection      { type: 'faq';      heading?: string; items: Array<{ question: string; answer: string }> }
interface CtaSection      { type: 'cta';      heading: string; text?: string; cta?: { label: string; href: string } }
interface TableSection    { type: 'table';    heading?: string; headers: string[]; rows: string[][] }
interface StepsSection    { type: 'steps';    heading?: string; steps: Array<{ title: string; text?: string }> }

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
    if (!siteUrl) throw new Error('SITE_URL env var is not set');

    // ── Step 1: Fetch prerender-content.json (user's content definitions) ────
    const contentJson = await fetchContentJson(siteUrl);
    if (contentJson) {
      console.log(`[cron] loaded prerender-content.json (${Object.keys(contentJson.pages ?? {}).length} page defs)`);
    } else {
      console.log('[cron] no prerender-content.json found — using auto-generated content');
    }

    // ── Step 2: Fetch global site metadata from the live homepage ─────────────
    const siteMeta = await fetchPageMeta(siteUrl, '/');
    const brand = contentJson?.brand ?? brandFromTitle(siteMeta.title);
    console.log(`[cron] site: ${siteUrl}  brand: "${brand}"`);

    // ── Step 3: Discover all pages from sitemap ───────────────────────────────
    const sitemapPaths = await discoverSitemapPaths(siteUrl);
    console.log(`[cron] sitemap discovered ${sitemapPaths.length} paths`);

    // ── Step 4: Add dynamic DB pages ─────────────────────────────────────────
    const dynamicPages = await buildDynamicPages(env, siteUrl, siteMeta, contentJson);
    const dynamicPaths = new Set(dynamicPages.map((p) => p.path));
    console.log(`[cron] ${dynamicPages.length} dynamic pages from DB`);

    // ── Step 5: Build full page list ──────────────────────────────────────────
    const allPaths: string[] = [
      ...sitemapPaths.filter((p) => !dynamicPaths.has(p)),
      ...dynamicPages.map((p) => p.path),
    ].slice(0, MAX_PAGES_PER_RUN);

    if (!allPaths.includes('/')) allPaths.unshift('/');

    console.log(`[cron] building cache for ${allPaths.length} pages`);

    // ── Step 6: Generate + store HTML for every page ──────────────────────────
    for (const path of allPaths) {
      if (!force) {
        try {
          const existing = await getPrerenderedPage(env.DB, path);
          if (existing?.html && existing.expires_at && new Date(existing.expires_at) > new Date()) continue;
        } catch {}
      }

      try {
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

        // Resolve content: prerender-content.json page def  OR  auto-generated
        const pageDef = contentJson?.pages?.[path] ?? contentJson?.fallback;
        const meta = await fetchPageMeta(siteUrl, path, siteMeta);

        const title = pageDef?.title ?? meta.title;
        const description = pageDef?.description ?? meta.description;
        const content = buildPageBody(path, title, description, siteUrl, brand, pageDef, contentJson);

        const html = generateHtmlPage({
          path,
          siteUrl,
          title,
          description,
          ogImage: meta.ogImage || siteMeta.ogImage,
          themeColor: meta.themeColor || siteMeta.themeColor,
          favicon: siteMeta.favicon,
          brand,
          nav: contentJson?.nav,
          content,
          schemas: buildSchemas(path, title, description, siteUrl, brand),
        });

        await upsertPrerenderedPage(env.DB, {
          path,
          html,
          title,
          description,
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

// ── Fetch prerender-content.json ───────────────────────────────────────────────

async function fetchContentJson(siteUrl: string): Promise<ContentJson | null> {
  try {
    const res = await fetch(`${siteUrl}/prerender-content.json`, {
      headers: { 'User-Agent': 'prerender-edge/1.0 (content-reader)', Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = await res.json<ContentJson>();
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

// ── Build page HTML body ────────────────────────────────────────────────────────

function buildPageBody(
  path: string,
  title: string,
  description: string,
  siteUrl: string,
  brand: string,
  pageDef: PageContent | undefined,
  contentJson: ContentJson | null,
): string {
  // If user provided sections for this page → render them (like the old edge function content generators)
  if (pageDef?.sections && pageDef.sections.length > 0) {
    return renderSections(pageDef.sections, siteUrl);
  }

  // Auto-generate: split description into sentences, make a readable article
  const sentences = description
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);

  const paragraphs = sentences.length > 0
    ? sentences.map((s) => `<p>${esc(s)}</p>`).join('\n      ')
    : `<p>${esc(description)}</p>`;

  const isHome = path === '/';
  const navLinks = (contentJson?.nav ?? [])
    .map((n) => `<a href="${esc(n.href)}">${esc(n.label)}</a>`)
    .join('\n        ');

  return `<article>
      <header>
        <h1>${esc(title)}</h1>
        ${isHome && contentJson?.tagline ? `<p class="tagline">${esc(contentJson.tagline)}</p>` : ''}
      </header>
      <section>
        ${paragraphs}
      </section>
      ${isHome && navLinks ? `<nav aria-label="Site pages">\n        ${navLinks}\n      </nav>` : ''}
    </article>`;
}

// ── Section renderers (same idea as the old edge function content generators) ──

function renderSections(sections: Section[], siteUrl: string): string {
  return sections.map((s) => renderSection(s, siteUrl)).join('\n  ');
}

function renderSection(s: Section, siteUrl: string): string {
  switch (s.type) {
    case 'hero': {
      const cta = s.cta ? `\n      <a href="${esc(s.cta.href)}">${esc(s.cta.label)}</a>` : '';
      return `<section class="hero">
      <h1>${esc(s.heading)}</h1>
      ${s.subheading ? `<h2>${esc(s.subheading)}</h2>` : ''}
      ${s.text ? `<p>${esc(s.text)}</p>` : ''}${cta}
    </section>`;
    }

    case 'text': {
      const paras = s.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('\n      ');
      return `<section>
      ${s.heading ? `<h2>${esc(s.heading)}</h2>` : ''}
      ${paras}
    </section>`;
    }

    case 'features': {
      const items = s.items.map((item) =>
        typeof item === 'string'
          ? `<li>${esc(item)}</li>`
          : `<li><strong>${esc(item.title)}</strong>${item.text ? ` — ${esc(item.text)}` : ''}</li>`,
      ).join('\n        ');
      return `<section class="features">
      ${s.heading ? `<h2>${esc(s.heading)}</h2>` : ''}
      <ul>
        ${items}
      </ul>
    </section>`;
    }

    case 'pricing': {
      const tiers = s.tiers.map((t) => {
        const feats = (t.features ?? []).map((f) => `<li>${esc(f)}</li>`).join('');
        return `<div class="tier">
          <h3>${esc(t.name)}</h3>
          <p class="price">${esc(t.price)}${t.period ? `<span>/${esc(t.period)}</span>` : ''}</p>
          ${feats ? `<ul>${feats}</ul>` : ''}
        </div>`;
      }).join('\n        ');
      return `<section class="pricing">
      ${s.heading ? `<h2>${esc(s.heading)}</h2>` : ''}
      <div class="pricing-grid">
        ${tiers}
      </div>
    </section>`;
    }

    case 'faq': {
      const faqs = s.items.map((item) =>
        `<dt>${esc(item.question)}</dt>\n        <dd>${esc(item.answer)}</dd>`,
      ).join('\n        ');
      return `<section class="faq">
      ${s.heading ? `<h2>${esc(s.heading)}</h2>` : ''}
      <dl>
        ${faqs}
      </dl>
    </section>`;
    }

    case 'cta': {
      const cta = s.cta ? `\n      <a href="${esc(s.cta.href)}">${esc(s.cta.label)}</a>` : '';
      return `<section class="cta">
      <h2>${esc(s.heading)}</h2>
      ${s.text ? `<p>${esc(s.text)}</p>` : ''}${cta}
    </section>`;
    }

    case 'table': {
      const headers = s.headers.map((h) => `<th>${esc(h)}</th>`).join('');
      const rows = s.rows.map((row) =>
        `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`,
      ).join('\n        ');
      return `<section class="table-section">
      ${s.heading ? `<h2>${esc(s.heading)}</h2>` : ''}
      <table>
        <thead><tr>${headers}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
    }

    case 'steps': {
      const steps = s.steps.map((step, i) =>
        `<li><strong>Step ${i + 1}: ${esc(step.title)}</strong>${step.text ? ` — ${esc(step.text)}` : ''}</li>`,
      ).join('\n        ');
      return `<section class="steps">
      ${s.heading ? `<h2>${esc(s.heading)}</h2>` : ''}
      <ol>
        ${steps}
      </ol>
    </section>`;
    }

    default:
      return '';
  }
}

// ── ✏️  OPTIONAL: Add DB-driven dynamic pages ──────────────────────────────────

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
  contentJson: ContentJson | null,
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
  //   const brand = contentJson?.brand ?? brandFromTitle(siteMeta.title);
  //   for (const post of results) {
  //     const path = `/blog/${post.slug}`;
  //     pages.push({
  //       path,
  //       title: post.title,
  //       description: post.excerpt,
  //       html: generateHtmlPage({
  //         path, siteUrl,
  //         title: post.title,
  //         description: post.excerpt,
  //         ogImage: siteMeta.ogImage,
  //         favicon: siteMeta.favicon,
  //         brand,
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
  hasCustomTitle: boolean;
}

async function fetchPageMeta(
  siteUrl: string,
  path: string,
  homeMeta?: PageMeta,
): Promise<PageMeta> {
  const url = `${siteUrl}${path}`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'prerender-edge/1.0 (cache-builder)', Accept: 'text/html' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    const title = extractMeta(html, 'title') || extractMeta(html, 'og:title') || '';
    const description = extractMeta(html, 'description') || extractMeta(html, 'og:description') || '';
    const ogImage =
      extractMeta(html, 'og:image') ||
      extractMeta(html, 'twitter:image') ||
      `${siteUrl}/og-image.png`;
    const favicon = extractFavicon(html, siteUrl);
    const themeColor = extractMeta(html, 'theme-color') || '';

    const isGeneric = homeMeta ? title === homeMeta.title : false;
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
    } catch { return null; }
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

// ── HTML page generator ────────────────────────────────────────────────────────

function generateHtmlPage(opts: {
  path: string;
  siteUrl: string;
  title: string;
  description: string;
  content: string;
  brand?: string;
  nav?: Array<{ label: string; href: string }>;
  ogImage?: string;
  favicon?: string;
  themeColor?: string;
  schemas?: object[];
}): string {
  const siteUrl = opts.siteUrl.replace(/\/$/, '');
  const canonical = `${siteUrl}${opts.path}`;
  const ogImage = opts.ogImage ?? `${siteUrl}/og-image.png`;
  const favicon = opts.favicon ?? `${siteUrl}/favicon.ico`;
  const desc = opts.description.length > 160 ? opts.description.slice(0, 157) + '...' : opts.description;
  const brand = opts.brand ?? brandFromTitle(opts.title);

  const schemaScripts = (opts.schemas ?? [])
    .map((s) => `  <script type="application/ld+json">${JSON.stringify(s)}</script>`)
    .join('\n');

  const themeColorMeta = opts.themeColor
    ? `\n  <meta name="theme-color" content="${esc(opts.themeColor)}">`
    : '';

  const navHtml = opts.nav && opts.nav.length > 0
    ? `\n  <header>\n    <nav aria-label="Main navigation">\n      ${
        opts.nav.map((n) => `<a href="${esc(n.href)}">${esc(n.label)}</a>`).join('\n      ')
      }\n    </nav>\n  </header>`
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
  <meta property="og:site_name" content="${esc(brand)}">

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
<body>${navHtml}
  <main id="content">
    ${opts.content}
  </main>
  <footer>
    <p>&copy; ${new Date().getFullYear()} ${esc(brand)}. All rights reserved.</p>
  </footer>
</body>
</html>`;
}

// ── Schema.org structured data ─────────────────────────────────────────────────

function buildSchemas(
  path: string,
  title: string,
  description: string,
  siteUrl: string,
  brand: string,
): object[] {
  if (path === '/') {
    return [{
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: brand,
      url: siteUrl,
      description,
    }];
  }

  if (path.includes('pricing') || path.includes('plan')) {
    return [{
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: title,
      description,
      url: `${siteUrl}${path}`,
      breadcrumb: {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: brand, item: siteUrl },
          { '@type': 'ListItem', position: 2, name: pathToLabel(path), item: `${siteUrl}${path}` },
        ],
      },
    }];
  }

  return [{
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description,
    url: `${siteUrl}${path}`,
  }];
}

// ── HTML parsing helpers ───────────────────────────────────────────────────────

function extractMeta(html: string, name: string): string {
  if (name === 'title') {
    const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return m ? m[1].trim() : '';
  }
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
  return href.startsWith('http') ? href : `${siteUrl}/${href.replace(/^\//, '')}`;
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
