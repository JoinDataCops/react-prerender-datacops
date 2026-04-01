/**
 * `prerender-edge init` — Backend selector.
 * Auto-triggers login if not authenticated, then delegates to
 * init-cloudflare.ts or init-supabase.ts.
 */
export declare function initCommand(opts: {
    force?: boolean;
    cloudflare?: boolean;
    supabase?: boolean;
}): Promise<void>;
//# sourceMappingURL=init.d.ts.map