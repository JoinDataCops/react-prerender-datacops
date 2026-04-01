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
import chalk from 'chalk';
import { input, confirm } from '@inquirer/prompts';
import { executeD1Sql } from './cf-api.js';
// ── Main wizard ────────────────────────────────────────────────────────────────
export async function runPageWizard(siteUrl, _workerDir) {
    const base = siteUrl.replace(/\/$/, '');
    const hostname = (() => { try {
        return new URL(base).hostname.replace(/^www\./, '');
    }
    catch {
        return base;
    } })();
    console.log(chalk.bold.cyan('\n  Page Content Setup\n'));
    console.log(chalk.dim('  Configure what Googlebot, Twitterbot, and other crawlers see.\n') +
        chalk.dim('  Real users always get your full React/Vue/Angular app.\n') +
        chalk.dim('  The richer the content, the better your SEO rankings.\n'));
    const brandName = await input({
        message: 'Brand / site name:',
        default: hostname.split('.')[0].replace(/\b\w/g, (c) => c.toUpperCase()),
    });
    // Nav links (used in the prerendered <header>)
    console.log(chalk.bold('\n  Navigation links') + chalk.dim(' (appear in the bot HTML header)\n'));
    const navLinks = [];
    const addNav = await confirm({ message: 'Add navigation links?', default: true });
    if (addNav) {
        let addMore = true;
        while (addMore) {
            const label = await input({ message: 'Nav label (e.g. Pricing):' });
            const href = await input({ message: `URL for "${label}":`, default: `${base}/${label.toLowerCase()}` });
            navLinks.push({ href, label });
            addMore = await confirm({ message: 'Add another nav link?', default: navLinks.length < 4 });
        }
    }
    const pages = [];
    // Homepage
    console.log(chalk.bold('\n  Homepage (/)\n'));
    const homePage = await collectPage('/', brandName, base, navLinks, true);
    pages.push(homePage);
    // Additional pages
    console.log(chalk.bold('\n  Other pages') + chalk.dim(' (pricing, about, features, etc.)\n'));
    let addMore = await confirm({ message: 'Add another page?', default: true });
    let sortIdx = 1;
    while (addMore) {
        const pagePath = await input({
            message: 'Page path (e.g. /pricing):',
            validate: (v) => v.startsWith('/') ? true : 'Must start with /',
        });
        const page = await collectPage(pagePath, brandName, base, navLinks, false);
        pages.push(page);
        sortIdx++;
        addMore = await confirm({ message: 'Add another page?', default: sortIdx < 5 });
    }
    console.log(chalk.bold('\n  Pages to configure:\n'));
    for (const p of pages) {
        console.log(`  ${chalk.cyan(p.path)}  ${chalk.dim('→')}  ${p.title}`);
    }
    console.log();
    return { pages, navLinks, brandName, siteUrl: base };
}
async function collectPage(pagePath, brandName, siteUrl, navLinks, isHome) {
    const pageLabel = isHome ? 'Homepage' : pagePath;
    const defaultTitle = isHome
        ? `${brandName} — Your tagline here`
        : `${pagePath.replace(/^\//, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} — ${brandName}`;
    const title = await input({
        message: `Title for ${pageLabel}:`,
        default: defaultTitle,
    });
    const description = await input({
        message: `Meta description (up to 160 chars):`,
        default: isHome
            ? `${brandName} — Describe what you do and why it matters.`
            : `Learn about ${pagePath.replace(/^\//, '').replace(/-/g, ' ')} at ${brandName}.`,
        validate: (v) => v.length <= 160 ? true : `Too long (${v.length}/160 chars)`,
    });
    // Rich content — key bullet points that will be turned into <p>/<li> HTML
    console.log(chalk.dim(`\n  Content for ${pageLabel} — enter key bullet points, one per line.`));
    console.log(chalk.dim('  These become visible text in the bot HTML (great for SEO).'));
    console.log(chalk.dim('  Press Enter twice when done, or type "skip" to use a minimal template.\n'));
    const bulletPoints = [];
    let bullet = '';
    let emptyCount = 0;
    while (true) {
        bullet = await input({ message: chalk.dim('  Bullet:') });
        if (bullet.toLowerCase() === 'skip') {
            break;
        }
        if (bullet === '') {
            emptyCount++;
            if (emptyCount >= 1)
                break;
        }
        else {
            emptyCount = 0;
            bulletPoints.push(bullet);
        }
    }
    const content = buildPageContent(pagePath, title, description, bulletPoints, brandName, siteUrl, navLinks);
    const schemas = buildSchemas(pagePath, title, description, siteUrl);
    return {
        path: pagePath,
        title,
        description,
        content,
        ogImage: `${siteUrl}/og-image.png`,
        schemas,
    };
}
// ── HTML content builder ───────────────────────────────────────────────────────
function buildPageContent(path, title, description, bullets, brandName, siteUrl, navLinks) {
    const listItems = bullets.length > 0
        ? `\n    <ul>\n${bullets.map((b) => `      <li>${escHtml(b)}</li>`).join('\n')}\n    </ul>`
        : '';
    const navHtml = navLinks.length > 0
        ? `<nav aria-label="Main navigation">\n${navLinks.map((n) => `      <a href="${escHtml(n.href)}">${escHtml(n.label)}</a>`).join('\n')}\n    </nav>`
        : '';
    return `<article itemscope itemtype="https://schema.org/WebPage">
      <h1>${escHtml(title)}</h1>
      <p>${escHtml(description)}</p>${listItems}
    </article>`;
}
function buildSchemas(path, title, description, siteUrl) {
    const url = `${siteUrl}${path}`;
    if (path === '/') {
        return [
            { '@context': 'https://schema.org', '@type': 'WebSite', name: title, url: siteUrl, description },
        ];
    }
    return [
        { '@context': 'https://schema.org', '@type': 'WebPage', name: title, description, url },
    ];
}
function escHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
// ── Write to D1 via Cloudflare API ────────────────────────────────────────────
/**
 * Writes each page config into D1 `prerender_page_configs`.
 * The worker's cron.ts reads this table to generate prerender HTML.
 * This is called after the worker is deployed so the table exists.
 */
export async function writePageConfigsToD1(token, accountId, dbId, result) {
    let written = 0;
    let failed = 0;
    const navJson = result.navLinks.length > 0 ? JSON.stringify(result.navLinks) : null;
    for (let i = 0; i < result.pages.length; i++) {
        const page = result.pages[i];
        const schemasJson = page.schemas ? JSON.stringify(page.schemas) : null;
        const sql = `
      INSERT INTO prerender_page_configs (id, path, title, description, content, og_image, schemas_json, nav_json, sort_order, created_at, updated_at)
      VALUES (lower(hex(randomblob(16))), '${sqlEsc(page.path)}', '${sqlEsc(page.title)}', '${sqlEsc(page.description)}', '${sqlEsc(page.content)}', ${page.ogImage ? `'${sqlEsc(page.ogImage)}'` : 'NULL'}, ${schemasJson ? `'${sqlEsc(schemasJson)}'` : 'NULL'}, ${navJson ? `'${sqlEsc(navJson)}'` : 'NULL'}, ${i}, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      ON CONFLICT(path) DO UPDATE SET
        title        = excluded.title,
        description  = excluded.description,
        content      = excluded.content,
        og_image     = excluded.og_image,
        schemas_json = excluded.schemas_json,
        nav_json     = excluded.nav_json,
        sort_order   = excluded.sort_order,
        updated_at   = excluded.updated_at;
    `;
        try {
            await executeD1Sql(token, accountId, dbId, sql);
            written++;
        }
        catch (err) {
            console.warn(chalk.yellow(`  ⚠ Failed to write config for ${page.path}: ${err instanceof Error ? err.message : err}`));
            failed++;
        }
    }
    return { written, failed };
}
function sqlEsc(s) {
    return String(s).replace(/'/g, "''");
}
// ── Legacy: write to cron.ts file (fallback if D1 write fails) ────────────────
import { existsSync } from 'fs';
import { join } from 'path';
export function writeCronTs(workerDir, result) {
    const cronPath = join(workerDir, 'src', 'routes', 'cron.ts');
    if (!existsSync(cronPath))
        return;
    // We no longer need to patch cron.ts since configs go to D1.
    // Just ensure the worker file is the latest template — the cron reads D1.
    console.log(chalk.dim(`  ✓ Worker will read ${result.pages.length} page(s) from D1 at runtime`));
}
//# sourceMappingURL=page-wizard.js.map