/**
 * `prerender-edge deploy-site`
 *
 * Builds the frontend site and deploys it to Cloudflare Pages.
 * Auto-detects framework (React/Vite/Vue/Next.js/etc.) and pre-fills defaults.
 *
 * Flow:
 *   1. Detect / confirm framework, build command, output dir
 *   2. Create or reuse a Cloudflare Pages project
 *   3. Run the build
 *   4. `wrangler pages deploy <outputDir> --project-name <name>`
 *   5. Set WORKER_URL + WORKER_SECRET env vars on the Pages project
 */
export interface DeploySiteOptions {
    /** Skip the build step (just deploy already-built output) */
    skipBuild?: boolean;
    /** Force re-ask all questions even if config exists */
    reconfigure?: boolean;
}
export declare function deploySiteCommand(opts?: DeploySiteOptions): Promise<void>;
//# sourceMappingURL=deploy-site.d.ts.map