-- =============================================================================
-- react-prerender-worker — Database Schema
-- Run this in your Supabase SQL Editor
-- =============================================================================

-- 1. Create the prerendered pages cache table
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

-- 2. Fast lookups by URL path
CREATE INDEX IF NOT EXISTS idx_prerendered_pages_path ON prerendered_pages(path);

-- 3. Enable RLS with public read access (bots need unauthenticated reads)
ALTER TABLE prerendered_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access"
  ON prerendered_pages FOR SELECT
  USING (true);

-- 4. Helper function to increment hit counters
CREATE OR REPLACE FUNCTION increment_hit_count(page_path TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE prerendered_pages
  SET hit_count = hit_count + 1,
      updated_at = now()
  WHERE path = page_path;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. (Optional) Auto-refresh cache every 6 hours via pg_cron
-- Uncomment after enabling the pg_cron extension in Supabase Dashboard → Database → Extensions
--
-- SELECT cron.schedule(
--   'refresh-prerender-cache',
--   '0 */6 * * *',
--   $$
--   SELECT net.http_post(
--     'https://YOUR-PROJECT.supabase.co/functions/v1/generate-cache',
--     '{}',
--     'application/json',
--     ARRAY[net.http_header('Authorization', 'Bearer YOUR-ANON-KEY')]
--   );
--   $$
-- );
