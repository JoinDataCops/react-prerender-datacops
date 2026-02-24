/**
 * Serve Static Sitemaps — DB Lookup
 * 
 * Supabase Edge Function: supabase/functions/serve-sitemap/index.ts
 * 
 * Serves pre-built sitemaps from the `static_sitemaps` table.
 * Ultra-lightweight (~50ms response time).
 * 
 * Query params:
 *   ?file=sitemap-markets-1.xml
 *   ?file=sitemap-index.xml (default)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const filename = url.searchParams.get('file') || 'sitemap-index.xml';
    
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data, error } = await supabase
      .from('static_sitemaps')
      .select('content, generated_at, url_count')
      .eq('filename', filename)
      .single();

    if (error || !data?.content) {
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`,
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/xml; charset=utf-8' } }
      );
    }

    return new Response(data.content, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=1800',
        'X-Sitemap-Generated': data.generated_at || '',
        'X-Sitemap-Url-Count': String(data.url_count || 0),
      },
    });
  } catch (error) {
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`,
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/xml; charset=utf-8' } }
    );
  }
});
