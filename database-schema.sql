-- ============================================================
-- Prerender System — Database Schema
-- Run this in Supabase SQL Editor to set up the required tables
-- ============================================================

-- 1. Prerendered Pages Cache
-- Stores server-rendered HTML for bot consumption
CREATE TABLE IF NOT EXISTS prerendered_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path TEXT UNIQUE NOT NULL,
  html TEXT NOT NULL,
  title TEXT,
  description TEXT,
  og_image TEXT,
  source_table TEXT,        -- e.g. 'markets', 'pillars_v2'
  source_id TEXT,           -- ID from source table
  content_type TEXT,
  hit_count INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast path lookups (critical for prerender performance)
CREATE INDEX IF NOT EXISTS idx_prerendered_pages_path 
  ON prerendered_pages(path);

-- Index for cache management (finding expired/stale entries)
CREATE INDEX IF NOT EXISTS idx_prerendered_pages_expires 
  ON prerendered_pages(expires_at);

-- Index for source-based updates (refresh when source data changes)
CREATE INDEX IF NOT EXISTS idx_prerendered_pages_source 
  ON prerendered_pages(source_table, source_id);


-- 2. Static Sitemaps Storage
-- Pre-built sitemap XML files served by serve-sitemap function
CREATE TABLE IF NOT EXISTS static_sitemaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT UNIQUE NOT NULL,
  content TEXT NOT NULL,
  url_count INTEGER DEFAULT 0,
  generated_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_static_sitemaps_filename 
  ON static_sitemaps(filename);


-- 3. Cron Job Run Tracking
-- Tracks each scheduled run for monitoring/debugging
CREATE TABLE IF NOT EXISTS cron_job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  markets_synced INTEGER DEFAULT 0,
  markets_failed INTEGER DEFAULT 0,
  error_message TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: allow insert/update for service, read for authenticated
ALTER TABLE cron_job_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow insert for cron jobs" ON cron_job_runs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update for cron jobs" ON cron_job_runs FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can view cron job runs" ON cron_job_runs FOR SELECT USING (true);


-- 4. Required DB Functions for pg_cron management
-- These are called by the manage-cron-job edge function

CREATE OR REPLACE FUNCTION public.schedule_cron_job(
  job_name text, job_schedule text, function_url text, auth_token text, request_body text DEFAULT '{}'
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  BEGIN PERFORM cron.unschedule(job_name); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule(
    job_name, job_schedule,
    format(
      'SELECT net.http_post(url:=%L, headers:=%L::jsonb, body:=%L::jsonb) as request_id',
      function_url,
      json_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || auth_token)::text,
      request_body
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.unschedule_cron_job(job_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM cron.unschedule(job_name);
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_cron_job_status(job_name text)
RETURNS TABLE(jobid bigint, schedule text, command text, active boolean)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT jobid, schedule, command, active FROM cron.job WHERE jobname = job_name;
$$;


-- 5. Optional: Direct pg_cron schedule (alternative to edge function)
--
-- SELECT cron.schedule(
--   'prerender-cache-refresh',
--   '0 * * * *',  -- Every hour
--   $$SELECT net.http_post(
--     url := 'https://YOUR_PROJECT.supabase.co/functions/v1/generate-prerender-cache',
--     headers := '{"Content-Type":"application/json","Authorization":"Bearer YOUR_ANON_KEY"}'::jsonb,
--     body := '{"market_limit": 4000}'::jsonb
--   )$$
-- );
