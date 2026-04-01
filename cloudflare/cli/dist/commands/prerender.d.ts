/**
 * `prerender-edge prerender`
 *
 * Production-grade prerendering — exactly like Next.js SSG but for any SPA.
 *
 * How it works:
 *   1. Builds your React app (or uses existing dist/)
 *   2. Starts a local HTTP server on the built output
 *   3. Launches a real Chromium browser (via puppeteer)
 *   4. Visits every page URL, waits for React to fully render
 *   5. Captures the complete DOM — every component, every text node
 *   6. Cleans the HTML (removes JS bundles, keeps structured content)
 *   7. Uploads all pages to D1 via the worker
 *
 * Add to your CI/CD or package.json:
 *   "postbuild": "prerender-edge prerender --skip-build"
 *
 * Requirements:
 *   - puppeteer must be installed: npm install --save-dev puppeteer
 *   - Worker must be deployed and reachable
 */
export declare function prerenderCommand(opts: {
    skipBuild?: boolean;
    dist?: string;
    port?: number;
    selector?: string;
    timeout?: number;
    concurrency?: number;
    ttlHours?: number;
    noBrowser?: boolean;
}): Promise<void>;
//# sourceMappingURL=prerender.d.ts.map