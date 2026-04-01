/**
 * `prerender-edge scan`
 *
 * Scans your React / Vue / Svelte source files, extracts all static JSX/HTML text
 * content automatically, and writes public/prerender-content.json.
 *
 * Add to your build pipeline:
 *   "prebuild": "prerender-edge scan --silent"
 *
 * How it works:
 *   1. Finds all page components in src/ (pages/, views/, screens/, routes/)
 *   2. Reads each file, strips comments and imports
 *   3. Extracts text from h1-h6, p, li, button, a, and common prop names
 *   4. Maps component filenames to URL paths (Home.tsx → /, Pricing.tsx → /pricing)
 *   5. Writes prerender-content.json to public/
 */
export declare function scanCommand(opts: {
    silent?: boolean;
    output?: string;
}): Promise<void>;
//# sourceMappingURL=scan.d.ts.map