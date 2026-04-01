/**
 * `prerender-edge pages configure`
 *
 * Re-run the page content wizard on an already-initialised setup.
 * Writes page configs into D1, re-deploys the worker, then triggers cache.
 */

import chalk from 'chalk';
import ora from 'ora';
import { select, input } from '@inquirer/prompts';
import { getProject, getAuth } from '../lib/config.js';
import { runPageWizard, writePageConfigsToD1 } from '../lib/page-wizard.js';
import { deployCommand } from './deploy.js';
import { cacheRefreshCommand } from './cache.js';

export async function configurePagesCommand(_opts: Record<string, unknown> = {}): Promise<void> {
  const proj = getProject();
  if (!proj) {
    console.error(chalk.red('  No Cloudflare project found. Run: prerender-edge init'));
    process.exit(1);
  }

  const auth = getAuth();
  if (!auth?.token) {
    console.error(chalk.red('  Not authenticated. Run: prerender-edge login'));
    process.exit(1);
  }

  const siteUrl = proj.siteUrl;
  let workerDir = proj.workerDir;

  if (!workerDir) {
    workerDir = await input({
      message: 'Path to your scaffolded worker directory:',
      default: './prerender-worker',
    });
  }

  if (!siteUrl || !proj.dbId) {
    console.error(chalk.red('  siteUrl or dbId missing. Run: prerender-edge init'));
    process.exit(1);
  }

  console.log(chalk.bold.cyan('\n  Configure Page Content\n'));
  console.log(
    chalk.dim('  Worker: ') + chalk.white(proj.workerName ?? 'unknown') + '\n' +
    chalk.dim('  Site:   ') + chalk.white(siteUrl) + '\n' +
    chalk.dim('  DB:     ') + chalk.white(proj.dbId) + '\n',
  );

  // Run the page wizard
  const pageData = await runPageWizard(siteUrl, workerDir ?? './prerender-worker');

  // Get account ID
  const { listAccounts } = await import('../lib/cf-api.js');
  const accounts = await listAccounts(auth.token);
  const accountId = accounts[0]?.id ?? '';
  if (!accountId) {
    console.error(chalk.red('  Could not fetch Cloudflare account. Re-login: prerender-edge login --force'));
    process.exit(1);
  }

  // Write page configs to D1
  const sp = ora('Writing page configs to D1...').start();
  const { written, failed } = await writePageConfigsToD1(auth.token, accountId, proj.dbId, pageData);
  if (written > 0) {
    sp.succeed(`${written} page config(s) saved to D1`);
  } else {
    sp.warn(`Could not write to D1 (${failed} failed). You may need to re-deploy the worker first.`);
  }

  const action = await select({
    message: 'What would you like to do next?',
    choices: [
      {
        name: `${chalk.bold('Re-deploy worker + refresh cache now')}  ${chalk.dim('— recommended')}`,
        value: 'deploy-and-refresh',
      },
      {
        name: 'Just refresh cache (worker already up to date)',
        value: 'refresh-only',
      },
      {
        name: 'Skip — I\'ll deploy manually',
        value: 'skip',
      },
    ],
  });

  if (action === 'skip') {
    console.log(chalk.dim('\n  Run when ready:'));
    console.log('  npx prerender-edge deploy');
    console.log('  npx prerender-edge cache refresh --force\n');
    return;
  }

  if (action === 'deploy-and-refresh') {
    console.log(chalk.bold('\n  Re-deploying worker...\n'));
    await deployCommand({});
  }

  console.log(chalk.bold('\n  Refreshing cache...\n'));
  await cacheRefreshCommand({ force: true });

  console.log(chalk.bold.green('\n  Done!\n'));
  console.log('  Test a page:');
  console.log(chalk.cyan(`  curl -A "Googlebot/2.1" ${siteUrl}`));
  console.log(chalk.dim('  You should now see full rich HTML instead of <div id="root"></div>\n'));
}
