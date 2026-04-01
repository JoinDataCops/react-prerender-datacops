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

import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import { confirm } from '@inquirer/prompts';
import { getProject } from '../lib/config.js';

// ── Types ───────────────────────────────────────────────────────────────────────

interface ScannedPage {
  route: string;
  file: string;
  title: string;
  description: string;
  headings: string[];
  paragraphs: string[];
  listItems: string[];
  ctaButtons: string[];
  pricingTiers: PricingTier[];
  faqItems: FaqItem[];
}

interface PricingTier {
  name: string;
  price: string;
  features: string[];
}

interface FaqItem {
  question: string;
  answer: string;
}

// ── Main command ───────────────────────────────────────────────────────────────

export async function scanCommand(opts: { silent?: boolean; output?: string }): Promise<void> {
  const silent = opts.silent ?? false;
  const cwd = process.cwd();
  const project = getProject();

  if (!silent) {
    console.log('\n' + chalk.bold('  Prerender Source Scanner'));
    console.log(chalk.dim('  Auto-extracting page content from your React source files\n'));
  }

  const spin = ora({ text: 'Scanning source files…', isSilent: silent }).start();

  // ── Step 1: Locate source directory ──────────────────────────────────────────
  const srcDir = findSrcDir(cwd);
  if (!srcDir) {
    spin.fail('Could not find src/ directory. Run this from your React project root.');
    process.exit(1);
  }

  // ── Step 2: Find page components ─────────────────────────────────────────────
  const pageFiles = findPageFiles(srcDir);
  spin.text = `Found ${pageFiles.length} page files — extracting content…`;

  if (pageFiles.length === 0) {
    spin.warn('No page components found. Make sure you have files in src/pages/, src/views/, or src/screens/');
    process.exit(0);
  }

  // ── Step 3: Extract content from each page ────────────────────────────────────
  const pages: ScannedPage[] = [];
  for (const file of pageFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const route = fileToRoute(file, srcDir);
    const extracted = extractPageContent(content, route, file);
    if (extracted) pages.push(extracted);
  }

  spin.succeed(`Scanned ${pages.length} pages`);

  // ── Step 4: Build prerender-content.json ──────────────────────────────────────
  const brand = project?.name
    ? capitalise(project.name.replace(/-/g, ' '))
    : detectBrand(cwd) ?? 'YourBrand';

  const contentJson = buildContentJson(pages, brand, project?.siteUrl);

  // ── Step 5: Write file ─────────────────────────────────────────────────────────
  const outputDir = opts.output ?? findPublicDir(cwd);
  const outputPath = path.join(outputDir, 'prerender-content.json');

  if (!silent && fs.existsSync(outputPath)) {
    const ok = await confirm({
      message: chalk.yellow('prerender-content.json already exists. Overwrite?'),
      default: true,
    });
    if (!ok) { console.log(chalk.dim('  Cancelled.')); return; }
  }

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(contentJson, null, 2), 'utf-8');

  if (!silent) {
    console.log('\n  ' + chalk.green('✓') + ' Written: ' + chalk.cyan(path.relative(cwd, outputPath)));
    printSummary(pages, contentJson);
  } else {
    // In silent mode (called from build script), just log to stderr
    process.stderr.write(`[prerender-edge] Scanned ${pages.length} pages → ${path.relative(cwd, outputPath)}\n`);
  }
}

// ── File discovery ─────────────────────────────────────────────────────────────

function findSrcDir(cwd: string): string | null {
  for (const candidate of ['src', 'app', 'pages', 'src/app']) {
    const p = path.join(cwd, candidate);
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p;
  }
  return null;
}

function findPublicDir(cwd: string): string {
  for (const candidate of ['public', 'static', 'dist']) {
    const p = path.join(cwd, candidate);
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p;
  }
  return path.join(cwd, 'public');
}

/** Find all page component files — supports React, Vue, Svelte */
function findPageFiles(srcDir: string): string[] {
  const files: string[] = [];
  const pagePatterns = ['pages', 'views', 'screens', 'routes', 'app'];
  const ext = ['.tsx', '.jsx', '.vue', '.svelte', '.ts', '.js'];

  // Look in known page dirs first
  for (const dir of pagePatterns) {
    const fullDir = path.join(srcDir, dir);
    if (fs.existsSync(fullDir)) {
      collectFiles(fullDir, ext, files, 3);
    }
  }

  // If nothing found, scan src root shallowly for page-like components
  if (files.length === 0) {
    collectFiles(srcDir, ext, files, 1);
  }

  // Deduplicate and filter out non-page files
  const seen = new Set<string>();
  return files.filter((f) => {
    if (seen.has(f)) return false;
    seen.add(f);
    const base = path.basename(f, path.extname(f)).toLowerCase();
    // Skip test files, stories, hooks, utils, etc.
    if (
      base.includes('.test') || base.includes('.spec') || base.includes('.stories') ||
      base.startsWith('use') || base.startsWith('_') ||
      ['index', 'layout', 'root', 'provider', 'store', 'context', 'types', 'utils', 'helpers', 'constants'].includes(base)
    ) return false;
    return true;
  });
}

function collectFiles(dir: string, exts: string[], out: string[], maxDepth: number, depth = 0): void {
  if (depth > maxDepth) return;
  try {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        collectFiles(full, exts, out, maxDepth, depth + 1);
      } else if (exts.includes(path.extname(entry))) {
        out.push(full);
      }
    }
  } catch {}
}

// ── Route mapping ──────────────────────────────────────────────────────────────

function fileToRoute(file: string, srcDir: string): string {
  const relative = path.relative(srcDir, file);
  const noExt = relative.replace(/\.[^.]+$/, '');
  const parts = noExt.split(path.sep).map((p) => p.toLowerCase());

  // Remove known page dir segments
  const stripped = parts.filter(
    (p) => !['pages', 'views', 'screens', 'routes'].includes(p),
  );

  // Last segment is the route name
  const last = stripped[stripped.length - 1] ?? '';

  const staticMap: Record<string, string> = {
    home: '/',
    homepage: '/',
    index: '/',
    landing: '/',
    main: '/',
    app: '/',
    root: '/',
  };
  if (staticMap[last]) return staticMap[last];

  // Nest segments if multiple depth
  return '/' + stripped.join('/');
}

// ── JSX text extraction ────────────────────────────────────────────────────────

function extractPageContent(source: string, route: string, filePath: string): ScannedPage | null {
  // Strip imports, comments, and type declarations
  const clean = stripNoise(source);

  const headings = extractTagText(clean, 'h[1-4]', 4, 120);
  const paragraphs = extractTagText(clean, 'p', 20, 400);
  const listItems = extractTagText(clean, 'li', 4, 200);
  const ctaButtons = [
    ...extractTagText(clean, 'button', 2, 60),
    ...extractLinkText(clean),
  ].filter((t, i, a) => a.indexOf(t) === i); // dedupe

  const pricingTiers = extractPricingTiers(clean);
  const faqItems = extractFaqItems(clean);

  // Also extract from common prop names (title=, heading=, description=, label=, etc.)
  const propTexts = extractPropValues(clean, ['title', 'heading', 'subtitle', 'label', 'description', 'text', 'caption']);

  // Merge prop texts into appropriate buckets
  for (const t of propTexts) {
    if (t.length > 40 && !paragraphs.includes(t)) paragraphs.push(t);
    else if (t.length <= 40 && !headings.includes(t)) headings.push(t);
  }

  if (headings.length === 0 && paragraphs.length === 0 && pricingTiers.length === 0) {
    return null; // nothing useful extracted
  }

  const title = headings[0] ?? capitalise(route.replace(/^\//, '') || 'Home');
  const description = paragraphs[0] ?? headings.slice(0, 3).join('. ');

  return {
    route,
    file: path.basename(filePath),
    title,
    description: description.slice(0, 250),
    headings,
    paragraphs,
    listItems,
    ctaButtons,
    pricingTiers,
    faqItems,
  };
}

function stripNoise(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/\/\/[^\n]*/g, '')        // line comments
    .replace(/^import\s[^\n]*/gm, '')  // import statements
    .replace(/^export\s+(?:default\s+)?(?:function|class|const)\s+\w+[^{]*/gm, '') // export declarations
    .replace(/^\s*(type|interface)\s+\w+[^{]*\{[\s\S]*?\}/gm, ''); // TypeScript types
}

function extractTagText(source: string, tagPattern: string, minLen: number, maxLen: number): string[] {
  const results: string[] = [];
  const re = new RegExp(`<${tagPattern}[^>]*>([^<>{}\\n]{${minLen},${maxLen}})<\\/`, 'gi');
  let m;
  while ((m = re.exec(source)) !== null) {
    const text = m[1].trim().replace(/\s+/g, ' ');
    if (isUsableText(text)) results.push(text);
  }
  return [...new Set(results)];
}

function extractLinkText(source: string): string[] {
  // <a href="...">text</a> — capture CTA-style links (short, action-oriented)
  const results: string[] = [];
  const re = /<a\s[^>]*href=["'][^"']*["'][^>]*>([^<>{}]{3,50})<\/a>/gi;
  let m;
  while ((m = re.exec(source)) !== null) {
    const text = m[1].trim().replace(/\s+/g, ' ');
    if (isUsableText(text) && !text.startsWith('/') && !text.startsWith('http')) results.push(text);
  }
  return [...new Set(results)];
}

function extractPropValues(source: string, propNames: string[]): string[] {
  const results: string[] = [];
  for (const prop of propNames) {
    const re = new RegExp(`\\b${prop}=["']([^"'\\n{]{5,250})["']`, 'gi');
    let m;
    while ((m = re.exec(source)) !== null) {
      const text = m[1].trim();
      if (isUsableText(text)) results.push(text);
    }
  }
  return [...new Set(results)];
}

/**
 * Detect pricing tiers from JSX:
 * Looks for patterns like: "Free", "$0", "$49/month", "Enterprise"
 * near each other (within 200 chars) to identify pricing blocks.
 */
function extractPricingTiers(source: string): PricingTier[] {
  const tiers: PricingTier[] = [];

  // Match a plan name followed by a price
  const tierRe = /["'>]([A-Z][a-zA-Z\s]{2,20})["'<][\s\S]{0,300}?\$[\d]+/g;
  const priceRe = /\$[\d,]+(?:\/(?:month|mo|year|yr|user))?/gi;
  const planNameRe = /\b(Free|Starter|Basic|Pro|Professional|Business|Team|Enterprise|Growth|Scale)\b/g;

  let m;
  while ((m = planNameRe.exec(source)) !== null) {
    const name = m[1];
    // Look for a price in the next 300 chars
    const slice = source.slice(m.index, m.index + 300);
    const priceMatch = priceRe.exec(slice);
    priceRe.lastIndex = 0;
    if (!priceMatch && name !== 'Enterprise' && name !== 'Free') continue;

    const price = priceMatch ? priceMatch[0] : name === 'Free' ? '$0' : 'Custom';

    // Extract feature list items near this tier
    const featureSlice = source.slice(m.index, m.index + 600);
    const features = extractTagText(featureSlice, 'li', 4, 120);

    if (!tiers.find((t) => t.name === name)) {
      tiers.push({ name, price, features: features.slice(0, 8) });
    }
  }

  return tiers;
}

/**
 * Extract FAQ pairs: looks for q/a patterns, accordions, etc.
 */
function extractFaqItems(source: string): FaqItem[] {
  const items: FaqItem[] = [];

  // Pattern: question="..." answer="..."
  const pairRe = /question=["']([^"']{10,200})["'][\s\S]{0,500}?answer=["']([^"']{10,400})["']/g;
  let m;
  while ((m = pairRe.exec(source)) !== null) {
    items.push({ question: m[1].trim(), answer: m[2].trim() });
  }

  // Pattern: h3/h4 followed by p within 300 chars (accordion pattern)
  if (items.length === 0) {
    const faqRe = /<h[34][^>]*>([^<>{}?]{10,120}\?)<\/h[34]>[\s\S]{0,300}?<p[^>]*>([^<>{}]{20,400})<\/p>/g;
    while ((m = faqRe.exec(source)) !== null) {
      items.push({ question: m[1].trim(), answer: m[2].trim() });
    }
  }

  return items.slice(0, 10);
}

function isUsableText(text: string): boolean {
  return (
    text.length > 0 &&
    !/{/.test(text) &&           // no JSX expressions
    !/>/.test(text) &&           // no HTML/JSX artifacts
    !/^\s*</.test(text) &&       // not starting with a tag
    !/import\s/.test(text) &&    // not an import statement
    !/export\s/.test(text) &&    // not an export statement
    !/function\s/.test(text) &&  // not a function declaration
    !/const\s/.test(text) &&     // not a const declaration
    !/=>\s*{/.test(text) &&      // not an arrow function
    !/className/.test(text) &&   // not JSX class
    !/style=/.test(text) &&      // not a style prop
    text.split(' ').some(w => w.length > 2) // has real words
  );
}

// ── Build prerender-content.json ───────────────────────────────────────────────

function buildContentJson(
  pages: ScannedPage[],
  brand: string,
  siteUrl?: string,
): object {
  const navPages = pages
    .filter((p) => ['/', '/features', '/pricing', '/about', '/contact', '/blog'].includes(p.route))
    .sort((a, b) => ['/','features','pricing','about'].indexOf(a.route) - ['/','features','pricing','about'].indexOf(b.route));

  const nav = navPages.map((p) => ({
    label: p.route === '/' ? 'Home' : capitalise(p.route.replace(/^\//, '')),
    href: p.route,
  }));

  const pagesOutput: Record<string, object> = {};

  for (const page of pages) {
    const sections: object[] = [];

    // Hero section from first heading + first para
    if (page.headings.length > 0) {
      const heroSection: Record<string, unknown> = {
        type: 'hero',
        heading: page.headings[0],
      };
      if (page.headings[1]) heroSection.subheading = page.headings[1];
      if (page.paragraphs[0]) heroSection.text = page.paragraphs[0];
      if (page.ctaButtons[0]) heroSection.cta = { label: page.ctaButtons[0], href: page.route === '/' ? (siteUrl ? `${siteUrl}/signup` : '/signup') : page.route };
      sections.push(heroSection);
    }

    // Features/items section from list items
    if (page.listItems.length >= 2 && page.pricingTiers.length === 0) {
      const featHeading = page.headings.find((h) =>
        /feature|benefit|offer|include|why|what|how|capabilit/i.test(h),
      );
      sections.push({
        type: 'features',
        heading: featHeading ?? (page.headings[2] ?? undefined),
        items: page.listItems.slice(0, 12).map((item) => ({ title: item })),
      });
    }

    // Pricing section
    if (page.pricingTiers.length > 0) {
      sections.push({
        type: 'pricing',
        heading: page.headings.find((h) => /price|plan|cost|billing/i.test(h)) ?? 'Pricing',
        tiers: page.pricingTiers,
      });
    }

    // Extra text paragraphs (skip first, already in hero)
    const extraParas = page.paragraphs.slice(1, 4);
    if (extraParas.length > 0 && page.pricingTiers.length === 0) {
      const textHeading = page.headings.find((h, i) => i > 0 && /about|story|mission|who|our/i.test(h));
      sections.push({
        type: 'text',
        ...(textHeading ? { heading: textHeading } : {}),
        paragraphs: extraParas,
      });
    }

    // FAQ section
    if (page.faqItems.length > 0) {
      sections.push({
        type: 'faq',
        heading: page.headings.find((h) => /faq|question|ask/i.test(h)) ?? 'Frequently Asked Questions',
        items: page.faqItems,
      });
    }

    // CTA section
    const ctaHeading = page.headings.find((h) =>
      /ready|start|get started|sign up|try|join|begin/i.test(h),
    );
    if (ctaHeading) {
      sections.push({
        type: 'cta',
        heading: ctaHeading,
        ...(page.ctaButtons[0] ? { cta: { label: page.ctaButtons[0], href: '/signup' } } : {}),
      });
    }

    pagesOutput[page.route] = {
      title: `${page.title} — ${brand}`,
      description: page.description,
      sections,
    };
  }

  return {
    brand,
    tagline: pages.find((p) => p.route === '/')?.headings[1] ?? `${brand} — Official Site`,
    nav,
    pages: pagesOutput,
  };
}

// ── Print summary ─────────────────────────────────────────────────────────────

function printSummary(pages: ScannedPage[], contentJson: object): void {
  const json = contentJson as { pages?: Record<string, { sections?: unknown[] }> };
  const count = Object.keys(json.pages ?? {}).length;

  console.log(`\n  ${chalk.bold('Extracted content for:')} ${count} pages\n`);
  for (const page of pages) {
    const sections = (json.pages?.[page.route] as { sections?: unknown[] })?.sections?.length ?? 0;
    console.log(
      `    ${chalk.green('✓')} ${chalk.cyan(page.route.padEnd(20))}  ` +
      `${page.file.padEnd(30)} ${chalk.dim(sections + ' sections')}`,
    );
  }

  console.log(`
  ${chalk.bold('Next steps:')}

  1. Review ${chalk.cyan('public/prerender-content.json')} — check extracted content looks right
  2. Deploy your site:  ${chalk.cyan('npm run build')}
  3. Refresh cache:     ${chalk.cyan('prerender-edge cache refresh --force')}

  ${chalk.bold('Add to your build pipeline:')}
  ${chalk.dim('"prebuild": "prerender-edge scan --silent"')}
  ${chalk.dim('→ Content auto-updates on every build, no manual work needed.')}
  `);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function capitalise(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function detectBrand(cwd: string): string | undefined {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8'));
    return pkg.name ? capitalise(pkg.name.replace(/-/g, ' ')) : undefined;
  } catch { return undefined; }
}
