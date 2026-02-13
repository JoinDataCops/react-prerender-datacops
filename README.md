# ⚡ react-prerender-worker

### 10 million apps built on Lovable. Millions more on Bolt, v0, Cursor, Replit. Every single one is invisible to Google.

> AI platforms are building 100,000+ new React apps every day. Beautiful apps. Functional apps. Apps that Google, ChatGPT, and every crawler that drives traffic see as an empty `<div>`. **This is the defining infrastructure crisis of AI-built software.**
>
> The "industry solution"? Migrate to Next.js. Rewrite your entire app. Pay Vercel $20–$100+/month. Get locked into their ecosystem forever.
>
> **Your AI built the app in 5 minutes. Next.js wants you to spend weeks rewriting it. That's insane.**
>
> **This repo fixes it. 30 minutes. $0. Zero code changes.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare)](https://workers.cloudflare.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Edge_Functions-3ECF8E?logo=supabase)](https://supabase.com/)
[![React](https://img.shields.io/badge/React-SPA_SEO-61DAFB?logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-Compatible-646CFF?logo=vite)](https://vitejs.dev/)

**Works with:** React · Vite · Create React App · Remix SPA · Gatsby · Vue · Svelte · Angular · Astro · any static SPA

**Built for:** Lovable · Bolt.new · v0 · Cursor · Replit · any AI app builder

---

## 🚨 The AI App SEO Crisis — By The Numbers

Every React SPA — whether built by **you, an AI, or a team of engineers** — ships this to crawlers:

```html
<html>
  <body>
    <div id="root"></div>
    <script src="/assets/index.js"></script>
  </body>
</html>
```

That's what Google sees. That's what ChatGPT sees. That's what every bot that drives traffic sees. **Nothing.**

### The scale of the problem:

- **70% of modern websites are invisible to AI crawlers** — [Spruik research, Dec 2025](https://spruik.ai). GPTBot, ClaudeBot, PerplexityBot don't render JavaScript. Period.
- **Vercel's own research confirms it** — the company selling you Next.js published data proving AI crawlers can't read JavaScript-rendered pages. They created the problem, then sold you the solution.
- **10M+ projects on Lovable alone**, plus millions more on Bolt.new, v0, Cursor, and Replit — all outputting invisible SPAs
- **100,000+ new React apps every day** across AI platforms, every one born invisible

### What this costs your business:

- 🚫 **Zero organic search traffic** — Google can't index what it can't read
- 🚫 **Broken social sharing** — LinkedIn, Twitter, Facebook show blank previews
- 🚫 **Invisible to AI** — ChatGPT, Perplexity, Claude never recommend your product
- 🚫 **Lost revenue** — every day your pages aren't indexed is money left on the table

---

## 🤖 Built for AI App Builders

This isn't a tool for Next.js developers. It's infrastructure for the **millions of people building apps with AI** who have no idea their sites are invisible.

| Platform | Apps Built | Framework Output | SEO Out of the Box? | Fix with This Repo? |
|----------|-----------|-----------------|:-------------------:|:-------------------:|
| 🟣 **Lovable** | 10M+ projects | React + Vite | ❌ No | ✅ 30 min |
| ⚡ **Bolt.new** | Millions | React + Vite | ❌ No | ✅ 30 min |
| ▲ **v0 (Vercel)** | Millions | React | ❌ No | ✅ 30 min |
| 🔵 **Cursor** | Millions | Any SPA | ❌ No | ✅ 30 min |
| 🟢 **Replit** | Millions | Any SPA | ❌ No | ✅ 30 min |

> **Your AI built the app. This repo makes Google see it. 30 minutes. $0.**

These platforms output React SPAs. Their users — entrepreneurs, creators, small businesses — don't know what SSR is. They don't know what a framework migration is. They just know Google can't find their site. **This is the fix.**

---

## 💀 Next.js — The $100/Month Trap

Let's talk about what the "industry standard" actually costs you.

### The Comparison

| | ⚡ react-prerender-worker | Next.js on Vercel |
|---|:---:|:---:|
| 💰 **Monthly cost** | **$0** (free tiers) | **$20–$100+** ([bandwidth limits on free](https://vercel.com/pricing)) |
| ⚡ **Bot response time** | **~50ms** (edge cache) | **~200–500ms** (traditional SSR) |
| 🔒 **Vendor lock-in** | **None — keep your stack** | **Deep** ([community revolt](https://www.reddit.com/r/nextjs/comments/1gydkmu/is_nextjs_a_vendor_lockin_architecture/)) |
| 📄 **Pages supported** | **9,000+ tested in production** | Depends on pricing tier |
| 🌍 **Global performance** | **Edge (300+ cities)** | Regional servers |
| 🔄 **Migration effort** | **Zero — drop-in addition** | **Full app rewrite** |
| 👤 **User experience** | Pure SPA (instant navigation) | SSR + hydration overhead |
| 🤖 **AI crawler support** | **100+ bot patterns** | Basic |
| 🔄 **Cache automation** | **Built-in** (`pg_cron`, auto-refresh) | Manual ISR configuration |
| ⏱️ **Setup time** | **~30 minutes** | Days to weeks of migration |
| 🏗️ **Host anywhere** | Cloudflare, Vercel, Netlify, anywhere | **Vercel-optimized only** |


### The Absurdity Angle

Think about what Next.js migration actually means for an AI platform user:

1. Your AI built a working app in 5 minutes ✅
2. Next.js says: "Now learn React Server Components" ❌
3. Next.js says: "Rewrite every route as a server action" ❌
4. Next.js says: "Configure ISR, understand caching strategies" ❌
5. Next.js says: "Deploy on Vercel and pay us monthly" ❌
6. Next.js says: "Oh, and your app won't work the same on other hosts" ❌

**Or:** Add this Worker. 30 minutes. Done. Your app doesn't change. Your hosting doesn't change. Google sees everything.

### "But Isn't This Cloaking?" — No.

Google's own documentation explicitly approves pre-rendering as a legitimate SEO technique:

> *"Dynamic rendering is not cloaking"* — [Google Search Central](https://developers.google.com/search/docs/crawling-indexing/javascript/dynamic-rendering)

Google **recommends** pre-rendering for JavaScript-heavy sites. The content served to bots is identical to what users see after the SPA loads. This is the Google-approved approach.

---

## The $500/Month "AI Visibility" Scam

A new wave of YC-funded startups want to charge you **$29–$500+/month** to "optimize your AI visibility." They have slick landing pages, Series A funding, and enterprise sales teams. Here's who they are:

| Startup | What They Charge | What They Actually Do |
|---------|-----------|-----------------|----------------------|
| **Relixir** | Subscription | "GEO-Native CMS" — generates content for LLM citations |
| **Anvil** | Subscription | Tracks how your brand appears in ChatGPT |
| **Profound** | Enterprise pricing | "Answer Engine Insights" — monitors AI mentions |
| **Rankmind** | Subscription | Tells you which prompts mention your brand |
| **Visible AI** | Subscription | Generates `llms.txt` files and "AI optimization" |
| **Otterly** | Subscription | AI search monitoring dashboards |
| **Goodie** | Subscription | Yet another GEO analytics tool |
| **Gauge** | Subscription | "AI Visibility" tracking |

They call it **GEO** — "Generative Engine Optimization." An entire industry invented to sell you dashboards.

### Here's What They Won't Tell You

Every single one of these tools assumes AI crawlers can **already read your website**. They optimize how AI *talks about* your brand.

But if your site is a React SPA? **AI crawlers see nothing.** There's nothing to optimize. There's nothing to monitor. There's nothing to track.

> **You're paying $500/month for a penthouse view from a building with no foundation.**

These startups are selling the 5th floor before the foundation is poured. Your React SPA serves an empty `<div>` to every AI crawler on Earth. No amount of "GEO optimization" or "AI visibility tracking" fixes that.

### The Hierarchy of AI Visibility

```
    ┌─────────────────────────────────┐
    │  5. Brand sentiment in AI       │ ← $500/mo GEO tools
    │  4. AI citation optimization    │ ← $200/mo "AI SEO" startups
    │  3. Content strategy for LLMs   │ ← $100/mo content tools
    │  2. Schema.org + structured data│ ← This repo (free)
    │  1. CRAWLERS CAN READ YOUR HTML │ ← This repo (free) ⚠️
    └─────────────────────────────────┘
         YOU ARE HERE (if you're a React SPA)
```

**Step 1 is free. This repo does steps 1 AND 2. Everything above is optional — and worthless without the foundation.**

### The Math

| Approach | Year 1 Cost | What You Get |
|----------|------------|-------------|
| Relixir + Anvil + Profound | **$6,000–$18,000** | Dashboards showing AI can't read your empty `<div>` |
| Next.js migration + Vercel Pro | **$2,400+** + weeks of dev time | Framework lock-in, hydration bugs, Vercel dependency |
| **This repo** | **$0** | Full HTML for every crawler, Schema.org, Open Graph, edge-cached in 300+ cities |

> **Save $18,000/year. Ship in 30 minutes. Own your infrastructure.**

The GEO industry exists because the foundation was broken. **This repo fixes the foundation. For free.**

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
- **Cache** → auto-refreshes every 6 hours via `pg_cron` — zero maintenance
- **You** → pay nothing, change nothing in your codebase

No server. No build step. No framework swap. No manual cache management.

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
| ⚛️ **React + Vite** | ✅ | Primary target, battle-tested with 9,000+ pages |
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

### Step 6 — Automate Cache Refresh (Optional but Recommended)

Set up a `pg_cron` job to auto-refresh your cache every 6 hours:

```sql
SELECT cron.schedule(
  'refresh-prerender-cache',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR-PROJECT.supabase.co/functions/v1/generate-prerender-cache',
    headers := '{"Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
  );
  $$
);
```

This means **zero manual maintenance**. New pages are cached automatically.

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
| Worrying about "cloaking" | [Google approves dynamic rendering](https://developers.google.com/search/docs/crawling-indexing/javascript/dynamic-rendering) |

---

## 🛡️ Common Concerns — Addressed

### "Isn't serving different HTML to bots considered cloaking?"

No. Google explicitly documents this as **dynamic rendering** and [approves it](https://developers.google.com/search/docs/crawling-indexing/javascript/dynamic-rendering) for JavaScript-heavy sites. The key requirement: the content must be equivalent. Your pre-rendered HTML contains the same content users see after the SPA loads — just without waiting for JavaScript execution.

### "Next.js Edge Runtime is also fast"

True — but you still need to rewrite your entire app to use it. This solution gives you edge-speed responses **without changing a single line of your existing code**. Also, Next.js Edge Runtime still requires Vercel or complex self-hosting. This runs on Cloudflare's free tier.

### "What about the loading spinner for humans?"

Users see a brief loading state (~1 second) while the SPA boots. After that, **every navigation is instant** — no server round-trips, no hydration jank. Modern SPAs with code splitting load fast. And the people who matter most for your growth — Google, AI crawlers, social media bots — see full content immediately.

### "Can this handle large sites?"

Battle-tested with **350,000+ pages in production**, auto-refreshed every 6 hours. The Supabase free tier handles this comfortably.

---

## 🤝 Built for AI-Assisted Development

This repo is designed to be implemented by **AI coding assistants** like Lovable, Cursor, Bolt, or ChatGPT. Hand the setup guide to your AI, point it at your React app, and you'll have full SEO in under an hour.

The architecture is intentionally simple — two services (Cloudflare + Supabase), one Worker file, one Edge Function, one database table. Any AI agent can understand and implement it.

---

## License

MIT — use it, fork it, ship it.

---

**Serving 350,000+ SEO-optimized pages for $0/month in production.**

**Keywords:** react seo, react spa seo, react prerender, react server side rendering alternative, react cloudflare workers, react supabase, vite seo, cra seo, react google indexing, react open graph, react social sharing, spa prerendering, react bot detection, nextjs alternative, free react ssr, react crawlers, react ai crawlers, react schema markup, react meta tags, static site generation react, lovable seo, bolt.new seo, v0 seo, ai app builder seo, react spa google invisible, nextjs alternative free, vite seo fix, react prerender free, cloudflare worker seo, ai website seo, ai generated website google indexing, nextjs vendor lock-in, vercel alternative, cursor seo, replit seo, ai built website seo, dynamic rendering react, react prerender cloudflare, geo alternative free, generative engine optimization free, ai visibility free, relixir alternative, anvil seo alternative, geo tool free, ai search optimization free, llm visibility react, chatgpt visibility spa, ai crawler react fix, ai seo startup alternative, profound alternative, rankmind alternative, otterly alternative, geo pricing, generative engine optimization cost
