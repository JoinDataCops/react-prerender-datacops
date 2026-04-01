# prerender-edge

CLI to set up a full **prerender + sitemaps + script injection** stack for React SPAs on:

- **Cloudflare** — D1 (SQLite) + Workers + Cron Triggers  
- **Supabase** — Postgres + Edge Functions + pg_cron

Pick whichever backend you want. Switch backends any time. Both are supported with the same CLI.

---

## Install

```bash
npm install -g prerender-edge
```

Or use without installing:

```bash
npx prerender-edge init
```

---

## Quick start

### 1. Login

```bash
prerender login
```

Asks which backend → opens the right dashboard → you paste a token.

**Cloudflare** — create an API token with: D1 Edit, Workers Edit, Pages Edit, Account Read  
**Supabase** — create a Personal Access Token at app.supabase.com/account/tokens

### 2. Setup (one command does everything)

```bash
prerender init
```

**Cloudflare flow:**
1. Picks your account
2. Creates D1 database
3. Applies schema (3 tables)
4. Scaffolds worker source → `./prerender-worker/`
5. Copies middleware → `functions/_middleware.ts`
6. Sets `WORKER_URL` + `WORKER_SECRET` on your Pages project
7. Deploys the worker

**Supabase flow:**
1. Lists your projects → you pick one
2. Applies Postgres schema via Management API
3. Sets function secrets (SUPABASE_URL, SERVICE_ROLE_KEY, etc.)
4. Scaffolds edge functions → `supabase/functions/`
5. Copies middleware → `functions/_middleware.ts`
6. Deploys functions via `supabase` CLI (if installed)

### 3. Copy middleware to your Pages project

```bash
# After init runs, just deploy your Pages project normally.
# The _middleware.ts is already in functions/ — Cloudflare Pages picks it up automatically.
```

---

## All commands

```
prerender login                    Authenticate (Cloudflare or Supabase)
prerender login --supabase         Log in to Supabase specifically
prerender login --cloudflare       Log in to Cloudflare specifically
prerender login --oauth <id>       Cloudflare OAuth PKCE browser flow
prerender login --token <tok>      Use a token directly (non-interactive)

prerender logout                   Log out (choose which backend)
prerender logout --all             Clear all config

prerender whoami                   Show auth status + active projects (both backends)

prerender init                     Setup wizard — asks which backend
prerender init --cloudflare        Force Cloudflare setup
prerender init --supabase          Force Supabase setup
prerender init --force             Re-run over existing config

prerender deploy                   Deploy Cloudflare Worker (needs wrangler)
prerender migrate                  Apply DB schema (D1 or Postgres)
prerender migrate --supabase       Target Supabase Postgres
prerender migrate --cloudflare     Target Cloudflare D1
prerender migrate --reset          DROP all tables then recreate (⚠ destroys data)

prerender status                   Cloudflare worker health + cache stats
prerender cache refresh            Trigger prerender cache generation now
prerender cache refresh --force    Force-regenerate all pages
prerender cache clear              Interactive cache clear
prerender cache clear --path /foo  Clear one specific path
prerender cache clear --all        Clear everything (with confirmation)
prerender cache stats              Cache statistics + cron run history
prerender logs                     Stream live Cloudflare Worker logs
prerender logs --worker <name>     Tail a specific worker
```

---

## What gets deployed

### Cloudflare

| Resource | What it does |
|---|---|
| D1 Database | Stores cached HTML, sitemaps, cron run history |
| Worker | All backend routes (`/api/prerender`, `/api/sitemap`, etc.) |
| Cron Trigger | Runs cache generation on a schedule (default: hourly) |
| Pages Middleware | Bot detection + prerender serving + script injection |

### Supabase

| Resource | What it does |
|---|---|
| Postgres Tables | `prerendered_pages`, `static_sitemaps`, `cron_job_runs` |
| `prerender` function | Serves cached HTML |
| `generate-prerender-cache` function | Builds cache on demand or via pg_cron |
| `generate-sitemap` function | Dynamic sitemap XML |
| `serve-sitemap` function | Serves stored sitemaps |
| `script-service` function | Returns script injection tags |
| `manage-cron-job` function | Manages pg_cron schedules |

---

## Customize

### Cache generation (Cloudflare)

After `init`, edit `prerender-worker/src/routes/cron.ts` → `buildPageList()`:

```typescript
async function buildPageList(db: D1Database): Promise<PageData[]> {
  const pages: PageData[] = [];

  // Fetch your pages from D1
  const rows = await db
    .prepare("SELECT title, slug FROM your_table WHERE active = 1")
    .all<{ title: string; slug: string }>();

  for (const row of rows.results) {
    pages.push({
      path: `/page/${row.slug}`,
      html: generateHtmlPage({ title: row.title, ... }),
    });
  }
  return pages;
}
```

Then redeploy: `prerender deploy`

### Script injection

Edit `prerender-worker/src/routes/scripts.ts` to add analytics, tracking pixels, etc.:

```typescript
const SCRIPTS = {
  head: [
    `<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXX"></script>`,
  ],
  body: [],
};
```

---

## Requirements

- Node.js >= 20
- For Cloudflare deploy: `npm install -g wrangler`
- For Supabase function deploy: `npm install -g supabase`

---

## Links

- [Cloudflare D1 docs](https://developers.cloudflare.com/d1/)
- [Cloudflare Workers docs](https://developers.cloudflare.com/workers/)
- [Supabase Edge Functions docs](https://supabase.com/docs/guides/functions)
- [Source repo](https://github.com/YOUR_GITHUB/react-prerender-datacops)
