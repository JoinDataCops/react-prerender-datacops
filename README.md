# react-prerender-worker

> Pre-rendering infrastructure for React SPAs. Full SEO without framework migration.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare)](https://workers.cloudflare.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Edge_Functions-3ECF8E?logo=supabase)](https://supabase.com/)

A Cloudflare Worker that serves pre-rendered HTML to search engines and AI crawlers, while routing humans to your unmodified SPA. No framework changes. No build pipeline modifications. Works with any static SPA hosted anywhere.

**Tested in production with 9,000+ pages at $0/month.**

---

## The Problem

React SPAs ship this to every crawler:

```html
<html>
  <body>
    <div id="root"></div>
    <script src="/assets/index.js"></script>
  </body>
</html>
```

Search engines and AI crawlers (GPTBot, ClaudeBot, PerplexityBot) either can't or won't execute JavaScript to render your content. [70% of modern websites are invisible to AI crawlers](https://spruik.ai) — and every React SPA built on platforms like Lovable, Bolt.new, v0, Cursor, or Replit ships with this limitation by default.

The standard industry advice is to migrate to a server-rendered framework. For applications built in minutes by AI tools, that's a disproportionate solution.

This repo provides a simpler path: a drop-in pre-rendering layer that requires zero changes to your existing application.

---

## How It Works

```
                    yoursite.com
                        │
                        ▼
              ┌─────────────────────┐
              │  Cloudflare Worker  │
              │   (Bot Detection)   │
              └─────────────────────┘
                   │           │
            Bot? ──┘           └── Human?
              │                     │
              ▼                     ▼
     ┌────────────────┐    ┌────────────────┐
     │   Supabase DB  │    │ Cloudflare CDN │
     │  (Pre-rendered  │    │  (Your SPA,    │
     │   HTML + meta)  │    │   unmodified)  │
     └────────────────┘    └────────────────┘
```

1. A Cloudflare Worker inspects the `User-Agent` on every request (~1ms overhead)
2. **Crawlers** receive pre-built HTML with full meta tags, Open Graph, and Schema.org markup from Supabase
3. **Users** are proxied to your SPA on the CDN — zero impact on user experience
4. Cache auto-refreshes via `pg_cron` — no manual maintenance

---

## Platform Compatibility

Built and tested with AI app builders, but works with any SPA.

| Platform | Output | Compatible |
|----------|--------|:----------:|
| Lovable | React + Vite | ✅ |
| Bolt.new | React + Vite | ✅ |
| v0 (Vercel) | React | ✅ |
| Cursor | Any SPA | ✅ |
| Replit | Any SPA | ✅ |

### Frameworks

| Framework | Notes |
|-----------|-------|
| React + Vite | Primary target, production-tested |
| Create React App | Drop-in, no ejection needed |
| Remix (SPA mode) | Client-side Remix |
| Vue.js | Any Vue SPA |
| Svelte / SvelteKit | Static adapter |
| Angular | Standard CLI builds |
| Astro | Client-rendered pages |
| Any static SPA | If it builds to HTML/JS/CSS |

### Hosting

The Worker proxies to any origin. Your app can live anywhere:

| Host | `PAGES_ORIGIN` example |
|------|----------------------|
| Cloudflare Pages | `https://your-project.pages.dev` |
| Vercel | `https://your-project.vercel.app` |
| Netlify | `https://your-project.netlify.app` |
| Lovable | `https://your-id.lovable.app` |
| GitHub Pages | `https://user.github.io/repo` |
| Firebase Hosting | `https://your-project.web.app` |
| Any server | Any URL with HTTPS |

---

## Comparison with SSR Frameworks

This is not a replacement for server-side rendering. It's an alternative approach when SSR migration is impractical.

| | This solution | SSR framework (e.g., Next.js) |
|---|:---:|:---:|
| **Monthly cost** | $0 (free tiers) | $20–$100+ (hosting + bandwidth) |
| **Bot response time** | ~50ms (edge cache) | ~200–500ms (server render) |
| **Migration effort** | None — add-on layer | Full application rewrite |
| **Vendor lock-in** | None | [Documented concerns](https://www.reddit.com/r/nextjs/comments/1gydkmu/is_nextjs_a_vendor_lockin_architecture/) |
| **Pages supported** | 9,000+ (production-tested) | Varies by tier |
| **Global distribution** | Edge (300+ cities) | Regional servers |
| **User experience** | Pure SPA (instant navigation) | SSR + hydration |
| **Cache management** | Automated (pg_cron) | Manual ISR configuration |
| **Setup time** | ~30 minutes | Days to weeks |

### When to use this instead

- Your app was built with an AI tool and migration isn't practical
- You need SEO for a SPA without rewriting your codebase
- You want to keep your existing hosting and framework
- You need $0 infrastructure costs at scale

### When SSR is the better choice

- You're starting a new project from scratch
- You need real-time server-rendered content
- Your team is already experienced with Next.js/Nuxt/SvelteKit

---

## A Note on "AI Visibility" Services

A growing category of startups (often VC-funded) offer subscription-based "AI visibility" and "Generative Engine Optimization" tools — monitoring how your brand appears in ChatGPT, tracking AI citations, generating optimized content for LLMs.

These tools address a real need, but they operate at a layer above a more fundamental requirement: **AI crawlers need to be able to read your HTML in the first place.**

If your site is a client-rendered SPA, crawlers see an empty `<div>`. No amount of citation optimization or brand monitoring changes that.

```
    ┌─────────────────────────────────┐
    │  5. Brand sentiment tracking    │  ← Paid services
    │  4. AI citation optimization    │  ← Paid services
    │  3. Content strategy for LLMs   │  ← Paid services
    │  2. Schema.org + structured data│  ← This repo (free)
    │  1. Crawlers can read your HTML │  ← This repo (free)
    └─────────────────────────────────┘
```

This repo handles layers 1 and 2. Everything above is optional — and only effective once the foundation is in place.

---

## Bot Detection

The Worker recognizes 100+ crawler patterns out of the box:

| Category | Examples |
|----------|---------|
| Search engines | Googlebot, Bingbot, Yandex, Baidu, DuckDuckGo |
| AI crawlers | GPTBot, ClaudeBot, PerplexityBot, Google-Extended, Gemini |
| Social platforms | Facebook, Twitter/X, LinkedIn, WhatsApp, Discord |
| SEO tools | Ahrefs, SEMrush, Screaming Frog, Moz |
| Platform bots | Applebot, AmazonBot, PetalBot |
| Feed readers | Feedly, Flipboard, NewsBlur |
| Archives | Wayback Machine, Archive.org |

---

## Setup (~30 minutes)

### Prerequisites (all free tier)

- A deployed SPA (any host)
- [Supabase](https://supabase.com) account
- [Cloudflare](https://cloudflare.com) account
- Domain DNS managed by Cloudflare

### 1. Create the cache table

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

### 2. Deploy the prerender edge function

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

### 3. Deploy the Worker

```bash
npm install -g wrangler
wrangler login
wrangler deploy
```

### 4. Set environment variables

Cloudflare Dashboard → Worker → Settings → Variables:

| Variable | Value |
|----------|-------|
| `SUPABASE_URL` | `https://YOUR-PROJECT.supabase.co` |
| `SUPABASE_ANON_KEY` | Your Supabase anon key |
| `PAGES_ORIGIN` | Your app's origin URL (include `https://`) |

### 5. Configure Worker routes

Cloudflare → Websites → Your Domain → Workers Routes:

| Route | Worker |
|-------|--------|
| `yourdomain.com/*` | `your-worker-name` |
| `www.yourdomain.com/*` | `your-worker-name` |

Use **Worker Routes**, not Pages Custom Domains.

### 6. Automate cache refresh (recommended)

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

---

## Populating the Cache

Store pre-rendered HTML for each route:

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

## Verification

```bash
# Human request — proxied to your SPA
curl -I https://yourdomain.com/
# → No X-Prerendered header

# Bot request — served from cache
curl -I -H "User-Agent: Googlebot/2.1" https://yourdomain.com/
# → X-Prerendered: true, X-Cache: hit
```

---

## FAQ

### Is this cloaking?

No. Google explicitly documents this approach as [dynamic rendering](https://developers.google.com/search/docs/crawling-indexing/javascript/dynamic-rendering) and distinguishes it from cloaking. The requirement is that the content served to crawlers matches what users see — which it does, since the pre-rendered HTML reflects the same content the SPA renders client-side.

### Can this handle large sites?

Production-tested with 9,000+ pages, auto-refreshed every 6 hours on Supabase's free tier.

### What about the initial load for users?

Users see a brief loading state (~1s) while the SPA boots. After that, all navigation is instant with no server round-trips. The crawlers that drive your traffic see full content immediately.

### Why not just use Next.js?

Next.js is excellent software. But migrating an existing SPA — especially one generated by an AI tool — requires rewriting routes, learning server components, configuring ISR, and often committing to a specific hosting provider. This solution achieves crawler visibility without any of that.

---

## Common Issues

| Issue | Solution |
|-------|---------|
| `PAGES_ORIGIN` missing protocol | Always include `https://` |
| Bot Fight Mode enabled | Disable in Cloudflare → Security → Bots |
| Domain added as Pages Custom Domain | Use Worker Routes instead |
| Empty cache table | Run your cache generator first |

---

## Contributing

Contributions are welcome. Please open an issue to discuss proposed changes before submitting a PR.

---

## License

MIT

---

**Keywords:** react seo, react spa seo, react prerender, vite seo, spa prerendering, react google indexing, react open graph, react social sharing, react bot detection, react ai crawlers, react schema markup, react meta tags, cloudflare worker seo, lovable seo, ai app seo, dynamic rendering react, react prerender cloudflare, ai crawler react, llm visibility, generative engine optimization, ai search optimization
