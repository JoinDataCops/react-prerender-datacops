import fs from 'node:fs';
import path from 'node:path';
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

// ── System-wide config (auth only — shared across all projects) ──────────────

interface SystemConfig {
  auth?: {
    token: string;
    tokenType: 'apiToken' | 'oauth';
    email?: string;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
  };
  supabaseAuth?: {
    token: string;
    email?: string;
  };
}

const systemConf = new Conf<SystemConfig>({
  projectName: 'prerender-edge',
  configName: 'auth',
});

// ── Project-local config (.prerender-edge.json in project root) ──────────────

interface ProjectLocalConfig {
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
  supabaseProject?: {
    ref: string;
    name: string;
    url: string;
    anonKey: string;
    serviceRoleKey?: string;
    pagesProject?: string;
    siteUrl?: string;
  };
  siteConfig?: SiteConfig;
}

const LOCAL_CONFIG_FILE = '.prerender-edge.json';

function findProjectRoot(): string {
  let dir = process.cwd();
  // Walk up to find package.json (project root)
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

function getLocalConfigPath(): string {
  return path.join(findProjectRoot(), LOCAL_CONFIG_FILE);
}

function readLocalConfig(): ProjectLocalConfig {
  const p = getLocalConfigPath();
  try {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf-8'));
    }
  } catch {}
  return {};
}

function writeLocalConfig(config: ProjectLocalConfig): void {
  const p = getLocalConfigPath();
  fs.writeFileSync(p, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

// ── Combined StoredConfig type (for backward compatibility) ──────────────────

export interface StoredConfig {
  auth?: SystemConfig['auth'];
  project?: ProjectLocalConfig['project'];
  siteConfig?: SiteConfig;
  supabaseAuth?: SystemConfig['supabaseAuth'];
  supabaseProject?: ProjectLocalConfig['supabaseProject'];
}

// ── Getters & setters ────────────────────────────────────────────────────────

export function getConfig(): StoredConfig {
  const local = readLocalConfig();
  return {
    auth: systemConf.get('auth'),
    supabaseAuth: systemConf.get('supabaseAuth'),
    project: local.project,
    supabaseProject: local.supabaseProject,
    siteConfig: local.siteConfig,
  };
}

export function setConfig(updates: Partial<StoredConfig>): void {
  // Auth goes to system-wide store
  if ('auth' in updates) {
    if (updates.auth === undefined) systemConf.delete('auth');
    else systemConf.set('auth', updates.auth);
  }
  if ('supabaseAuth' in updates) {
    if (updates.supabaseAuth === undefined) systemConf.delete('supabaseAuth');
    else systemConf.set('supabaseAuth', updates.supabaseAuth);
  }

  // Project config goes to local file
  const localKeys: (keyof ProjectLocalConfig)[] = ['project', 'supabaseProject', 'siteConfig'];
  const hasLocalUpdate = localKeys.some((k) => k in updates);
  if (hasLocalUpdate) {
    const local = readLocalConfig();
    for (const key of localKeys) {
      if (key in updates) {
        if ((updates as Record<string, unknown>)[key] === undefined) {
          delete local[key];
        } else {
          (local as Record<string, unknown>)[key] = (updates as Record<string, unknown>)[key];
        }
      }
    }
    writeLocalConfig(local);
  }
}

export function clearConfig(): void {
  systemConf.clear();
  const p = getLocalConfigPath();
  try { fs.unlinkSync(p); } catch {}
}

export function getConfigPath(): string {
  return `System: ${systemConf.path}\nProject: ${getLocalConfigPath()}`;
}

// ── Auth (system-wide) ───────────────────────────────────────────────────────

export function getAuth(): SystemConfig['auth'] | undefined {
  return systemConf.get('auth');
}

export function setAuth(auth: SystemConfig['auth']): void {
  systemConf.set('auth', auth);
}

export function clearAuth(): void {
  systemConf.delete('auth');
}

/** Returns the API token to use for Cloudflare API requests. */
export function getApiToken(): string | undefined {
  const auth = getAuth();
  if (!auth) return undefined;
  if (auth.tokenType === 'apiToken') return auth.token;
  return auth.accessToken ?? auth.token;
}

// ── Project config (project-local) ───────────────────────────────────────────

export function getProject(): ProjectLocalConfig['project'] | undefined {
  return readLocalConfig().project;
}

export function setProject(project: ProjectLocalConfig['project']): void {
  const local = readLocalConfig();
  local.project = project;
  writeLocalConfig(local);
}

// ── Supabase auth (system-wide) ──────────────────────────────────────────────

export function getSupabaseAuth(): SystemConfig['supabaseAuth'] | undefined {
  return systemConf.get('supabaseAuth');
}

export function setSupabaseAuth(auth: SystemConfig['supabaseAuth']): void {
  systemConf.set('supabaseAuth', auth);
}

export function clearSupabaseAuth(): void {
  systemConf.delete('supabaseAuth');
}

// ── Supabase project (project-local) ─────────────────────────────────────────

export function getSupabaseProject(): ProjectLocalConfig['supabaseProject'] | undefined {
  return readLocalConfig().supabaseProject;
}

export function setSupabaseProject(project: ProjectLocalConfig['supabaseProject']): void {
  const local = readLocalConfig();
  local.supabaseProject = project;
  writeLocalConfig(local);
}

// ── Login check ──────────────────────────────────────────────────────────────

export function isLoggedIn(): { cloudflare: boolean; supabase: boolean } {
  return {
    cloudflare: !!getAuth(),
    supabase: !!getSupabaseAuth(),
  };
}

// ── Site config (project-local) ──────────────────────────────────────────────

export function getSiteConfig(): SiteConfig | undefined {
  return readLocalConfig().siteConfig;
}

export function setSiteConfig(cfg: SiteConfig): void {
  const local = readLocalConfig();
  local.siteConfig = cfg;
  writeLocalConfig(local);
}

export function clearSiteConfig(): void {
  const local = readLocalConfig();
  delete local.siteConfig;
  writeLocalConfig(local);
}
