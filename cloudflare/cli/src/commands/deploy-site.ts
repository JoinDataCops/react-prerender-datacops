/**
 * `prerender-edge deploy-site`
 *
 * Builds the frontend site and deploys it to Cloudflare Pages.
 * Auto-detects framework (React/Vite/Vue/Next.js/etc.) and pre-fills defaults.
 *
 * Flow:
 *   1. Detect / confirm framework, build command, output dir
 *   2. Create or reuse a Cloudflare Pages project
 *   3. Run the build
 *   4. `wrangler pages deploy <outputDir> --project-name <name>`
 *   5. Set WORKER_URL + WORKER_SECRET env vars on the Pages project
 */

import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { select, input, confirm } from '@inquirer/prompts';

import {
  getApiToken, getProject, getSiteConfig, setSiteConfig,
} from '../lib/config.js';
import {
  listAccounts, listPagesProjects, createPagesProject,
  updatePagesEnvVars, CloudflareApiError,
} from '../lib/cf-api.js';
import {
  detectFramework, getUnknownFramework, SPA_FRAMEWORKS,
} from '../lib/detect-framework.js';

export interface DeploySiteOptions {
  /** Skip the build step (just deploy already-built output) */
  skipBuild?: boolean;
  /** Force re-ask all questions even if config exists */
  reconfigure?: boolean;
}

export async function deploySiteCommand(opts: DeploySiteOptions = {}): Promise<void> {
  const token = getApiToken();
  if (!token) {
    console.log(chalk.red('\n  Not logged in. Run `prerender-edge login` first.\n'));
    process.exit(1);
  }

  const project = getProject();
  const existing = getSiteConfig();

  // ── 1. Load or collect site config ───────────────────────────────────────
  let siteConfig = existing && !opts.reconfigure ? existing : await collectSiteConfig(token, project);

  // ── 2. Show summary ───────────────────────────────────────────────────────
  console.log(chalk.bold.cyan('\n  Deploying site to Cloudflare Pages\n'));
  console.log(`  Framework : ${chalk.cyan(siteConfig.framework)}`);
  console.log(`  Build     : ${chalk.dim(siteConfig.buildCommand)}`);
  console.log(`  Output    : ${chalk.dim(siteConfig.outputDir)}`);
  console.log(`  Project   : ${chalk.cyan(siteConfig.pagesProject)}\n`);

  // ── 3. Build ──────────────────────────────────────────────────────────────
  if (!opts.skipBuild) {
    const built = await runBuild(siteConfig.buildCommand, siteConfig.outputDir);
    if (!built) process.exit(1);
  } else {
    console.log(chalk.dim('  Skipping build (--skip-build)\n'));
    if (!existsSync(resolve(process.cwd(), siteConfig.outputDir))) {
      console.log(chalk.red(`  Output directory "${siteConfig.outputDir}" not found.`));
      console.log(chalk.dim('  Run the build first or remove --skip-build.\n'));
      process.exit(1);
    }
  }

  // ── 4. Ensure Pages project exists ────────────────────────────────────────
  const { accountId } = await ensurePagesProject(token, siteConfig.pagesProject);

  // ── 5. wrangler pages deploy ──────────────────────────────────────────────
  const deployed = await runPagesDeploy(siteConfig.outputDir, siteConfig.pagesProject);
  if (!deployed) process.exit(1);

  // ── 6. Set env vars ───────────────────────────────────────────────────────
  if (project?.workerUrl && project?.workerSecret) {
    await setPageEnvVars(token, accountId, siteConfig.pagesProject, project.workerUrl, project.workerSecret);
  } else {
    console.log(chalk.yellow('\n  Worker URL or secret not found in config.'));
    console.log(chalk.dim('  Run `prerender-edge init` first to configure the worker.\n'));
  }

  console.log(chalk.bold.green('\n  ✓ Site deployed!\n'));
  console.log(chalk.dim('  Your site will be live at:'));
  console.log(`  ${chalk.cyan(`https://${siteConfig.pagesProject}.pages.dev`)}\n`);
  console.log(chalk.dim('  Custom domain: Cloudflare dashboard → Workers & Pages → your project → Custom domains\n'));
}

// ── Site config collector ─────────────────────────────────────────────────────

async function collectSiteConfig(
  token: string,
  project: ReturnType<typeof getProject>,
): Promise<NonNullable<ReturnType<typeof getSiteConfig>>> {
  console.log(chalk.bold.cyan('\n  Site Deployment Setup\n'));
  console.log(
    chalk.dim('  prerender-edge is designed for pure SPAs (React, Vue, Angular, etc.)\n') +
    chalk.dim('  that render into a single <div>. Frameworks with built-in SSR (Next.js,\n') +
    chalk.dim('  Nuxt, SvelteKit, Remix) don\'t need this — they already handle bots.\n'),
  );

  // Auto-detect framework
  const detected = detectFramework();

  if (detected?.hasBuiltInSsr) {
    console.log(chalk.yellow(`  ⚠  Detected: ${chalk.bold(detected.label)}`));
    console.log(chalk.yellow(`\n  ${detected.ssrNote}\n`));
    const proceed = await confirm({
      message: 'This framework has built-in SSR. Continue anyway?',
      default: false,
    });
    if (!proceed) {
      console.log(chalk.dim('\n  Exiting. No changes made.\n'));
      process.exit(0);
    }
  } else if (detected) {
    console.log(chalk.green(`  ✓ Detected: ${chalk.bold(detected.label)}\n`));
  } else {
    console.log(chalk.dim('  Could not detect framework — please select below.\n'));
  }

  // Framework picker — SPAs only shown by default
  const frameworkChoice = await select({
    message: 'Framework:',
    choices: [
      ...(detected && !detected.hasBuiltInSsr
        ? [{ name: `${detected.label}  ${chalk.dim('(detected)')}`, value: detected.name }]
        : []),
      ...SPA_FRAMEWORKS
        .filter((f) => f.name !== detected?.name)
        .map((f) => ({ name: f.label, value: f.name })),
      { name: 'Other / Custom', value: 'unknown' },
    ],
  });

  const profile =
    SPA_FRAMEWORKS.find((f) => f.name === frameworkChoice) ?? getUnknownFramework();

  // Build command
  const buildCommand = await input({
    message: 'Build command:',
    default: profile.buildCommand,
  });

  // Output dir
  const outputDir = await input({
    message: 'Build output directory:',
    default: profile.outputDir,
  });

  // Pages project name
  const defaultProjectName = project?.name ?? 'my-site';

  // Check existing Pages projects
  const s = ora('Loading Cloudflare Pages projects...').start();
  let pagesProjects: { id: string; name: string }[] = [];
  let accountId = '';
  try {
    const accounts = await listAccounts(token);
    accountId = accounts[0]?.id ?? '';
    if (accountId) pagesProjects = await listPagesProjects(token, accountId);
  } catch {}
  s.stop();

  let pagesProject: string;
  if (pagesProjects.length > 0) {
    pagesProject = await select({
      message: 'Cloudflare Pages project:',
      choices: [
        { name: `+ Create new project "${defaultProjectName}"`, value: '__new__' },
        ...pagesProjects.map((p) => ({ name: p.name, value: p.name })),
      ],
    });
    if (pagesProject === '__new__') {
      pagesProject = await input({
        message: 'New Pages project name:',
        default: defaultProjectName,
        validate: (v) => /^[a-z0-9-]+$/.test(v) ? true : 'Lowercase, numbers and hyphens only',
      });
    }
  } else {
    pagesProject = await input({
      message: 'Cloudflare Pages project name (will be created):',
      default: defaultProjectName,
      validate: (v) => /^[a-z0-9-]+$/.test(v) ? true : 'Lowercase, numbers and hyphens only',
    });
  }

  const cfg = {
    framework: profile.label,
    buildCommand,
    outputDir,
    pagesProject,
  };

  setSiteConfig(cfg);
  return cfg;
}

// ── Build ─────────────────────────────────────────────────────────────────────

async function runBuild(buildCommand: string, outputDir: string): Promise<boolean> {
  const s = ora(`Building site (${buildCommand})...`).start();

  // Split command into binary + args for cross-platform compatibility
  const [cmd, ...args] = buildCommand.split(' ');
  const result = spawnSync(cmd, args, {
    cwd: process.cwd(),
    shell: true,
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (result.status !== 0) {
    s.fail('Build failed');
    console.log('\n' + chalk.dim(result.stderr || result.stdout));
    console.log(chalk.yellow(`\n  Fix the build error above and retry.\n`));
    return false;
  }

  const outPath = resolve(process.cwd(), outputDir);
  if (!existsSync(outPath)) {
    s.fail(`Build succeeded but output directory "${outputDir}" was not created.`);
    console.log(chalk.dim(`  Expected output at: ${outPath}`));
    console.log(chalk.dim('  Check your framework config or update the output directory path.\n'));
    return false;
  }

  s.succeed(`Build complete → ${chalk.dim(outputDir)}`);
  return true;
}

// ── Ensure Pages project exists ───────────────────────────────────────────────

async function ensurePagesProject(
  token: string,
  projectName: string,
): Promise<{ accountId: string }> {
  // Step 1: get account ID (required for all API calls)
  const accounts = await listAccounts(token);
  const accountId = accounts[0]?.id ?? '';
  if (!accountId) {
    console.log(chalk.red('  Could not determine Cloudflare account ID.'));
    process.exit(1);
  }

  // Step 2: check if project already exists (list may fail — that's ok)
  let exists = false;
  try {
    const projects = await listPagesProjects(token, accountId);
    exists = projects.some((p) => p.name === projectName);
  } catch {
    // Can't list — assume it doesn't exist and try to create
  }

  if (exists) {
    console.log(chalk.dim(`  ✓ Using existing Pages project "${projectName}"`));
    return { accountId };
  }

  // Step 3: create the project via API
  const s = ora(`Creating Pages project "${projectName}"...`).start();
  try {
    await createPagesProject(token, accountId, projectName);
    s.succeed(`Created Pages project "${projectName}"`);
    return { accountId };
  } catch (apiErr) {
    s.stop();
    console.log(chalk.yellow(`  API create failed: ${apiErr instanceof Error ? apiErr.message : apiErr}`));
  }

  // Step 4: API failed — fallback to wrangler CLI
  console.log(chalk.dim(`  Trying wrangler CLI to create project...`));
  const r = spawnSync(
    'npx',
    ['wrangler', 'pages', 'project', 'create', projectName, '--production-branch', 'main'],
    { shell: true, encoding: 'utf8', stdio: 'pipe' },
  );
  if (r.status === 0) {
    console.log(chalk.green(`  ✓ Project "${projectName}" created via wrangler`));
    return { accountId };
  }

  // Step 5: Both failed — tell user to create manually and continue (deploy will fail gracefully)
  console.log(chalk.yellow(`\n  Could not create Pages project automatically.`));
  console.log(chalk.dim('  Create it manually with:'));
  console.log(chalk.cyan(`    npx wrangler pages project create ${projectName} --production-branch main`));
  console.log(chalk.dim('  Then re-run: prerender-edge deploy-site --skip-build\n'));

  return { accountId };
}

// ── wrangler pages deploy ─────────────────────────────────────────────────────

async function runPagesDeploy(outputDir: string, projectName: string): Promise<boolean> {
  const s = ora('Uploading to Cloudflare Pages...').start();

  const result = spawnSync(
    'npx',
    ['wrangler', 'pages', 'deploy', outputDir, '--project-name', projectName, '--commit-dirty=true'],
    {
      cwd: process.cwd(),
      shell: true,
      encoding: 'utf8',
      stdio: 'pipe',
    },
  );

  const output = (result.stdout ?? '') + (result.stderr ?? '');

  if (result.status === 0) {
    s.succeed('Uploaded to Cloudflare Pages');

    // Show the deployment URL wrangler printed
    const urlMatch = output.match(/https:\/\/[a-z0-9-]+\.pages\.dev/);
    if (urlMatch) {
      console.log(`  ${chalk.dim('URL:')} ${chalk.cyan(urlMatch[0])}`);
    }
    return true;
  }

  s.fail('Pages deployment failed');

  const isAuthError =
    output.includes('Authentication error') ||
    output.includes('code: 10000') ||
    output.includes('401');

  if (isAuthError) {
    console.log(chalk.yellow('\n  Auth error — run `prerender-edge login --force` and try again.\n'));
  } else {
    console.log('\n' + chalk.dim('  Wrangler output:'));
    output.split('\n').filter((l) => l.trim()).slice(-15).forEach((l) =>
      console.log(chalk.dim(`    ${l.trim()}`)),
    );
    console.log('\n  To deploy manually:');
    console.log(chalk.cyan(`    npx wrangler pages deploy ${outputDir} --project-name ${projectName}\n`));
  }

  return false;
}

// ── Set env vars on Pages project ─────────────────────────────────────────────

async function setPageEnvVars(
  token: string,
  accountId: string,
  projectName: string,
  workerUrl: string,
  workerSecret: string,
): Promise<void> {
  if (!accountId) return;
  const s = ora('Setting WORKER_URL and WORKER_SECRET on Pages project...').start();
  try {
    await updatePagesEnvVars(token, accountId, projectName, {
      WORKER_URL: workerUrl,
      WORKER_SECRET: workerSecret,
    });
    s.succeed('Environment variables set (WORKER_URL, WORKER_SECRET)');
  } catch (err) {
    s.warn('Could not auto-set env vars');
    const msg = err instanceof Error ? err.message : String(err);
    const isAuthErr = msg.includes('10000') || msg.includes('Auth') || msg.includes('403');
    if (isAuthErr) {
      console.log(chalk.dim('  Run `prerender-edge login --force` for a token with pages:write scope.'));
    }
    console.log(chalk.dim('\n  Set these manually in the Cloudflare Pages dashboard:'));
    console.log(chalk.dim(`  WORKER_URL    = ${workerUrl}`));
    console.log(chalk.dim(`  WORKER_SECRET = ${workerSecret}\n`));
  }
}
