/**
 * D1 database helpers — typed wrappers around raw SQL.
 * All IDs are generated here via crypto.randomUUID().
 */

export interface PrerenderedPage {
  id: string;
  path: string;
  html: string;
  title: string | null;
  description: string | null;
  og_image: string | null;
  source_table: string | null;
  source_id: string | null;
  content_type: string | null;
  hit_count: number;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StaticSitemap {
  id: string;
  filename: string;
  content: string;
  url_count: number;
  generated_at: string;
  expires_at: string | null;
}

export interface CronJobRun {
  id: string;
  job_name: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  pages_synced: number;
  pages_failed: number;
  error_message: string | null;
  details: string | null;
  created_at: string;
}

export async function getPrerenderedPage(
  db: D1Database,
  path: string,
): Promise<PrerenderedPage | null> {
  const result = await db
    .prepare(
      'SELECT id, html, title, description, og_image, hit_count, expires_at FROM prerendered_pages WHERE path = ?',
    )
    .bind(path)
    .first<PrerenderedPage>();
  return result ?? null;
}

export async function incrementHitCount(db: D1Database, path: string): Promise<void> {
  await db
    .prepare('UPDATE prerendered_pages SET hit_count = hit_count + 1 WHERE path = ?')
    .bind(path)
    .run();
}

export async function upsertPrerenderedPage(
  db: D1Database,
  data: {
    path: string;
    html: string;
    title?: string;
    description?: string;
    og_image?: string;
    source_table?: string;
    source_id?: string;
    expires_at?: string;
  },
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO prerendered_pages (id, path, html, title, description, og_image, source_table, source_id, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET
         html         = excluded.html,
         title        = excluded.title,
         description  = excluded.description,
         og_image     = excluded.og_image,
         source_table = excluded.source_table,
         source_id    = excluded.source_id,
         expires_at   = excluded.expires_at,
         updated_at   = excluded.updated_at`,
    )
    .bind(
      crypto.randomUUID(),
      data.path,
      data.html,
      data.title ?? null,
      data.description ?? null,
      data.og_image ?? null,
      data.source_table ?? null,
      data.source_id ?? null,
      data.expires_at ?? null,
      now,
      now,
    )
    .run();
}

export async function deletePrerenderedPage(db: D1Database, path: string): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM prerendered_pages WHERE path = ?')
    .bind(path)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function clearAllPrerenderedPages(db: D1Database): Promise<number> {
  const result = await db.prepare('DELETE FROM prerendered_pages').run();
  return result.meta.changes ?? 0;
}

export async function getPrerenderedPageStats(db: D1Database): Promise<{
  total: number;
  expired: number;
  totalHits: number;
}> {
  const now = new Date().toISOString();
  const [total, expired, hits] = await Promise.all([
    db.prepare('SELECT COUNT(*) as n FROM prerendered_pages').first<{ n: number }>(),
    db
      .prepare('SELECT COUNT(*) as n FROM prerendered_pages WHERE expires_at IS NOT NULL AND expires_at < ?')
      .bind(now)
      .first<{ n: number }>(),
    db.prepare('SELECT SUM(hit_count) as n FROM prerendered_pages').first<{ n: number }>(),
  ]);
  return {
    total: total?.n ?? 0,
    expired: expired?.n ?? 0,
    totalHits: hits?.n ?? 0,
  };
}

export async function getStaticSitemap(
  db: D1Database,
  filename: string,
): Promise<StaticSitemap | null> {
  const result = await db
    .prepare('SELECT * FROM static_sitemaps WHERE filename = ?')
    .bind(filename)
    .first<StaticSitemap>();
  return result ?? null;
}

export async function upsertStaticSitemap(
  db: D1Database,
  data: { filename: string; content: string; url_count: number; expires_at?: string },
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO static_sitemaps (id, filename, content, url_count, generated_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(filename) DO UPDATE SET
         content      = excluded.content,
         url_count    = excluded.url_count,
         generated_at = excluded.generated_at,
         expires_at   = excluded.expires_at`,
    )
    .bind(
      crypto.randomUUID(),
      data.filename,
      data.content,
      data.url_count,
      now,
      data.expires_at ?? null,
    )
    .run();
}

export async function createCronRun(db: D1Database, jobName: string): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO cron_job_runs (id, job_name, status, started_at, created_at)
       VALUES (?, ?, 'running', ?, ?)`,
    )
    .bind(id, jobName, now, now)
    .run();
  return id;
}

export async function updateCronRun(
  db: D1Database,
  id: string,
  data: {
    status: 'completed' | 'failed';
    pages_synced?: number;
    pages_failed?: number;
    error_message?: string;
    details?: object;
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE cron_job_runs SET
         status        = ?,
         completed_at  = ?,
         pages_synced  = ?,
         pages_failed  = ?,
         error_message = ?,
         details       = ?
       WHERE id = ?`,
    )
    .bind(
      data.status,
      new Date().toISOString(),
      data.pages_synced ?? 0,
      data.pages_failed ?? 0,
      data.error_message ?? null,
      data.details ? JSON.stringify(data.details) : null,
      id,
    )
    .run();
}

export async function clearStuckCronRuns(db: D1Database, jobName: string): Promise<number> {
  const result = await db
    .prepare(
      `UPDATE cron_job_runs SET
         status        = 'failed',
         completed_at  = ?,
         error_message = 'Manually cleared stuck run'
       WHERE job_name = ? AND status = 'running'`,
    )
    .bind(new Date().toISOString(), jobName)
    .run();
  return result.meta.changes ?? 0;
}

export async function getCronRuns(
  db: D1Database,
  jobName?: string,
  limit = 20,
): Promise<CronJobRun[]> {
  const sql = jobName
    ? 'SELECT * FROM cron_job_runs WHERE job_name = ? ORDER BY started_at DESC LIMIT ?'
    : 'SELECT * FROM cron_job_runs ORDER BY started_at DESC LIMIT ?';
  const stmt = jobName
    ? db.prepare(sql).bind(jobName, limit)
    : db.prepare(sql).bind(limit);
  const result = await stmt.all<CronJobRun>();
  return result.results;
}
