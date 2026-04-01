/**
 * `prerender-edge deploy` — Deploy the backend worker using wrangler.
 *
 * Handles:
 *   - Auto npm install if node_modules is missing
 *   - Auto `wrangler login` if auth fails
 *   - Pushes WORKER_SECRET + SITE_URL via wrangler after deploy
 */
export interface DeployOptions {
    workerSecret?: string;
    env?: string;
    workerDir?: string;
}
export declare function deployCommand(opts?: DeployOptions): Promise<void>;
//# sourceMappingURL=deploy.d.ts.map