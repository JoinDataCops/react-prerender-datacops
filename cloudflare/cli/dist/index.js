#!/usr/bin/env node
/**
 * prerender-edge CLI
 *
 * Manage a zero-dependency prerender + sitemaps + script injection stack
 * on Cloudflare (D1 + Workers) OR Supabase (Postgres + Edge Functions).
 *
 * Install:  npm install -g prerender-edge
 * Usage:    prerender <command>
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { loginCommand } from './commands/login.js';
import { logoutCommand } from './commands/logout.js';
import { whoamiCommand } from './commands/whoami.js';
import { initCommand } from './commands/init.js';
import { deployCommand } from './commands/deploy.js';
import { deploySiteCommand } from './commands/deploy-site.js';
import { migrateCommand } from './commands/migrate.js';
import { statusCommand } from './commands/status.js';
import { cacheRefreshCommand, cacheClearCommand, cacheStatsCommand } from './commands/cache.js';
import { logsCommand } from './commands/logs.js';
import { configurePagesCommand } from './commands/configure-pages.js';
const program = new Command();
program
    .name('prerender-edge')
    .description(chalk.bold('prerender-edge') +
    chalk.dim(' — Cloudflare D1 + Workers or Supabase prerender stack'))
    .version('1.0.0');
// ── login ─────────────────────────────────────────────────────────────────────
program
    .command('login')
    .description('Authenticate with Cloudflare (API token / OAuth) or Supabase (PAT)')
    .option('--token <token>', 'Use an existing API / Personal Access Token directly')
    .option('--oauth <client_id>', 'Cloudflare OAuth PKCE browser flow')
    .option('--supabase', 'Log in to Supabase')
    .option('--force', 'Re-authenticate even if already logged in')
    .action((opts) => run(() => loginCommand(opts)));
// ── logout ────────────────────────────────────────────────────────────────────
program
    .command('logout')
    .description('Remove stored credentials')
    .option('--cloudflare', 'Log out Cloudflare only')
    .option('--supabase', 'Log out Supabase only')
    .option('--all', 'Clear ALL stored config')
    .action((opts) => run(() => logoutCommand(opts)));
// ── whoami ────────────────────────────────────────────────────────────────────
program
    .command('whoami')
    .description('Show auth status and active projects for both backends')
    .action(() => run(() => whoamiCommand()));
// ── init ──────────────────────────────────────────────────────────────────────
program
    .command('init')
    .description('Interactive setup wizard — creates DB, applies schema, scaffolds files, sets env vars')
    .option('--cloudflare', 'Use Cloudflare backend (D1 + Workers)')
    .option('--supabase', 'Use Supabase backend (Postgres + Edge Functions)')
    .option('--force', 'Overwrite existing configuration')
    .action((opts) => run(() => initCommand(opts)));
// ── deploy ────────────────────────────────────────────────────────────────────
program
    .command('deploy')
    .description('Deploy the backend worker (Cloudflare) — requires wrangler')
    .option('--env <env>', 'Wrangler environment (staging, production)')
    .action((opts) => run(() => deployCommand(opts)));
// ── deploy-site ───────────────────────────────────────────────────────────────
program
    .command('deploy-site')
    .description('Build and deploy the frontend site to Cloudflare Pages (auto-detects framework)')
    .option('--skip-build', 'Skip the build step and deploy existing output directory')
    .option('--reconfigure', 'Re-ask all setup questions even if config already exists')
    .action((opts) => run(() => deploySiteCommand(opts)));
// ── migrate ───────────────────────────────────────────────────────────────────
program
    .command('migrate')
    .description('Apply database schema migrations (D1 or Postgres)')
    .option('--cloudflare', 'Target Cloudflare D1')
    .option('--supabase', 'Target Supabase Postgres')
    .option('--reset', 'DROP all tables first then recreate (destroys data)')
    .action((opts) => run(() => migrateCommand(opts)));
// ── status ────────────────────────────────────────────────────────────────────
program
    .command('status')
    .description('Show deployment health, D1 DB info, and cache stats')
    .action(() => run(() => statusCommand()));
// ── cache ─────────────────────────────────────────────────────────────────────
const cache = program
    .command('cache')
    .description('Manage the prerender cache (Cloudflare backend)');
cache
    .command('refresh')
    .description('Trigger cache regeneration now')
    .option('--force', 'Force regenerate all pages even if not expired')
    .action((opts) => run(() => cacheRefreshCommand(opts)));
cache
    .command('clear')
    .description('Delete cached pages')
    .option('--path <path>', 'Clear a specific path, e.g. /market/bitcoin')
    .option('--all', 'Clear ALL cached pages (with confirmation)')
    .action((opts) => run(() => cacheClearCommand(opts)));
cache
    .command('stats')
    .description('Cache statistics and recent cron run history')
    .action(() => run(() => cacheStatsCommand()));
// ── pages ─────────────────────────────────────────────────────────────────────
const pagesCmd = program
    .command('pages')
    .description('Manage prerender page content (what bots see)');
pagesCmd
    .command('configure')
    .description('Run the page wizard to set titles, descriptions & content, then redeploy')
    .action(() => run(() => configurePagesCommand()));
// ── logs ──────────────────────────────────────────────────────────────────────
program
    .command('logs')
    .description('Stream live Cloudflare Worker logs (Ctrl+C to stop)')
    .option('--worker <name>', 'Worker name (defaults to configured backend worker)')
    .action((opts) => run(() => logsCommand(opts)));
// ── error handler ─────────────────────────────────────────────────────────────
async function run(fn) {
    try {
        await fn();
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('\n' + chalk.red('  Error: ') + msg + '\n');
        process.exit(1);
    }
}
program.parse(process.argv);
//# sourceMappingURL=index.js.map