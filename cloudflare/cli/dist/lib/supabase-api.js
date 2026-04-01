/**
 * Supabase Management API client
 * Docs: https://api.supabase.com/api/v1
 *
 * Auth: Personal Access Token from https://app.supabase.com/account/tokens
 */
const BASE = 'https://api.supabase.com/v1';
export class SupabaseApiError extends Error {
    status;
    constructor(message, status) {
        super(message);
        this.status = status;
        this.name = 'SupabaseApiError';
    }
}
async function sbFetch(token, path, options = {}) {
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
            const body = await res.json();
            msg = body.message ?? body.error ?? msg;
        }
        catch { }
        throw new SupabaseApiError(msg, res.status);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : {};
}
export async function getSbUser(token) {
    return sbFetch(token, '/profile');
}
export async function listSbProjects(token) {
    return sbFetch(token, '/projects');
}
export async function getSbProject(token, ref) {
    return sbFetch(token, `/projects/${ref}`);
}
export async function getSbApiKeys(token, ref) {
    return sbFetch(token, `/projects/${ref}/api-keys`);
}
export async function executeSbSql(token, ref, query) {
    return sbFetch(token, `/projects/${ref}/database/query`, {
        method: 'POST',
        body: JSON.stringify({ query }),
    });
}
/** Split a multi-statement SQL file and execute each statement individually. */
export async function executeSbSqlFile(token, ref, sql) {
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
        }
        catch (err) {
            // Skip "already exists" errors from IF NOT EXISTS failures on older pg
            if (err instanceof SupabaseApiError) {
                const msg = err.message.toLowerCase();
                if (msg.includes('already exists') || msg.includes('duplicate'))
                    continue;
            }
            throw err;
        }
    }
}
export async function listSbFunctions(token, ref) {
    return sbFetch(token, `/projects/${ref}/functions`);
}
/** Deploy/update a single edge function. `body` is the Deno TypeScript source. */
export async function deploySbFunction(token, ref, slug, name, body) {
    // Check if function exists
    let exists = false;
    try {
        await sbFetch(token, `/projects/${ref}/functions/${slug}`);
        exists = true;
    }
    catch (err) {
        if (err instanceof SupabaseApiError && err.status !== 404)
            throw err;
    }
    const payload = { slug, name, body, verify_jwt: true };
    if (exists) {
        return sbFetch(token, `/projects/${ref}/functions/${slug}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
        });
    }
    return sbFetch(token, `/projects/${ref}/functions`, {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}
// ── Secrets / Env Vars ────────────────────────────────────────────────────────
export async function setSbSecrets(token, ref, secrets) {
    const payload = Object.entries(secrets).map(([name, value]) => ({ name, value }));
    await sbFetch(token, `/projects/${ref}/secrets`, {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}
//# sourceMappingURL=supabase-api.js.map