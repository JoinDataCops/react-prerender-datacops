/**
 * Supabase init flow.
 * Called by init.ts when user selects the Supabase backend.
 *
 * 1. Select Supabase project
 * 2. Apply Postgres schema via Management API
 * 3. Show anon key + URL (for Pages env vars)
 * 4. Scaffold edge function source files
 * 5. Deploy functions (via supabase CLI or manual instructions)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, copyFileSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';
import { select, input, confirm } from '@inquirer/prompts';
import { getSupabaseAuth, setSupabaseProject, getSupabaseProject } from '../lib/config.js';
import { loginCommand } from './login.js';
import {
  listSbProjects,
  getSbApiKeys,
  executeSbSqlFile,
  listSbFunctions,
  deploySbFunction,
  setSbSecrets,
  SupabaseApiError,
} from '../lib/supabase-api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function findPostgresSchema(): string {
  const candidates = [
    resolve(__dirname, '../../assets/schemas/postgres-schema.sql'),  // npm package
    resolve(process.cwd(), 'database-schema.sql'),                    // repo root
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(`database-schema.sql not found. Looked in:\n  ${candidates.join('\n  ')}`);
}

function findEdgeFunctionTemplates(): string | null {
  const candidates = [
    resolve(__dirname, '../../assets/templates/supabase/edge-functions'),
    resolve(process.cwd(), 'edge-functions'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

function findSupabaseMiddlewareTemplate(): string | null {
  const candidates = [
    resolve(__dirname, '../../assets/templates/supabase/_middleware.ts'),
    resolve(process.cwd(), 'middleware.ts'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

function copyDir(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const s = join(src, entry);
    const d = join(dest, entry);
    if (statSync(s).isDirectory()) copyDir(s, d);
    else copyFileSync(s, d);
  }
}

function findSupabaseCli(): boolean {
  const result = spawnSync('supabase', ['--version'], { shell: true, encoding: 'utf8' });
  return result.status === 0;
}

export async function initSupabase(opts: { force?: boolean }): Promise<void> {
  // Auto-login if needed
  if (!getSupabaseAuth()) {
    console.log(chalk.yellow('  Not logged in to Supabase — starting login flow...\n'));
    await loginCommand({ supabase: true, force: false });
  }
  const auth = getSupabaseAuth()!;

  const existing = getSupabaseProject();
  if (existing && !opts.force) {
    console.log(chalk.yellow(`  Supabase project "${existing.name}" already configured.`));
    const overwrite = await confirm({ message: 'Reconfigure?', default: false });
    if (!overwrite) { console.log(chalk.dim('  Cancelled.')); return; }
  }

  console.log(chalk.bold.cyan('\n  Supabase Setup Wizard\n'));

  // ── 1. Select project ─────────────────────────────────────────────────────
  const spin = ora('Loading Supabase projects...').start();
  let projects;
  try {
    projects = await listSbProjects(auth.token);
  } catch (err) {
    spin.fail('Could not load projects');
    throw err;
  }
  spin.stop();

  if (!projects.length) {
    console.log(chalk.red('  No Supabase projects found. Create one at https://app.supabase.com'));
    process.exit(1);
  }

  const ref = await select({
    message: 'Select Supabase project:',
    choices: projects.map((p) => ({
      name: `${p.name}  ${chalk.dim(p.ref)}  ${chalk.dim(p.region)}  ${p.status === 'ACTIVE_HEALTHY' ? chalk.green('●') : chalk.yellow('●')}`,
      value: p.ref,
    })),
  });
  const project = projects.find((p) => p.ref === ref)!;

  // ── 2. Get API keys ───────────────────────────────────────────────────────
  const keySpin = ora('Fetching API keys...').start();
  let anonKey = '';
  let serviceRoleKey = '';
  try {
    const keys = await getSbApiKeys(auth.token, ref);
    anonKey = keys.find((k) => k.name === 'anon')?.api_key ?? '';
    serviceRoleKey = keys.find((k) => k.name === 'service_role')?.api_key ?? '';
    keySpin.succeed('API keys retrieved');
  } catch {
    keySpin.warn('Could not fetch API keys — you can set them manually');
  }

  const projectUrl = `https://${ref}.supabase.co`;

  // ── 3. Site URL ───────────────────────────────────────────────────────────
  const siteUrl = await input({
    message: 'Production site URL:',
    default: 'https://my-site.com',
    validate: (v) => (v.startsWith('https://') ? true : 'Must start with https://'),
  });

  // Pages project name (for reference)
  const pagesProject = await input({
    message: 'Cloudflare Pages project name (optional, for reference):',
    default: '',
  });

  // ── 4. Apply Postgres schema ───────────────────────────────────────────────
  const schemaSpin = ora('Applying Postgres schema...').start();
  try {
    const sql = readFileSync(findPostgresSchema(), 'utf8');
    await executeSbSqlFile(auth.token, ref, sql);
    schemaSpin.succeed('Schema applied (prerendered_pages, static_sitemaps, cron_job_runs)');
  } catch (err) {
    schemaSpin.fail('Schema failed');
    console.log(chalk.yellow('\n  You can apply the schema manually in the Supabase SQL editor.'));
    console.log(chalk.dim('  https://app.supabase.com/project/' + ref + '/sql/new\n'));
  }

  // ── 5. Save config ────────────────────────────────────────────────────────
  setSupabaseProject({
    ref,
    name: project.name,
    url: projectUrl,
    anonKey,
    serviceRoleKey,
    pagesProject,
    siteUrl,
  });

  // ── 6. Push secrets to edge functions ─────────────────────────────────────
  if (serviceRoleKey) {
    const secSpin = ora('Setting function secrets...').start();
    try {
      await setSbSecrets(auth.token, ref, {
        SUPABASE_URL: projectUrl,
        SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
        SUPABASE_ANON_KEY: anonKey,
        SITE_URL: siteUrl,
      });
      secSpin.succeed('Function secrets set');
    } catch {
      secSpin.warn('Could not set secrets — set them in the Supabase dashboard');
    }
  }

  // ── 7. Scaffold edge function files ───────────────────────────────────────
  const tplDir = findEdgeFunctionTemplates();
  if (tplDir) {
    const scaffoldEdge = await confirm({
      message: 'Scaffold edge function source files into your project?',
      default: true,
    });

    if (scaffoldEdge) {
      const edgeDest = resolve(process.cwd(), 'supabase/functions');
      try {
        // Copy each function as its own folder (Supabase convention)
        for (const fn of readdirSync(tplDir)) {
          const fnSrc = join(tplDir, fn);
          if (statSync(fnSrc).isFile()) {
            // Template has flat files: prerender.ts → supabase/functions/prerender/index.ts
            const fnName = fn.replace('.ts', '');
            const fnDest = join(edgeDest, fnName);
            mkdirSync(fnDest, { recursive: true });
            copyFileSync(fnSrc, join(fnDest, 'index.ts'));
          }
        }
        console.log(chalk.dim(`  ✓ Edge functions → supabase/functions/`));
      } catch (e) {
        console.log(chalk.yellow(`  Could not scaffold: ${(e as Error).message}`));
      }
    }
  }

  // Scaffold middleware
  const middleTpl = findSupabaseMiddlewareTemplate();
  if (middleTpl) {
    const dest = resolve(process.cwd(), 'functions/_middleware.ts');
    mkdirSync(dirname(dest), { recursive: true });
    // Patch SUPABASE_URL and SUPABASE_ANON_KEY into the middleware comment
    copyFileSync(middleTpl, dest);
    console.log(chalk.dim(`  ✓ Middleware → functions/_middleware.ts`));
  }

  // ── 8. Deploy functions (supabase CLI) ────────────────────────────────────
  const hasCli = findSupabaseCli();

  if (hasCli) {
    const shouldDeploy = await confirm({
      message: 'Deploy all edge functions now via supabase CLI?',
      default: true,
    });

    if (shouldDeploy) {
      await deployWithSupabaseCli(ref);
    }
  } else {
    console.log('\n' + chalk.bold('  Deploy edge functions manually:'));
    console.log(chalk.dim('  npm install -g supabase'));
    for (const fn of ['prerender', 'generate-prerender-cache', 'generate-sitemap', 'serve-sitemap', 'script-service', 'manage-cron-job']) {
      console.log(chalk.dim(`  supabase functions deploy ${fn} --project-ref ${ref}`));
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n' + chalk.bold.green('  ✓ Supabase setup complete!\n'));
  console.log(`  Project     : ${chalk.cyan(project.name)}  ${chalk.dim('(' + ref + ')')}`);
  console.log(`  URL         : ${chalk.cyan(projectUrl)}`);
  console.log(`  Anon key    : ${chalk.dim(anonKey ? '(stored in config)' : 'not found — get from dashboard')}`);

  console.log('\n' + chalk.bold('  Set these in your Cloudflare Pages dashboard:'));
  console.log(chalk.dim(`    SUPABASE_URL      = ${projectUrl}`));
  console.log(chalk.dim(`    SUPABASE_ANON_KEY = ${anonKey || '<your-anon-key>'}`));
  console.log();
}

async function deployWithSupabaseCli(ref: string): Promise<void> {
  const functions = [
    'prerender',
    'generate-prerender-cache',
    'generate-sitemap',
    'serve-sitemap',
    'script-service',
    'manage-cron-job',
  ];

  for (const fn of functions) {
    const spin = ora(`Deploying ${fn}...`).start();
    const result = spawnSync(
      'supabase',
      ['functions', 'deploy', fn, '--project-ref', ref],
      { shell: true, encoding: 'utf8', cwd: process.cwd() },
    );
    if (result.status === 0) {
      spin.succeed(`Deployed ${fn}`);
    } else {
      spin.warn(`Could not deploy ${fn} — check supabase/functions/${fn}/index.ts exists`);
    }
  }
}
