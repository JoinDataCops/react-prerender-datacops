/**
 * Dynamic Sitemap Generator
 * 
 * Supabase Edge Function: supabase/functions/generate-sitemap/index.ts
 * 
 * Generates XML sitemaps on-the-fly from DB records.
 * Called by the middleware when bots request /sitemap-markets.xml or /sitemap-pillars.xml
 * 
 * Query params:
 *   ?type=markets  — Generate market URLs
 *   ?type=pillars  — Generate pillar URLs
 *   ?type=all      — Generate all URLs
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SITE_URL = 'https://YOUR-SITE.com'; // ← Change this

interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq: string;
  priority: string;
}

function slugify(text: string): string {
  return text.toLowerCase()
    .replace(/&/g, 'and').replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-')
    .replace(/^-|-$/g, '').slice(0, 80);
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function generateSitemapXml(urls: SitemapUrl[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `  <url>
    <loc>${escapeXml(SITE_URL + url.loc)}</loc>${url.lastmod ? `
    <lastmod>${url.lastmod}</lastmod>` : ''}
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`).join('\n')}
</urlset>`;
}

// Fetch all rows with pagination (bypasses Supabase 1000-row limit)
async function fetchAllRows(supabase: any, table: string, query: { select: string; filters?: any }): Promise<any[]> {
  const allRows: any[] = [];
  let offset = 0;
  const batchSize = 1000;
  
  while (true) {
    let qb = supabase.from(table).select(query.select).range(offset, offset + batchSize - 1);
    if (query.filters) {
      for (const [key, value] of Object.entries(query.filters)) {
        qb = Array.isArray(value) ? qb.in(key, value) : qb.eq(key, value);
      }
    }
    const { data, error } = await qb;
    if (error || !data?.length) break;
    allRows.push(...data);
    if (data.length < batchSize) break;
    offset += batchSize;
  }
  return allRows;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const type = url.searchParams.get('type') || 'all';
    
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const urls: SitemapUrl[] = [];

    // Add your dynamic page types here
    if (type === 'markets' || type === 'all') {
      const markets = await fetchAllRows(supabase, 'markets', {
        select: 'title, updated_at, status',
        filters: { status: ['open', 'active'] }
      });
      const seen = new Set<string>();
      markets.forEach(m => {
        const slug = slugify(m.title);
        if (!seen.has(slug)) {
          seen.add(slug);
          urls.push({ loc: `/market/${slug}`, lastmod: m.updated_at?.split('T')[0], changefreq: 'daily', priority: '0.7' });
        }
      });
    }

    return new Response(generateSitemapXml(urls), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
    });
  } catch (error) {
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`, {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/xml; charset=utf-8' },
    });
  }
});
