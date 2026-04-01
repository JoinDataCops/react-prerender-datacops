/**
 * `prerender-edge content`
 *
 * Generates a starter prerender-content.json in the user's public/ folder.
 * The worker reads this file on every cron run to build rich page HTML.
 *
 * This is the "prev method" — write your content once in a file, the worker
 * reads it automatically and generates full HTML for bots.
 */
export declare function contentCommand(): Promise<void>;
//# sourceMappingURL=content.d.ts.map