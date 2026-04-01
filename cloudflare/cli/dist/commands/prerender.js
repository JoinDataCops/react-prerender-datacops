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
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import chalk from 'chalk';
import ora from 'ora';
import { confirm } from '@inquirer/prompts';
import { getProject } from '../lib/config.js';
// ── Main command ───────────────────────────────────────────────────────────────
export async function prerenderCommand(opts) {
    const cwd = process.cwd();
    const project = getProject();
    console.log('\n' + chalk.bold('  Prerender — Local Browser Rendering\n'));
    console.log(chalk.dim('  Renders your React app with real Chromium → uploads to D1 cache'));
    console.log(chalk.dim('  Bots get 100% real page content, identical to what a user sees\n'));
    if (!project?.workerUrl || !project?.workerSecret) {
        console.log(chalk.red('  No worker configured. Run `prerender-edge init` first.'));
        process.exit(1);
    }
    // ── No-browser mode: scan source + build output → upload structured HTML ──
    if (opts.noBrowser) {
        await noBrowserPrerender(opts, project);
        return;
    }
    // ── Step 1: Build (optional) ───────────────────────────────────────────────
    if (!opts.skipBuild) {
        const doBuild = await confirm({ message: 'Build the project first?', default: true });
        if (doBuild) {
            const buildCmd = detectBuildCommand(cwd);
            console.log(chalk.dim(`\n  Running: ${buildCmd}\n`));
            try {
                execSync(buildCmd, { cwd, stdio: 'inherit' });
            }
            catch {
                console.log(chalk.red('\n  Build failed. Fix errors and retry.'));
                process.exit(1);
            }
        }
    }
    // ── Step 2: Find dist directory ────────────────────────────────────────────
    const distDir = opts.dist ?? findDistDir(cwd);
    if (!distDir || !fs.existsSync(distDir)) {
        console.log(chalk.red(`\n  Build output not found at "${distDir ?? 'dist/'}".`));
        console.log(chalk.dim('  Run your build first, or use --dist <path> to specify the output directory.'));
        process.exit(1);
    }
    console.log(chalk.dim(`  Build output: ${path.relative(cwd, distDir)}/`));
    // ── Step 3: Get puppeteer ──────────────────────────────────────────────────
    const puppeteer = await ensurePuppeteer(cwd);
    // ── Step 4: Discover routes ────────────────────────────────────────────────
    const port = opts.port ?? 3997;
    const routes = await discoverRoutes(distDir, project.siteUrl, cwd);
    if (routes.length === 0) {
        console.log(chalk.yellow('\n  No routes found.'));
        console.log(chalk.dim('  Make sure you have a sitemap.xml in public/ or dist/'));
        console.log(chalk.dim('  Or add routes manually: --routes /,/pricing,/about'));
        process.exit(1);
    }
    console.log(chalk.dim(`\n  Found ${routes.length} routes to render\n`));
    // ── Step 5: Start local server ─────────────────────────────────────────────
    const server = startStaticServer(distDir, port);
    console.log(chalk.dim(`  Local server: http://localhost:${port}\n`));
    // ── Step 6: Render all pages ───────────────────────────────────────────────
    const results = [];
    const failures = [];
    const concurrency = opts.concurrency ?? 3;
    const timeout = (opts.timeout ?? 15) * 1000;
    const waitSelector = opts.selector ?? '#root > *, [data-testid], main > *';
    const spin = ora(`Launching Chromium...`).start();
    let browser = null;
    try {
        const launchOpts = {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote',
            ],
        };
        // Use system Chrome if puppeteer-core was loaded
        if (_systemChromePath) {
            launchOpts.executablePath = _systemChromePath;
            console.log(chalk.dim(`  Using system Chrome: ${launchOpts.executablePath}`));
        }
        browser = await puppeteer.launch(launchOpts);
        spin.text = `Rendering ${routes.length} pages (${concurrency} at a time)...`;
        // Process in batches for concurrency
        for (let i = 0; i < routes.length; i += concurrency) {
            const batch = routes.slice(i, i + concurrency);
            const batchResults = await Promise.allSettled(batch.map((route) => renderPage(browser, `http://localhost:${port}`, route, waitSelector, timeout)));
            for (let j = 0; j < batchResults.length; j++) {
                const r = batchResults[j];
                if (r.status === 'fulfilled' && r.value) {
                    results.push(r.value);
                    spin.text = `Rendered ${results.length}/${routes.length}: ${batch[j]}`;
                }
                else {
                    failures.push(batch[j]);
                    console.warn(chalk.yellow(`\n  ⚠ Failed: ${batch[j]}`));
                }
            }
        }
        spin.succeed(`Rendered ${results.length}/${routes.length} pages${failures.length > 0 ? ` (${failures.length} failed)` : ''}`);
    }
    finally {
        await browser?.close().catch(() => { });
        server.close();
    }
    if (results.length === 0) {
        console.log(chalk.red('\n  Nothing rendered. Check that your app loads at http://localhost:' + port));
        process.exit(1);
    }
    // ── Step 7: Upload to D1 ──────────────────────────────────────────────────
    const uploadSpin = ora(`Uploading ${results.length} pages to D1...`).start();
    try {
        const ttlHours = opts.ttlHours ?? 24;
        const resp = await fetch(`${project.workerUrl}/api/prerender/import`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${project.workerSecret}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                pages: results.map(({ path, html, title, description }) => ({ path, html, title, description })),
                ttl_hours: ttlHours,
            }),
        });
        if (!resp.ok) {
            const text = await resp.text();
            uploadSpin.fail(`Upload failed (${resp.status}): ${text}`);
            process.exit(1);
        }
        const result = await resp.json();
        uploadSpin.succeed(`${result.imported} pages cached in D1 (expires in ${ttlHours}h)`);
    }
    catch (err) {
        uploadSpin.fail(`Upload failed: ${err.message}`);
        process.exit(1);
    }
    // ── Done ───────────────────────────────────────────────────────────────────
    console.log(`
  ${chalk.bold.green('✓ Done!')}

  ${results.length} pages pre-rendered with real Chromium → stored in D1.
  Bots now get complete HTML — every heading, paragraph, pricing table, FAQ.

  ${chalk.bold('Verify:')}
  ${chalk.cyan(`curl -A "Googlebot/2.1" ${project.siteUrl}/pricing`)}

  ${chalk.bold('Add to your CI/build pipeline:')}
  ${chalk.dim('"postbuild": "prerender-edge prerender --skip-build"')}
  ${chalk.dim('→ Runs automatically on every deploy. Cache TTL: ' + (opts.ttlHours ?? 24) + 'h')}
  `);
    if (failures.length > 0) {
        console.log(chalk.yellow(`  Failed routes (${failures.length}):`));
        failures.forEach((f) => console.log(chalk.dim(`    ${f}`)));
        console.log();
    }
}
// ── Render a single page with Puppeteer ───────────────────────────────────────
async function renderPage(browser, baseUrl, route, waitSelector, timeout) {
    const page = await browser.newPage();
    try {
        // Ignore image and font requests (faster)
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const type = req.resourceType();
            if (['image', 'font', 'media'].includes(type))
                req.abort();
            else
                req.continue();
        });
        await page.setViewport({ width: 1280, height: 900 });
        await page.setUserAgent('prerender-edge/1.0 (local-renderer)');
        await page.goto(`${baseUrl}${route}`, {
            waitUntil: 'networkidle0',
            timeout,
        });
        // Wait for React to render content (runs inside Chromium — DOM available)
        await page
            .waitForFunction((sel) => {
            const el = document.querySelector(sel);
            return el !== null && el.children.length > 0;
        }, { timeout }, waitSelector)
            .catch(() => { });
        // Additional settle time for lazy-loaded content
        await page.evaluate(() => new Promise((r) => setTimeout(r, 500)));
        const rawHtml = await page.content();
        const title = await page.title();
        const description = await page
            .$eval('meta[name="description"]', (el) => el.content ?? '')
            .catch(() => '');
        const html = cleanHtmlForBots(rawHtml, route);
        return { path: route, html, title, description };
    }
    finally {
        await page.close().catch(() => { });
    }
}
// ── Clean rendered HTML for bot serving ───────────────────────────────────────
// Remove JS bundles (bots don't need them), keep all content + structured data
function cleanHtmlForBots(rawHtml, path) {
    let html = rawHtml;
    // Remove JS module scripts (React bundles)
    html = html.replace(/<script\b(?![^>]*type=["']application\/ld\+json["'])[^>]*src=["'][^"']*["'][^>]*>\s*<\/script>/gi, '');
    html = html.replace(/<script\b(?![^>]*type=["']application\/ld\+json["'])[^>]*type=["']module["'][^>]*>[\s\S]*?<\/script>/gi, '');
    html = html.replace(/<script\b(?![^>]*type=["']application\/ld\+json["'])[^>]*>[\s\S]*?<\/script>/gi, (match) => {
        // Keep ld+json, remove everything else
        if (match.includes('application/ld+json'))
            return match;
        return '';
    });
    // Remove Vite/webpack HMR artifacts
    html = html.replace(/<!--\s*vite.*?-->/gi, '');
    html = html.replace(/<link[^>]+modulepreload[^>]*>/gi, '');
    // Remove React dev attributes
    html = html.replace(/\s+data-reactroot=""/g, '');
    // Add prerender marker if not present
    if (!html.includes('prerender-status')) {
        html = html.replace(/<\/head>/i, `  <meta name="prerender-status" content="success">\n  <meta name="prerender-date" content="${new Date().toISOString()}">\n</head>`);
    }
    return html;
}
// ── Puppeteer installer ────────────────────────────────────────────────────────
/**
 * Try to find a working Chrome/Chromium binary on the system.
 * Returns the path if found, null otherwise.
 */
function findSystemChrome() {
    const isWin = process.platform === 'win32';
    const isMac = process.platform === 'darwin';
    const candidates = isWin
        ? [
            process.env['PROGRAMFILES(X86)'] ? path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
            process.env.PROGRAMFILES ? path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
            process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
            process.env['PROGRAMFILES(X86)'] ? path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe') : '',
            process.env.PROGRAMFILES ? path.join(process.env.PROGRAMFILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe') : '',
        ].filter(Boolean)
        : isMac
            ? [
                '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                '/Applications/Chromium.app/Contents/MacOS/Chromium',
                '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
            ]
            : [
                '/usr/bin/google-chrome',
                '/usr/bin/google-chrome-stable',
                '/usr/bin/chromium',
                '/usr/bin/chromium-browser',
                '/snap/bin/chromium',
            ];
    for (const c of candidates) {
        if (fs.existsSync(c))
            return c;
    }
    // Try `which` / `where` as a last resort
    try {
        const cmd = isWin ? 'where chrome 2>nul' : 'which google-chrome 2>/dev/null || which chromium 2>/dev/null';
        const result = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
        if (result && fs.existsSync(result.split('\n')[0]))
            return result.split('\n')[0];
    }
    catch { }
    return null;
}
/**
 * Resolve the correct ESM entry point for a package in the user's node_modules.
 * Reads the package's package.json → finds the right file.
 *
 * puppeteer uses:       lib/cjs/puppeteer/puppeteer.js
 * puppeteer-core uses:  lib/cjs/puppeteer/puppeteer-core.js
 */
function resolvePackageEntry(pkgDir) {
    const pkgJsonPath = path.join(pkgDir, 'package.json');
    if (!fs.existsSync(pkgJsonPath))
        throw new Error(`No package.json at ${pkgDir}`);
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    const candidates = [
        // ESM entries (preferred)
        typeof pkgJson.exports === 'string' ? pkgJson.exports : undefined,
        pkgJson.exports?.['.']?.import,
        pkgJson.exports?.['.']?.require,
        pkgJson.exports?.['.']?.default,
        pkgJson.module,
        pkgJson.main,
        // Known puppeteer paths as fallback
        'lib/esm/puppeteer/puppeteer-core.js',
        'lib/esm/puppeteer/puppeteer.js',
        'lib/cjs/puppeteer/puppeteer-core.js',
        'lib/cjs/puppeteer/puppeteer.js',
        'index.js',
    ];
    for (const candidate of candidates) {
        if (!candidate)
            continue;
        const resolved = candidate.startsWith('./') ? candidate.slice(2) : candidate;
        const full = path.join(pkgDir, resolved);
        if (fs.existsSync(full))
            return full;
    }
    throw new Error(`Cannot find entry point for package at ${pkgDir}`);
}
/** Import a package from the user's node_modules by resolving its entry point */
async function importFromUserProject(cwd, pkgName) {
    const pkgDir = path.join(cwd, 'node_modules', pkgName);
    const entry = resolvePackageEntry(pkgDir);
    return await import(pathToFileURL(entry).href);
}
// Module-level variable to pass system Chrome path to the launch step
// (ESM module objects are frozen — can't add properties to them)
let _systemChromePath = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensurePuppeteer(cwd) {
    _systemChromePath = null;
    // 1. Check in user's project first (puppeteer full)
    const localPath = path.join(cwd, 'node_modules', 'puppeteer');
    if (fs.existsSync(localPath)) {
        try {
            return await importFromUserProject(cwd, 'puppeteer');
        }
        catch { }
    }
    // 2. Try direct import (works if puppeteer is in CLI's own node_modules or global)
    try {
        return await import('puppeteer');
    }
    catch { }
    // 3. Try puppeteer-core + system Chrome (lightweight, no download)
    const systemChrome = findSystemChrome();
    if (systemChrome) {
        // Try puppeteer-core from user's project
        const corePath = path.join(cwd, 'node_modules', 'puppeteer-core');
        if (fs.existsSync(corePath)) {
            try {
                const core = await importFromUserProject(cwd, 'puppeteer-core');
                _systemChromePath = systemChrome;
                return core;
            }
            catch { }
        }
        // Try global puppeteer-core
        try {
            const core = await import('puppeteer-core');
            _systemChromePath = systemChrome;
            return core;
        }
        catch { }
    }
    // 4. Not found — offer to install
    console.log(chalk.yellow('\n  puppeteer is not installed.'));
    console.log(chalk.dim('  It downloads Chromium (~170MB) once and uses it for local rendering.\n'));
    if (systemChrome) {
        console.log(chalk.dim(`  System Chrome found: ${systemChrome}`));
        console.log(chalk.dim('  Will try puppeteer-core (no Chromium download needed).\n'));
    }
    const install = await confirm({ message: 'Install puppeteer in this project now?', default: true });
    if (!install) {
        console.log(chalk.dim('\n  Install manually: npm install --save-dev puppeteer'));
        process.exit(1);
    }
    // Try install with escalating strategies to avoid peer dep conflicts
    const pkg = systemChrome ? 'puppeteer-core' : 'puppeteer';
    const installSpin = ora(`Installing ${pkg}${systemChrome ? '' : ' (downloading Chromium, ~170MB)'}...`).start();
    const installStrategies = [
        `npm install --save-dev ${pkg} --legacy-peer-deps`,
        `npm install --save-dev ${pkg} --force`,
    ];
    let installed = false;
    for (const cmd of installStrategies) {
        try {
            execSync(cmd, { cwd, stdio: 'pipe' });
            installed = true;
            installSpin.succeed(`${pkg} installed`);
            break;
        }
        catch {
            // Try next strategy
        }
    }
    if (!installed) {
        installSpin.fail('Install failed');
        console.log(chalk.dim(`  Your project has dependency conflicts that block installation.`));
        console.log(chalk.dim(`  Try one of:`));
        console.log(chalk.cyan(`    npm install --save-dev ${pkg} --legacy-peer-deps`));
        console.log(chalk.cyan(`    npm install -g puppeteer`));
        console.log(chalk.dim(`  Or use: ${chalk.cyan('prerender-edge prerender --no-browser')}`));
        throw new Error(`Could not install ${pkg}`);
    }
    const mod = await importFromUserProject(cwd, pkg);
    if (systemChrome && pkg === 'puppeteer-core') {
        _systemChromePath = systemChrome;
    }
    return mod;
}
// ── Local static file server ───────────────────────────────────────────────────
function startStaticServer(distDir, port) {
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.woff2': 'font/woff2',
    };
    const server = http.createServer((req, res) => {
        let urlPath = req.url?.split('?')[0] ?? '/';
        // SPA fallback: try exact path, then index.html
        const candidates = [
            path.join(distDir, urlPath),
            path.join(distDir, urlPath, 'index.html'),
            path.join(distDir, 'index.html'),
        ];
        for (const filePath of candidates) {
            if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                const ext = path.extname(filePath);
                res.setHeader('Content-Type', mimeTypes[ext] ?? 'application/octet-stream');
                res.end(fs.readFileSync(filePath));
                return;
            }
        }
        // Final fallback to index.html (SPA routing)
        const indexPath = path.join(distDir, 'index.html');
        if (fs.existsSync(indexPath)) {
            res.setHeader('Content-Type', 'text/html');
            res.end(fs.readFileSync(indexPath));
        }
        else {
            res.writeHead(404);
            res.end('Not found');
        }
    });
    server.listen(port);
    return server;
}
// ── Route discovery ────────────────────────────────────────────────────────────
//
// Local-first route discovery — never depends on a live URL.
//
// Priority:
//   1. Local sitemap.xml  (dist/, public/, or project root)
//   2. React Router paths (extracted from source code)
//   3. Page component files (src/pages/*.tsx → /page-name)
//   4. Built HTML files (dist/**/index.html)
//   5. Live sitemap (ONLY as a last resort if site is already published)
async function discoverRoutes(distDir, siteUrl, cwd) {
    const routes = new Set();
    routes.add('/');
    const projectDir = cwd ?? process.cwd();
    // ── 1. Local sitemap.xml ──────────────────────────────────────────────────
    const sitemapCandidates = [
        path.join(distDir, 'sitemap.xml'),
        path.join(projectDir, 'public', 'sitemap.xml'),
        path.join(projectDir, 'sitemap.xml'),
    ];
    for (const sitemapPath of sitemapCandidates) {
        if (fs.existsSync(sitemapPath)) {
            const xml = fs.readFileSync(sitemapPath, 'utf-8');
            for (const m of xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)) {
                try {
                    routes.add(new URL(m[1].trim()).pathname);
                }
                catch {
                    const loc = m[1].trim();
                    if (loc.startsWith('/'))
                        routes.add(loc);
                }
            }
            break;
        }
    }
    // ── 2. Extract routes from React Router / source code ─────────────────────
    const srcRoutes = extractRoutesFromSource(projectDir);
    for (const r of srcRoutes)
        routes.add(r);
    // ── 3. Page component files → route mapping ──────────────────────────────
    if (routes.size <= 1) {
        const pageRoutes = discoverPageComponentRoutes(projectDir);
        for (const r of pageRoutes)
            routes.add(r);
    }
    // ── 4. Scan dist/ for HTML files ──────────────────────────────────────────
    if (fs.existsSync(distDir)) {
        scanHtmlFiles(distDir, distDir, routes);
    }
    // ── 5. Live sitemap (last resort — site may not be published yet) ─────────
    if (routes.size <= 1 && siteUrl) {
        const normalizedSiteUrl = siteUrl.replace(/\/+$/, '');
        for (const sitemapUrl of [`${normalizedSiteUrl}/sitemap.xml`, `${normalizedSiteUrl}/sitemap_index.xml`]) {
            try {
                const res = await fetch(sitemapUrl, {
                    headers: { 'User-Agent': 'prerender-edge/1.0 (sitemap-reader)' },
                    signal: AbortSignal.timeout(5000),
                });
                if (!res.ok)
                    continue;
                const xml = await res.text();
                if (xml.includes('<sitemapindex')) {
                    const childUrls = [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)].map((m) => m[1].trim());
                    for (const childUrl of childUrls) {
                        try {
                            const childRes = await fetch(childUrl, {
                                headers: { 'User-Agent': 'prerender-edge/1.0 (sitemap-reader)' },
                                signal: AbortSignal.timeout(5000),
                            });
                            if (!childRes.ok)
                                continue;
                            const childXml = await childRes.text();
                            for (const m of childXml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)) {
                                try {
                                    routes.add(new URL(m[1].trim()).pathname);
                                }
                                catch { }
                            }
                        }
                        catch { }
                    }
                    break;
                }
                if (xml.includes('<urlset')) {
                    for (const m of xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)) {
                        try {
                            routes.add(new URL(m[1].trim()).pathname);
                        }
                        catch { }
                    }
                    break;
                }
            }
            catch { }
        }
    }
    return [...routes].sort();
}
// ── Extract routes from React Router config ────────────────────────────────────
//
// Searches for route definitions in the source code:
//   - <Route path="/pricing" ...>
//   - { path: "/pricing", ... }
//   - createBrowserRouter([{ path: "/about" }])
//   - to="/contact" (Link destinations)
function extractRoutesFromSource(projectDir) {
    const routes = [];
    const srcDir = findSrcDir(projectDir);
    if (!srcDir)
        return routes;
    const files = [];
    collectSourceFiles(srcDir, ['.tsx', '.jsx', '.ts', '.js'], files, 5);
    for (const file of files) {
        try {
            const content = fs.readFileSync(file, 'utf-8');
            // <Route path="/pricing" ...>
            for (const m of content.matchAll(/<Route\s[^>]*path=["']([^"'*:]+)["']/g)) {
                const p = m[1].trim();
                if (p.startsWith('/') && !p.includes(':') && !p.includes('*'))
                    routes.push(p);
            }
            // path: "/pricing" (in route config objects)
            for (const m of content.matchAll(/path\s*:\s*["']([^"'*:]+)["']/g)) {
                const p = m[1].trim();
                if (p.startsWith('/') && !p.includes(':') && !p.includes('*'))
                    routes.push(p);
            }
            // to="/contact" or to={"/contact"} (Link / NavLink destinations)
            for (const m of content.matchAll(/\bto=(?:["']|{["'])([^"'*:]+)["']/g)) {
                const p = m[1].trim();
                if (p.startsWith('/') && !p.includes(':') && !p.includes('*') && !p.includes('?') && !p.startsWith('//'))
                    routes.push(p);
            }
            // href="/about" or href={"/about"} in <a> tags
            for (const m of content.matchAll(/href=(?:["']|{["'])([^"'*:]+)["']/g)) {
                const p = m[1].trim();
                if (p.startsWith('/') && !p.includes(':') && !p.includes('*') && !p.startsWith('//') && !p.includes('.'))
                    routes.push(p);
            }
            // navigate("/dashboard") or navigate('/dashboard') — programmatic navigation
            for (const m of content.matchAll(/navigate\(["']([^"'*:]+)["']/g)) {
                const p = m[1].trim();
                if (p.startsWith('/') && !p.includes(':') && !p.includes('*'))
                    routes.push(p);
            }
            // createBrowserRouter / createHashRouter — array of route objects
            // element: <Component />, path: already matched above
            // NavLink or Link component with string children often indicate routes
            // e.g., <NavLink to="/market">Market</NavLink>  — already caught by `to=` above
        }
        catch { }
    }
    // Deduplicate and filter
    return [...new Set(routes)].filter((r) => r.length > 0 &&
        r.startsWith('/') &&
        !r.includes('#') &&
        !r.endsWith('.js') &&
        !r.endsWith('.css') &&
        !r.endsWith('.png') &&
        !r.endsWith('.svg') &&
        !r.startsWith('/api/'));
}
// ── Discover routes from page component filenames ─────────────────────────────
//
// Maps:  src/pages/Pricing.tsx     → /pricing
//        src/pages/about/Team.tsx  → /about/team
//        src/pages/Home.tsx        → /
function discoverPageComponentRoutes(projectDir) {
    const routes = [];
    const srcDir = findSrcDir(projectDir);
    if (!srcDir)
        return routes;
    const pageDirs = ['pages', 'views', 'screens', 'routes'];
    const exts = ['.tsx', '.jsx', '.vue', '.svelte'];
    for (const dir of pageDirs) {
        const fullDir = path.join(srcDir, dir);
        if (!fs.existsSync(fullDir))
            continue;
        const files = [];
        collectSourceFiles(fullDir, exts, files, 3);
        for (const file of files) {
            const base = path.basename(file, path.extname(file)).toLowerCase();
            // Skip non-page files
            if (base.includes('.test') || base.includes('.spec') || base.includes('.stories') ||
                base.startsWith('use') || base.startsWith('_') ||
                ['layout', 'provider', 'store', 'context', 'types', 'utils', 'helpers', 'constants'].includes(base))
                continue;
            // Map filename to route
            const homeNames = ['home', 'homepage', 'index', 'landing', 'main'];
            if (homeNames.includes(base)) {
                routes.push('/');
                continue;
            }
            // Build route from relative path
            const rel = path.relative(fullDir, file);
            const noExt = rel.replace(/\.[^.]+$/, '');
            const parts = noExt.split(path.sep).map((p) => p.toLowerCase());
            // Remove trailing "index"
            if (parts[parts.length - 1] === 'index')
                parts.pop();
            if (parts.length > 0) {
                routes.push('/' + parts.join('/'));
            }
        }
    }
    return [...new Set(routes)];
}
function collectSourceFiles(dir, exts, out, maxDepth, depth = 0) {
    if (depth > maxDepth)
        return;
    try {
        for (const entry of fs.readdirSync(dir)) {
            if (entry.startsWith('.') || entry === 'node_modules')
                continue;
            const full = path.join(dir, entry);
            const stat = fs.statSync(full);
            if (stat.isDirectory()) {
                collectSourceFiles(full, exts, out, maxDepth, depth + 1);
            }
            else if (exts.some((e) => entry.endsWith(e))) {
                out.push(full);
            }
        }
    }
    catch { }
}
function scanHtmlFiles(dir, base, routes, depth = 0) {
    if (depth > 4)
        return;
    try {
        for (const entry of fs.readdirSync(dir)) {
            const full = path.join(dir, entry);
            if (fs.statSync(full).isDirectory()) {
                scanHtmlFiles(full, base, routes, depth + 1);
            }
            else if (entry === 'index.html') {
                const rel = path.relative(base, dir);
                const route = rel === '' ? '/' : '/' + rel.replace(/\\/g, '/');
                routes.add(route);
            }
        }
    }
    catch { }
}
// ── Build helpers ──────────────────────────────────────────────────────────────
function detectBuildCommand(cwd) {
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8'));
        if (pkg.scripts?.build)
            return 'npm run build';
    }
    catch { }
    return 'npm run build';
}
function findDistDir(cwd) {
    for (const candidate of ['dist', 'build', 'out', '.next', 'public']) {
        const p = path.join(cwd, candidate);
        if (fs.existsSync(p) && fs.existsSync(path.join(p, 'index.html')))
            return p;
    }
    return null;
}
// ── No-browser SSG rendering (happy-dom) ──────────────────────────────────────
//
// Like Next.js SSG — but for any SPA, without Chromium.
//
// How it works:
//   1. Builds your React app (npm run build)
//   2. Starts a local HTTP server on the built output
//   3. Uses happy-dom (lightweight Node.js DOM, ~2MB) to load each page
//   4. happy-dom fetches index.html + executes your JS bundles
//   5. React renders inside happy-dom — same as it would in a browser
//   6. Captures the complete rendered DOM for each route
//   7. Cleans the HTML and uploads to D1
//
// Advantages over Chromium:
//   - No 170MB browser download
//   - ~10x faster per page (no rendering engine overhead)
//   - No native binary dependencies — works everywhere Node.js runs
//   - No peer dependency conflicts
//
// Limitations:
//   - Some browser APIs (Canvas, WebGL, IntersectionObserver) are not available
//   - Very complex animations/transitions may not execute
//   - If a page fails, falls back to source-scan content for that page
const HAPPY_DOM_TIMEOUT_MS = 12_000;
const HAPPY_DOM_SETTLE_MS = 1500;
const HAPPY_DOM_CONCURRENCY = 5;
async function noBrowserPrerender(opts, project) {
    const cwd = process.cwd();
    console.log('\n' + chalk.bold('  Prerender — SSG Mode (happy-dom)\n'));
    console.log(chalk.dim('  Like Next.js SSG — executes your React app in Node.js, no Chromium needed.'));
    console.log(chalk.dim('  Captures real rendered DOM for every page.\n'));
    // ── Step 1: Build (optional) ───────────────────────────────────────────────
    if (!opts.skipBuild) {
        const doBuild = await confirm({ message: 'Build the project first?', default: true });
        if (doBuild) {
            const buildCmd = detectBuildCommand(cwd);
            console.log(chalk.dim(`\n  Running: ${buildCmd}\n`));
            try {
                execSync(buildCmd, { cwd, stdio: 'inherit' });
            }
            catch {
                console.log(chalk.red('\n  Build failed. Fix errors and retry.'));
                process.exit(1);
            }
        }
    }
    // ── Step 2: Find dist directory ────────────────────────────────────────────
    const distDir = opts.dist ?? findDistDir(cwd);
    if (!distDir || !fs.existsSync(distDir)) {
        console.log(chalk.red(`\n  Build output not found at "${distDir ?? 'dist/'}".`));
        console.log(chalk.dim('  Run your build first, or use --dist <path>.'));
        process.exit(1);
    }
    console.log(chalk.dim(`  Build output: ${path.relative(cwd, distDir)}/`));
    // ── Step 3: Discover routes ────────────────────────────────────────────────
    const port = opts.port ?? 3998;
    const routes = await discoverRoutes(distDir, project.siteUrl, cwd);
    if (routes.length === 0) {
        console.log(chalk.yellow('\n  No routes found. Make sure you have a sitemap.xml.'));
        process.exit(1);
    }
    console.log(chalk.dim(`  Found ${routes.length} routes to render\n`));
    // ── Step 4: Prepare scan-based fallback content ────────────────────────────
    const scanFallback = await buildScanFallback(cwd);
    // ── Step 5: Start local server ─────────────────────────────────────────────
    const server = startStaticServer(distDir, port);
    console.log(chalk.dim(`  Local server: http://localhost:${port}`));
    // ── Step 6: Render all pages with happy-dom ────────────────────────────────
    const results = [];
    const failures = [];
    const domRendered = [];
    const scanUsed = [];
    const concurrency = opts.concurrency ?? HAPPY_DOM_CONCURRENCY;
    const timeoutMs = (opts.timeout ?? 12) * 1000;
    const waitSelector = opts.selector ?? '#root';
    const spin = ora(`Rendering ${routes.length} pages with happy-dom (${concurrency} at a time)...`).start();
    // Global error trap — happy-dom triggers async DNS errors (ENOTFOUND) that fire
    // after individual page handlers complete. Keep this active for the entire batch.
    const suppressedErrors = [];
    const globalErrorTrap = (err) => { suppressedErrors.push(err); };
    process.on('uncaughtException', globalErrorTrap);
    try {
        // Import happy-dom
        const { Window } = await import('happy-dom');
        for (let i = 0; i < routes.length; i += concurrency) {
            const batch = routes.slice(i, i + concurrency);
            const batchResults = await Promise.allSettled(batch.map((route) => renderWithHappyDom(Window, `http://localhost:${port}`, route, waitSelector, timeoutMs)));
            for (let j = 0; j < batchResults.length; j++) {
                const r = batchResults[j];
                const route = batch[j];
                if (r.status === 'fulfilled' && r.value) {
                    results.push(r.value);
                    domRendered.push(route);
                    spin.text = `Rendered ${results.length}/${routes.length}: ${route}`;
                }
                else {
                    // Fallback to scan-based content for this route
                    const fallback = buildFallbackPage(route, project, scanFallback, distDir);
                    if (fallback) {
                        results.push(fallback);
                        scanUsed.push(route);
                        spin.text = `Rendered ${results.length}/${routes.length}: ${route} ${chalk.dim('(scan fallback)')}`;
                    }
                    else {
                        failures.push(route);
                    }
                }
            }
        }
        spin.succeed(`Rendered ${results.length}/${routes.length} pages` +
            (domRendered.length > 0 ? chalk.green(` (${domRendered.length} DOM-rendered)`) : '') +
            (scanUsed.length > 0 ? chalk.yellow(` (${scanUsed.length} scan-fallback)`) : '') +
            (failures.length > 0 ? chalk.red(` (${failures.length} failed)`) : ''));
    }
    catch (err) {
        spin.fail(`happy-dom rendering failed: ${err.message}`);
        server.close();
        throw err;
    }
    finally {
        server.close();
        // Wait a moment for any straggling async DNS errors before removing the trap
        await new Promise((r) => setTimeout(r, 2000));
        process.removeListener('uncaughtException', globalErrorTrap);
        if (suppressedErrors.length > 0) {
            console.log(chalk.dim(`  (Suppressed ${suppressedErrors.length} async network errors from happy-dom)`));
        }
    }
    if (results.length === 0) {
        console.log(chalk.red('\n  Nothing rendered.'));
        process.exit(1);
    }
    // ── Step 7: Upload to D1 ──────────────────────────────────────────────────
    const uploadSpin = ora(`Uploading ${results.length} pages to D1...`).start();
    try {
        const ttlHours = opts.ttlHours ?? 24;
        const resp = await fetch(`${project.workerUrl}/api/prerender/import`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${project.workerSecret}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                pages: results.map(({ path, html, title, description }) => ({ path, html, title, description })),
                ttl_hours: ttlHours,
            }),
        });
        if (!resp.ok) {
            const text = await resp.text();
            uploadSpin.fail(`Upload failed (${resp.status}): ${text}`);
            process.exit(1);
        }
        const result = await resp.json();
        uploadSpin.succeed(`${result.imported} pages cached in D1 (expires in ${ttlHours}h)`);
    }
    catch (err) {
        uploadSpin.fail(`Upload failed: ${err.message}`);
        process.exit(1);
    }
    // ── Done ───────────────────────────────────────────────────────────────────
    console.log(`
  ${chalk.bold.green('✓ Done!')}

  ${results.length} pages rendered → stored in D1.
  ${chalk.green(`${domRendered.length} pages`)} rendered with real JS execution (happy-dom)
  ${scanUsed.length > 0 ? chalk.yellow(`${scanUsed.length} pages`) + ' used scan-based fallback' : ''}

  ${chalk.bold('Verify:')}
  ${chalk.cyan(`curl -A "Googlebot/2.1" ${project.siteUrl}/`)}

  ${chalk.bold('Add to your CI/build pipeline:')}
  ${chalk.dim('"postbuild": "prerender-edge prerender --no-browser --skip-build"')}
  `);
    if (failures.length > 0) {
        console.log(chalk.yellow(`  Failed routes (${failures.length}):`));
        failures.forEach((f) => console.log(chalk.dim(`    ${f}`)));
        console.log();
    }
}
// ── happy-dom page renderer ──────────────────────────────────────────────────
async function renderWithHappyDom(
// eslint-disable-next-line @typescript-eslint/no-explicit-any
Window, baseUrl, route, waitSelector, timeout) {
    const url = `${baseUrl}${route}`;
    const window = new Window({
        url,
        width: 1280,
        height: 900,
        settings: {
            disableJavaScriptFileLoading: false,
            disableJavaScriptEvaluation: false,
            disableCSSFileLoading: true,
            disableIFramePageLoading: true,
            navigator: { userAgent: 'prerender-edge/1.0 (ssg-renderer)' },
        },
    });
    // Override window.fetch to prevent external network calls from crashing
    // Only allow requests to our local server
    const originalFetch = window.fetch?.bind(window);
    window.fetch = async (input, init) => {
        const reqUrl = typeof input === 'string' ? input : input?.url ?? '';
        // Allow local server requests, block everything else
        if (typeof reqUrl === 'string' && !reqUrl.startsWith(baseUrl) && !reqUrl.startsWith('/')) {
            // Return an empty response for external requests
            return new window.Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        // Relative URLs and local URLs are fine
        try {
            return await originalFetch(input, init);
        }
        catch {
            return new window.Response('', { status: 500 });
        }
    };
    try {
        // Fetch the page HTML from local server (using Node fetch, not happy-dom fetch)
        const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!resp.ok)
            return null;
        const html = await resp.text();
        // Write HTML into happy-dom (this triggers script execution)
        window.document.write(html);
        // Wait for async operations (script loading, React render)
        await Promise.race([
            window.happyDOM.waitUntilComplete(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeout)),
        ]).catch(() => {
            // Timeout is OK — content may still be present from initial render
        });
        // Poll for React content to appear in the root element
        const rendered = await pollForContent(window, waitSelector, Math.min(timeout, 5000));
        if (!rendered) {
            const root = window.document.querySelector(waitSelector);
            if (!root || root.innerHTML.trim().length < 50) {
                return null;
            }
        }
        // Additional settle time for lazy-loaded content
        await new Promise((r) => setTimeout(r, HAPPY_DOM_SETTLE_MS));
        // Extract the rendered page
        const doc = window.document;
        const title = doc.title || '';
        const descMeta = doc.querySelector('meta[name="description"]');
        const description = descMeta?.getAttribute('content') ?? '';
        // Get the full body content (React-rendered DOM)
        const rootEl = doc.querySelector(waitSelector);
        const bodyContent = rootEl?.innerHTML ?? doc.body.innerHTML;
        if (!bodyContent || bodyContent.trim().length < 50) {
            return null;
        }
        // Build clean HTML for bots
        const cleanBody = cleanDomContent(bodyContent);
        const fullHtml = buildSsgHtml({
            title,
            description,
            route,
            siteUrl: baseUrl.replace(/:\d+$/, ''), // remove port for canonical
            body: cleanBody,
            ogImage: doc.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? '',
            favicon: doc.querySelector('link[rel="icon"]')?.getAttribute('href') ?? '/favicon.ico',
        });
        return { path: route, html: fullHtml, title, description };
    }
    catch {
        return null;
    }
    finally {
        await window.happyDOM.close().catch(() => { });
    }
}
// ── Poll for content ─────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pollForContent(window, selector, timeout) {
    const start = Date.now();
    const interval = 200;
    while (Date.now() - start < timeout) {
        const el = window.document.querySelector(selector);
        if (el && el.children.length > 0) {
            // Check for meaningful content (not just a loading spinner)
            const text = el.textContent?.trim() ?? '';
            if (text.length > 30)
                return true;
        }
        await new Promise((r) => setTimeout(r, interval));
    }
    return false;
}
// ── Clean DOM content for bot serving ────────────────────────────────────────
function cleanDomContent(html) {
    let clean = html;
    // Remove inline scripts (React won't re-hydrate for bots)
    clean = clean.replace(/<script\b(?![^>]*type=["']application\/ld\+json["'])[^>]*>[\s\S]*?<\/script>/gi, (match) => {
        if (match.includes('application/ld+json'))
            return match;
        return '';
    });
    // Remove style tags (not needed for bot content indexing)
    clean = clean.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    // Remove empty divs (React mount artifacts)
    clean = clean.replace(/<div[^>]*>\s*<\/div>/gi, '');
    // Remove data-reactroot and other React dev attributes
    clean = clean.replace(/\s+data-reactroot=""/g, '');
    clean = clean.replace(/\s+data-react-[\w-]+="[^"]*"/g, '');
    // Clean up excessive whitespace
    clean = clean.replace(/\n\s*\n\s*\n/g, '\n\n');
    return clean.trim();
}
// ── Build SSG HTML document ─────────────────────────────────────────────────
function buildSsgHtml(opts) {
    const siteUrl = opts.siteUrl.replace(/\/$/, '');
    const canonical = `${siteUrl}${opts.route}`;
    const desc = opts.description.length > 160 ? opts.description.slice(0, 157) + '...' : opts.description;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(opts.title)}</title>
  <meta name="description" content="${escHtml(desc)}">
  <link rel="canonical" href="${canonical}">
  ${opts.favicon ? `<link rel="icon" href="${escHtml(opts.favicon)}">` : ''}

  <!-- Open Graph -->
  <meta property="og:title" content="${escHtml(opts.title)}">
  <meta property="og:description" content="${escHtml(desc)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:type" content="website">
  ${opts.ogImage ? `<meta property="og:image" content="${escHtml(opts.ogImage)}">` : ''}

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escHtml(opts.title)}">
  <meta name="twitter:description" content="${escHtml(desc)}">

  <!-- Prerender marker -->
  <meta name="prerender-status" content="success">
  <meta name="prerender-date" content="${new Date().toISOString()}">
  <meta name="generator" content="prerender-edge/ssg (happy-dom)">
</head>
<body>
  <div id="root">
    ${opts.body}
  </div>
</body>
</html>`;
}
async function buildScanFallback(cwd) {
    try {
        // Try to run the scan command silently
        const srcDir = findSrcDir(cwd);
        if (!srcDir)
            return null;
        const { scanCommand } = await import('./scan.js');
        await scanCommand({ silent: true });
        const contentPath = findContentJson(cwd);
        if (!contentPath)
            return null;
        return JSON.parse(fs.readFileSync(contentPath, 'utf-8'));
    }
    catch {
        return null;
    }
}
function buildFallbackPage(route, project, scanData, distDir) {
    const pageDef = scanData?.pages?.[route];
    // Extract meta from built index.html
    const indexPath = path.join(distDir, 'index.html');
    let buildTitle = '';
    let buildDesc = '';
    if (fs.existsSync(indexPath)) {
        const html = fs.readFileSync(indexPath, 'utf-8');
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
            || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
        buildTitle = titleMatch?.[1]?.trim() ?? '';
        buildDesc = descMatch?.[1]?.trim() ?? '';
    }
    const brand = scanData?.brand ?? project.name ?? 'Site';
    const title = pageDef?.title ?? buildTitle ?? routeToLabel(route);
    const description = pageDef?.description ?? buildDesc ?? '';
    // Build body from scanned sections
    let body = '';
    if (pageDef?.sections && pageDef.sections.length > 0) {
        body = pageDef.sections.map((s) => renderFallbackSection(s)).filter(Boolean).join('\n    ');
    }
    else {
        body = `<article><h1>${escHtml(title)}</h1>${description ? `<p>${escHtml(description)}</p>` : ''}</article>`;
    }
    const html = buildSsgHtml({
        title,
        description,
        route,
        siteUrl: project.siteUrl,
        body,
    });
    return { path: route, html, title, description };
}
function renderFallbackSection(s) {
    const h = s.heading ? `<h2>${escHtml(s.heading)}</h2>` : '';
    switch (s.type) {
        case 'hero':
            return `<section>${s.heading ? `<h1>${escHtml(s.heading)}</h1>` : ''}${s.text ? `<p>${escHtml(s.text)}</p>` : ''}</section>`;
        case 'text':
            return `<section>${h}${(s.paragraphs ?? []).map((p) => `<p>${escHtml(p)}</p>`).join('\n      ')}</section>`;
        case 'features': {
            const items = (s.items ?? []).map((item) => {
                if (typeof item === 'string')
                    return `<li>${escHtml(item)}</li>`;
                if (item && typeof item === 'object' && 'title' in item)
                    return `<li>${escHtml(item.title)}</li>`;
                return '';
            }).join('\n        ');
            return `<section>${h}<ul>${items}</ul></section>`;
        }
        default:
            return h ? `<section>${h}</section>` : '';
    }
}
// ── Shared helpers ────────────────────────────────────────────────────────────
function findContentJson(cwd) {
    for (const candidate of ['public/prerender-content.json', 'dist/prerender-content.json', 'prerender-content.json']) {
        const p = path.join(cwd, candidate);
        if (fs.existsSync(p))
            return p;
    }
    return null;
}
function findSrcDir(cwd) {
    for (const candidate of ['src', 'app', 'pages', 'src/app']) {
        const p = path.join(cwd, candidate);
        if (fs.existsSync(p) && fs.statSync(p).isDirectory())
            return p;
    }
    return null;
}
function routeToLabel(route) {
    if (route === '/')
        return 'Home';
    return route
        .replace(/^\//, '')
        .split('/')
        .pop()
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
}
function escHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
//# sourceMappingURL=prerender.js.map