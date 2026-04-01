/**
 * Auto-detects the frontend framework from the project's package.json.
 *
 * Target: pure SPAs that render into a single root <div> with no SSR/SSG.
 * Next.js, Nuxt, Remix, SvelteKit etc. already have built-in SSR —
 * prerender-edge is not designed for them.
 */
export interface FrameworkInfo {
    name: string;
    label: string;
    buildCommand: string;
    outputDir: string;
    /** If true, this framework has built-in SSR and doesn't need prerender-edge */
    hasBuiltInSsr?: boolean;
    ssrNote?: string;
}
export declare const SPA_FRAMEWORKS: FrameworkInfo[];
export declare const SSR_FRAMEWORKS: FrameworkInfo[];
export declare function detectFramework(projectDir?: string): FrameworkInfo | null;
export declare function getUnknownFramework(): FrameworkInfo;
//# sourceMappingURL=detect-framework.d.ts.map