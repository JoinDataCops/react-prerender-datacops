/**
 * Supabase Management API client
 * Docs: https://api.supabase.com/api/v1
 *
 * Auth: Personal Access Token from https://app.supabase.com/account/tokens
 */

const BASE = 'https://api.supabase.com/v1';

export class SupabaseApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'SupabaseApiError';
  }
}

async function sbFetch<T>(token: string, path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json() as { message?: string; error?: string };
      msg = body.message ?? body.error ?? msg;
    } catch {}
    throw new SupabaseApiError(msg, res.status);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : ({} as T);
}

// ── User ──────────────────────────────────────────────────────────────────────

export interface SbUser {
  id: string;
  email: string;
  username?: string;
}

export async function getSbUser(token: string): Promise<SbUser> {
  return sbFetch<SbUser>(token, '/profile');
}

// ── Projects ──────────────────────────────────────────────────────────────────

export interface SbProject {
  id: string;
  ref: string;
  name: string;
  status: string;
  region: string;
  organization_id: string;
  db_host: string;
  inserted_at: string;
}

export async function listSbProjects(token: string): Promise<SbProject[]> {
  return sbFetch<SbProject[]>(token, '/projects');
}

export async function getSbProject(token: string, ref: string): Promise<SbProject> {
  return sbFetch<SbProject>(token, `/projects/${ref}`);
}

// ── API Keys ──────────────────────────────────────────────────────────────────

export interface SbApiKey {
  name: string;
  api_key: string;
}

export async function getSbApiKeys(token: string, ref: string): Promise<SbApiKey[]> {
  return sbFetch<SbApiKey[]>(token, `/projects/${ref}/api-keys`);
}

// ── Database ──────────────────────────────────────────────────────────────────

export interface SbQueryResult {
  rows?: Record<string, unknown>[];
}

export async function executeSbSql(
  token: string,
  ref: string,
  query: string,
): Promise<SbQueryResult> {
  return sbFetch<SbQueryResult>(token, `/projects/${ref}/database/query`, {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
}

/** Split a multi-statement SQL file and execute each statement individually. */
export async function executeSbSqlFile(
  token: string,
  ref: string,
  sql: string,
): Promise<void> {
  // Strip single-line comments per line first, then split on semicolons
  const statements = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    try {
      await executeSbSql(token, ref, stmt);
    } catch (err) {
      // Skip "already exists" errors from IF NOT EXISTS failures on older pg
      if (err instanceof SupabaseApiError) {
        const msg = err.message.toLowerCase();
        if (msg.includes('already exists') || msg.includes('duplicate')) continue;
      }
      throw err;
    }
  }
}

// ── Edge Functions ────────────────────────────────────────────────────────────

export interface SbFunction {
  id: string;
  slug: string;
  name: string;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export async function listSbFunctions(token: string, ref: string): Promise<SbFunction[]> {
  return sbFetch<SbFunction[]>(token, `/projects/${ref}/functions`);
}

/** Deploy/update a single edge function. `body` is the Deno TypeScript source. */
export async function deploySbFunction(
  token: string,
  ref: string,
  slug: string,
  name: string,
  body: string,
): Promise<SbFunction> {
  // Check if function exists
  let exists = false;
  try {
    await sbFetch<SbFunction>(token, `/projects/${ref}/functions/${slug}`);
    exists = true;
  } catch (err) {
    if (err instanceof SupabaseApiError && err.status !== 404) throw err;
  }

  const payload = { slug, name, body, verify_jwt: true };

  if (exists) {
    return sbFetch<SbFunction>(token, `/projects/${ref}/functions/${slug}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  return sbFetch<SbFunction>(token, `/projects/${ref}/functions`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ── Secrets / Env Vars ────────────────────────────────────────────────────────

export async function setSbSecrets(
  token: string,
  ref: string,
  secrets: Record<string, string>,
): Promise<void> {
  const payload = Object.entries(secrets).map(([name, value]) => ({ name, value }));
  await sbFetch<unknown>(token, `/projects/${ref}/secrets`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
