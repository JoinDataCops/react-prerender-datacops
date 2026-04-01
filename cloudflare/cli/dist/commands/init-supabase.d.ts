/**
 * Supabase init flow.
 * Called by init.ts when user selects the Supabase backend.
 *
 * 1. Select Supabase project
 * 2. Apply Postgres schema via Management API
 * 3. Show anon key + URL (for Pages env vars)
 * 4. Scaffold edge function source files
 * 5. Deploy functions (via supabase CLI or manual instructions)
 */
export declare function initSupabase(opts: {
    force?: boolean;
}): Promise<void>;
//# sourceMappingURL=init-supabase.d.ts.map