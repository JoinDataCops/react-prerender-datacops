/**
 * Script Service — Central registry of 3rd-party scripts.
 *
 * The middleware fetches this and injects the returned tags into
 * every HTML response (bots + humans).
 *
 * To add/remove a script: edit the SCRIPTS object below and redeploy.
 *
 * GET /api/scripts
 */

const SCRIPTS = {
  head: [
    // ── Add <head> scripts here ──────────────────────────────────
    //
    // Google Analytics example:
    // `<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXX"></script>
    //  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-XXXXX');</script>`,
    //
    // Any pixel or head-injection snippet:
    // `<script src="https://cdn.example.com/tracker.js" data-site="YOUR_ID"></script>`,
  ] as string[],
  body: [
    // ── Add <body> end scripts here ──────────────────────────────
  ] as string[],
};

export function handleScripts(req: Request): Response {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify(SCRIPTS), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}
