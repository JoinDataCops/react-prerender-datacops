/**
 * Page content wizard — collects real page data during `init` or
 * `prerender-edge pages configure`, then writes it directly to D1
 * via the Cloudflare API so the cache is populated immediately.
 *
 * Flow:
 *  1. Ask: brand name, nav links
 *  2. For each page: path, title, description, body content (bullets)
 *  3. Write each page config into D1 `prerender_page_configs` via CF API
 *  4. Caller triggers POST /api/cache/generate to build HTML immediately
 */
export interface PageEntry {
    path: string;
    title: string;
    description: string;
    /** Raw HTML body inserted inside <main> */
    content: string;
    ogImage?: string;
    schemas?: object[];
}
export interface NavLink {
    href: string;
    label: string;
}
export interface PageWizardResult {
    pages: PageEntry[];
    navLinks: NavLink[];
    brandName: string;
    siteUrl: string;
}
export declare function runPageWizard(siteUrl: string, _workerDir: string): Promise<PageWizardResult>;
/**
 * Writes each page config into D1 `prerender_page_configs`.
 * The worker's cron.ts reads this table to generate prerender HTML.
 * This is called after the worker is deployed so the table exists.
 */
export declare function writePageConfigsToD1(token: string, accountId: string, dbId: string, result: PageWizardResult): Promise<{
    written: number;
    failed: number;
}>;
export declare function writeCronTs(workerDir: string, result: PageWizardResult): void;
//# sourceMappingURL=page-wizard.d.ts.map