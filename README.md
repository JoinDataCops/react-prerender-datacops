# ⚡ react-prerender-worker

### Your React app is invisible to Google. This fixes it — for $0/month.

> You built a beautiful React app. But Google, ChatGPT, and every crawler that drives traffic? They see an empty `<div>`. Your competitors on Next.js rank above you. Not because they're better — because their HTML is visible.
>
> **This is the fix. No framework migration. No SSR hosting bill. No rewrite.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare)](https://workers.cloudflare.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Edge_Functions-3ECF8E?logo=supabase)](https://supabase.com/)
[![React](https://img.shields.io/badge/React-SPA_SEO-61DAFB?logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-Compatible-646CFF?logo=vite)](https://vitejs.dev/)

**Works with:** React · Vite · Create React App · Remix SPA · Gatsby · Vue · Svelte · Angular · Astro · any static SPA

---

## 🔥 The Problem Nobody Talks About

Every React SPA — whether built with **Vite, Create React App, or any client-side framework** — ships the same thing to crawlers:

```html
<html>
  <body>
    <div id="root"></div>
    <script src="/assets/index.js"></script>
  </body>
</html>
```

That's what Google sees. That's what ChatGPT sees. That's what every social media preview bot sees. **Nothing.**

### What this costs your business:

- 🚫 **Zero organic search traffic** — Google can't index what it can't read
- 🚫 **Broken social sharing** — LinkedIn, Twitter, Facebook show blank previews
- 🚫 **Invisible to AI** — ChatGPT, Perplexity, Claude never recommend your product
- 🚫 **Lost revenue** — every day your pages aren't indexed is money left on the table

### The "industry standard" solution?

Migrate to **Next.js**. Rewrite your entire app. Pay Vercel $20–$100+/month. Get locked into their ecosystem forever.

**That's insane.** There's a better way.

---

## 💀 Next.js vs. This Solution — Head to Head

Let's be honest about what you're paying for:

| | ⚡ react-prerender-worker | Next.js on Vercel |
|---|:---:|:---:|
| 💰 **Monthly cost** | **$0** (free tiers) | **$20–$100+** |
| ⚡ **Bot response time** | **~50ms** (edge cache) | **~200–500ms** (SSR) |
| 🔒 **Framework lock-in** | **None — keep your stack** | **Next.js only, forever** |
| 📄 **Pages supported** | **350,000+ tested** | Depends on pricing plan |
| 🌍 **Global performance** | **Edge (300+ cities)** | Regional servers |
| 🔄 **Migration effort** | **Zero — drop-in addition** | **Full app rewrite** |
| 👤 **User experience** | Pure SPA (instant navigation) | SSR + hydration jank |
| 🤖 **AI crawler support** | **100+ bot patterns** | Basic |
| 📱 **Social previews** | ✅ Full OG/meta support | ✅ |
| ⏱️ **Setup time** | **~30 minutes** | Days to weeks of migration |

### The honest trade-off

Next.js gives humans server-rendered HTML on first page load. This solution shows a loading spinner for ~1 second while the SPA boots. After that? **Every navigation is instant** — no hydration overhead, no server round-trips. Bots get full content either way.

**You're not choosing between good SEO and bad SEO. You're choosing between $0 and $100/month for the same result.**

---

## 🧠 How It Actually Works

A tiny Cloudflare Worker (free tier) sits in front of your domain. Every request, it makes one decision in under 1ms:

```
                    yoursite.com
                        │
                        ▼
              ┌─────────────────────┐
              │  Cloudflare Worker  │
              │   (Bot Detector)    │
              └─────────────────────┘
                   │           │
            Bot? ──┘           └── Human?
              │                     │
              ▼                     ▼
     ┌────────────────┐    ┌────────────────┐
     │   Supabase DB  │    │ Cloudflare CDN │
     │ (Rich HTML     │    │  (Your React   │
     │  with Schema)  │    │   SPA, fast)   │
     └────────────────┘    └────────────────┘
```

- **Bots** → get pre-built, SEO-rich HTML with Schema.org, Open Graph, meta tags
- **Humans** → get your blazing-fast React SPA from the global CDN
- **You** → pay nothing, change nothing in your codebase

No server. No build step. No framework swap.

---

## 🤖 100+ Bot Patterns — Out of the Box

The Worker recognizes every crawler that matters:

| Category | Bots Detected |
|----------|--------------|
| 🔍 **Search Engines** | Googlebot, Bingbot, Yandex, Baidu, DuckDuckGo, Ecosia, Mojeek |
| 🤖 **AI Crawlers** | GPTBot, ClaudeBot, PerplexityBot, Google-Extended, Gemini, Meta AI, Mistral, Cohere |
| 📱 **Social Media** | Facebook, Twitter/X, LinkedIn, WhatsApp, Discord, Telegram, Reddit, Pinterest |
| 📊 **SEO Tools** | Ahrefs, SEMrush, Screaming Frog, Moz, SERPstat |
| 🍎 **Platform Bots** | Applebot, AmazonBot, PetalBot |
| 📰 **Feed Readers** | Feedly, Flipboard, NewsBlur, Inoreader |
| 🏛️ **Archives** | Wayback Machine, Archive.org |

Every single one sees your **full content**, Open Graph tags, Schema.org markup, and meta descriptions — not an empty `<div>`.

---

## 🏗️ Works With Any Framework AND Any Host

This is **not** a framework. It's a **layer** that sits in front of any SPA, hosted **anywhere**:

### Frameworks

| Framework | Compatible? | Notes |
|-----------|:-----------:|-------|
| ⚛️ **React + Vite** | ✅ | Primary target, battle-tested with 10,000+ pages |
| ⚛️ **Create React App** | ✅ | Drop-in, no ejection needed |
| ⚛️ **Remix (SPA mode)** | ✅ | Works with client-side Remix |
| 🟢 **Vue.js** | ✅ | Any Vue SPA that builds to static files |
| 🔶 **Svelte/SvelteKit** | ✅ | Static adapter works perfectly |
| 🅰️ **Angular** | ✅ | Standard Angular CLI builds |
| 🚀 **Astro** | ✅ | Client-rendered pages |
| 📦 **Any static SPA** | ✅ | If it builds to HTML/JS/CSS, it works |

### Hosting Providers

The Worker just needs an origin URL. Your app can live **anywhere**:

| Host | `PAGES_ORIGIN` value | Notes |
|------|---------------------|-------|
| ☁️ **Cloudflare Pages** | `https://your-project.pages.dev` | Easiest — same ecosystem |
| ▲ **Vercel** | `https://your-project.vercel.app` | Works perfectly |
| 🔷 **Netlify** | `https://your-project.netlify.app` | Works perfectly |
| 🚀 **Lovable** | `https://your-id.lovable.app` | Built with AI, SEO with this |
| 🐙 **GitHub Pages** | `https://username.github.io/repo` | Free static hosting |
| 🔥 **Firebase Hosting** | `https://your-project.web.app` | Google's CDN |
| 🌊 **Surge.sh** | `https://your-project.surge.sh` | Simple static hosting |
| 🖥️ **Any server** | `https://your-origin-url.com` | VPS, Docker, anything with a URL |

**The Worker doesn't care where your files live.** It only needs the URL to proxy human traffic to. Set `PAGES_ORIGIN` to whatever your hosting provider gives you, and it just works.

**Zero code changes to your app.** The Worker only routes traffic — it never touches your build or hosting.

---

## 🚀 Setup in 30 Minutes

### What You Need (All Free)

- Your SPA, hosted anywhere (Vercel, Netlify, Cloudflare Pages, Lovable, GitHub Pages, etc.)
- A [Supabase](https://supabase.com) account (free tier)
- A [Cloudflare](https://cloudflare.com) account (free tier — only for the Worker + DNS)
- Your domain's DNS managed by Cloudflare

### Step 1 — Create the Cache Table

Run in Supabase SQL Editor:

```sql
CREATE TABLE IF NOT EXISTS prerendered_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path TEXT UNIQUE NOT NULL,
  html TEXT NOT NULL,
  title TEXT,
  hit_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_prerendered_pages_path ON prerendered_pages(path);

ALTER TABLE prerendered_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON prerendered_pages FOR SELECT USING (true);
```

### Step 2 — Deploy the Prerender Function

Create `supabase/functions/prerender/index.ts`:

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*" } });

  const url = new URL(req.url);
  let path = url.searchParams.get("path") || "/";
  if (path !== "/" && path.endsWith("/")) path = path.slice(0, -1);

  const { data } = await supabase
    .from("prerendered_pages")
    .select("html")
    .eq("path", path)
    .maybeSingle();

  if (data?.html) {
    return new Response(data.html, {
      headers: { "Content-Type": "text/html; charset=utf-8", "X-Cache": "hit" },
    });
  }

  return new Response("Not found", { status: 404, headers: { "X-Cache": "miss" } });
});
```

### Step 3 — Deploy the Worker

```bash
npm install -g wrangler
wrangler login
wrangler deploy
```

### Step 4 — Set Environment Variables

Cloudflare Dashboard → Worker → Settings → Variables:

| Variable | Value |
|----------|-------|
| `SUPABASE_URL` | `https://YOUR-PROJECT.supabase.co` |
| `SUPABASE_ANON_KEY` | Your Supabase anon key |
| `PAGES_ORIGIN` | Your app's origin URL (**must include `https://`**) |

> **`PAGES_ORIGIN` examples by host:**
> - Cloudflare Pages: `https://my-app.pages.dev`
> - Vercel: `https://my-app.vercel.app`
> - Netlify: `https://my-app.netlify.app`
> - Lovable: `https://my-id.lovable.app`
> - GitHub Pages: `https://user.github.io/repo`
> - Any server: `https://your-origin.com`

### Step 5 — Configure Worker Routes

Cloudflare → Websites → Your Domain → Workers Routes:

| Route | Worker |
|-------|--------|
| `yourdomain.com/*` | `your-worker-name` |
| `www.yourdomain.com/*` | `your-worker-name` |

⚠️ Use **Worker Routes**, not Pages Custom Domains.

---

## 📝 Populating the Cache

Generate HTML for each page and store it in `prerendered_pages`:

```typescript
await supabase.from("prerendered_pages").upsert(
  {
    path: "/about",
    title: "About Us",
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <title>About Us | YourApp</title>
  <meta name="description" content="Learn about our mission">
  <meta property="og:title" content="About Us">
  <link rel="canonical" href="https://yourdomain.com/about">
</head>
<body><h1>About Us</h1><p>Your content here...</p></body>
</html>`
  },
  { onConflict: "path" }
);
```

Schedule with `pg_cron` to keep the cache fresh every few hours.

---

## ✅ Verify It Works

```bash
# Human request — gets your SPA
curl -I https://yourdomain.com/
# → No X-Prerendered header

# Bot request — gets cached HTML
curl -I -H "User-Agent: Googlebot/2.1" https://yourdomain.com/
# → X-Prerendered: true, X-Cache: hit
```

---

## ⚠️ Common Mistakes

| Mistake | Fix |
|---------|-----|
| `PAGES_ORIGIN` missing `https://` | Always include the protocol |
| Bot Fight Mode enabled | Turn it OFF (Cloudflare → Security → Bots) |
| Domain added as Pages Custom Domain | Use Worker Routes instead |
| Empty cache table | Run your cache generator first |

---

## 🤝 Built for AI-Assisted Development

This repo is designed to be implemented by **AI coding assistants** like Lovable, Cursor, Bolt, or ChatGPT. Hand the setup guide to your AI, point it at your React app, and you'll have full SEO in under an hour.

The architecture is intentionally simple — two services (Cloudflare + Supabase), one Worker file, one Edge Function, one database table. Any AI agent can understand and implement it.

---

## License

MIT — use it, fork it, ship it.

---

**Serving 350,000+ SEO-optimized pages for $0/month since 2025.**

**Keywords:** react seo, react spa seo, react prerender, react server side rendering alternative, react cloudflare workers, react supabase, vite seo, cra seo, react google indexing, react open graph, react social sharing, spa prerendering, react bot detection, nextjs alternative, free react ssr, react crawlers, react ai crawlers, react schema markup, react meta tags, static site generation react
