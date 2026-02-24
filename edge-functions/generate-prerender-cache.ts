/**
 * Generate Prerender Cache — Full Cache Builder
 * 
 * Supabase Edge Function: supabase/functions/generate-prerender-cache/index.ts
 * 
 * Pre-generates HTML for all pages (homepage, markets, pillars, etc.)
 * and stores them in the `prerendered_pages` table.
 * 
 * Run via cron (hourly) or manually via POST.
 * 
 * POST body options:
 *   { "force": true }           — Force regenerate all
 *   { "markets_only": true }    — Only regenerate market pages
 *   { "pillars_only": true }    — Only regenerate pillar pages
 *   { "market_offset": 0, "market_limit": 4000 }  — Chunked processing
 * 
 * ⚠️ This is a TEMPLATE. Customize generateHomepageContent(), 
 *    generateMarketContent(), etc. for your own site content.
 * 
 * See the full implementation at:
 *   supabase/functions/generate-prerender-cache/index.ts
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SITE_URL = 'https://YOUR-SITE.com'; // ← Change this
const BATCH_SIZE = 50;

// ── Utility Functions ──────────────────────────────────────────

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

function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── HTML Page Template ─────────────────────────────────────────

function generateHtmlPage(
  title: string,
  description: string,
  path: string,
  content: string,
  schemas: object[],
  ogImage: string = `${SITE_URL}/og-image.png`
): string {
  const fullTitle = title.includes("YourBrand") ? title : `${title} | YourBrand`;
  const truncatedDesc = description.length > 160 ? description.slice(0, 157) + '...' : description;
  const canonicalUrl = `${SITE_URL}${path}`;
  
  const schemaScripts = schemas
    .map(s => `<script type="application/ld+json">${JSON.stringify(s)}</script>`)
    .join('\n    ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(fullTitle)}</title>
  <meta name="description" content="${escapeHtml(truncatedDesc)}">
  <link rel="canonical" href="${canonicalUrl}">
  
  <!-- Open Graph -->
  <meta property="og:title" content="${escapeHtml(fullTitle)}">
  <meta property="og:description" content="${escapeHtml(truncatedDesc)}">
  <meta property="og:image" content="${ogImage}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="YourBrand">
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(fullTitle)}">
  <meta name="twitter:description" content="${escapeHtml(truncatedDesc)}">
  <meta name="twitter:image" content="${ogImage}">
  
  <!-- Prerender Status -->
  <meta name="prerender-status" content="success">
  <meta name="prerender-date" content="${new Date().toISOString()}">
  
  ${schemaScripts}
</head>
<body>
  <header>
    <nav aria-label="Main navigation">
      <a href="${SITE_URL}">Home</a>
      <!-- Add your nav links -->
    </nav>
  </header>
  
  <main id="content">
    ${content}
  </main>
  
  <footer>
    <p>&copy; ${new Date().getFullYear()} YourBrand.</p>
  </footer>
</body>
</html>`;
}

// ── Content Generators (CUSTOMIZE THESE) ───────────────────────

function generateHomepageContent(): string {
  return `
    <article>
      <h1>Your Homepage Title</h1>
      <p>Your homepage description for SEO.</p>
      <!-- Add sections that match your actual homepage -->
    </article>`;
}

// ── Main Handler ───────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    
    // Generate homepage
    const html = generateHtmlPage(
      'Your Site Title',
      'Your site description',
      '/',
      generateHomepageContent(),
      [{ "@context": "https://schema.org", "@type": "WebSite", "name": "YourBrand", "url": SITE_URL }]
    );
    
    await supabase.from('prerendered_pages').upsert({
      path: '/',
      html,
      title: 'Your Site Title',
      description: 'Your site description',
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'path' });

    // Add more page types here (loop through DB records, etc.)
    
    return new Response(JSON.stringify({
      success: true,
      time_ms: Date.now() - startTime,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Fatal error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
