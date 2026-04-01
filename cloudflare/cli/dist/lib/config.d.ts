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
export declare function getConfig(): StoredConfig;
export declare function setConfig(updates: Partial<StoredConfig>): void;
export declare function clearConfig(): void;
export declare function getConfigPath(): string;
export declare function getAuth(): StoredConfig['auth'] | undefined;
export declare function setAuth(auth: StoredConfig['auth']): void;
export declare function clearAuth(): void;
export declare function getProject(): StoredConfig['project'] | undefined;
export declare function setProject(project: StoredConfig['project']): void;
/** Returns the API token to use for Cloudflare API requests. */
export declare function getApiToken(): string | undefined;
export declare function getSupabaseAuth(): StoredConfig['supabaseAuth'] | undefined;
export declare function setSupabaseAuth(auth: StoredConfig['supabaseAuth']): void;
export declare function clearSupabaseAuth(): void;
export declare function getSupabaseProject(): StoredConfig['supabaseProject'] | undefined;
export declare function setSupabaseProject(project: StoredConfig['supabaseProject']): void;
export declare function isLoggedIn(): {
    cloudflare: boolean;
    supabase: boolean;
};
export declare function getSiteConfig(): StoredConfig['siteConfig'] | undefined;
export declare function setSiteConfig(cfg: StoredConfig['siteConfig']): void;
export declare function clearSiteConfig(): void;
//# sourceMappingURL=config.d.ts.map