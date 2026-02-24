/**
 * Cloudflare Pages Functions Middleware
 * Bot Detection + Prerender + Dynamic Sitemaps
 * 
 * Place this file at: functions/_middleware.ts (project root)
 * Cloudflare Pages auto-detects it as edge middleware.
 * 
 * REQUIRES environment variables in Pages dashboard:
 *   - SUPABASE_URL
 *   - SUPABASE_ANON_KEY
 */

const BOT_AGENTS = [
  // Search Engines
  'googlebot', 'bingbot', 'yandexbot', 'baiduspider', 'duckduckbot',
  'slurp', 'sogou', 'exabot', 'ia_archiver',
  // AI Crawlers
  'gptbot', 'chatgpt-user', 'oai-searchbot',
  'claudebot', 'claude-user', 'claude-searchbot',
  'google-extended', 'google-cloudvertexbot', 'gemini-deep-research',
  'perplexitybot', 'perplexity-user',
  'meta-externalagent', 'meta-webindexer',
  'bytespider', 'amazonbot', 'duckassistbot',
  'mistralai-user', 'cohere-ai', 'ccbot', 'diffbot', 'webzio', 'icc-crawler',
  // Social Media
  'facebookexternalhit', 'facebot', 'twitterbot', 'linkedinbot',
  'pinterest', 'whatsapp', 'telegrambot', 'slackbot', 'discordbot',
  'vkshare', 'redditbot', 'tumblr', 'embedly', 'quora link preview', 'outbrain',
  // SEO Tools
  'semrushbot', 'ahrefsbot', 'mj12bot', 'dotbot', 'rogerbot',
  'screaming frog', 'seokicks', 'blexbot', 'siteexplorer', 'serpstatbot',
  // Apple & Other
  'applebot', 'applebot-extended', 'petalbot', 'seznambot',
  'naver', 'yeti', 'qwantify', 'ecosia', 'mojeek',
  // Google Specific
  'mediapartners-google', 'adsbot-google', 'feedfetcher-google',
  'google-read-aloud', 'storebot-google', 'google-safety',
  // Archive & Research
  'archive.org_bot', 'wayback', 'wget', 'curl', 'python-requests',
  'go-http-client', 'java', 'libwww-perl', 'axios', 'httpie', 'postman',
  // Feed Readers
  'feedly', 'flipboard', 'newsblur', 'inoreader', 'theoldreader', 'feedbin',
];

interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

function isBot(ua: string): boolean {
  if (!ua) return false;
  const lower = ua.toLowerCase();
  return BOT_AGENTS.some(bot => lower.includes(bot));
}

function isStaticAsset(path: string): boolean {
  return /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|map|json|txt|pdf|mp4|webm|webp|avif)$/i.test(path);
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const userAgent = request.headers.get('user-agent') || '';

  // Static assets — pass through
  if (isStaticAsset(path)) {
    return next();
  }

  // Debug endpoint
  if (path === '/__debug') {
    return new Response(JSON.stringify({
      middleware: 'pages-middleware',
      version: '1.0.0',
      hasSupabaseUrl: !!env.SUPABASE_URL,
      hasSupabaseKey: !!env.SUPABASE_ANON_KEY,
      hostname: url.hostname,
      userAgent: userAgent.substring(0, 80),
      isBot: isBot(userAgent),
      timestamp: new Date().toISOString(),
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Dynamic sitemaps — proxy to Supabase generate-sitemap
  if (path === '/sitemap-markets.xml' || path === '/sitemap-pillars.xml') {
    const type = path.includes('markets') ? 'markets' : 'pillars';
    try {
      const resp = await fetch(
        `${env.SUPABASE_URL}/functions/v1/generate-sitemap?type=${type}`,
        {
          headers: {
            'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
            'apikey': env.SUPABASE_ANON_KEY,
          },
        }
      );
      if (resp.ok) {
        return new Response(await resp.text(), {
          status: 200,
          headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'public, max-age=3600, s-maxage=86400',
            'X-Sitemap-Source': 'supabase',
          },
        });
      }
    } catch (e) {
      // Fall through to SPA
    }
  }

  // Static sitemap shards — proxy to Supabase serve-sitemap
  if (/^\/sitemap-(markets|pillars)-\d+\.xml$/.test(path) || path === '/sitemap-index.xml') {
    const filename = path.replace(/^\//, '');
    try {
      const resp = await fetch(
        `${env.SUPABASE_URL}/functions/v1/serve-sitemap?file=${encodeURIComponent(filename)}`,
        {
          headers: {
            'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
            'apikey': env.SUPABASE_ANON_KEY,
          },
        }
      );
      if (resp.ok) {
        return new Response(await resp.text(), {
          status: 200,
          headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'public, max-age=1800, s-maxage=3600',
            'X-Sitemap-Source': 'supabase-static',
          },
        });
      }
    } catch (e) {
      // Fall through
    }
  }

  // Bot detection — serve prerendered HTML from Supabase cache
  if (isBot(userAgent)) {
    try {
      const prerenderUrl = `${env.SUPABASE_URL}/functions/v1/prerender?path=${encodeURIComponent(path)}`;
      const res = await fetch(prerenderUrl, {
        headers: {
          'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
          'apikey': env.SUPABASE_ANON_KEY,
          'User-Agent': userAgent,
        },
      });
      if (res.ok) {
        return new Response(await res.text(), {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'X-Prerendered': 'true',
            'X-Cache': res.headers.get('X-Cache') || 'hit',
            'Cache-Control': 'public, max-age=3600',
          },
        });
      }
    } catch (e) {
      // Fall through to SPA
    }
  }

  // Human (or bot fallback) — serve SPA natively from Pages
  return next();
};
