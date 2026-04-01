-- ============================================================
-- Prerender System — D1 (SQLite) Database Schema
-- Cloudflare D1 drop-in replacement for Supabase Postgres
--
-- Apply with:
--   wrangler d1 execute <DB_NAME> --file=./cloudflare/d1-schema.sql
-- Or via CLI:
--   cf-prerender migrate
-- ============================================================

-- 1. Prerendered Pages Cache
--    Stores server-rendered HTML for bot consumption
CREATE TABLE IF NOT EXISTS prerendered_pages (
  id           TEXT PRIMARY KEY,
  path         TEXT UNIQUE NOT NULL,
  html         TEXT NOT NULL,
  title        TEXT,
  description  TEXT,
  og_image     TEXT,
  source_table TEXT,
  source_id    TEXT,
  content_type TEXT,
  hit_count    INTEGER NOT NULL DEFAULT 0,
  expires_at   TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_prerendered_pages_path
  ON prerendered_pages(path);

CREATE INDEX IF NOT EXISTS idx_prerendered_pages_expires
  ON prerendered_pages(expires_at);

CREATE INDEX IF NOT EXISTS idx_prerendered_pages_source
  ON prerendered_pages(source_table, source_id);


-- 2. Static Sitemaps Storage
--    Pre-built sitemap XML files served directly from D1
CREATE TABLE IF NOT EXISTS static_sitemaps (
  id           TEXT PRIMARY KEY,
  filename     TEXT UNIQUE NOT NULL,
  content      TEXT NOT NULL,
  url_count    INTEGER NOT NULL DEFAULT 0,
  generated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_static_sitemaps_filename
  ON static_sitemaps(filename);


-- 3. Cron Job Run Tracking
--    Tracks each scheduled run for monitoring/debugging
--    (Replaces Supabase pg_cron — use Cloudflare Cron Triggers instead)
CREATE TABLE IF NOT EXISTS cron_job_runs (
  id             TEXT PRIMARY KEY,
  job_name       TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'running',
  started_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  completed_at   TEXT,
  pages_synced   INTEGER NOT NULL DEFAULT 0,
  pages_failed   INTEGER NOT NULL DEFAULT 0,
  error_message  TEXT,
  details        TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_cron_job_runs_job_name
  ON cron_job_runs(job_name);

CREATE INDEX IF NOT EXISTS idx_cron_job_runs_status
  ON cron_job_runs(status);

CREATE INDEX IF NOT EXISTS idx_cron_job_runs_started
  ON cron_job_runs(started_at DESC);
