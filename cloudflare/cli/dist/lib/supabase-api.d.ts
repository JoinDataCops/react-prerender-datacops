/**
 * Supabase Management API client
 * Docs: https://api.supabase.com/api/v1
 *
 * Auth: Personal Access Token from https://app.supabase.com/account/tokens
 */
export declare class SupabaseApiError extends Error {
    readonly status: number;
    constructor(message: string, status: number);
}
export interface SbUser {
    id: string;
    email: string;
    username?: string;
}
export declare function getSbUser(token: string): Promise<SbUser>;
export interface SbProject {
    id: string;
    ref: string;
    name: string;
    status: string;
    region: string;
    organization_id: string;
    db_host: string;
    inserted_at: string;
}
export declare function listSbProjects(token: string): Promise<SbProject[]>;
export declare function getSbProject(token: string, ref: string): Promise<SbProject>;
export interface SbApiKey {
    name: string;
    api_key: string;
}
export declare function getSbApiKeys(token: string, ref: string): Promise<SbApiKey[]>;
export interface SbQueryResult {
    rows?: Record<string, unknown>[];
}
export declare function executeSbSql(token: string, ref: string, query: string): Promise<SbQueryResult>;
/** Split a multi-statement SQL file and execute each statement individually. */
export declare function executeSbSqlFile(token: string, ref: string, sql: string): Promise<void>;
export interface SbFunction {
    id: string;
    slug: string;
    name: string;
    status: string;
    version: number;
    created_at: string;
    updated_at: string;
}
export declare function listSbFunctions(token: string, ref: string): Promise<SbFunction[]>;
/** Deploy/update a single edge function. `body` is the Deno TypeScript source. */
export declare function deploySbFunction(token: string, ref: string, slug: string, name: string, body: string): Promise<SbFunction>;
export declare function setSbSecrets(token: string, ref: string, secrets: Record<string, string>): Promise<void>;
//# sourceMappingURL=supabase-api.d.ts.map