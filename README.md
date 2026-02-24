# Prerender & Bot SEO System

> **Make your React SPA fully visible to Google, social crawlers, and AI bots — without SSR, without Next.js, without any framework migration. Works with ANY backend and ANY database.**

---

## The Problem

Single-Page Applications (SPAs) built with React/Vite serve a blank `<div id="root"></div>` to every visitor. Humans see your app after JavaScript loads. But bots — Googlebot, Twitter's card crawler, ChatGPT's browser, Slack's link previewer — see **nothing**.

This means:
- 🔍 **Google can't index your pages** — your SEO is effectively zero
- 🐦 **Social shares show blank cards** — no title, no image, no description
- 🤖 **AI crawlers skip your content** — you're invisible to the new web
- 📊 **Rich snippets don't work** — no FAQ panels, no product cards in search results

## The Solution

This system adds a **transparent bot-detection layer** at the Cloudflare edge. No code changes to your React app. No framework migration. No build-time rendering.

```
Human visits your-site.com  → Normal SPA (unchanged)
Googlebot visits your-site.com → Rich, pre-built HTML with full SEO
```

### How It Works

1. **Cloudflare Pages Middleware** sits at the edge and inspects every request
2. If the visitor is a **bot** (100+ user-agents detected), it fetches pre-built HTML from **your backend** (any API, any database)
3. If the visitor is a **human**, it passes through to your normal SPA
4. A **scheduled job** automatically refreshes the cached HTML

### Stack Agnostic

The **only constant** is Cloudflare Pages middleware for bot detection. Everything else is swappable:

| Layer | Options |
|-------|---------|
| **Edge / Bot Detection** | Cloudflare Pages Middleware *(included)* |
| **Database** | PostgreSQL, MongoDB, MySQL, Redis, DynamoDB, Firebase Firestore, Supabase, PlanetScale — anything that stores text |
| **Backend / API** | Supabase Edge Functions, Node.js/Express, Python/FastAPI, Go, AWS Lambda, Vercel Functions, Netlify Functions, Firebase Functions |
| **Cron / Scheduler** | pg_cron, node-cron, AWS EventBridge, GitHub Actions, Railway cron, Render cron, any scheduler |
| **Frontend** | React, Vue, Svelte, Angular — any SPA framework |

## What's Included

| File | What It Does |
|------|-------------|
| `SKILL.md` | Technical implementation guide with multi-stack examples |
| `middleware.ts` | Cloudflare Pages edge middleware — bot detection & routing |
| `database-schema.sql` | PostgreSQL schema (adapt for your DB) |
| `edge-functions/prerender.ts` | Supabase reference: cache lookup |
| `edge-functions/generate-prerender-cache.ts` | Supabase reference: HTML builder |
| `edge-functions/generate-sitemap.ts` | Supabase reference: dynamic sitemap |
| `edge-functions/serve-sitemap.ts` | Supabase reference: static sitemap |
| `edge-functions/manage-cron-job.ts` | Supabase reference: cron manager |

> **Note:** The `edge-functions/` folder contains Supabase/Deno implementations as a reference. If you use a different backend, implement the same endpoints in your stack — the SKILL.md shows how.

## Quick Start

1. **Read `SKILL.md`** for the full technical walkthrough
2. Choose your backend stack
3. Create the cache storage (database table, collection, or key-value store)
4. Implement 2 API endpoints: `GET /prerender?path=...` and `POST /generate-cache`
5. Add the Cloudflare middleware pointing to your API
6. Seed the cache, set up a scheduler, done

## Results

After deploying this system:
- ✅ Google indexes all your dynamic pages
- ✅ Social shares display rich cards with images and descriptions
- ✅ AI crawlers can read your full content
- ✅ FAQ and product structured data appears in search results
- ✅ Sitemaps are auto-generated and always up-to-date
- ✅ Cache refreshes automatically — set it and forget it

---

*The bot detection layer (Cloudflare) is universal. The backend is yours to choose.*
