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
export interface StoredConfig {
    auth?: SystemConfig['auth'];
    project?: ProjectLocalConfig['project'];
    siteConfig?: SiteConfig;
    supabaseAuth?: SystemConfig['supabaseAuth'];
    supabaseProject?: ProjectLocalConfig['supabaseProject'];
}
export declare function getConfig(): StoredConfig;
export declare function setConfig(updates: Partial<StoredConfig>): void;
export declare function clearConfig(): void;
export declare function getConfigPath(): string;
export declare function getAuth(): SystemConfig['auth'] | undefined;
export declare function setAuth(auth: SystemConfig['auth']): void;
export declare function clearAuth(): void;
/** Returns the API token to use for Cloudflare API requests. */
export declare function getApiToken(): string | undefined;
export declare function getProject(): ProjectLocalConfig['project'] | undefined;
export declare function setProject(project: ProjectLocalConfig['project']): void;
export declare function getSupabaseAuth(): SystemConfig['supabaseAuth'] | undefined;
export declare function setSupabaseAuth(auth: SystemConfig['supabaseAuth']): void;
export declare function clearSupabaseAuth(): void;
export declare function getSupabaseProject(): ProjectLocalConfig['supabaseProject'] | undefined;
export declare function setSupabaseProject(project: ProjectLocalConfig['supabaseProject']): void;
export declare function isLoggedIn(): {
    cloudflare: boolean;
    supabase: boolean;
};
export declare function getSiteConfig(): SiteConfig | undefined;
export declare function setSiteConfig(cfg: SiteConfig): void;
export declare function clearSiteConfig(): void;
export {};
//# sourceMappingURL=config.d.ts.map