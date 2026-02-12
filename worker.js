/**
 * react-prerender-worker
 * 
 * A Cloudflare Worker that detects bots and serves pre-rendered HTML
 * from a cache, while passing regular users to your React SPA.
 * 
 * Environment variables (set in Cloudflare Dashboard):
 * - SUPABASE_URL: Your Supabase project URL
 * - SUPABASE_ANON_KEY: Your Supabase anon/public key
 * - PAGES_ORIGIN: Your Cloudflare Pages URL (must include https://)
 * 
 * @license MIT
 */

// =============================================================================
// SCRIPT INJECTION (analytics, CMP, tracking pixels, etc.)
// 
// Set INJECT_SCRIPT to a string to inject scripts into <head> of every HTML 
// response — for both humans AND bots. No rebuild needed, changes go live
// globally in seconds.
//
// Example — Google Analytics:
//   const INJECT_SCRIPT = `<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXX"></script>
//   <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-XXXXX');</script>`;
//
// Example — Multiple scripts (GTM + CMP + Hotjar + Meta Pixel):
//   const INJECT_SCRIPT = `<script>...GTM...</script>
//   <script src="https://your-cmp.com/cmp.js"></script>
//   <script>...Hotjar...</script>
//   <script>...Meta Pixel...</script>`;
//
// Set to null to disable:
// =============================================================================
const INJECT_SCRIPT = null;

/**
 * Inject a script into HTML responses before </head>
 * Skips non-HTML responses and avoids double-injection.
 */
async function injectScript(response, scriptId, scriptHtml) {
  if (!scriptHtml) return response;
  
  const ct = response.headers.get('content-type') || '';
  if (!ct.includes('text/html')) return response;

  const html = await response.text();
  if (html.includes(scriptId)) {
    return new Response(html, { status: response.status, headers: response.headers });
  }

  const injected = html.replace('</head>', `${scriptHtml}\n</head>`);
  const headers = new Headers(response.headers);
  return new Response(injected, { status: response.status, headers });
}

// =============================================================================
// BOT USER AGENT LIST — 100+ patterns covering search, AI, social, SEO tools
// =============================================================================
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
  'mistralai-user', 'cohere-ai', 'ccbot', 'diffbot',
  'webzio', 'icc-crawler',

  // Social Media
  'facebookexternalhit', 'facebot', 'twitterbot', 'linkedinbot',
  'pinterest', 'whatsapp', 'telegrambot', 'slackbot', 'discordbot',
  'vkshare', 'redditbot', 'tumblr', 'embedly', 'quora link preview',
  'outbrain',

  // SEO Tools
  'semrushbot', 'ahrefsbot', 'mj12bot', 'dotbot', 'rogerbot',
  'screaming frog', 'seokicks', 'blexbot', 'siteexplorer', 'serpstatbot',

  // Apple & Others
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

function isBot(userAgent) {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return BOT_AGENTS.some(bot => ua.includes(bot));
}

function isStaticAsset(path) {
  return /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|map|json|xml|txt|pdf|mp4|webm|webp|avif)$/i.test(path);
}

function isExcludedPath(path) {
  const excludedPatterns = [
    '/cms',     // Admin panels
    '/api/',    // API routes
    '/_',       // Internal routes
    '/auth/',   // Auth routes
  ];
  return excludedPatterns.some(pattern => path.startsWith(pattern));
}

// =============================================================================
// CONFIGURATION — Customize these for your domain
// =============================================================================
const PRIMARY_DOMAINS = ['yourdomain.com', 'www.yourdomain.com'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const hostname = url.hostname;

    // Bypass for subdomains not in the primary list
    if (!PRIMARY_DOMAINS.includes(hostname)) {
      return fetch(request);
    }

    const path = url.pathname;
    const userAgent = request.headers.get('user-agent') || '';

    // Validate configuration
    const pagesOrigin = env.PAGES_ORIGIN;
    if (!pagesOrigin) {
      return new Response(
        'Configuration Error: PAGES_ORIGIN not set. Add your Cloudflare Pages URL as an environment variable.',
        { status: 500, headers: { 'Content-Type': 'text/plain' } }
      );
    }

    // === STATIC ASSETS → Pages (always) ===
    if (isStaticAsset(path)) {
      return fetch(`${pagesOrigin}${path}${url.search}`, { headers: request.headers });
    }

    // === EXCLUDED PATHS → Pages (always) ===
    if (isExcludedPath(path)) {
      return fetch(`${pagesOrigin}${path}${url.search}`, { headers: request.headers });
    }

    // === BOT → Supabase prerender cache ===
    if (isBot(userAgent)) {
      try {
        const prerenderUrl = `${env.SUPABASE_URL}/functions/v1/prerender?path=${encodeURIComponent(path)}`;
        const prerenderResponse = await fetch(prerenderUrl, {
          method: 'GET',
          headers: {
            'User-Agent': userAgent,
            'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
            'apikey': env.SUPABASE_ANON_KEY,
          },
        });

        if (prerenderResponse.ok) {
          const html = await prerenderResponse.text();
          const botResponse = new Response(html, {
            status: 200,
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'X-Prerendered': 'true',
              'X-Cache': prerenderResponse.headers.get('X-Cache') || 'unknown',
              'X-Bot-Detected': 'true',
              'Cache-Control': 'public, max-age=3600',
            },
          });
          return INJECT_SCRIPT
            ? injectScript(botResponse, 'injected-script', INJECT_SCRIPT)
            : botResponse;
        }

        console.log(`[Worker] Prerender miss for ${path}, falling back to SPA`);
      } catch (error) {
        console.error(`[Worker] Prerender error for ${path}:`, error);
      }
    }

    // === HUMAN (or bot fallback) → SPA from Pages ===
    try {
      const pagesResponse = await fetch(`${pagesOrigin}${path}${url.search}`, {
        method: request.method,
        headers: request.headers,
      });

      const responseHeaders = new Headers();
      for (const [key, value] of pagesResponse.headers.entries()) {
        responseHeaders.append(key, value);
      }

      // Prevent caching HTML (ensures fresh SPA shell)
      if (!isStaticAsset(path)) {
        responseHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      }

      const userResponse = new Response(pagesResponse.body, {
        status: pagesResponse.status,
        headers: responseHeaders,
      });

      return INJECT_SCRIPT
        ? injectScript(userResponse, 'injected-script', INJECT_SCRIPT)
        : userResponse;
    } catch (error) {
      console.error(`[Worker] Pages fetch error:`, error);
      return new Response('Service temporarily unavailable', {
        status: 503,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
  },
};
