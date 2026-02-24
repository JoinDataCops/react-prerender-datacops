# Prerender & Bot SEO System — Technical Skill File

> This file teaches an AI (or developer) the full concept, architecture, and step-by-step execution for any stack. The Cloudflare Pages middleware is the constant. The backend and database are swappable.

---

## Core Concept

**Problem:** SPAs return empty HTML to bots. Bots can't run JavaScript, so they see nothing.

**Solution:** Intercept bot requests at the CDN edge (Cloudflare), serve them pre-built HTML from a cache. Humans get the normal SPA. The cache is rebuilt on a schedule.

**Three components:**
1. **Bot Detector** (Cloudflare Pages Middleware) — always the same
2. **Cache Store** (any database) — stores pre-built HTML keyed by URL path
3. **Cache Builder** (any backend) — generates HTML and upserts into cache

---

## Architecture

```
Browser Request
      │
      ▼
┌─────────────────────────────────┐
│  Cloudflare Pages Middleware    │
│  (functions/_middleware.ts)     │
│                                 │
│  1. Static asset? → pass thru   │
│  2. Sitemap URL? → proxy to API │
│  3. Fetch scripts → inject tags │
│  4. Bot UA? → prerendered HTML  │
│  5. Human? → SPA + injected     │
└─────────────────────────────────┘
      │                    │
      ▼                    ▼
   SPA (Vite)      Your Backend API
                    ├── GET /prerender?path=...    (cache lookup)
                    ├── POST /generate-cache       (cache builder)
                    ├── GET /sitemap?name=...       (sitemap)
                    ├── GET /script-service         (3rd party scripts)
                    └── POST /manage-cron           (scheduler)
```

The middleware is the **only Cloudflare-specific part**. Your backend API can be:
- Supabase Edge Functions (Deno)
- Node.js / Express
- Python / FastAPI / Django
- Go / Gin
- AWS Lambda / API Gateway
- Vercel Serverless Functions
- Netlify Functions
- Firebase Cloud Functions
- Any HTTP server

---

## Required API Endpoints

Your backend must expose these endpoints. The middleware calls them.

### 1. `GET /prerender?path=/some/page`

**Purpose:** Return cached HTML for a given URL path.

**Request:** `GET /prerender?path=/markets/bitcoin-price`

**Response (cache hit):**
```json
{ "html": "<!DOCTYPE html><html>...</html>", "title": "Bitcoin Price", "cached": true }
```

**Response (cache miss):**
```json
{ "error": "not_found" }
```
Status: 404

**Logic:**
1. Look up `path` in your cache store
2. If found, increment `hit_count`, return HTML
3. If not found, return 404
4. Optionally: check `expires_at` and return `X-Cache: stale` header if expired

### 2. `POST /generate-cache`

**Purpose:** Build HTML for all pages and store in cache.

**Request:** `POST /generate-cache` with optional `{ "force": true }`

**Logic:**
1. Query your database for all content that needs pages (products, articles, markets, etc.)
2. For each item, generate a full HTML document with:
   - `<title>` and `<meta description>`
   - Open Graph tags (`og:title`, `og:description`, `og:image`)
   - Twitter Card tags
   - JSON-LD structured data
   - Visible body content (headings, paragraphs, lists)
   - Internal links
3. Upsert each page into your cache store keyed by `path`
4. Return a summary: `{ "pages_cached": 150, "errors": 0 }`

### 3. `GET /sitemap?name=sitemap-index.xml` (optional)

**Purpose:** Return XML sitemaps for search engines.

### 4. `POST /manage-cron` (optional)

**Purpose:** Schedule/unschedule automated cache rebuilds.

---

## Cache Store Schema

Your cache needs to store these fields per page. Adapt to your database:

### PostgreSQL / Supabase / PlanetScale / MySQL

```sql
CREATE TABLE prerendered_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- or AUTO_INCREMENT for MySQL
  path TEXT UNIQUE NOT NULL,                       -- URL path, e.g. '/markets/bitcoin'
  html TEXT NOT NULL,                              -- Full HTML document
  title TEXT,                                      -- Page title (for debugging)
  description TEXT,                                -- Meta description
  og_image TEXT,                                   -- OG image URL
  source_table TEXT,                               -- Which table generated this page
  source_id TEXT,                                  -- ID of the source record
  content_type TEXT,                               -- 'market', 'article', 'product', etc.
  hit_count INTEGER DEFAULT 0,                     -- How many times bots requested this
  expires_at TIMESTAMPTZ,                          -- When cache becomes stale
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_prerendered_pages_path ON prerendered_pages(path);
```

### MongoDB

```javascript
// Collection: prerendered_pages
{
  path: "/markets/bitcoin",       // Unique index on this field
  html: "<!DOCTYPE html>...",
  title: "Bitcoin Price Market",
  description: "...",
  og_image: "https://...",
  source_collection: "markets",
  source_id: "abc123",
  content_type: "market",
  hit_count: 0,
  expires_at: ISODate("2026-03-01T00:00:00Z"),
  created_at: ISODate("2026-02-24T00:00:00Z"),
  updated_at: ISODate("2026-02-24T00:00:00Z")
}

// Create unique index:
db.prerendered_pages.createIndex({ path: 1 }, { unique: true })
```

### Redis (key-value)

```
Key:    prerender:/markets/bitcoin
Value:  { full HTML string }
TTL:    3600 (1 hour auto-expiry)
```

### Firebase Firestore

```javascript
// Collection: prerendered_pages
// Document ID: path encoded (e.g., "markets--bitcoin")
{
  path: "/markets/bitcoin",
  html: "<!DOCTYPE html>...",
  title: "Bitcoin Price Market",
  hit_count: 0,
  expires_at: Timestamp,
  updated_at: Timestamp
}
```

### Sitemaps Table (optional, any SQL DB)

```sql
CREATE TABLE static_sitemaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT UNIQUE NOT NULL,
  content TEXT NOT NULL,
  url_count INTEGER DEFAULT 0,
  generated_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);
```

---

## Cloudflare Pages Middleware (Universal)

This is the **same for every stack**. It lives at `functions/_middleware.ts` in your project root.

**What it does:**
1. Checks if the request is for a static asset → pass through
2. Checks if the URL matches a sitemap pattern → proxy to your sitemap API
3. Checks the User-Agent against 100+ known bot strings → fetch prerendered HTML from your API
4. Otherwise → pass through to SPA

**Key configuration points:**
- `BACKEND_API_URL` — your API base URL (set as Cloudflare env var)
- `BACKEND_API_KEY` — auth key for your API (set as Cloudflare env var)
- `BOT_AGENTS` — array of bot user-agent substrings

See `middleware.ts` for the full implementation. The only things to change:
- The URL it fetches prerendered HTML from (line that calls your `/prerender` endpoint)
- The auth header format (Bearer token, API key header, etc.)

---

## Execution Plan (Step-by-Step)

Follow these phases in order. Each depends on the previous one.

---

### Phase 1: Choose Your Stack

**Decision:** Pick your backend and database.

| If you use... | Cache Store | Backend API | Scheduler |
|---------------|-------------|-------------|-----------|
| **Supabase** | PostgreSQL (built-in) | Supabase Edge Functions (Deno) | pg_cron |
| **MongoDB + Node.js** | MongoDB collection | Express/Fastify API | node-cron or external |
| **Firebase** | Firestore collection | Firebase Cloud Functions | Firebase scheduled functions |
| **AWS** | DynamoDB or RDS | Lambda + API Gateway | EventBridge |
| **Vercel** | Any DB (Postgres, Mongo) | Vercel Serverless Functions | Vercel Cron |
| **Railway / Render** | PostgreSQL (managed) | Node.js service | Built-in cron |
| **Raw VPS** | PostgreSQL / MySQL | Express / FastAPI | system cron |

**The Cloudflare Pages middleware stays the same regardless of choice.**

---

### Phase 2: Create the Cache Store

**Goal:** Set up storage for pre-built HTML pages.

**Steps:**
1. Create the `prerendered_pages` table/collection in your database (see schemas above)
2. Create a unique index on `path`
3. Optionally create `static_sitemaps` table/collection
4. Verify you can insert and query by path

**Success criteria:** You can insert `{ path: "/test", html: "<h1>Test</h1>" }` and retrieve it by path.

---

### Phase 3: Build the Prerender API Endpoint

**Goal:** Create `GET /prerender?path=...` that returns cached HTML.

**Pseudocode (works in any language):**
```
function handlePrerender(request):
    path = request.query.path
    if not path: return 400 "Missing path"
    
    page = database.findOne({ path: path })
    if not page: return 404 "Not found"
    
    // Optional: increment hit counter
    database.update({ path: path }, { $inc: { hit_count: 1 } })
    
    // Optional: check staleness
    is_stale = page.expires_at < now()
    
    return HTML response:
        status: 200
        headers:
            Content-Type: text/html
            X-Prerender: true
            X-Cache: is_stale ? "stale" : "hit"
        body: page.html
```

**Node.js/Express example:**
```javascript
app.get('/prerender', async (req, res) => {
  const { path } = req.query;
  if (!path) return res.status(400).json({ error: 'Missing path' });
  
  const page = await db.collection('prerendered_pages').findOne({ path });
  if (!page) return res.status(404).json({ error: 'not_found' });
  
  await db.collection('prerendered_pages').updateOne({ path }, { $inc: { hit_count: 1 } });
  
  res.set('Content-Type', 'text/html');
  res.set('X-Prerender', 'true');
  res.send(page.html);
});
```

**Supabase Edge Function:** See `edge-functions/prerender.ts` for the Deno/Supabase version.

**Success criteria:** `curl "https://your-api.com/prerender?path=/test"` returns HTML.

---

### Phase 4: Build the Cache Generator

**Goal:** Create `POST /generate-cache` that builds HTML for all pages and stores them.

**This is the most project-specific part.** You need to:

1. **Define your static pages** — home, about, pricing, FAQ, etc.
2. **Query your dynamic content** — products, articles, markets, users, etc.
3. **Generate full HTML for each** — with SEO tags, JSON-LD, body content

**HTML template structure (universal):**
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <link rel="canonical" href="${siteUrl}${path}">
  
  <!-- Open Graph -->
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${ogImage}">
  <meta property="og:url" content="${siteUrl}${path}">
  <meta property="og:type" content="website">
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${ogImage}">
  
  <!-- JSON-LD (customize per page type) -->
  <script type="application/ld+json">${jsonLd}</script>
</head>
<body>
  <h1>${heading}</h1>
  <p>${bodyContent}</p>
  <!-- Add real content: lists, tables, links — anything you want indexed -->
</body>
</html>
```

**Pseudocode:**
```
function generateCache():
    pages = []
    
    // Static pages
    pages.push({ path: "/", title: "Home", html: buildHomePage() })
    pages.push({ path: "/pricing", title: "Pricing", html: buildPricingPage() })
    
    // Dynamic pages from database
    products = database.query("SELECT * FROM products WHERE active = true")
    for product in products:
        pages.push({
            path: "/products/" + product.slug,
            title: product.name,
            html: buildProductPage(product)
        })
    
    // Upsert all pages into cache
    for page in pages:
        database.upsert("prerendered_pages", { path: page.path }, {
            path: page.path,
            html: page.html,
            title: page.title,
            updated_at: now(),
            expires_at: now() + 1 hour
        })
    
    return { pages_cached: pages.length }
```

**Supabase reference:** See `edge-functions/generate-prerender-cache.ts`

**Success criteria:** After running, `prerendered_pages` has rows for every route with non-empty HTML.

---

### Phase 5: Deploy Cloudflare Middleware

**Goal:** Add bot detection at the Cloudflare edge.

**Steps:**
1. Create `functions/_middleware.ts` at your **project root** (NOT inside `src/`)
2. Create `functions/tsconfig.json` for Cloudflare Workers types
3. Configure environment variables in Cloudflare Pages dashboard:

| Variable | Value | Description |
|----------|-------|-------------|
| `BACKEND_API_URL` | `https://your-api.com` | Your prerender API base URL |
| `BACKEND_API_KEY` | `your-secret-key` | Auth for your API (if needed) |

**For Supabase specifically:**
- `SUPABASE_URL` = `https://YOUR_PROJECT.supabase.co`
- `SUPABASE_ANON_KEY` = your anon key

**For Node.js / Express:**
- `BACKEND_API_URL` = `https://your-server.com/api`
- `BACKEND_API_KEY` = whatever auth your API expects

**For Firebase:**
- `BACKEND_API_URL` = `https://us-central1-YOUR_PROJECT.cloudfunctions.net`

4. In `middleware.ts`, update the fetch URL to match your API:

```typescript
// Supabase:
const prerenderUrl = `${env.SUPABASE_URL}/functions/v1/prerender?path=${encodeURIComponent(pathname)}`;

// Node.js:
const prerenderUrl = `${env.BACKEND_API_URL}/prerender?path=${encodeURIComponent(pathname)}`;

// Firebase:
const prerenderUrl = `${env.BACKEND_API_URL}/prerender?path=${encodeURIComponent(pathname)}`;
```

5. **Important file structure:**
```
project-root/
├── functions/
│   ├── _middleware.ts    ← Bot detection (Cloudflare)
│   └── tsconfig.json     ← Workers types
├── src/                   ← Your React app (unchanged)
└── ...
```

6. Deploy: push to GitHub (Cloudflare auto-deploys) or `wrangler pages deploy`

**Success criteria:** `functions/` directory at project root, env vars set in Cloudflare dashboard.

---

### Phase 6: Seed Cache and Test

**Goal:** Populate cache and verify end-to-end.

**Steps:**
1. Trigger the cache generator:
```bash
# Supabase:
curl -X POST "https://YOUR_PROJECT.supabase.co/functions/v1/generate-prerender-cache" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" -H "Content-Type: application/json" \
  -d '{"force": true}'

# Node.js:
curl -X POST "https://your-server.com/api/generate-cache" \
  -H "Authorization: Bearer YOUR_API_KEY" -H "Content-Type: application/json" \
  -d '{"force": true}'

# Firebase:
curl -X POST "https://us-central1-PROJECT.cloudfunctions.net/generateCache" \
  -H "Content-Type: application/json" -d '{"force": true}'
```

2. Verify cache has data:
```sql
-- PostgreSQL / Supabase:
SELECT path, title, length(html) as html_size FROM prerendered_pages LIMIT 10;
```
```javascript
// MongoDB:
db.prerendered_pages.find({}, { path: 1, title: 1 }).limit(10)
```

3. Test bot detection:
```bash
# Human request — should return normal SPA
curl -s https://your-site.pages.dev/ | head -5

# Bot request — should return prerendered HTML
curl -s -H "User-Agent: Googlebot" https://your-site.pages.dev/ | head -50

# Debug endpoint
curl https://your-site.pages.dev/__debug

# Bot debug
curl -H "User-Agent: Googlebot" https://your-site.pages.dev/__debug
```

**Success criteria:** Bots get rich HTML. Humans get SPA.

---

### Phase 7: Set Up Automated Cache Refresh

**Goal:** Schedule automatic rebuilds so content stays fresh.

**Choose your scheduler:**

**pg_cron (Supabase / PostgreSQL):**
```bash
curl -X POST "https://YOUR_PROJECT.supabase.co/functions/v1/manage-cron-job" \
  -H "Authorization: Bearer YOUR_ANON_KEY" -H "Content-Type: application/json" \
  -d '{
    "action": "schedule",
    "jobName": "prerender-cache-refresh",
    "targetFunction": "generate-prerender-cache",
    "schedule": "0 * * * *",
    "body": {"force": true}
  }'
```

**node-cron (Node.js):**
```javascript
const cron = require('node-cron');
cron.schedule('0 * * * *', async () => {
  await generateCache({ force: true });
  console.log('Cache refreshed');
});
```

**Firebase Scheduled Functions:**
```javascript
exports.refreshCache = functions.pubsub.schedule('every 1 hours').onRun(async () => {
  await generateCache({ force: true });
});
```

**GitHub Actions (any backend):**
```yaml
# .github/workflows/refresh-cache.yml
on:
  schedule:
    - cron: '0 * * * *'
jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - run: curl -X POST "${{ secrets.CACHE_API_URL }}/generate-cache" -H "Authorization: Bearer ${{ secrets.API_KEY }}"
```

**Vercel Cron:**
```json
// vercel.json
{ "crons": [{ "path": "/api/generate-cache", "schedule": "0 * * * *" }] }
```

**Success criteria:** Cache rebuilds automatically. `updated_at` timestamps refresh on schedule.

---

## Cron Job Management (Supabase-specific)

If using Supabase with pg_cron, you also need:

### Database setup for cron tracking

```sql
CREATE TABLE cron_job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL,
  status TEXT DEFAULT 'running',
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  markets_synced INTEGER DEFAULT 0,
  markets_failed INTEGER DEFAULT 0,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- PostgreSQL functions for cron management
CREATE OR REPLACE FUNCTION schedule_cron_job(...) ...
CREATE OR REPLACE FUNCTION unschedule_cron_job(...) ...
CREATE OR REPLACE FUNCTION get_cron_job_status(...) ...
```

See `database-schema.sql` for full SQL and `edge-functions/manage-cron-job.ts` for the Supabase implementation.

---

## Script Service — Dynamic 3rd Party Script Injection

### The Core Problem

React SPAs cannot natively inject 3rd-party scripts without modifying source code. This is a critical limitation because:

1. **AI-built apps** (Lovable, Bolt, Cursor) don't expose `index.html` — you can't manually add `<script>` tags
2. **Every AI rebuild** can overwrite hardcoded scripts
3. **Analytics, tracking pixels, consent managers** all require `<script>` tags in `<head>` or `<body>`
4. **No server layer** exists in a pure SPA to dynamically inject tags

### How Script Service Solves It

The Script Service is a **backend function** that returns a JSON object containing all scripts to inject:

```json
{
  "head": [
    "<script async src=\"https://www.googletagmanager.com/gtag/js?id=G-XXXXX\"></script>",
    "<script>/* consent manager */</script>"
  ],
  "body": [
    "<script>/* chat widget */</script>"
  ]
}
```

The Cloudflare middleware **fetches this registry** (cached for 5 minutes) and injects the scripts into every HTML response — both for bots and humans. Scripts run in a **first-party context** (same domain), bypassing ad-blocker and reverse-proxy limitations.

### API Endpoint: `GET /script-service`

**Purpose:** Return all 3rd-party scripts to inject into HTML responses.

**Response:**
```json
{
  "head": ["<script>...</script>", "<script src=\"...\"></script>"],
  "body": ["<script>...</script>"]
}
```

**Pseudocode (any language):**
```
function handleScriptService(request):
    return JSON response:
        status: 200
        headers:
            Content-Type: application/json
            Cache-Control: public, max-age=300
        body: {
            head: [
                // Google Analytics
                "<script async src='https://www.googletagmanager.com/gtag/js?id=G-XXXXX'></script>",
                // Consent manager
                "<script src='https://consent-tool.com/banner.js'></script>"
            ],
            body: [
                // Chat widget, etc.
            ]
        }
```

**Node.js/Express example:**
```javascript
app.get('/script-service', (req, res) => {
  res.json({
    head: [
      `<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXX"></script>
       <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-XXXXX');</script>`,
    ],
    body: [],
  });
});
```

**Supabase Edge Function:** See `edge-functions/script-service.ts` for the Deno/Supabase version.

### Middleware Integration

The middleware already handles script injection. The key functions:

```typescript
// Fetch scripts (cached in-memory for 5 minutes)
async function getScripts(env): Promise<{ head: string; body: string }> {
    // Fetch from your script-service endpoint
    // Cache the result in-memory for 5 min
    // Return joined strings for head and body
}

// Inject into HTML response
function injectScripts(html: string, scripts: { head: string; body: string }): string {
    if (scripts.head) html = html.replace('</head>', `${scripts.head}\n</head>`);
    if (scripts.body) html = html.replace('</body>', `${scripts.body}\n</body>`);
    return html;
}
```

### Adding / Removing Scripts

To add a new script: edit your script-service function and redeploy. **No changes to your React app.**

To remove a script: delete it from the registry and redeploy. **No changes to your React app.**

The 5-minute edge cache ensures changes propagate quickly without hammering your backend.

---

## Customization Guide

### Adding New Page Types
1. Add a content generator function in your cache builder
2. Query your database for the new content type
3. Build HTML with appropriate SEO tags and JSON-LD schema
4. Upsert into your cache store

### Modifying Bot Detection
Edit the `BOT_AGENTS` array in `functions/_middleware.ts`. The included list covers 100+ bots including Googlebot, Bingbot, social crawlers, AI crawlers, and SEO tools.

### Cache Expiration
- Set `expires_at` when inserting cache entries
- The prerender endpoint can serve stale content with `X-Cache: stale` header
- The scheduler rebuilds cache periodically to keep it fresh

### HTML Content Tips
- Include **real text content** — not just metadata. Google indexes body content.
- Add internal `<a href>` links so crawlers discover more pages
- Use semantic HTML: `<h1>`, `<h2>`, `<p>`, `<ul>`, `<table>`
- Include JSON-LD for rich results: FAQ, Product, Article, Organization

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Bot gets SPA instead of HTML | Check `__debug` endpoint — verify `isBot: true` for your UA |
| Cache miss (404 from prerender) | Run your cache generator to populate |
| Stale content | Check `expires_at`, re-run cache generator |
| Middleware not running | Ensure `functions/` is at project root, not inside `src/` |
| Sitemaps 404 | Ensure your sitemap endpoint is deployed and middleware proxies correctly |
| Scheduler not firing | Check your scheduler logs (pg_cron, node-cron, etc.) |
| API auth failing | Verify Cloudflare env vars match your API auth requirements |
| HTML too small / empty | Check your content generator queries — ensure they return data |
| Scripts not injecting | Check `__debug` endpoint for `scriptCacheAge`, verify script-service endpoint returns valid JSON |
| Scripts blocked by ad-blockers | Scripts injected at edge run in first-party context — this is the solution |
