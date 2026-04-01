/**
 * Cloudflare REST API client
 * Docs: https://developers.cloudflare.com/api/
 */
const BASE = 'https://api.cloudflare.com/client/v4';
export class CloudflareApiError extends Error {
    status;
    errors;
    constructor(message, status, errors) {
        super(message);
        this.status = status;
        this.errors = errors;
        this.name = 'CloudflareApiError';
    }
}
async function cfFetch(token, path, options = {}) {
    const url = path.startsWith('http') ? path : `${BASE}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(options.headers ?? {}),
        },
    });
    const body = (await res.json());
    if (!body.success || !res.ok) {
        const errors = body.errors ?? [];
        const msg = errors.map((e) => e.message).join(', ') || `HTTP ${res.status}`;
        throw new CloudflareApiError(msg, res.status, errors);
    }
    return body.result;
}
export async function getUser(token) {
    return cfFetch(token, '/user');
}
export async function listAccounts(token) {
    return cfFetch(token, '/accounts?per_page=50');
}
export async function listD1Databases(token, accountId) {
    return cfFetch(token, `/accounts/${accountId}/d1/database?per_page=100`);
}
export async function createD1Database(token, accountId, name) {
    return cfFetch(token, `/accounts/${accountId}/d1/database`, {
        method: 'POST',
        body: JSON.stringify({ name }),
    });
}
export async function executeD1Sql(token, accountId, databaseId, sql, params = []) {
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
    if (statements.length === 0)
        return [];
    const results = [];
    for (const stmt of statements) {
        try {
            const result = await cfFetch(token, `/accounts/${accountId}/d1/database/${databaseId}/query`, {
                method: 'POST',
                body: JSON.stringify({ sql: stmt, params }),
            });
            results.push(result);
        }
        catch (err) {
            if (err instanceof CloudflareApiError) {
                const msg = err.message.toLowerCase();
                // Skip harmless "already exists" / duplicate errors
                if (msg.includes('already exists') || msg.includes('duplicate'))
                    continue;
            }
            throw err;
        }
    }
    return results;
}
export async function listWorkers(token, accountId) {
    return cfFetch(token, `/accounts/${accountId}/workers/scripts`);
}
export async function getWorkerSubdomain(token, accountId) {
    const result = await cfFetch(token, `/accounts/${accountId}/workers/subdomain`);
    return result.subdomain;
}
export async function createPagesProject(token, accountId, projectName) {
    return cfFetch(token, `/accounts/${accountId}/pages/projects`, {
        method: 'POST',
        body: JSON.stringify({ name: projectName, production_branch: 'main' }),
    });
}
export async function listPagesProjects(token, accountId) {
    // Pages API does not support per_page — use default pagination
    return cfFetch(token, `/accounts/${accountId}/pages/projects`);
}
export async function getPagesProject(token, accountId, projectName) {
    return cfFetch(token, `/accounts/${accountId}/pages/projects/${projectName}`);
}
export async function updatePagesEnvVars(token, accountId, projectName, envVars, environments = ['production', 'preview']) {
    const builtVars = {};
    for (const [k, v] of Object.entries(envVars)) {
        builtVars[k] = { value: v };
    }
    const deploymentConfigs = {};
    for (const env of environments) {
        deploymentConfigs[env] = { env_vars: builtVars };
    }
    return cfFetch(token, `/accounts/${accountId}/pages/projects/${projectName}`, {
        method: 'PATCH',
        body: JSON.stringify({ deployment_configs: deploymentConfigs }),
    });
}
// ── Worker Secrets ───────────────────────────────────────────────────────────
export async function putWorkerSecret(token, accountId, scriptName, secretName, secretValue) {
    await cfFetch(token, `/accounts/${accountId}/workers/scripts/${scriptName}/secrets`, {
        method: 'PUT',
        body: JSON.stringify({ name: secretName, text: secretValue, type: 'secret_text' }),
    });
}
export async function createTailSession(token, accountId, scriptName) {
    return cfFetch(token, `/accounts/${accountId}/workers/scripts/${scriptName}/tails`, { method: 'POST', body: '{}' });
}
export async function deleteTailSession(token, accountId, scriptName, tailId) {
    await cfFetch(token, `/accounts/${accountId}/workers/scripts/${scriptName}/tails/${tailId}`, { method: 'DELETE' });
}
//# sourceMappingURL=cf-api.js.map