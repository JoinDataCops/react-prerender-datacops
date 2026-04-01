import { getStaticSitemap, upsertStaticSitemap } from '../lib/db.js';

interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq: string;
  priority: string;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildSitemapXml(urls: SitemapUrl[], siteUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${escapeXml(siteUrl + u.loc)}</loc>${
      u.lastmod
        ? `
    <lastmod>${u.lastmod}</lastmod>`
        : ''
    }
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`,
  )
  .join('\n')}
</urlset>`;
}

/**
 * Dynamic sitemap: generates XML on the fly from D1 data.
 * Customize `buildDynamicSitemap` for your own tables.
 *
 * GET /api/sitemap?type=markets|pillars|all
 */
export async function handleGenerateSitemap(
  req: Request,
  db: D1Database,
  siteUrl: string,
): Promise<Response> {
  if (req.method !== 'GET') return methodNotAllowed();

  const url = new URL(req.url);
  const type = url.searchParams.get('type') || 'all';
  const urls: SitemapUrl[] = [];

  try {
    // ── Customize: add your own table queries here ──────────────

    if (type === 'markets' || type === 'all') {
      // Example: fetch from a `markets` table if it exists
      try {
        const rows = await db
          .prepare(
            "SELECT title, updated_at FROM markets WHERE status IN ('open','active') ORDER BY updated_at DESC LIMIT 50000",
          )
          .all<{ title: string; updated_at: string }>();

        for (const m of rows.results) {
          const slug = slugify(m.title);
          urls.push({
            loc: `/market/${slug}`,
            lastmod: m.updated_at?.split('T')[0],
            changefreq: 'daily',
            priority: '0.7',
          });
        }
      } catch {
        // markets table doesn't exist — skip
      }
    }

    if (type === 'pillars' || type === 'all') {
      try {
        const rows = await db
          .prepare('SELECT slug, updated_at FROM pillars_v2 ORDER BY updated_at DESC LIMIT 50000')
          .all<{ slug: string; updated_at: string }>();

        for (const p of rows.results) {
          urls.push({
            loc: `/pillar/${p.slug}`,
            lastmod: p.updated_at?.split('T')[0],
            changefreq: 'weekly',
            priority: '0.6',
          });
        }
      } catch {
        // pillars table doesn't exist — skip
      }
    }

    // ── End customize ────────────────────────────────────────────

    const xml = buildSitemapXml(urls, siteUrl);
    return new Response(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
        'X-Sitemap-Url-Count': String(urls.length),
        'X-Sitemap-Source': 'd1-dynamic',
      },
    });
  } catch (err) {
    return new Response(emptyUrlset(), {
      status: 500,
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    });
  }
}

/**
 * Static sitemaps: stored in D1, served directly.
 * GET /api/sitemap/static?file=sitemap-index.xml
 * POST /api/sitemap/static — store a sitemap
 */
export async function handleStaticSitemap(req: Request, db: D1Database): Promise<Response> {
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const filename = url.searchParams.get('file') || 'sitemap-index.xml';
    const sitemap = await getStaticSitemap(db, filename);

    if (!sitemap?.content) {
      return new Response(emptyUrlset(), {
        status: 404,
        headers: { 'Content-Type': 'application/xml; charset=utf-8' },
      });
    }

    return new Response(sitemap.content, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=1800, s-maxage=3600',
        'X-Sitemap-Generated': sitemap.generated_at,
        'X-Sitemap-Url-Count': String(sitemap.url_count),
        'X-Sitemap-Source': 'd1-static',
      },
    });
  }

  if (req.method === 'POST') {
    const data = await req.json<{
      filename: string;
      content: string;
      url_count?: number;
      expires_at?: string;
    }>();

    if (!data.filename || !data.content) {
      return json({ error: 'filename and content are required' }, 400);
    }

    await upsertStaticSitemap(db, {
      filename: data.filename,
      content: data.content,
      url_count: data.url_count ?? 0,
      expires_at: data.expires_at,
    });

    return json({ success: true, filename: data.filename });
  }

  return methodNotAllowed();
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function emptyUrlset(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function methodNotAllowed(): Response {
  return json({ error: 'Method not allowed' }, 405);
}
