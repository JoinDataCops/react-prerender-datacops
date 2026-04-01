/**
 * Cloudflare REST API client
 * Docs: https://developers.cloudflare.com/api/
 */
export declare class CloudflareApiError extends Error {
    readonly status: number;
    readonly errors: {
        code: number;
        message: string;
    }[];
    constructor(message: string, status: number, errors: {
        code: number;
        message: string;
    }[]);
}
export interface CfUser {
    id: string;
    email: string;
    username: string;
}
export declare function getUser(token: string): Promise<CfUser>;
export interface CfAccount {
    id: string;
    name: string;
}
export declare function listAccounts(token: string): Promise<CfAccount[]>;
export interface CfD1Database {
    uuid: string;
    name: string;
    created_at: string;
    num_tables?: number;
    file_size?: number;
}
export declare function listD1Databases(token: string, accountId: string): Promise<CfD1Database[]>;
export declare function createD1Database(token: string, accountId: string, name: string): Promise<CfD1Database>;
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
export declare function executeD1Sql(token: string, accountId: string, databaseId: string, sql: string, params?: unknown[]): Promise<D1QueryResult[]>;
export interface CfWorker {
    id: string;
    etag: string;
    created_on: string;
    modified_on: string;
}
export declare function listWorkers(token: string, accountId: string): Promise<CfWorker[]>;
export declare function getWorkerSubdomain(token: string, accountId: string): Promise<string>;
export interface CfPagesProject {
    id: string;
    name: string;
    subdomain: string;
    domains: string[];
    deployment_configs: {
        production: {
            env_vars?: Record<string, {
                value: string;
            }>;
        };
        preview: {
            env_vars?: Record<string, {
                value: string;
            }>;
        };
    };
}
export declare function createPagesProject(token: string, accountId: string, projectName: string): Promise<CfPagesProject>;
export declare function listPagesProjects(token: string, accountId: string): Promise<CfPagesProject[]>;
export declare function getPagesProject(token: string, accountId: string, projectName: string): Promise<CfPagesProject>;
export declare function updatePagesEnvVars(token: string, accountId: string, projectName: string, envVars: Record<string, string>, environments?: ('production' | 'preview')[]): Promise<CfPagesProject>;
export declare function putWorkerSecret(token: string, accountId: string, scriptName: string, secretName: string, secretValue: string): Promise<void>;
export interface CfTailSession {
    id: string;
    url: string;
    expires_at: string;
}
export declare function createTailSession(token: string, accountId: string, scriptName: string): Promise<CfTailSession>;
export declare function deleteTailSession(token: string, accountId: string, scriptName: string, tailId: string): Promise<void>;
//# sourceMappingURL=cf-api.d.ts.map