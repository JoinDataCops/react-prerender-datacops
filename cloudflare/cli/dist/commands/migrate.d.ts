/**
 * `prerender migrate` — Apply or reset the database schema.
 * Supports both Cloudflare D1 and Supabase Postgres.
 */
export declare function migrateCommand(opts: {
    reset?: boolean;
    cloudflare?: boolean;
    supabase?: boolean;
}): Promise<void>;
//# sourceMappingURL=migrate.d.ts.map