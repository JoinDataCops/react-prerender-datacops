import Conf from 'conf';

export interface SiteConfig {
  /** Framework detected or chosen by user */
  framework: string;
  /** Shell command to build the site, e.g. "npm run build" */
  buildCommand: string;
  /** Relative path to build output directory, e.g. "dist" */
  outputDir: string;
  /** Cloudflare Pages project name (created/chosen during deploy-site) */
  pagesProject: string;
}

export interface StoredConfig {
  // ── Cloudflare ────────────────────────────────────────────────
  auth?: {
    token: string;
    tokenType: 'apiToken' | 'oauth';
    email?: string;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
  };
  project?: {
    name: string;
    siteUrl: string;
    pagesProject: string;
    workerName: string;
    dbName: string;
    dbId: string;
    workerUrl?: string;
    workerSecret?: string;
    workerDir?: string;
  };
  /** Frontend site deployment config */
  siteConfig?: SiteConfig;

  // ── Supabase ──────────────────────────────────────────────────
  supabaseAuth?: {
    token: string;
    email?: string;
  };
  supabaseProject?: {
    ref: string;
    name: string;
    url: string;
    anonKey: string;
    serviceRoleKey?: string;
    pagesProject?: string;
    siteUrl?: string;
  };
}

const conf = new Conf<StoredConfig>({
  projectName: 'prerender-edge',
  configName: 'config',
});

export function getConfig(): StoredConfig {
  return conf.store;
}

export function setConfig(updates: Partial<StoredConfig>): void {
  for (const [key, value] of Object.entries(updates) as [keyof StoredConfig, unknown][]) {
    if (value === undefined) {
      conf.delete(key);
    } else {
      conf.set(key, value as StoredConfig[typeof key]);
    }
  }
}

export function clearConfig(): void {
  conf.clear();
}

export function getConfigPath(): string {
  return conf.path;
}

export function getAuth(): StoredConfig['auth'] | undefined {
  return conf.get('auth');
}

export function setAuth(auth: StoredConfig['auth']): void {
  conf.set('auth', auth);
}

export function clearAuth(): void {
  conf.delete('auth');
}

export function getProject(): StoredConfig['project'] | undefined {
  return conf.get('project');
}

export function setProject(project: StoredConfig['project']): void {
  conf.set('project', project);
}

/** Returns the API token to use for Cloudflare API requests. */
export function getApiToken(): string | undefined {
  const auth = getAuth();
  if (!auth) return undefined;
  if (auth.tokenType === 'apiToken') return auth.token;
  return auth.accessToken ?? auth.token;
}

// ── Supabase ─────────────────────────────────────────────────────────────────

export function getSupabaseAuth(): StoredConfig['supabaseAuth'] | undefined {
  return conf.get('supabaseAuth');
}

export function setSupabaseAuth(auth: StoredConfig['supabaseAuth']): void {
  conf.set('supabaseAuth', auth);
}

export function clearSupabaseAuth(): void {
  conf.delete('supabaseAuth');
}

export function getSupabaseProject(): StoredConfig['supabaseProject'] | undefined {
  return conf.get('supabaseProject');
}

export function setSupabaseProject(project: StoredConfig['supabaseProject']): void {
  conf.set('supabaseProject', project);
}

export function isLoggedIn(): { cloudflare: boolean; supabase: boolean } {
  return {
    cloudflare: !!getAuth(),
    supabase: !!getSupabaseAuth(),
  };
}

// ── Site config ───────────────────────────────────────────────────────────────

export function getSiteConfig(): StoredConfig['siteConfig'] | undefined {
  return conf.get('siteConfig');
}

export function setSiteConfig(cfg: StoredConfig['siteConfig']): void {
  conf.set('siteConfig', cfg);
}

export function clearSiteConfig(): void {
  conf.delete('siteConfig');
}
