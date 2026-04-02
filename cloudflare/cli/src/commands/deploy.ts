/**
 * `prerender-edge deploy` — Deploy the backend worker using wrangler.
 *
 * Handles:
 *   - Auto npm install if node_modules is missing
 *   - Auto `wrangler login` if auth fails
 *   - Pushes WORKER_SECRET + SITE_URL via wrangler after deploy
 */

import { spawnSync, spawn } from 'child_process';
import { resolve, join } from 'path';
import { existsSync, writeFileSync } from 'fs';
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

  // ── 1. Ensure package.json exists (older scaffolds may not have one) ─────
  const pkgPath = join(workerDir, 'package.json');
  if (!existsSync(pkgPath)) {
    console.log(chalk.dim('  Creating package.json for worker...'));
    writeFileSync(pkgPath, JSON.stringify({
      name: 'prerender-worker',
      private: true,
      version: '0.0.0',
      type: 'module',
      scripts: { dev: 'wrangler dev', deploy: 'wrangler deploy' },
      devDependencies: {
        '@cloudflare/workers-types': '^4.20240725.0',
        typescript: '^5.5.0',
        wrangler: '^4.0.0',
      },
    }, null, 2) + '\n');
  }

  // ── 2. npm install if needed ──────────────────────────────────────────────
  if (!existsSync(join(workerDir, 'node_modules'))) {
    console.log(chalk.dim('  Installing worker dependencies...\n'));

    // Use --legacy-peer-deps so that peer dep conflicts in the parent
    // project (if the worker dir is nested inside another npm project)
    // do not block the worker's own install.
    const installCode = await new Promise<number>((res) => {
      const child = spawn('npm', ['install', '--legacy-peer-deps'], {
        cwd: workerDir, shell: true, stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stderr = '';
      child.stdout?.on('data', (d: Buffer) => {
        const line = d.toString().trim();
        if (line) console.log(chalk.dim(`    ${line}`));
      });
      child.stderr?.on('data', (d: Buffer) => {
        const line = d.toString().trim();
        stderr += d.toString();
        if (line) console.log(chalk.dim(`    ${line}`));
      });
      child.on('close', (code) => {
        if (code !== 0 && (stderr.includes('ERESOLVE') || stderr.includes('peer'))) {
          console.log(chalk.yellow('\n  Peer dependency conflict detected.'));
          console.log(chalk.dim('  Run manually inside the worker directory:'));
          console.log(chalk.cyan(`    cd "${workerDir}"`));
          console.log(chalk.cyan('    npm install --legacy-peer-deps'));
        }
        res(code ?? 1);
      });
    });

    if (installCode !== 0) {
      console.log(chalk.red('\n  ✗ npm install failed'));
      process.exit(1);
    }
    console.log(chalk.green('\n  ✓ Dependencies installed'));
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
  const label = isRetry ? '  Retrying deploy...' : '  Running wrangler deploy...';
  console.log(chalk.dim(label + '\n'));

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

  // Stream wrangler output in real-time while capturing it for error detection
  const { exitCode, output } = await new Promise<{ exitCode: number; output: string }>((res) => {
    let captured = '';
    const child = spawn(
      wranglerBin,
      ['deploy', '--env='],
      {
        cwd: workerDir,
        env: deployEnv,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    child.stdout?.on('data', (d: Buffer) => {
      const text = d.toString();
      captured += text;
      text.split('\n').filter((l: string) => l.trim()).forEach((l: string) => {
        console.log(chalk.dim(`    ${l}`));
      });
    });
    child.stderr?.on('data', (d: Buffer) => {
      const text = d.toString();
      captured += text;
      text.split('\n').filter((l: string) => l.trim()).forEach((l: string) => {
        // Warnings in yellow, errors in default dim
        if (l.includes('WARN') || l.includes('[WARNING]')) {
          console.log(chalk.yellow(`    ${l}`));
        } else {
          console.log(chalk.dim(`    ${l}`));
        }
      });
    });
    child.on('close', (code) => res({ exitCode: code ?? 1, output: captured }));
  });

  if (exitCode === 0) {
    // Show the URL wrangler printed
    const urlMatch = output.match(/https:\/\/\S+\.workers\.dev/);
    console.log(chalk.green('\n  ✓ Worker deployed'));
    if (urlMatch) {
      console.log(chalk.dim(`  URL: ${urlMatch[0]}`));
    }
    return true;
  }

  // ── Deploy failed ─────────────────────────────────────────────────────────
  console.log(chalk.red('\n  ✗ Deployment failed'));

  const isAuthError =
    output.includes('Authentication error') ||
    output.includes('code: 10000') ||
    output.includes('[code: 10000]') ||
    output.includes('CLOUDFLARE_API_TOKEN') ||
    output.includes('401');

  const isMultiEnv =
    output.includes('Multiple environments') ||
    output.includes('no target environment');

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
