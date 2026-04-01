/**
 * `prerender-edge content`
 *
 * Generates a starter prerender-content.json in the user's public/ folder.
 * The worker reads this file on every cron run to build rich page HTML.
 *
 * This is the "prev method" — write your content once in a file, the worker
 * reads it automatically and generates full HTML for bots.
 */

import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { confirm, input } from '@inquirer/prompts';
import { getProject } from '../lib/config.js';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function contentCommand(): Promise<void> {
  const project = getProject();

  console.log('\n' + chalk.bold('  Prerender Content Setup'));
  console.log(chalk.dim('  Generate a prerender-content.json for rich bot-visible HTML\n'));

  // ── Find the user's public/ folder ─────────────────────────────────────────
  const cwd = process.cwd();
  const candidateDirs = ['public', 'static', 'dist', '.'];
  let publicDir = '';

  for (const dir of candidateDirs) {
    const fullPath = path.join(cwd, dir);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
      publicDir = fullPath;
      break;
    }
  }

  if (!publicDir) publicDir = path.join(cwd, 'public');

  const outputDir = await input({
    message: 'Where to save prerender-content.json?',
    default: path.relative(cwd, publicDir) || 'public',
  });

  const outputPath = path.resolve(cwd, outputDir, 'prerender-content.json');

  if (fs.existsSync(outputPath)) {
    const overwrite = await confirm({
      message: `${chalk.yellow('prerender-content.json already exists.')} Overwrite?`,
      default: false,
    });
    if (!overwrite) {
      console.log(chalk.dim('\n  Keeping existing file. Edit it manually to update content.'));
      printInstructions(outputPath, project?.siteUrl);
      return;
    }
  }

  // ── Load the template ───────────────────────────────────────────────────────
  const templatePath = path.resolve(__dirname, '../../assets/templates/prerender-content.json');
  let template = fs.readFileSync(templatePath, 'utf-8');

  // ── Personalise with project details ───────────────────────────────────────
  const brand = await input({
    message: 'Your brand / company name:',
    default: project?.name ?? 'YourBrand',
  });

  const tagline = await input({
    message: 'One-line tagline:',
    default: 'The best solution for your needs',
  });

  template = template
    .replace(/YOUR_BRAND/g, brand)
    .replace(/"tagline": ".*?"/, `"tagline": "${tagline}"`)
    .replace(/"brand": ".*?"/, `"brand": "${brand}"`);

  // Remove the comment keys (they're informational only, not valid JSON in some parsers)
  const parsed = JSON.parse(template);
  delete parsed._comment;
  delete parsed._docs;

  // ── Write file ──────────────────────────────────────────────────────────────
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(parsed, null, 2), 'utf-8');

  console.log('\n  ' + chalk.green('✓') + ' Created: ' + chalk.cyan(path.relative(cwd, outputPath)));

  printInstructions(outputPath, project?.siteUrl);
}

function printInstructions(outputPath: string, siteUrl?: string): void {
  const rel = path.relative(process.cwd(), outputPath);
  const url = siteUrl?.replace(/\/$/, '') ?? 'https://your-site.com';

  console.log(`
  ${chalk.bold('Next steps:')}

  1. ${chalk.yellow('Edit')} ${chalk.cyan(rel)} with your actual page content
     – Add sections for each important page (hero, features, pricing, faq, etc.)
     – The worker reads this file automatically — no redeployment needed

  2. Verify the file is accessible at:
     ${chalk.cyan(`${url}/prerender-content.json`)}

  3. Regenerate the cache:
     ${chalk.cyan('prerender-edge cache refresh --force')}

  ${chalk.dim('Tip: Every cron run (hourly) will pick up changes automatically.')}
  `);
}
