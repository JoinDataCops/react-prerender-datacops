/**
 * Cloudflare REST API client
 * Docs: https://developers.cloudflare.com/api/
 */

const BASE = 'https://api.cloudflare.com/client/v4';

export class CloudflareApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly errors: { code: number; message: string }[],
  ) {
    super(message);
    this.name = 'CloudflareApiError';
  }
}

async function cfFetch<T>(
  token: string,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  const body = (await res.json()) as {
    success: boolean;
    result?: T;
    errors?: { code: number; message: string }[];
    messages?: unknown[];
  };

  if (!body.success || !res.ok) {
    const errors = body.errors ?? [];
    const msg = errors.map((e) => e.message).join(', ') || `HTTP ${res.status}`;
    throw new CloudflareApiError(msg, res.status, errors);
  }

  return body.result as T;
}

// ── User / Account ───────────────────────────────────────────────────────────

export interface CfUser {
  id: string;
  email: string;
  username: string;
}

export async function getUser(token: string): Promise<CfUser> {
  return cfFetch<CfUser>(token, '/user');
}

export interface CfAccount {
  id: string;
  name: string;
}

export async function listAccounts(token: string): Promise<CfAccount[]> {
  return cfFetch<CfAccount[]>(token, '/accounts?per_page=50');
}

// ── D1 ───────────────────────────────────────────────────────────────────────

export interface CfD1Database {
  uuid: string;
  name: string;
  created_at: string;
  num_tables?: number;
  file_size?: number;
}

export async function listD1Databases(
  token: string,
  accountId: string,
): Promise<CfD1Database[]> {
  return cfFetch<CfD1Database[]>(token, `/accounts/${accountId}/d1/database?per_page=100`);
}

export async function createD1Database(
  token: string,
  accountId: string,
  name: string,
): Promise<CfD1Database> {
  return cfFetch<CfD1Database>(token, `/accounts/${accountId}/d1/database`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export interface D1QueryResult {
  results: Record<string, unknown>[];
  success: boolean;
  meta: {
    duration: number;
    changes: number;
    last_row_id: number;
    rows_read: number;
    rows_written: number;
  };
}

export async function executeD1Sql(
  token: string,
  accountId: string,
  databaseId: string,
  sql: string,
  params: unknown[] = [],
): Promise<D1QueryResult[]> {
  // Strip single-line comments BEFORE splitting — critical!
  // Without this, chunks that start with "--" comment lines get dropped
  // even though they contain real SQL after the comments.
  const stripped = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  const statements = stripped
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (statements.length === 0) return [];

  const results: D1QueryResult[] = [];
  for (const stmt of statements) {
    try {
      const result = await cfFetch<D1QueryResult>(
        token,
        `/accounts/${accountId}/d1/database/${databaseId}/query`,
        {
          method: 'POST',
          body: JSON.stringify({ sql: stmt, params }),
        },
      );
      results.push(result);
    } catch (err) {
      if (err instanceof CloudflareApiError) {
        const msg = err.message.toLowerCase();
        // Skip harmless "already exists" / duplicate errors
        if (msg.includes('already exists') || msg.includes('duplicate')) continue;
      }
      throw err;
    }
  }
  return results;
}

// ── Workers ──────────────────────────────────────────────────────────────────

export interface CfWorker {
  id: string;
  etag: string;
  created_on: string;
  modified_on: string;
}

export async function listWorkers(
  token: string,
  accountId: string,
): Promise<CfWorker[]> {
  return cfFetch<CfWorker[]>(token, `/accounts/${accountId}/workers/scripts`);
}

export async function getWorkerSubdomain(
  token: string,
  accountId: string,
): Promise<string> {
  const result = await cfFetch<{ subdomain: string }>(
    token,
    `/accounts/${accountId}/workers/subdomain`,
  );
  return result.subdomain;
}

// ── Pages ────────────────────────────────────────────────────────────────────

export interface CfPagesProject {
  id: string;
  name: string;
  subdomain: string;
  domains: string[];
  deployment_configs: {
    production: { env_vars?: Record<string, { value: string }> };
    preview: { env_vars?: Record<string, { value: string }> };
  };
}

export async function createPagesProject(
  token: string,
  accountId: string,
  projectName: string,
): Promise<CfPagesProject> {
  return cfFetch<CfPagesProject>(
    token,
    `/accounts/${accountId}/pages/projects`,
    {
      method: 'POST',
      body: JSON.stringify({ name: projectName, production_branch: 'main' }),
    },
  );
}

export async function listPagesProjects(
  token: string,
  accountId: string,
): Promise<CfPagesProject[]> {
  // Pages API does not support per_page — use default pagination
  return cfFetch<CfPagesProject[]>(
    token,
    `/accounts/${accountId}/pages/projects`,
  );
}

export async function getPagesProject(
  token: string,
  accountId: string,
  projectName: string,
): Promise<CfPagesProject> {
  return cfFetch<CfPagesProject>(
    token,
    `/accounts/${accountId}/pages/projects/${projectName}`,
  );
}

export async function updatePagesEnvVars(
  token: string,
  accountId: string,
  projectName: string,
  envVars: Record<string, string>,
  environments: ('production' | 'preview')[] = ['production', 'preview'],
): Promise<CfPagesProject> {
  const builtVars: Record<string, { value: string }> = {};
  for (const [k, v] of Object.entries(envVars)) {
    builtVars[k] = { value: v };
  }

  const deploymentConfigs: Record<string, { env_vars: Record<string, { value: string }> }> = {};
  for (const env of environments) {
    deploymentConfigs[env] = { env_vars: builtVars };
  }

  return cfFetch<CfPagesProject>(
    token,
    `/accounts/${accountId}/pages/projects/${projectName}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ deployment_configs: deploymentConfigs }),
    },
  );
}

// ── Worker Secrets ───────────────────────────────────────────────────────────

export async function putWorkerSecret(
  token: string,
  accountId: string,
  scriptName: string,
  secretName: string,
  secretValue: string,
): Promise<void> {
  await cfFetch<unknown>(
    token,
    `/accounts/${accountId}/workers/scripts/${scriptName}/secrets`,
    {
      method: 'PUT',
      body: JSON.stringify({ name: secretName, text: secretValue, type: 'secret_text' }),
    },
  );
}

// ── Worker Tail Logs ─────────────────────────────────────────────────────────

export interface CfTailSession {
  id: string;
  url: string;
  expires_at: string;
}

export async function createTailSession(
  token: string,
  accountId: string,
  scriptName: string,
): Promise<CfTailSession> {
  return cfFetch<CfTailSession>(
    token,
    `/accounts/${accountId}/workers/scripts/${scriptName}/tails`,
    { method: 'POST', body: '{}' },
  );
}

export async function deleteTailSession(
  token: string,
  accountId: string,
  scriptName: string,
  tailId: string,
): Promise<void> {
  await cfFetch<unknown>(
    token,
    `/accounts/${accountId}/workers/scripts/${scriptName}/tails/${tailId}`,
    { method: 'DELETE' },
  );
}
