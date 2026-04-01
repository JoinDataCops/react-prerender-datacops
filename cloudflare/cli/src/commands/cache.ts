/**
 * `cf-prerender cache <subcommand>`
 *
 * Subcommands:
 *   refresh   — Trigger cache regeneration
 *   clear     — Delete all cached pages (or a specific path)
 *   stats     — Show cache statistics
 */

import chalk from 'chalk';
import ora from 'ora';
import { confirm, input } from '@inquirer/prompts';
import { getApiToken, getProject } from '../lib/config.js';

function getWorkerClient(): { url: string; secret: string } {
  const project = getProject();
  if (!project?.workerUrl || !project?.workerSecret) {
    console.log(chalk.red('  Worker URL or secret not configured.'));
    console.log(chalk.dim('  Run `cf-prerender init` or `cf-prerender status` first.'));
    process.exit(1);
  }
  return { url: project.workerUrl, secret: project.workerSecret };
}

async function workerFetch<T>(
  url: string,
  secret: string,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Worker returned ${res.status}: ${text}`);
  }
  return res.json() as T;
}

export async function cacheRefreshCommand(opts: { force?: boolean }): Promise<void> {
  const token = getApiToken();
  if (!token) {
    console.log(chalk.red('  Not logged in. Run `cf-prerender login` first.'));
    process.exit(1);
  }

  const { url, secret } = getWorkerClient();

  console.log(chalk.bold.cyan('\n  Triggering cache refresh...\n'));
  const spinner = ora('Generating prerender cache...').start();

  try {
    const result = await workerFetch<{
      success: boolean;
      time_ms: number;
      pages_synced: number;
      error?: string;
    }>(url, secret, '/api/cache/generate', {
      method: 'POST',
      body: JSON.stringify({ force: opts.force ?? false }),
    });

    if (result.success) {
      spinner.succeed(
        `Cache refreshed — ${chalk.bold(result.pages_synced)} pages in ${result.time_ms}ms`,
      );
    } else {
      spinner.fail(`Cache refresh failed: ${result.error}`);
      process.exit(1);
    }
  } catch (err) {
    spinner.fail('Cache refresh failed');
    throw err;
  }
}

export async function cacheClearCommand(opts: { path?: string; all?: boolean }): Promise<void> {
  const token = getApiToken();
  if (!token) {
    console.log(chalk.red('  Not logged in. Run `cf-prerender login` first.'));
    process.exit(1);
  }

  const { url, secret } = getWorkerClient();

  if (opts.all || (!opts.path)) {
    // Get stats first to show impact
    let total = 0;
    try {
      const stats = await workerFetch<{ total: number }>(url, secret, '/api/prerender/stats');
      total = stats.total;
    } catch {
      // ignore
    }

    console.log(chalk.yellow(`\n  This will delete all ${total} cached pages.\n`));
    const yes = await confirm({ message: 'Continue?', default: false });
    if (!yes) {
      console.log(chalk.dim('  Cancelled.'));
      return;
    }

    const spinner = ora('Clearing cache...').start();
    try {
      const result = await workerFetch<{ success: boolean; cleared: number }>(
        url,
        secret,
        '/api/prerender?all=true',
        { method: 'DELETE' },
      );
      spinner.succeed(`Cleared ${chalk.bold(result.cleared)} cached pages`);
    } catch (err) {
      spinner.fail('Clear failed');
      throw err;
    }
    return;
  }

  const targetPath = opts.path ?? await input({
    message: 'Path to clear (e.g. /market/bitcoin):',
    validate: (v) => (v.startsWith('/') ? true : 'Path must start with /'),
  });

  const spinner = ora(`Clearing cache for "${targetPath}"...`).start();
  try {
    const result = await workerFetch<{ success: boolean; path: string }>(
      url,
      secret,
      `/api/prerender?path=${encodeURIComponent(targetPath)}`,
      { method: 'DELETE' },
    );
    if (result.success) {
      spinner.succeed(`Cleared: ${targetPath}`);
    } else {
      spinner.warn(`Not cached: ${targetPath}`);
    }
  } catch (err) {
    spinner.fail('Clear failed');
    throw err;
  }
}

export async function cacheStatsCommand(): Promise<void> {
  const token = getApiToken();
  if (!token) {
    console.log(chalk.red('  Not logged in. Run `cf-prerender login` first.'));
    process.exit(1);
  }

  const { url, secret } = getWorkerClient();
  const spinner = ora('Fetching stats...').start();

  try {
    const [stats, cronRuns] = await Promise.all([
      workerFetch<{ total: number; expired: number; totalHits: number }>(
        url,
        secret,
        '/api/prerender/stats',
      ),
      workerFetch<{
        runs: {
          job_name: string;
          status: string;
          started_at: string;
          completed_at: string | null;
          pages_synced: number;
          pages_failed: number;
          error_message: string | null;
        }[];
      }>(url, secret, '/api/cron/runs?limit=5'),
    ]);

    spinner.stop();

    console.log('\n' + chalk.bold('  Cache Statistics'));
    console.log(`  Total cached pages : ${chalk.cyan(stats.total)}`);
    console.log(`  Expired entries    : ${stats.expired > 0 ? chalk.yellow(stats.expired) : chalk.green(stats.expired)}`);
    console.log(`  Total cache hits   : ${chalk.cyan(stats.totalHits)}`);

    if (cronRuns.runs.length > 0) {
      console.log('\n' + chalk.bold('  Recent Cache Runs'));
      for (const run of cronRuns.runs) {
        const statusColor =
          run.status === 'completed' ? chalk.green : run.status === 'running' ? chalk.yellow : chalk.red;
        const duration = run.completed_at
          ? `${Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000)}s`
          : 'running...';
        console.log(
          `  ${statusColor(run.status.padEnd(10))} ${run.started_at.replace('T', ' ').slice(0, 19)}  ${run.pages_synced} synced  ${duration}${run.error_message ? '  ' + chalk.red(run.error_message.slice(0, 50)) : ''}`,
        );
      }
    }
    console.log();
  } catch (err) {
    spinner.fail('Stats fetch failed');
    throw err;
  }
}
