# ⚡ Prerender & Bot SEO System

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![GitHub Stars](https://img.shields.io/github/stars/JoinDataCops/react-prerender-datacops?style=social)](https://github.com/JoinDataCops/react-prerender-datacops)

 **Open Source · MIT Licensed**

 Built and maintained by [**DataCops**](https://joindatacops.com)   first-party analytics, bot filtering, no-code conversion APIs, and first-party  consent management from your own domain. We recover the 15–60% of session data that ad blockers and ITP silently drop, then distribute clean conversions to every ad platform and CRM.


### 10 million applications built on Lovable. Millions more on Bolt, v0, Cursor, Replit. Every single one invisible to search engines.

> AI platforms generate over 100,000 React applications daily. Well-designed, functional applications that Google, ChatGPT, and web crawlers perceive as empty `<div id="root"></div>` elements. **This represents the defining infrastructure challenge of AI-generated software.**
>
> The conventional solution? Migrate to Next.js. Rewrite your entire application. Commit to Vercel hosting at $20–$100+ monthly. Accept permanent vendor lock-in.
>
> **AI platforms build applications in 5 minutes. Next.js migration requires weeks of development effort. This is fundamentally inefficient.**
>
> **This system solves the problem in 30 minutes. Zero cost. Zero code modifications. Works with ANY backend and ANY database.**

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare)](https://workers.cloudflare.com/)
[![React](https://img.shields.io/badge/React-SPA_SEO-61DAFB?logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-Compatible-646CFF?logo=vite)](https://vitejs.dev/)

**Compatible with:** React · Vite · Create React App · Remix SPA · Gatsby · Vue · Svelte · Angular · Astro · any static SPA

**Designed for:** Lovable · Bolt.new · v0 · Cursor · Replit · any AI application builder

---

## 🚨 The AI Application SEO Challenge — Quantified

Every React SPA—whether built by developers, AI platforms, or engineering teams—delivers this HTML to web crawlers:

```html
<body>
  <noscript>You need to enable JavaScript to run this app.</noscript>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
```

This is what Googlebot indexes. This is what ChatGPT processes. This is what every traffic-driving crawler encounters. **Empty content.**

### Scale of the challenge:

- **70% of modern websites remain invisible to AI crawlers** — GPTBot, ClaudeBot, PerplexityBot do not execute JavaScript. This is a technical limitation, not a choice.
- **Vercel's published research validates this issue** — The company commercializing Next.js has published data demonstrating that AI crawlers cannot process JavaScript-rendered content. They documented the technical limitation, then positioned their framework as the solution.
- **10M+ projects on Lovable alone**, plus millions across Bolt.new, v0, Cursor, and Replit—all generating crawler-invisible SPAs
- **100,000+ new React applications daily** across AI platforms, each launched without search engine visibility

### Business impact:

- 🚫 **Zero organic search traffic** — Search engines cannot index content they cannot parse
- 🚫 **Failed social media previews** — LinkedIn, Twitter, Facebook display blank preview cards
- 🚫 **Absent from AI recommendations** — ChatGPT, Perplexity, Claude cannot reference inaccessible content
- 🚫 **Revenue opportunity loss** — Each day without indexing represents unrealized commercial value

---

## 🤖 Built for AI Application Builders

This solution addresses the requirements of **millions building applications through AI platforms** who may lack awareness that their sites have no search visibility.

| Platform          | Applications Generated | Framework Output | Native SEO | Implementation Time |
| ----------------- | ---------------------- | ---------------- | :--------: | :-----------------: |
| 🟣 **Lovable**    | 10M+ projects          | React + Vite     |   ❌ No    |    ✅ 30 minutes    |
| ⚡ **Bolt.new**   | Millions               | React + Vite     |   ❌ No    |    ✅ 30 minutes    |
| 🔵 **Cursor**     | Millions               | Any SPA          |   ❌ No    |    ✅ 30 minutes    |
| 🟢 **Replit**     | Millions               | Any SPA          |   ❌ No    |    ✅ 30 minutes    |

> **AI platforms generate applications. This system ensures search engines can index them. 30 minutes. Zero cost.**

These platforms output React SPAs. Their users—entrepreneurs, creators, small businesses—typically lack knowledge of SSR, framework migration strategies, or rendering patterns. They simply observe that search engines cannot discover their applications. **This system provides the solution.**

---

## 💀 Next.js Migration: Cost-Benefit Analysis

### Comparative Analysis

| Feature                       |                 ⚡ This System                  |                                                           Next.js on Vercel                                                           |
| ----------------------------- | :---------------------------------------------: | :-----------------------------------------------------------------------------------------------------------------------------------: |
| 💰 **Monthly cost**           |        **$0** (free tier infrastructure)        |                            **$20–$100+** ([bandwidth limitations documented](https://vercel.com/pricing))                             |
| ⚡ **Bot response time**      |             **~50ms** (edge cache)              |                                                **~200–500ms** (server-side rendering)                                                 |
| 🔒 **Vendor lock-in**         |             **None—stack agnostic**             | **Substantial** ([community documentation](https://www.reddit.com/r/nextjs/comments/1gydkmu/is_nextjs_a_vendor_lockin_architecture/)) |
| 🌍 **Global distribution**    |         **Edge network (300+ cities)**          |                                                      Regional server deployment                                                       |
| 🔄 **Migration requirements** |     **Zero—additive infrastructure layer**      |                                                   **Complete application rewrite**                                                    |
| 👤 **User experience**        | Pure SPA (instantaneous client-side navigation) |                                                       SSR + hydration overhead                                                        |
| 🤖 **Crawler detection**      |        **100+ bot user-agent patterns**         |                                                            Basic detection                                                            |
| 🔄 **Cache management**       |          **Automated** (any scheduler)          |                                                   Manual ISR configuration required                                                   |
| ⏱️ **Implementation time**    |                 **~30 minutes**                 |                                                             Days to weeks                                                             |
| 🏗️ **Backend flexibility**    |          Any DB, any API, any hosting           |                                                   **Vercel-optimized architecture**                                                   |

## 🧠 The Solution — How It Works

This system adds a **transparent bot-detection layer** at the Cloudflare edge. No code changes to your React app. No framework migration. No build-time rendering. **Any backend, any database.**

```
Human visits your-site.com  → Normal SPA (unchanged)
Googlebot visits your-site.com → Rich, pre-built HTML with full SEO
```

1. **Cloudflare Pages Middleware** sits at the edge and inspects every request
2. If the visitor is a **bot** (100+ user-agents detected), it fetches pre-built HTML from **your backend** (any API, any database)
3. If the visitor is a **human**, it passes through to your normal SPA
4. A **scheduled job** automatically refreshes the cached HTML

---

## 🔌 Script Service — 3rd Party Integrations Without Code Changes

### The Problem React SPAs Have with 3rd Party Scripts

React SPAs have a **fundamental limitation**: adding analytics, tracking pixels, consent managers, or any 3rd-party `<script>` tag requires modifying source code, rebuilding, and redeploying. For AI-generated applications, this means:

- 🚫 **No access to `index.html`** — AI platforms like Lovable, Bolt.new, and Cursor don't expose the HTML shell
- 🚫 **Hardcoded scripts break on rebuild** — every AI edit can overwrite your manual changes
- 🚫 **No server-side injection** — React SPAs have no server layer to dynamically insert tags
- 🚫 **Analytics blind spots** — Google Analytics, Facebook Pixel, consent banners, heatmaps all require `<script>` tags in `<head>` or `<body>`

### The Solution: Dynamic Script Injection at the Edge

The **Script Service** is a lightweight backend function that acts as a **centralized registry** of all your 3rd-party scripts. The Cloudflare middleware fetches this registry and **dynamically injects scripts into every HTML response** — for both bots and humans.

```
Your Script Service (backend)          Cloudflare Middleware (edge)
┌──────────────────────────┐          ┌──────────────────────────┐
│  Returns JSON:           │  ──────► │  Injects into HTML:      │
│  {                       │          │                          │
│    head: ["<script>..."] │          │  </head> ← head scripts  │
│    body: ["<script>..."] │          │  </body> ← body scripts  │
│  }                       │          │                          │
└──────────────────────────┘          └──────────────────────────┘
```

### Why This Matters

| Capability | Without Script Service | With Script Service |
|------------|:---------------------:|:-------------------:|
| Add Google Analytics | ❌ Edit source, rebuild, redeploy | ✅ Add to registry, instant |
| Add Facebook Pixel | ❌ Edit source, rebuild, redeploy | ✅ Add to registry, instant |
| Add consent manager (GDPR) | ❌ Edit source, rebuild, redeploy | ✅ Add to registry, instant |
| Add heatmap (Hotjar, etc.) | ❌ Edit source, rebuild, redeploy | ✅ Add to registry, instant |
| Remove a script | ❌ Edit source, rebuild, redeploy | ✅ Remove from registry, instant |
| Scripts survive AI rebuilds | ❌ Overwritten | ✅ Decoupled from source |
| First-party context | ❌ CDN/proxy issues | ✅ Injected at edge |

> **One function. Any script. Zero code changes. Survives every rebuild.**

### Stack Agnostic

The **only constant** is Cloudflare Pages middleware for bot detection and script injection. Everything else is swappable:

| Layer                    | Options                                                                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| **Edge / Bot Detection** | Cloudflare Pages Middleware _(included)_                                                                                          |
| **Database**             | PostgreSQL, MongoDB, MySQL, Redis, DynamoDB, Firebase Firestore, Supabase, PlanetScale — anything that stores text                |
| **Backend / API**        | Supabase Edge Functions, Node.js/Express, Python/FastAPI, Go, AWS Lambda, Vercel Functions, Netlify Functions, Firebase Functions |
| **Cron / Scheduler**     | pg_cron, node-cron, AWS EventBridge, GitHub Actions, Railway cron, Render cron, any scheduler                                     |
| **Script Registry**      | Supabase Edge Function, Express endpoint, Lambda, any HTTP JSON endpoint                                                          |
| **Frontend**             | React, Vue, Svelte, Angular — any SPA framework                                                                                   |

## What's Included

| File                                         | What It Does                                               |
| -------------------------------------------- | ---------------------------------------------------------- |
| `SKILL.md`                                   | Technical implementation guide with multi-stack examples   |
| `middleware.ts`                              | Cloudflare Pages edge middleware — bot detection & routing |
| `database-schema.sql`                        | PostgreSQL schema (adapt for your DB)                      |
| `edge-functions/prerender.ts`                | Supabase reference: cache lookup                           |
| `edge-functions/generate-prerender-cache.ts` | Supabase reference: HTML builder                           |
| `edge-functions/generate-sitemap.ts`         | Supabase reference: dynamic sitemap                        |
| `edge-functions/serve-sitemap.ts`            | Supabase reference: static sitemap                         |
| `edge-functions/manage-cron-job.ts`          | Supabase reference: cron manager                           |
| `edge-functions/script-service.ts`           | Supabase reference: dynamic script injection registry      |

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
- ✅ 3rd-party scripts (analytics, pixels, consent) managed from one place — no code changes
- ✅ Scripts survive AI rebuilds — decoupled from your React source code

---

## License

MIT License — use, fork, and deploy freely.

---

_The bot detection layer (Cloudflare) is universal. The backend is yours to choose._
