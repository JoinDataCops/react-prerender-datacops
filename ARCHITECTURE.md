# prerender-edge — How It Works

**Version:** 1.1.6  
**Package:** `prerender-edge` on npm

---

## The Problem We're Solving

Pure SPAs (React, Vue, Angular) always return this to bots:

```html
<!DOCTYPE html>
<html>
  <body>
    <div id="root"></div>  <!-- empty. no content. -->
  </body>
</html>
```

Googlebot, ChatGPT, Twitter link preview, Facebook OG — they all read HTML directly. They don't execute JavaScript. So they see nothing, index nothing, and your SEO is dead.

**The solution:** detect when a bot visits → serve them pre-built HTML instead of the SPA shell.

---

## Architecture Overview

```
User's Browser           Bot (Googlebot, etc.)
      │                          │
      ▼                          ▼
┌─────────────────────────────────────────┐
│         Cloudflare Pages                │
│         functions/_middleware.ts        │
│                                         │
│  Is this a bot?  ──Yes──► Worker URL   │
│        │                      │         │
│       No                      │         │
│        │              ┌───────▼───────┐ │
│        ▼              │  Cloudflare   │ │
│   Serve SPA           │    Worker     │ │
│  (React app)          │  (backend)    │ │
└───────────────────────┤               │─┘
                        │  D1 Database  │
                        │  (cached HTML)│
                        └───────────────┘
                                │
                         Hourly cron
                                │
                    fetch sitemap.xml
                         +
                    prerender-content.json
                         │
                    build full HTML
                    store in D1
```

---

## Components

### 1. `functions/_middleware.ts` — Bot Detection Gate

Lives **inside the user's React project** (at the root, not in `src/`).  
Cloudflare Pages runs this on every request before serving anything.

**What it does:**
- Checks the `User-Agent` header for known bots (Googlebot, Bingbot, Twitterbot, facebookexternalhit, GPTBot, etc.)
- If bot → sends the request to the **Worker** with the page path
- If human → lets the normal SPA serve as usual
- Also handles a `/__debug` endpoint to verify the middleware is active

**Why here:** Cloudflare Pages Functions run at the edge (zero latency, free), so bot detection is instant with no cost.

---

### 2. Cloudflare Worker (`prerender-worker/`) — The Brain

Scaffolded into the **user's project** during `init`. Deployed to Cloudflare Workers.  
Source template lives at `cloudflare/workers/backend/` in this repo.

Has four route handlers:

| Route | Method | What it does |
|---|---|---|
| `/api/prerender` | GET | Serves cached HTML for a given `?path=` |
| `/api/cache/generate` | POST | Triggers cache rebuild (also called by cron) |
| `/api/cron/runs` | GET | Lists cron job history |
| `/health` | GET | Health check |

**Secrets (set automatically by CLI):**
- `WORKER_SECRET` — shared secret between middleware and worker (prevents abuse)
- `SITE_URL` — the live site URL (e.g., `https://joindatacops.com`)

---

### 3. D1 Database — Cache Storage

Cloudflare's SQLite-compatible database. Three tables:

| Table | Purpose |
|---|---|
| `prerendered_pages` | Stores path, full HTML, title, description, expiry |
| `cron_job_runs` | Logs every cache generation run (status, pages synced, errors) |
| `static_sitemaps` | Optional stored sitemaps |

**Why D1 and not KV?** D1 supports SQL queries, so we can do things like "list all expired pages", "count total hits", "get pages by path pattern". KV only supports key lookups.

---

### 4. Cron Job — Cache Builder (`cron.ts`)

Runs every hour via Cloudflare Cron Triggers (configured in `wrangler.toml`).  
Also triggerable manually via `POST /api/cache/generate`.

**Step-by-step what happens:**

```
1. Fetch SITE_URL/prerender-content.json
   └─ User's page content definitions (headings, pricing, FAQs, etc.)
   └─ If not found → fall back to auto-generated content from meta tags

2. Fetch SITE_URL/sitemap.xml
   └─ Discover every page URL on the site
   └─ Supports sitemap index files (multiple sitemaps)

3. For each page path:
   a. Fetch live page → read <title>, <meta description>, og:image, etc.
   b. Look up content in prerender-content.json for this path
   c. Build full HTML using all available data:
      - Complete <head> with title, meta, OG, Twitter cards, canonical URL
      - <body> with hero section, features, pricing, FAQ, CTA
      - Schema.org structured data (JSON-LD)
      - Site nav from content.json
      - Footer with brand + year
   d. Store in D1 with 2-hour expiry

4. Bot visits /pricing
   └─ Middleware detects bot
   └─ Fetches from Worker: GET /api/prerender?path=/pricing
   └─ Worker reads from D1 → returns full HTML
   └─ Bot sees complete pricing page HTML (not <div id="root">)
```

---

### 5. `prerender-content.json` — Page Content Definitions

A JSON file the user puts in their `public/` folder.  
The worker fetches it on every cron run — **no worker redeployment needed** to update content.

```json
{
  "brand": "DataCops",
  "tagline": "Privacy-first analytics platform",
  "nav": [
    { "label": "Home", "href": "/" },
    { "label": "Pricing", "href": "/pricing" }
  ],
  "pages": {
    "/": {
      "sections": [
        { "type": "hero", "heading": "...", "text": "..." },
        { "type": "features", "items": [...] }
      ]
    },
    "/pricing": {
      "sections": [
        { "type": "pricing", "tiers": [...] },
        { "type": "faq", "items": [...] }
      ]
    }
  }
}
```

**Available section types:** `hero`, `text`, `features`, `pricing`, `faq`, `cta`, `table`, `steps`

---

## CLI Commands

The CLI (`prerender-edge`) manages all of this. Published to npm.  
Users run it from their React project root.

### `prerender-edge init`

The main command. Runs everything in sequence:

```
1.  Check if already initialized → offer resume / reconfigure
2.  Cloudflare login (wrangler OAuth — browser opens, no token copying)
3.  Ask: project name, site URL, worker name, D1 DB name, Pages project
4.  Create D1 database via Cloudflare API
5.  Apply SQL schema (3 tables)
6.  Scaffold worker files → ./prerender-worker/ in user's project
7.  Scaffold _middleware.ts → ./functions/ in user's project
8.  Save config locally (~/.config/prerender-edge/)
9.  Deploy worker via wrangler
10. Scan React source files (src/pages/*.tsx) → extract content → write public/prerender-content.json
11. Trigger initial cache generation (worker fetches sitemap + content.json → builds HTML)
12. Ask: deploy frontend to Cloudflare Pages? (build + upload)
    └─ Or: set env vars on existing Cloudflare / Vercel / Netlify deployment
```

After `init`, the system is fully operational.

---

### `prerender-edge scan`

Auto-extracts page content from React/Vue/Svelte source files.

```
Reads: src/pages/*.tsx, src/views/*.tsx, etc.
Extracts:
  - h1–h4 text → page headings / hero
  - <p> text → body paragraphs
  - <li> text → feature lists
  - button / <a> text → CTA labels
  - Pricing tier names + prices (Free, $49, Enterprise, etc.)
  - FAQ pairs (question="..." answer="..." or h3+p accordion pattern)
Writes: public/prerender-content.json
```

**Add to your build pipeline:**
```json
"prebuild": "prerender-edge scan --silent"
```
Now every `npm run build` updates content automatically. Zero maintenance.

---

### `prerender-edge cache refresh`

Manually triggers the cron job (POST /api/cache/generate).  
Use `--force` to regenerate all pages even if cache is still fresh.

```bash
prerender-edge cache refresh --force
```

---

### `prerender-edge cache stats`

Shows:
- Total pages cached
- Expired pages
- Total cache hits
- Last 5 cron run results (duration, pages synced, errors)

---

### `prerender-edge cache clear`

```bash
prerender-edge cache clear --path /pricing   # clear one page
prerender-edge cache clear --all              # clear everything (with confirmation)
```

---

### `prerender-edge deploy`

Re-deploys the worker (calls `npx wrangler deploy`).  
Use this after manually editing worker files.

---

### `prerender-edge deploy-site`

Builds the React project and deploys to Cloudflare Pages.  
Auto-detects framework (Vite, CRA, Next, Nuxt, etc.) and sets build command / output dir.

---

### `prerender-edge status`

Shows live health of the full stack:
- Worker deployed? Last modified?
- D1 database exists? Size? Table count?
- Cache stats (pages cached, hits, expired)
- Worker URL / Site URL

---

### `prerender-edge content`

Generates a starter `prerender-content.json` template with your brand name.  
Use `scan` instead if you want automatic extraction from source files.  
Use `content` if you want a blank template to fill manually.

---

### `prerender-edge logs`

Streams live Cloudflare Worker logs using `wrangler tail`.  
Useful for debugging cron runs and cache generation.

---

### `prerender-edge migrate`

Re-applies the D1 schema. Use if:
- You reset the database
- Schema was updated in a new version
- Tables are missing

```bash
prerender-edge migrate --cloudflare
prerender-edge migrate --cloudflare --reset   # DROP all tables first
```

---

## Free Plan Compatibility

Everything works on **Cloudflare's free plan**:

| Feature | Free plan |
|---|---|
| D1 database | ✓ 5GB free |
| Workers | ✓ 100k requests/day |
| Cron Triggers | ✓ 5 per account |
| Pages hosting | ✓ unlimited |
| Pages Functions (middleware) | ✓ unlimited |

**What requires a paid plan:**
- Cloudflare Browser Rendering (`@cloudflare/puppeteer`) — runs headless Chrome to render full SPA DOM. Not needed with our approach.

---

## How Content Gets to Bots — Full Request Flow

```
Googlebot visits: https://joindatacops.com/pricing

1. Cloudflare Pages receives request
2. functions/_middleware.ts runs:
   - User-Agent: "Googlebot/2.1 (+http://www.google.com/bot.html)"
   - isBot = true
   - fetch("https://datacops-backend.dronehyp.workers.dev/api/prerender?path=/pricing",
           { headers: { Authorization: "Bearer <WORKER_SECRET>" } })

3. Worker receives request:
   - Validates WORKER_SECRET
   - SELECT html FROM prerendered_pages WHERE path = '/pricing' AND expires_at > now()
   - Found → return 200 with full HTML

4. Middleware returns that HTML to Googlebot

5. Googlebot sees:
   <!DOCTYPE html>
   <html>
   <head>
     <title>Pricing — DataCops</title>
     <meta name="description" content="Simple, transparent pricing...">
     <meta property="og:title" content="Pricing — DataCops">
     ... (full meta tags)
     <script type="application/ld+json">{"@type":"WebPage"...}</script>
   </head>
   <body>
     <header><nav>...</nav></header>
     <main>
       <section class="hero"><h1>Simple, transparent pricing</h1></section>
       <section class="pricing">
         <div class="tier"><h3>Free</h3><p class="price">$0/month</p>...</div>
         <div class="tier"><h3>Pro</h3><p class="price">$49/month</p>...</div>
       </section>
       <section class="faq">
         <dl><dt>Can I change plans?</dt><dd>Yes...</dd></dl>
       </section>
     </main>
     <footer>&copy; 2026 DataCops</footer>
   </body>
   </html>
```

---

## File Locations After Init

```
your-react-project/
├── src/                        ← your React code (untouched)
├── public/
│   └── prerender-content.json  ← written by `scan`, read by worker
├── functions/
│   └── _middleware.ts          ← bot detection, scaffolded by init
└── prerender-worker/           ← Cloudflare Worker source
    ├── wrangler.toml           ← worker config (name, D1 binding, cron)
    ├── package.json
    └── src/
        ├── index.ts            ← main entry + Env interface
        ├── lib/
        │   └── db.ts           ← D1 helper functions
        └── routes/
            ├── cron.ts         ← cache generation logic
            ├── prerender.ts    ← serve cached HTML to bots
            ├── sitemap.ts      ← optional sitemap endpoint
            └── scripts.ts      ← optional script injection
```

---

## Config Storage

CLI stores config locally (not in the project, not in git):

```
Windows:  C:\Users\<you>\AppData\Roaming\prerender-edge\
Mac/Linux: ~/.config/prerender-edge/
```

Stores:
- Cloudflare API token
- Project settings (worker name, DB ID, site URL, worker secret, etc.)

The `WORKER_SECRET` is also pushed to the deployed worker as a Cloudflare secret (so it's never in your codebase).

---

## Why Not Next.js / Nuxt?

This tool is built specifically for **pure SPAs** — React, Vue, Angular, Svelte apps that produce a single `index.html` with `<div id="root">`.

Next.js and Nuxt already do SSR/SSG natively — they don't need this.  
Our target is the massive number of teams that have a Vite/CRA React app and need SEO without rewriting their entire architecture.
