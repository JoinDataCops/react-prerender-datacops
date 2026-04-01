/**
 * Cloudflare Pages Functions Middleware — Cloudflare-only stack
 * Bot Detection + Prerender + Dynamic Sitemaps + Script Injection
 *
 * Place this file at: functions/_middleware.ts in your Pages project root.
 * Cloudflare Pages auto-detects it as edge middleware.
 *
 * REQUIRES environment variables in Cloudflare Pages dashboard:
 *   - WORKER_URL     — URL of your deployed prerender-backend Worker
 *                      e.g. https://prerender-backend.your-account.workers.dev
 *   - WORKER_SECRET  — Shared secret (same value as the Worker's WORKER_SECRET)
 *
 * No Supabase. No external dependencies.
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
  WORKER_URL: string;
  WORKER_SECRET: string;
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

interface ScriptCache {
  head: string[];
  body: string[];
  fetchedAt: number;
}

let scriptCache: ScriptCache | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

function isBot(ua: string): boolean {
  if (!ua) return false;
  const lower = ua.toLowerCase();
  return BOT_AGENTS.some((bot) => lower.includes(bot));
}

function isStaticAsset(path: string): boolean {
  return /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|map|json|txt|pdf|mp4|webm|webp|avif)$/i.test(
    path,
  );
}

function workerHeaders(secret: string): HeadersInit {
  return { Authorization: `Bearer ${secret}` };
}

async function getScripts(env: Env): Promise<{ head: string; body: string }> {
  const now = Date.now();
  if (scriptCache && now - scriptCache.fetchedAt < CACHE_TTL_MS) {
    return { head: scriptCache.head.join('\n'), body: scriptCache.body.join('\n') };
  }

  try {
    const resp = await fetch(`${env.WORKER_URL}/api/scripts`, {
      headers: workerHeaders(env.WORKER_SECRET),
    });
    if (resp.ok) {
      const data = (await resp.json()) as { head: string[]; body: string[] };
      scriptCache = { head: data.head || [], body: data.body || [], fetchedAt: now };
      return { head: scriptCache.head.join('\n'), body: scriptCache.body.join('\n') };
    }
  } catch {
    // Use stale cache or empty
  }

  if (scriptCache) {
    return { head: scriptCache.head.join('\n'), body: scriptCache.body.join('\n') };
  }
  return { head: '', body: '' };
}

function injectScripts(html: string, scripts: { head: string; body: string }): string {
  if (scripts.head) html = html.replace('</head>', `${scripts.head}\n</head>`);
  if (scripts.body) html = html.replace('</body>', `${scripts.body}\n</body>`);
  return html;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const userAgent = request.headers.get('user-agent') || '';

  if (isStaticAsset(path)) return next();

  // Debug endpoint
  if (path === '/__debug') {
    return new Response(
      JSON.stringify(
        {
          middleware: 'cf-only-middleware',
          version: '3.0.0',
          hasWorkerUrl: !!env.WORKER_URL,
          hasWorkerSecret: !!env.WORKER_SECRET,
          hostname: url.hostname,
          userAgent: userAgent.substring(0, 80),
          isBot: isBot(userAgent),
          scriptCacheAge: scriptCache
            ? Math.round((Date.now() - scriptCache.fetchedAt) / 1000) + 's'
            : 'cold',
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
      { headers: { 'Content-Type': 'application/json' } },
    );
  }

  const scripts = await getScripts(env);

  // Dynamic sitemaps
  if (path === '/sitemap-markets.xml' || path === '/sitemap-pillars.xml') {
    const type = path.includes('markets') ? 'markets' : 'pillars';
    try {
      const resp = await fetch(`${env.WORKER_URL}/api/sitemap?type=${type}`, {
        headers: workerHeaders(env.WORKER_SECRET),
      });
      if (resp.ok) {
        return new Response(await resp.text(), {
          status: 200,
          headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'public, max-age=3600, s-maxage=86400',
            'X-Sitemap-Source': 'd1-dynamic',
          },
        });
      }
    } catch {
      // Fall through to SPA
    }
  }

  // Static sitemap shards
  if (/^\/sitemap-(markets|pillars)-\d+\.xml$/.test(path) || path === '/sitemap-index.xml') {
    const filename = path.replace(/^\//, '');
    try {
      const resp = await fetch(
        `${env.WORKER_URL}/api/sitemap/static?file=${encodeURIComponent(filename)}`,
        { headers: workerHeaders(env.WORKER_SECRET) },
      );
      if (resp.ok) {
        return new Response(await resp.text(), {
          status: 200,
          headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'public, max-age=1800, s-maxage=3600',
            'X-Sitemap-Source': 'd1-static',
          },
        });
      }
    } catch {
      // Fall through
    }
  }

  // Bot — serve prerendered HTML
  if (isBot(userAgent)) {
    try {
      const resp = await fetch(
        `${env.WORKER_URL}/api/prerender?path=${encodeURIComponent(path)}`,
        {
          headers: {
            ...workerHeaders(env.WORKER_SECRET),
            'User-Agent': userAgent,
          },
        },
      );
      if (resp.ok) {
        const html = injectScripts(await resp.text(), scripts);
        return new Response(html, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'X-Prerendered': 'true',
            'X-Scripts-Injected': 'true',
            'X-Cache': resp.headers.get('X-Cache') || 'hit',
            'Cache-Control': 'public, max-age=3600',
          },
        });
      }
    } catch {
      // Fall through to SPA
    }
  }

  // Human (or bot fallback) — serve SPA with scripts injected
  const response = await next();
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.includes('text/html')) return response;

  const html = injectScripts(await response.text(), scripts);
  return new Response(html, {
    status: response.status,
    headers: {
      ...Object.fromEntries(response.headers.entries()),
      'X-Scripts-Injected': 'true',
    },
  });
};
