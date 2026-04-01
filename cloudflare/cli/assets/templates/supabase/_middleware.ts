/**
 * Cloudflare Pages Functions Middleware
 * Bot Detection + Prerender + Dynamic Sitemaps + Script Injection
 * 
 * Place this file at: functions/_middleware.ts (project root)
 * Cloudflare Pages auto-detects it as edge middleware.
 * 
 * REQUIRES environment variables in Pages dashboard:
 *   - SUPABASE_URL
 *   - SUPABASE_ANON_KEY
 * 
 * FEATURES:
 *   1. Bot detection → serves prerendered HTML from Supabase cache
 *   2. Dynamic sitemaps → proxies to Supabase generate-sitemap / serve-sitemap
 *   3. Script injection → fetches 3rd-party scripts from script-service edge function
 *      and injects them into every HTML response (bots + humans)
 *      This ensures analytics survive AI platform rebuilds and run in first-party context.
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

interface ScriptCache {
  head: string[];
  body: string[];
  fetchedAt: number;
}

// Module-level cache — persists within each Cloudflare isolate
let scriptCache: ScriptCache | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function isBot(ua: string): boolean {
  if (!ua) return false;
  const lower = ua.toLowerCase();
  return BOT_AGENTS.some(bot => lower.includes(bot));
}

function isStaticAsset(path: string): boolean {
  return /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|map|json|txt|pdf|mp4|webm|webp|avif)$/i.test(path);
}

/**
 * Fetch scripts from the script-service edge function.
 * Cached in isolate memory for 5 minutes. Falls back to stale cache or empty.
 */
async function getScripts(env: Env): Promise<{ head: string; body: string }> {
  const now = Date.now();
  if (scriptCache && (now - scriptCache.fetchedAt) < CACHE_TTL_MS) {
    return {
      head: scriptCache.head.join('\n'),
      body: scriptCache.body.join('\n'),
    };
  }

  try {
    const resp = await fetch(
      `${env.SUPABASE_URL}/functions/v1/script-service`,
      {
        headers: {
          'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
          'apikey': env.SUPABASE_ANON_KEY,
        },
      }
    );

    if (resp.ok) {
      const data = await resp.json() as { head: string[]; body: string[] };
      scriptCache = {
        head: data.head || [],
        body: data.body || [],
        fetchedAt: now,
      };
      return {
        head: scriptCache.head.join('\n'),
        body: scriptCache.body.join('\n'),
      };
    }
  } catch (e) {
    // If fetch fails, use stale cache or empty
  }

  if (scriptCache) {
    return {
      head: scriptCache.head.join('\n'),
      body: scriptCache.body.join('\n'),
    };
  }

  return { head: '', body: '' };
}

/**
 * Inject script tags into HTML before </head> and </body>.
 */
function injectScripts(html: string, scripts: { head: string; body: string }): string {
  if (scripts.head) {
    html = html.replace('</head>', `${scripts.head}\n</head>`);
  }
  if (scripts.body) {
    html = html.replace('</body>', `${scripts.body}\n</body>`);
  }
  return html;
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
      version: '2.0.0',
      hasSupabaseUrl: !!env.SUPABASE_URL,
      hasSupabaseKey: !!env.SUPABASE_ANON_KEY,
      hostname: url.hostname,
      userAgent: userAgent.substring(0, 80),
      isBot: isBot(userAgent),
      scriptCacheAge: scriptCache ? Math.round((Date.now() - scriptCache.fetchedAt) / 1000) + 's' : 'cold',
      timestamp: new Date().toISOString(),
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Fetch scripts (cached in isolate memory)
  const scripts = await getScripts(env);

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

  // Bot detection — serve prerendered HTML with scripts injected
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
        const html = injectScripts(await res.text(), scripts);
        return new Response(html, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'X-Prerendered': 'true',
            'X-Scripts-Injected': 'true',
            'X-Cache': res.headers.get('X-Cache') || 'hit',
            'Cache-Control': 'public, max-age=3600',
          },
        });
      }
    } catch (e) {
      // Fall through to SPA
    }
  }

  // Human (or bot fallback) — serve SPA with scripts injected
  const response = await next();

  // Only inject into HTML responses
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.includes('text/html')) {
    return response;
  }

  const html = injectScripts(await response.text(), scripts);
  return new Response(html, {
    status: response.status,
    headers: {
      ...Object.fromEntries(response.headers.entries()),
      'X-Scripts-Injected': 'true',
    },
  });
};
