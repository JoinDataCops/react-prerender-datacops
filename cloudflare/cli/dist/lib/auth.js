/**
 * Cloudflare authentication helpers.
 *
 * Supports two modes:
 *  1. OAuth PKCE flow (opens browser, catches callback on localhost)
 *  2. API Token (user pastes a token they created in the dashboard)
 *
 * For OAuth, you need to register a Cloudflare OAuth application:
 *   https://developers.cloudflare.com/cloudflare-one/identity/idp-integration/
 * Then set CF_CLIENT_ID env var or pass it to loginWithOAuth().
 */
import { createServer } from 'http';
import { createHash, randomBytes } from 'crypto';
import open from 'open';
const CF_AUTH_URL = 'https://dash.cloudflare.com/oauth2/auth';
const CF_TOKEN_URL = 'https://dash.cloudflare.com/oauth2/token';
const CF_REVOKE_URL = 'https://dash.cloudflare.com/oauth2/revoke';
/**
 * Cloudflare's publicly registered OAuth client for the Wrangler CLI.
 * This is the same client_id used by `wrangler login` — open source, MIT licensed.
 * The redirect URI must be http://localhost:8976/oauth/callback to match.
 */
export const CF_DEFAULT_CLIENT_ID = '54d11594-84e4-41aa-b438-e81b8fa78ee7';
const CALLBACK_PORT = 8976; // must match Cloudflare's registered redirect URI
const CALLBACK_PATH = '/oauth/callback';
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}${CALLBACK_PATH}`;
// Cloudflare OAuth scopes — same as wrangler login uses.
// These must match what the registered OAuth client (wrangler's client_id) allows.
const CF_SCOPES = [
    'account:read',
    'user:read',
    'workers:write',
    'workers_kv:write',
    'workers_routes:write',
    'workers_scripts:write',
    'workers_tail:read',
    'd1:write',
    'pages:write',
    'zone:read',
    'ssl_certs:write',
    'ai:write',
    'queues:write',
    'offline_access',
].join(' ');
// ── PKCE helpers ──────────────────────────────────────────────────────────────
function base64urlEncode(buf) {
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
export function generateCodeVerifier() {
    return base64urlEncode(randomBytes(32));
}
export async function generateCodeChallenge(verifier) {
    const hash = createHash('sha256').update(verifier).digest();
    return base64urlEncode(hash);
}
export function generateState() {
    return base64urlEncode(randomBytes(16));
}
export async function startOAuthFlow(clientId = CF_DEFAULT_CLIENT_ID) {
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    const state = generateState();
    const authUrl = new URL(CF_AUTH_URL);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('scope', CF_SCOPES);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    // Open browser after a short delay (gives the local callback server time to start)
    const fullUrl = authUrl.toString();
    setTimeout(() => { open(fullUrl).catch(() => { }); }, 300);
    const code = await waitForOAuthCallback(fullUrl, state);
    return exchangeCodeForTokens(clientId, code, verifier);
}
function waitForOAuthCallback(authUrl, expectedState) {
    return new Promise((resolve, reject) => {
        const server = createServer((req, res) => {
            const url = new URL(req.url, `http://localhost:${CALLBACK_PORT}`);
            if (url.pathname !== CALLBACK_PATH) {
                res.writeHead(404);
                res.end();
                return;
            }
            const code = url.searchParams.get('code');
            const state = url.searchParams.get('state');
            const error = url.searchParams.get('error');
            if (error) {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(callbackHtml('Authentication failed', error, false));
                server.close();
                reject(new Error(`OAuth error: ${error}`));
                return;
            }
            if (state !== expectedState) {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(callbackHtml('Authentication failed', 'State mismatch. Possible CSRF.', false));
                server.close();
                reject(new Error('OAuth state mismatch'));
                return;
            }
            if (!code) {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(callbackHtml('Authentication failed', 'No code returned', false));
                server.close();
                reject(new Error('No authorization code'));
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(callbackHtml('Authenticated!', 'You can close this tab and return to the terminal.', true));
            server.close();
            resolve(code);
        });
        server.listen(CALLBACK_PORT, '127.0.0.1', () => {
            // Server is ready — caller should open the browser
        });
        server.on('error', (err) => {
            reject(new Error(`Could not start local server on port ${CALLBACK_PORT}: ${err.message}`));
        });
        // Timeout after 5 minutes
        setTimeout(() => {
            server.close();
            reject(new Error('OAuth timeout — browser was not opened in time'));
        }, 5 * 60 * 1000);
    });
}
async function exchangeCodeForTokens(clientId, code, codeVerifier) {
    const res = await fetch(CF_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: clientId,
            code,
            redirect_uri: REDIRECT_URI,
            code_verifier: codeVerifier,
        }).toString(),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Token exchange failed: ${res.status} ${text}`);
    }
    const data = (await res.json());
    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    };
}
export async function refreshAccessToken(clientId, refreshToken) {
    const res = await fetch(CF_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: clientId,
            refresh_token: refreshToken,
        }).toString(),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Token refresh failed: ${res.status} ${text}`);
    }
    const data = (await res.json());
    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    };
}
export async function revokeToken(clientId, token) {
    await fetch(CF_REVOKE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: clientId, token }).toString(),
    });
}
export function buildOAuthUrl(clientId = CF_DEFAULT_CLIENT_ID) {
    const verifier = generateCodeVerifier();
    const state = generateState();
    const url = new URL(CF_AUTH_URL);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', REDIRECT_URI);
    url.searchParams.set('scope', CF_SCOPES);
    url.searchParams.set('state', state);
    return { url: url.toString(), state, verifier };
}
// ── HTML for callback page ────────────────────────────────────────────────────
function callbackHtml(title, message, success) {
    const color = success ? '#2ecc71' : '#e74c3c';
    const icon = success ? '✓' : '✗';
    return `<!DOCTYPE html><html><head><title>cf-prerender</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0f172a;color:#f1f5f9}
.card{text-align:center;padding:48px;background:#1e293b;border-radius:16px;max-width:400px}
.icon{font-size:64px;color:${color}}h1{margin:16px 0 8px;font-size:24px}p{color:#94a3b8;margin:0}</style></head>
<body><div class="card"><div class="icon">${icon}</div><h1>${title}</h1><p>${message}</p></div></body></html>`;
}
//# sourceMappingURL=auth.js.map