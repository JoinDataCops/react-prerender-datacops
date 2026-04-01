# Cloudflare Stack — Zero Supabase

Complete drop-in replacement for the Supabase backend using **Cloudflare D1**, **Cloudflare Workers**, and the **`cf-prerender` CLI**.

Everything runs on Cloudflare. No Supabase. No external DB.

---

## What's included

| File / folder | What it does |
|---|---|
| `d1-schema.sql` | SQLite-compatible schema for D1 (replaces Postgres schema) |
| `functions/_middleware.ts` | Updated Pages middleware — calls the Worker, not Supabase |
| `workers/backend/` | Single Cloudflare Worker replacing **all** Supabase Edge Functions |
| `cli/` | `cf-prerender` CLI — login, init, deploy, migrate, status, cache, logs |

### Supabase → Cloudflare mapping

| Supabase | Cloudflare replacement |
|---|---|
| Postgres | D1 (SQLite) |
| `prerender` edge function | `GET /api/prerender` on Worker |
| `generate-prerender-cache` edge function | `POST /api/cache/generate` + Cron Trigger |
| `generate-sitemap` edge function | `GET /api/sitemap` on Worker |
| `serve-sitemap` edge function | `GET /api/sitemap/static` on Worker |
| `script-service` edge function | `GET /api/scripts` on Worker |
| `manage-cron-job` edge function | Cloudflare Cron Triggers + D1 tracking |
| `pg_cron` | Cloudflare Cron Triggers (`wrangler.toml` → `[triggers]`) |

---

## Quick start (one-click setup)

### Prerequisites

```bash
node >= 20
npm install -g wrangler   # Cloudflare's official deployment CLI
```

### 1. Build and install the CLI

```bash
cd cloudflare/cli
npm install
npm run build
npm link          # makes `cf-prerender` available globally
```

### 2. Login to Cloudflare

```bash
cf-prerender login
```

**Option A — API Token** (recommended, no setup needed):
- CLI opens `dash.cloudflare.com/profile/api-tokens` in your browser
- Create a token with these permissions:
  - Account › **D1** — Edit
  - Account › **Workers Scripts** — Edit
  - Account › **Pages** — Edit
  - Account › **Account Settings** — Read
  - User › **User Details** — Read
- Paste the token back into the terminal

**Option B — OAuth PKCE** (requires registering an OAuth app):
```bash
cf-prerender login --oauth YOUR_CF_CLIENT_ID
```
Register an app at: https://developers.cloudflare.com/cloudflare-one/identity/idp-integration/

### 3. Run the setup wizard

```bash
cf-prerender init
```

This will:
1. List your Cloudflare accounts — pick one
2. Ask for project name, site URL, Pages project name
3. **Create the D1 database** via Cloudflare API
4. **Apply the schema** (all 3 tables + indexes)
5. Patch `workers/backend/wrangler.toml` with the `database_id`
6. Set `WORKER_URL` + `WORKER_SECRET` on your Pages project
7. Offer to deploy the worker immediately

### 4. Copy the middleware to your Pages project

```bash
cp cloudflare/functions/_middleware.ts  path/to/your/site/functions/_middleware.ts
```

The middleware reads two env vars (set automatically by `init`):
- `WORKER_URL` — your deployed worker URL
- `WORKER_SECRET` — shared auth secret

---

## CLI reference

```
cf-prerender <command>

Authentication:
  login              Authenticate (API token or OAuth PKCE browser flow)
  logout             Remove stored credentials
  logout --all       Clear ALL config including project settings
  whoami             Show current user, account, and project

Project setup:
  init               Interactive wizard — create DB, apply schema, configure everything
  init --force       Re-run wizard over existing config
  deploy             Deploy the backend worker (shells out to wrangler)
  migrate            Apply D1 schema without full reinit
  migrate --reset    DROP all tables and recreate (⚠ destroys data)

Monitoring:
  status             Show worker + D1 + cache health
  logs               Stream live worker logs (Ctrl+C to stop)
  logs --worker <n>  Tail a specific worker

Cache management:
  cache refresh             Trigger prerender cache generation now
  cache refresh --force     Force-regenerate all pages
  cache clear               Interactive: clear all or one page
  cache clear --path /foo   Clear a specific path
  cache clear --all         Clear everything (with confirmation)
  cache stats               Cache statistics + recent cron run history
```

---

## Backend Worker API

All routes require `Authorization: Bearer <WORKER_SECRET>` except `/api/health`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check (public) |
| `GET` | `/api/prerender?path=<p>` | Lookup cached HTML |
| `POST` | `/api/prerender` | Store cached HTML |
| `DELETE` | `/api/prerender?path=<p>` | Delete one cached page |
| `DELETE` | `/api/prerender?all=true` | Delete all cached pages |
| `GET` | `/api/prerender/stats` | Cache statistics |
| `GET` | `/api/sitemap?type=markets` | Dynamic sitemap XML |
| `GET` | `/api/sitemap/static?file=x.xml` | Serve stored sitemap |
| `POST` | `/api/sitemap/static` | Store a sitemap |
| `GET` | `/api/scripts` | Script injection JSON |
| `POST` | `/api/cache/generate` | Trigger cache generation |
| `GET` | `/api/cron/runs` | Cron run history |
| `DELETE` | `/api/cron/runs/stuck` | Clear stuck runs |

---

## Cron / scheduled cache refresh

The worker includes a `scheduled()` export that runs cache generation automatically.

Configure the schedule in `workers/backend/wrangler.toml`:

```toml
[triggers]
crons = ["0 * * * *"]   # every hour
```

Deploy with `cf-prerender deploy` and the cron trigger activates automatically.

---

## Customizing the cache generator

Edit `workers/backend/src/routes/cron.ts` — specifically `buildPageList()`:

```typescript
async function buildPageList(db: D1Database, force: boolean): Promise<PageData[]> {
  const pages: PageData[] = [];

  // Add homepage
  pages.push({ path: '/', html: generateHtmlPage({ ... }), ... });

  // Example: fetch from your own D1 table
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

---

## Customizing the dynamic sitemap

Edit `workers/backend/src/routes/sitemap.ts` — inside `handleGenerateSitemap()`.
The function already includes example queries for `markets` and `pillars_v2` tables.

---

## Environment variables

### Backend Worker (set via `wrangler secret put` or Cloudflare dashboard)

| Variable | Description |
|---|---|
| `WORKER_SECRET` | Auth secret shared with the Pages middleware |
| `SITE_URL` | Your production URL, e.g. `https://mysite.com` |

### Cloudflare Pages (set via `cf-prerender init` or dashboard)

| Variable | Description |
|---|---|
| `WORKER_URL` | URL of your deployed backend worker |
| `WORKER_SECRET` | Same value as the worker's `WORKER_SECRET` |
