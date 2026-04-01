import Conf from 'conf';
const conf = new Conf({
    projectName: 'prerender-edge',
    configName: 'config',
});
export function getConfig() {
    return conf.store;
}
export function setConfig(updates) {
    for (const [key, value] of Object.entries(updates)) {
        if (value === undefined) {
            conf.delete(key);
        }
        else {
            conf.set(key, value);
        }
    }
}
export function clearConfig() {
    conf.clear();
}
export function getConfigPath() {
    return conf.path;
}
export function getAuth() {
    return conf.get('auth');
}
export function setAuth(auth) {
    conf.set('auth', auth);
}
export function clearAuth() {
    conf.delete('auth');
}
export function getProject() {
    return conf.get('project');
}
export function setProject(project) {
    conf.set('project', project);
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
// ── Supabase ─────────────────────────────────────────────────────────────────
export function getSupabaseAuth() {
    return conf.get('supabaseAuth');
}
export function setSupabaseAuth(auth) {
    conf.set('supabaseAuth', auth);
}
export function clearSupabaseAuth() {
    conf.delete('supabaseAuth');
}
export function getSupabaseProject() {
    return conf.get('supabaseProject');
}
export function setSupabaseProject(project) {
    conf.set('supabaseProject', project);
}
export function isLoggedIn() {
    return {
        cloudflare: !!getAuth(),
        supabase: !!getSupabaseAuth(),
    };
}
// ── Site config ───────────────────────────────────────────────────────────────
export function getSiteConfig() {
    return conf.get('siteConfig');
}
export function setSiteConfig(cfg) {
    conf.set('siteConfig', cfg);
}
export function clearSiteConfig() {
    conf.delete('siteConfig');
}
//# sourceMappingURL=config.js.map