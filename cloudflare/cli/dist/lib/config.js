import fs from 'node:fs';
import path from 'node:path';
import Conf from 'conf';
const systemConf = new Conf({
    projectName: 'prerender-edge',
    configName: 'auth',
});
const LOCAL_CONFIG_FILE = '.prerender-edge.json';
function findProjectRoot() {
    let dir = process.cwd();
    // Walk up to find package.json (project root)
    while (dir !== path.dirname(dir)) {
        if (fs.existsSync(path.join(dir, 'package.json')))
            return dir;
        dir = path.dirname(dir);
    }
    return process.cwd();
}
function getLocalConfigPath() {
    return path.join(findProjectRoot(), LOCAL_CONFIG_FILE);
}
function readLocalConfig() {
    const p = getLocalConfigPath();
    try {
        if (fs.existsSync(p)) {
            return JSON.parse(fs.readFileSync(p, 'utf-8'));
        }
    }
    catch { }
    return {};
}
function writeLocalConfig(config) {
    const p = getLocalConfigPath();
    fs.writeFileSync(p, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}
// ── Getters & setters ────────────────────────────────────────────────────────
export function getConfig() {
    const local = readLocalConfig();
    return {
        auth: systemConf.get('auth'),
        supabaseAuth: systemConf.get('supabaseAuth'),
        project: local.project,
        supabaseProject: local.supabaseProject,
        siteConfig: local.siteConfig,
    };
}
export function setConfig(updates) {
    // Auth goes to system-wide store
    if ('auth' in updates) {
        if (updates.auth === undefined)
            systemConf.delete('auth');
        else
            systemConf.set('auth', updates.auth);
    }
    if ('supabaseAuth' in updates) {
        if (updates.supabaseAuth === undefined)
            systemConf.delete('supabaseAuth');
        else
            systemConf.set('supabaseAuth', updates.supabaseAuth);
    }
    // Project config goes to local file
    const localKeys = ['project', 'supabaseProject', 'siteConfig'];
    const hasLocalUpdate = localKeys.some((k) => k in updates);
    if (hasLocalUpdate) {
        const local = readLocalConfig();
        for (const key of localKeys) {
            if (key in updates) {
                if (updates[key] === undefined) {
                    delete local[key];
                }
                else {
                    local[key] = updates[key];
                }
            }
        }
        writeLocalConfig(local);
    }
}
export function clearConfig() {
    systemConf.clear();
    const p = getLocalConfigPath();
    try {
        fs.unlinkSync(p);
    }
    catch { }
}
export function getConfigPath() {
    return `System: ${systemConf.path}\nProject: ${getLocalConfigPath()}`;
}
// ── Auth (system-wide) ───────────────────────────────────────────────────────
export function getAuth() {
    return systemConf.get('auth');
}
export function setAuth(auth) {
    systemConf.set('auth', auth);
}
export function clearAuth() {
    systemConf.delete('auth');
}
/** Returns the API token to use for Cloudflare API requests. */
export function getApiToken() {
    const auth = getAuth();
    if (!auth)
        return undefined;
    if (auth.tokenType === 'apiToken')
        return auth.token;
    return auth.accessToken ?? auth.token;
}
// ── Project config (project-local) ───────────────────────────────────────────
export function getProject() {
    return readLocalConfig().project;
}
export function setProject(project) {
    const local = readLocalConfig();
    local.project = project;
    writeLocalConfig(local);
}
// ── Supabase auth (system-wide) ──────────────────────────────────────────────
export function getSupabaseAuth() {
    return systemConf.get('supabaseAuth');
}
export function setSupabaseAuth(auth) {
    systemConf.set('supabaseAuth', auth);
}
export function clearSupabaseAuth() {
    systemConf.delete('supabaseAuth');
}
// ── Supabase project (project-local) ─────────────────────────────────────────
export function getSupabaseProject() {
    return readLocalConfig().supabaseProject;
}
export function setSupabaseProject(project) {
    const local = readLocalConfig();
    local.supabaseProject = project;
    writeLocalConfig(local);
}
// ── Login check ──────────────────────────────────────────────────────────────
export function isLoggedIn() {
    return {
        cloudflare: !!getAuth(),
        supabase: !!getSupabaseAuth(),
    };
}
// ── Site config (project-local) ──────────────────────────────────────────────
export function getSiteConfig() {
    return readLocalConfig().siteConfig;
}
export function setSiteConfig(cfg) {
    const local = readLocalConfig();
    local.siteConfig = cfg;
    writeLocalConfig(local);
}
export function clearSiteConfig() {
    const local = readLocalConfig();
    delete local.siteConfig;
    writeLocalConfig(local);
}
//# sourceMappingURL=config.js.map