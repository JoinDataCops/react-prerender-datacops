/**
 * Cloudflare init flow — smart, resumable.
 *
 * On every run it checks the actual state of each component
 * (DB exists? schema applied? worker deployed? Pages env set?)
 * and only runs the steps that are missing or broken.
 */
export declare function initCloudflare(opts: {
    force?: boolean;
}): Promise<void>;
//# sourceMappingURL=init-cloudflare.d.ts.map