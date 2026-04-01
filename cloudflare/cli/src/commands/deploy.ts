/**
 * `prerender-edge deploy` — Deploy the backend worker using wrangler.
 *
 * Handles:
 *   - Auto npm install if node_modules is missing
 *   - Auto `wrangler login` if auth fails
 *   - Pushes WORKER_SECRET + SITE_URL via wrangler after deploy
 */

import { spawnSync } from 'child_process';
import { resolve, join } from 'path';
import { existsSync } from 'fs';
import chalk from 'chalk';
import ora from 'ora';
import { confirm } from '@inquirer/prompts';
import { getProject, getApiToken } from '../lib/config.js';
import { putWorkerSecret, listAccounts } from '../lib/cf-api.js';

export interface DeployOptions {
  workerSecret?: string;
  env?: string;
  workerDir?: string;
}

export async function deployCommand(opts: DeployOptions = {}): Promise<void> {
  const token = getApiToken();
  if (!token) {
    console.log(chalk.red('  Not logged in. Run `prerender-edge login` first.'));
    process.exit(1);
  }

  const project = getProject();
  if (!project) {
    console.log(chalk.red('  No project configured. Run `prerender-edge init` first.'));
    process.exit(1);
  }

  const workerDir = opts.workerDir ?? resolve(process.cwd(), 'prerender-worker');

  if (!existsSync(workerDir)) {
    console.log(chalk.red(`\n  Worker directory not found: ${workerDir}`));
    console.log(chalk.yellow('  Run `prerender-edge init` first to scaffold the worker files.'));
    process.exit(1);
  }

  if (!existsSync(join(workerDir, 'wrangler.toml'))) {
    console.log(chalk.red(`\n  No wrangler.toml found in ${workerDir}`));
    console.log(chalk.yellow('  Run `prerender-edge init` to scaffold the worker files.'));
    process.exit(1);
  }

  console.log(chalk.bold.cyan('\n  Deploying backend worker...\n'));
  console.log(chalk.dim(`  Dir    : ${workerDir}`));

  // ── 1. npm install if needed ──────────────────────────────────────────────
  if (!existsSync(join(workerDir, 'node_modules'))) {
    const s = ora('Installing worker dependencies...').start();

    // Use --legacy-peer-deps so that peer dep conflicts in the parent
    // project (if the worker dir is nested inside another npm project)
    // do not block the worker's own install.
    const r = spawnSync('npm', ['install', '--legacy-peer-deps'], {
      cwd: workerDir, shell: true, encoding: 'utf8', stdio: 'pipe',
    });

    if (r.status !== 0) {
      s.fail('npm install failed');
      console.log(chalk.dim('\n' + (r.stderr || r.stdout)));

      // If the error is still about peer deps, give a clear manual fix
      const output = (r.stderr ?? '') + (r.stdout ?? '');
      if (output.includes('ERESOLVE') || output.includes('peer')) {
        console.log(chalk.yellow('\n  Peer dependency conflict detected.'));
        console.log(chalk.dim('  Run manually inside the worker directory:'));
        console.log(chalk.cyan(`    cd "${workerDir}"`));
        console.log(chalk.cyan('    npm install --legacy-peer-deps'));
        console.log(chalk.cyan('    npx wrangler deploy --env='));
      }
      process.exit(1);
    }
    s.succeed('Dependencies installed');
  }

  // ── 2. Find wrangler ──────────────────────────────────────────────────────
  const wranglerBin = findWrangler(workerDir);
  if (!wranglerBin) {
    console.log(chalk.red('\n  wrangler not found.'));
    console.log(chalk.dim('  Install globally:  npm install -g wrangler'));
    console.log(chalk.dim('  Or locally:        npm install wrangler  (inside ' + workerDir + ')'));
    process.exit(1);
  }
  console.log(chalk.dim(`  Wrangler: ${wranglerBin}\n`));

  // ── 3. Deploy (with auto-retry after wrangler login) ─────────────────────
  const deployed = await runDeploy(wranglerBin, workerDir, token, project.workerName);
  if (!deployed) process.exit(1);

  // ── 4. Push secrets via Cloudflare API ───────────────────────────────────
  const secret = opts.workerSecret ?? project.workerSecret;
  if (secret) {
    await pushSecrets(token, project, secret, wranglerBin, workerDir);
  }

  console.log(chalk.bold.green('\n  ✓ Deployment complete!\n'));
  console.log(`  Worker  : ${chalk.cyan(project.workerName)}`);
  console.log(`  URL     : ${chalk.cyan(project.workerUrl ?? '(check Cloudflare dashboard)')}`);
  console.log(chalk.dim(`\n  Note: the workers.dev subdomain is your Cloudflare account slug.`));
  console.log(chalk.dim(`  Change it at: dash.cloudflare.com → Workers & Pages → Manage → Workers subdomain\n`));
  console.log(chalk.dim('  Run: prerender-edge status\n'));
}

// ── Deploy runner with auto-login ─────────────────────────────────────────────

async function runDeploy(
  wranglerBin: string,
  workerDir: string,
  token: string,
  workerName: string,
  isRetry = false,
): Promise<boolean> {
  const label = isRetry ? 'Retrying deploy...' : 'Running wrangler deploy...';
  const s = ora(label).start();

  // On retry after `wrangler login`, do NOT inject CLOUDFLARE_API_TOKEN —
  // that would override the freshly-stored OAuth session and cause auth errors.
  const deployEnv = isRetry
    ? {
        ...process.env,
        CLOUDFLARE_API_TOKEN: undefined,
        CLOUDFLARE_API_KEY: undefined,
        CLOUDFLARE_EMAIL: undefined,
      }
    : {
        ...process.env,
        CLOUDFLARE_API_TOKEN: token,
        CLOUDFLARE_API_KEY: '',
        CLOUDFLARE_EMAIL: '',
      };

  const result = spawnSync(
    wranglerBin,
    ['deploy', '--env='],
    {
      cwd: workerDir,
      env: deployEnv,
      encoding: 'utf8',
      shell: true,
      stdio: 'pipe', // capture output so we can detect auth errors
    },
  );

  const output = (result.stdout ?? '') + (result.stderr ?? '');

  if (result.status === 0) {
    s.succeed('Worker deployed');

    // Show the URL wrangler printed
    const urlMatch = output.match(/https:\/\/\S+\.workers\.dev/);
    if (urlMatch) {
      console.log(chalk.dim(`  URL: ${urlMatch[0]}`));
    }

    // Print non-empty non-warning output for visibility
    const lines = output.split('\n').filter(
      (l) => l.trim() && !l.includes('WARN') && !l.includes('[WARNING]'),
    );
    if (lines.length > 0 && lines.some((l) => !l.startsWith('>'))) {
      console.log(chalk.dim('\n  Wrangler output:'));
      lines.slice(-8).forEach((l) => console.log(chalk.dim(`    ${l.trim()}`)));
    }
    return true;
  }

  // ── Deploy failed ─────────────────────────────────────────────────────────
  s.fail('Deployment failed');

  const isAuthError =
    output.includes('Authentication error') ||
    output.includes('code: 10000') ||
    output.includes('[code: 10000]') ||
    output.includes('CLOUDFLARE_API_TOKEN') ||
    output.includes('401');

  const isMultiEnv =
    output.includes('Multiple environments') ||
    output.includes('no target environment');

  // Print the actual wrangler error output
  console.log('\n' + chalk.dim('  Wrangler output:'));
  output.split('\n')
    .filter((l) => l.trim())
    .slice(-20)
    .forEach((l) => console.log(chalk.dim(`    ${l.trim()}`)));

  // ── Auth error: offer to run wrangler login ───────────────────────────────
  if (isAuthError && !isRetry) {
    console.log(
      chalk.yellow(
        '\n  Wrangler could not authenticate with your token.\n' +
        '  This sometimes happens because wrangler needs its own login session.\n',
      ),
    );

    const doLogin = await confirm({
      message: 'Run `wrangler login` now? (opens browser, takes ~30 seconds)',
      default: true,
    });

    if (doLogin) {
      console.log(chalk.dim('\n  Running wrangler login — browser will open...\n'));
      const loginResult = spawnSync(wranglerBin, ['login'], {
        cwd: workerDir,
        shell: true,
        stdio: 'inherit', // must be inherit — it's interactive
        env: process.env,
      });

      if (loginResult.status === 0) {
        console.log(chalk.green('\n  ✓ Wrangler logged in — retrying deploy...\n'));
        return runDeploy(wranglerBin, workerDir, token, workerName, true);
      } else {
        console.log(chalk.red('  wrangler login failed. Try running it manually:'));
        console.log(chalk.dim(`    cd "${workerDir}" && npx wrangler login`));
        return false;
      }
    }

    console.log('\n  To deploy manually:');
    console.log(chalk.cyan(`    cd "${workerDir}"`));
    console.log(chalk.cyan(`    npx wrangler login`));
    console.log(chalk.cyan(`    npx wrangler deploy --env=`));
    return false;
  }

  if (isMultiEnv) {
    console.log(chalk.yellow('\n  This should not happen with the current wrangler.toml.'));
    console.log(chalk.dim('  Try running manually with: npx wrangler deploy --env='));
  }

  if (!isAuthError) {
    console.log('\n  To deploy manually:');
    console.log(chalk.cyan(`    cd "${workerDir}"`));
    console.log(chalk.cyan(`    npx wrangler deploy --env=`));
  }

  return false;
}

// ── Push secrets ──────────────────────────────────────────────────────────────

async function pushSecrets(
  token: string,
  project: NonNullable<ReturnType<typeof import('../lib/config.js').getProject>>,
  secret: string,
  wranglerBin: string,
  workerDir: string,
): Promise<void> {
  // Try Cloudflare API first (faster, no interactive prompt)
  const s = ora('Setting worker secrets (WORKER_SECRET, SITE_URL)...').start();
  try {
    const accounts = await listAccounts(token);
    const accountId = accounts[0]?.id;
    if (accountId) {
      await putWorkerSecret(token, accountId, project.workerName, 'WORKER_SECRET', secret);
      await putWorkerSecret(token, accountId, project.workerName, 'SITE_URL', project.siteUrl);
      s.succeed('Secrets set via API (WORKER_SECRET, SITE_URL)');
      return;
    }
  } catch {
    // Fall through to wrangler CLI approach
  }

  // Fallback: wrangler secret put
  s.text = 'Setting secrets via wrangler...';
  const envArgs = ['--env='];
  const r1 = spawnSync(wranglerBin, ['secret', 'put', 'WORKER_SECRET', ...envArgs], {
    cwd: workerDir,
    input: secret + '\n',
    encoding: 'utf8',
    shell: true,
    env: { ...process.env, CLOUDFLARE_API_TOKEN: token },
  });
  const r2 = spawnSync(wranglerBin, ['secret', 'put', 'SITE_URL', ...envArgs], {
    cwd: workerDir,
    input: project.siteUrl + '\n',
    encoding: 'utf8',
    shell: true,
    env: { ...process.env, CLOUDFLARE_API_TOKEN: token },
  });

  if (r1.status === 0 && r2.status === 0) {
    s.succeed('Secrets set via wrangler (WORKER_SECRET, SITE_URL)');
  } else {
    s.warn('Could not set secrets automatically. Set them manually:');
    console.log(chalk.dim(`    cd "${workerDir}"`));
    console.log(chalk.dim(`    npx wrangler secret put WORKER_SECRET`));
    console.log(chalk.dim(`    npx wrangler secret put SITE_URL`));
    console.log(chalk.dim(`    WORKER_SECRET value: (run prerender-edge whoami to see it)`));
    console.log(chalk.dim(`    SITE_URL value:      ${project.siteUrl}`));
  }
}

// ── Wrangler binary detection ─────────────────────────────────────────────────

function findWrangler(workerDir: string): string | null {
  const ext = process.platform === 'win32' ? '.cmd' : '';
  const candidates = [
    join(workerDir, `node_modules/.bin/wrangler${ext}`),
    join(workerDir, `node_modules/.bin/wrangler`),
    `wrangler${ext}`,
    'wrangler',
    'npx wrangler',
  ];
  for (const cmd of candidates) {
    const r = spawnSync(cmd, ['--version'], { shell: true, encoding: 'utf8', stdio: 'pipe' });
    if (r.status === 0) return cmd;
  }
  return null;
}
