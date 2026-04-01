/**
 * `cf-prerender cache <subcommand>`
 *
 * Subcommands:
 *   refresh   — Trigger cache regeneration
 *   clear     — Delete all cached pages (or a specific path)
 *   stats     — Show cache statistics
 */
export declare function cacheRefreshCommand(opts: {
    force?: boolean;
}): Promise<void>;
export declare function cacheClearCommand(opts: {
    path?: string;
    all?: boolean;
}): Promise<void>;
export declare function cacheStatsCommand(): Promise<void>;
//# sourceMappingURL=cache.d.ts.map