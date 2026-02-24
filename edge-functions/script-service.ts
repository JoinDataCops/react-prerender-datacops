/**
 * Script Service — Central registry of all 3rd-party scripts.
 * 
 * Supabase Edge Function: supabase/functions/script-service/index.ts
 * 
 * The Cloudflare Pages middleware calls this function and injects
 * the returned scripts into every HTML response (bots + humans).
 * 
 * This eliminates hardcoded scripts in index.html and ensures
 * analytics run in a first-party context, bypassing reverse proxy
 * and host-header limitations.
 * 
 * To add/remove a script: edit the SCRIPTS object below and redeploy.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Cache-Control': 'public, max-age=300, s-maxage=300',
};

const SCRIPTS = {
  head: [
    // -- Add head scripts here --
    // Example: Google Analytics
    // `<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXX"></script>
    //  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-XXXXX');</script>`,
    
    // Example: Any analytics or tracking pixel
    // `<script src="https://your-analytics.com/tracker.js" data-site="your-site"></script>`,
  ] as string[],
  body: [
    // -- Add body-end scripts here --
  ] as string[],
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(JSON.stringify(SCRIPTS), {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
});
