/**
 * Prerender Edge Function — Cache Lookup
 * 
 * Supabase Edge Function: supabase/functions/prerender/index.ts
 * 
 * Returns cached HTML on hit (200), or 404 on miss.
 * The middleware falls back to serving the SPA on 404.
 * 
 * Table: prerendered_pages
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.searchParams.get('path') || '/';

    console.log(`Prerender request for path: ${path}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: cached, error } = await supabase
      .from('prerendered_pages')
      .select('html, expires_at, hit_count')
      .eq('path', path)
      .maybeSingle();

    if (error) {
      console.error('Cache lookup error:', error);
    }

    if (cached?.html) {
      const isExpired = cached.expires_at && new Date(cached.expires_at) < new Date();
      console.log(`Cache ${isExpired ? 'stale' : 'hit'} for ${path}`);

      // Fire-and-forget hit count increment
      supabase
        .from('prerendered_pages')
        .update({ hit_count: (cached.hit_count || 0) + 1 })
        .eq('path', path)
        .then(() => {});

      return new Response(cached.html, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/html; charset=utf-8',
          'X-Prerendered': 'true',
          'X-Cache': isExpired ? 'stale' : 'hit',
          'Cache-Control': 'public, max-age=3600, s-maxage=86400',
        },
      });
    }

    // Cache miss → return 404 so the middleware falls back to SPA
    console.log(`Cache miss for ${path}`);
    return new Response(JSON.stringify({ error: 'not_cached', path }), {
      status: 404,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'X-Cache': 'miss',
      },
    });

  } catch (error: unknown) {
    console.error('Prerender error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }
});
