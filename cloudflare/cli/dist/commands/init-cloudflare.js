/**
 * Cloudflare init flow — smart, resumable.
 *
 * On every run it checks the actual state of each component
 * (DB exists? schema applied? worker deployed? Pages env set?)
 * and only runs the steps that are missing or broken.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, copyFileSync, } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import ora from 'ora';
import { select, input, confirm } from '@inquirer/prompts';
import { getApiToken, setProject, getProject } from '../lib/config.js';
import { loginCommand } from './login.js';
import { deployCommand } from './deploy.js';
import { deploySiteCommand } from './deploy-site.js';
import { listAccounts, listD1Databases, createD1Database, executeD1Sql, listPagesProjects, updatePagesEnvVars, getWorkerSubdomain, listWorkers, getPagesProject, } from '../lib/cf-api.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// ── Schema / template finders ─────────────────────────────────────────────────
function findSchema() {
    const candidates = [
        resolve(__dirname, '../../assets/schemas/d1-schema.sql'),
        resolve(process.cwd(), 'cloudflare/d1-schema.sql'),
        resolve(process.cwd(), 'd1-schema.sql'),
    ];
    for (const p of candidates)
        if (existsSync(p))
            return p;
    throw new Error(`d1-schema.sql not found. Looked in:\n  ${candidates.join('\n  ')}`);
}
function findWorkerTemplate() {
    const candidates = [
        resolve(__dirname, '../../assets/templates/cloudflare/worker'),
        resolve(process.cwd(), 'cloudflare/workers/backend'),
    ];
    for (const p of candidates)
        if (existsSync(p))
            return p;
    return null;
}
function findMiddlewareTemplate() {
    const candidates = [
        resolve(__dirname, '../../assets/templates/cloudflare/_middleware.ts'),
        resolve(process.cwd(), 'cloudflare/functions/_middleware.ts'),
    ];
    for (const p of candidates)
        if (existsSync(p))
            return p;
    return null;
}
function copyDir(src, dest) {
    mkdirSync(dest, { recursive: true });
    for (const entry of readdirSync(src)) {
        const s = join(src, entry);
        const d = join(dest, entry);
        if (statSync(s).isDirectory())
            copyDir(s, d);
        else
            copyFileSync(s, d);
    }
}
function generateSecret() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let r = '';
    const arr = new Uint8Array(48);
    globalThis.crypto.getRandomValues(arr);
    for (const b of arr)
        r += chars[b % chars.length];
    return r;
}
async function checkStatus(token, project, workerDir) {
    const accounts = await listAccounts(token);
    const accountId = accounts[0]?.id ?? '';
    const accountName = accounts[0]?.name ?? '';
    // DB
    const dbs = await listD1Databases(token, accountId).catch(() => []);
    const db = dbs.find((d) => d.name === project.dbName || d.uuid === project.dbId);
    const dbExists = !!db;
    const dbId = db?.uuid ?? project.dbId;
    // Schema (try querying the table)
    let schemaApplied = false;
    if (dbExists && dbId) {
        try {
            await executeD1Sql(token, accountId, dbId, 'SELECT 1 FROM prerendered_pages LIMIT 1');
            schemaApplied = true;
        }
        catch {
            schemaApplied = false;
        }
    }
    // Worker
    const workers = await listWorkers(token, accountId).catch(() => []);
    const workerDeployed = workers.some((w) => w.id === project.workerName || w.id?.includes(project.workerName));
    // Pages env vars
    let pagesEnvSet = false;
    if (project.pagesProject) {
        try {
            const pg = await getPagesProject(token, accountId, project.pagesProject);
            const vars = pg.deployment_configs?.production?.env_vars ?? {};
            pagesEnvSet = !!vars['WORKER_URL'] && !!vars['WORKER_SECRET'];
        }
        catch {
            pagesEnvSet = false;
        }
    }
    // Local files
    const workerFilesExist = existsSync(join(workerDir, 'wrangler.toml'));
    const middlewareExists = existsSync(resolve(process.cwd(), 'functions/_middleware.ts'));
    return {
        accountId, accountName,
        dbExists, dbId, schemaApplied,
        workerDeployed, pagesEnvSet,
        workerFilesExist, middlewareExists,
    };
}
function printStatus(project, s, workerDir) {
    const ok = chalk.green('  ✓');
    const no = chalk.red('  ✗');
    const skip = chalk.dim('  –');
    console.log(chalk.bold('\n  Setup status'));
    console.log(`${s.dbExists ? ok : no} D1 database   ${chalk.dim(project.dbName)}`);
    console.log(`${s.schemaApplied ? ok : (s.dbExists ? no : skip)} Schema         ${s.schemaApplied ? chalk.dim('3 tables created') : chalk.dim('not applied')}`);
    console.log(`${s.workerFilesExist ? ok : no} Worker files   ${chalk.dim(workerDir)}`);
    console.log(`${s.workerDeployed ? ok : no} Worker deployed ${chalk.dim(project.workerName)}`);
    console.log(`${project.pagesProject
        ? (s.pagesEnvSet ? ok : no)
        : skip} Pages env vars ${project.pagesProject ? chalk.dim('WORKER_URL, WORKER_SECRET') : chalk.dim('(no pages project set)')}`);
    console.log(`${s.middlewareExists ? ok : no} Middleware     ${chalk.dim('functions/_middleware.ts')}\n`);
}
function isComplete(s, project) {
    return (s.dbExists &&
        s.schemaApplied &&
        s.workerFilesExist &&
        s.workerDeployed &&
        (!project.pagesProject || s.pagesEnvSet));
}
// ── Main export ───────────────────────────────────────────────────────────────
export async function initCloudflare(opts) {
    // Auto-login if needed
    if (!getApiToken()) {
        console.log(chalk.yellow('  Not logged in to Cloudflare — starting login...\n'));
        await loginCommand({ supabase: false, force: false });
    }
    const token = getApiToken();
    const existing = getProject();
    const defaultWorkerDir = resolve(process.cwd(), 'prerender-worker');
    // ── Already configured: show status and ask what to do ───────────────────
    if (existing && !opts.force) {
        const workerDir = opts.force ? defaultWorkerDir : defaultWorkerDir;
        const checkSpin = ora('Checking current setup status...').start();
        let status;
        try {
            status = await checkStatus(token, existing, workerDir);
            checkSpin.stop();
        }
        catch (err) {
            checkSpin.fail('Could not check status');
            throw err;
        }
        console.log(chalk.bold.cyan('\n  Prerender Stack — Cloudflare'));
        console.log(chalk.dim(`  Project: ${existing.name}  |  Site: ${existing.siteUrl}`));
        printStatus(existing, status, workerDir);
        const complete = isComplete(status, existing);
        if (complete) {
            console.log(chalk.green('  Everything is set up and deployed!\n'));
            const action = await select({
                message: 'What would you like to do?',
                choices: [
                    { name: 'Redeploy worker', value: 'redeploy' },
                    { name: 'Push secrets again (WORKER_SECRET, SITE_URL)', value: 'secrets' },
                    { name: 'Reconfigure project (keeps DB, changes settings)', value: 'reconfigure' },
                    { name: 'Nothing — exit', value: 'exit' },
                ],
            });
            if (action === 'exit')
                return;
            if (action === 'redeploy') {
                await deployCommand({ workerDir });
                return;
            }
            if (action === 'secrets') {
                await pushSecrets(token, existing, workerDir);
                return;
            }
            // fall through to reconfigure
        }
        else {
            const missingSteps = getMissingSteps(status, existing);
            console.log(chalk.yellow(`  ${missingSteps.length} step(s) still need attention.\n`));
            const action = await select({
                message: 'What would you like to do?',
                choices: [
                    { name: `Complete missing steps (${missingSteps.join(', ')})`, value: 'complete' },
                    { name: 'Reconfigure from scratch', value: 'reconfigure' },
                    { name: 'Exit', value: 'exit' },
                ],
            });
            if (action === 'exit')
                return;
            if (action === 'complete') {
                await runMissingSteps(token, existing, status, workerDir);
                return;
            }
            // fall through to reconfigure
        }
        // Reconfigure: keep account but re-ask project details
        console.log(chalk.dim('\n  Reconfiguring...\n'));
    }
    // ── Fresh setup wizard ────────────────────────────────────────────────────
    console.log(chalk.bold.cyan('\n  Cloudflare Setup Wizard\n'));
    // 1. Account
    const accSpin = ora('Loading accounts...').start();
    const accounts = await listAccounts(token);
    accSpin.stop();
    if (!accounts.length) {
        console.log(chalk.red('  No Cloudflare accounts found.'));
        process.exit(1);
    }
    let accountId, accountName;
    if (accounts.length === 1) {
        accountId = accounts[0].id;
        accountName = accounts[0].name;
        console.log(chalk.dim(`  Account: ${accountName}\n`));
    }
    else {
        const sel = await select({
            message: 'Select Cloudflare account:',
            choices: accounts.map((a) => ({ name: `${a.name}  ${chalk.dim(a.id)}`, value: a.id })),
        });
        const acc = accounts.find((a) => a.id === sel);
        accountId = acc.id;
        accountName = acc.name;
    }
    // 2. Project details
    const projectName = await input({
        message: 'Project name:',
        default: existing?.name ?? 'my-site',
        validate: (v) => /^[a-z0-9-]+$/.test(v) ? true : 'Lowercase letters, numbers and hyphens only',
    });
    const siteUrl = await input({
        message: 'Production site URL:',
        default: existing?.siteUrl ?? 'https://my-site.com',
        validate: (v) => v.startsWith('https://') ? true : 'Must start with https://',
    });
    const workerName = await input({
        message: 'Backend worker name:',
        default: existing?.workerName ?? `${projectName}-backend`,
    });
    const dbName = await input({
        message: 'D1 database name:',
        default: existing?.dbName ?? `${projectName}-prerender`,
    });
    // 3. Pages project (optional — only for Cloudflare Pages hosted sites)
    let pagesProjectName = existing?.pagesProject ?? '';
    const pagesSpin = ora('Loading Cloudflare Pages projects...').start();
    let pagesProjects = [];
    try {
        pagesProjects = await listPagesProjects(token, accountId);
    }
    catch { }
    pagesSpin.stop();
    if (pagesProjects.length > 0) {
        pagesProjectName = await select({
            message: 'Cloudflare Pages project (to auto-set WORKER_URL + WORKER_SECRET):',
            choices: [
                { name: '— My site is not on Cloudflare Pages (Vercel / Netlify / other) —', value: '' },
                ...pagesProjects.map((p) => ({ name: p.name, value: p.name })),
            ],
        });
    }
    else {
        console.log(chalk.dim('  No Cloudflare Pages projects found.'));
        console.log(chalk.dim('  If your site is on Vercel / Netlify / etc., leave this blank — you\'ll get setup instructions at the end.\n'));
        pagesProjectName = await input({
            message: 'Cloudflare Pages project name (blank if not on Cloudflare Pages):',
            default: '',
        });
    }
    // 4. Worker dir
    const scaffoldAt = await input({
        message: 'Where to scaffold worker files?',
        default: './prerender-worker',
    });
    const workerDir = resolve(process.cwd(), scaffoldAt);
    // 5. D1 database
    console.log('\n' + chalk.bold('  Setting up D1 database...'));
    const dbSpin = ora(`Looking for "${dbName}"...`).start();
    let dbId;
    try {
        const dbs = await listD1Databases(token, accountId);
        const found = dbs.find((d) => d.name === dbName);
        if (found) {
            dbSpin.succeed(`Reusing existing database "${dbName}"  ${chalk.dim(found.uuid)}`);
            dbId = found.uuid;
        }
        else {
            dbSpin.text = `Creating database "${dbName}"...`;
            const db = await createD1Database(token, accountId, dbName);
            dbSpin.succeed(`Created "${dbName}"  ${chalk.dim(db.uuid)}`);
            dbId = db.uuid;
        }
    }
    catch (err) {
        dbSpin.fail('Database setup failed');
        throw err;
    }
    // 6. Schema
    const schSpin = ora('Applying D1 schema...').start();
    try {
        const sql = readFileSync(findSchema(), 'utf8');
        await executeD1Sql(token, accountId, dbId, sql);
        schSpin.succeed('Schema applied (prerendered_pages, static_sitemaps, cron_job_runs)');
    }
    catch (err) {
        schSpin.fail('Schema migration failed');
        console.log(chalk.yellow('  You can retry with: prerender-edge migrate --cloudflare'));
        throw err;
    }
    // 7. Worker secret + URL
    const workerSecret = existing?.workerSecret ?? generateSecret();
    let workerUrl = `https://${workerName}.${accountName.toLowerCase().replace(/\s+/g, '-')}.workers.dev`;
    try {
        const sub = await getWorkerSubdomain(token, accountId);
        workerUrl = `https://${workerName}.${sub}.workers.dev`;
    }
    catch { }
    // 8. Save config
    setProject({ name: projectName, siteUrl, pagesProject: pagesProjectName, workerName, dbName, dbId, workerUrl, workerSecret, workerDir });
    // 9. Scaffold worker files
    await scaffoldWorker(workerDir, dbId, dbName, workerName);
    // 10. Scaffold middleware
    scaffoldMiddleware();
    // 11. Summary
    console.log('\n' + chalk.bold.green('  ✓ Backend setup complete!\n'));
    console.log(`  Worker    : ${chalk.cyan(workerName)}`);
    console.log(`  D1 DB     : ${chalk.cyan(dbName)}  ${chalk.dim(dbId)}`);
    console.log(`  Worker URL: ${chalk.cyan(workerUrl)}`);
    console.log(`  Files at  : ${chalk.dim(workerDir)}\n`);
    // 12. Deploy worker
    const deployWorker = await confirm({ message: 'Deploy the worker now?', default: true });
    if (deployWorker) {
        await deployCommand({ workerSecret, workerDir });
        // Trigger initial cache: worker fetches sitemap + live meta, builds HTML automatically
        await triggerInitialCache(workerUrl, workerSecret, siteUrl);
    }
    else {
        console.log(chalk.dim(`\n  When ready: prerender-edge deploy\n`));
    }
    // 13. Frontend site — where is it / deploy it
    console.log();
    console.log(chalk.bold('  Where is your frontend site?\n'));
    console.log(chalk.dim('  prerender-edge works best with pure SPAs (React, Vue, Angular, etc.)\n'));
    const siteAction = await select({
        message: 'What would you like to do with your site?',
        choices: [
            {
                name: `${chalk.bold('Deploy to Cloudflare Pages now')}  ${chalk.dim('— build + upload in one step')}`,
                value: 'deploy-cf',
            },
            {
                name: `My site is already on Cloudflare Pages  ${chalk.dim('— just set the env vars')}`,
                value: 'existing-cf',
            },
            {
                name: `My site is on Vercel  ${chalk.dim('— show me what to add')}`,
                value: 'vercel',
            },
            {
                name: `My site is on Netlify  ${chalk.dim('— show me what to add')}`,
                value: 'netlify',
            },
            {
                name: `Other / I'll set env vars myself`,
                value: 'other',
            },
        ],
    });
    if (siteAction === 'deploy-cf') {
        // Full deploy-site flow
        await deploySiteCommand({});
    }
    else if (siteAction === 'existing-cf') {
        // Ask for their existing Pages project name and set the vars
        const existingPagesProjects = await listPagesProjects(token, accountId).catch(() => []);
        let cfPagesProject;
        if (existingPagesProjects.length > 0) {
            cfPagesProject = await select({
                message: 'Select your Cloudflare Pages project:',
                choices: existingPagesProjects.map((p) => ({ name: p.name, value: p.name })),
            });
        }
        else {
            cfPagesProject = await input({
                message: 'Cloudflare Pages project name:',
                validate: (v) => v.trim().length > 0 ? true : 'Required',
            });
        }
        setProject({ name: projectName, siteUrl, pagesProject: cfPagesProject, workerName, dbName, dbId, workerUrl, workerSecret, workerDir });
        await setPagesEnvVars(token, accountId, cfPagesProject, workerUrl, workerSecret);
    }
    else {
        // Show manual instructions for Vercel / Netlify / Other
        showEnvInstructions(siteAction, '', workerUrl, workerSecret);
    }
}
// ── Missing steps runner ──────────────────────────────────────────────────────
function getMissingSteps(s, project) {
    const missing = [];
    if (!s.dbExists)
        missing.push('create DB');
    if (!s.schemaApplied)
        missing.push('apply schema');
    if (!s.workerFilesExist)
        missing.push('scaffold files');
    if (!s.workerDeployed)
        missing.push('deploy worker');
    if (project.pagesProject && !s.pagesEnvSet)
        missing.push('set Pages env vars');
    if (!s.middlewareExists)
        missing.push('scaffold middleware');
    return missing;
}
async function runMissingSteps(token, project, status, workerDir) {
    const accounts = await listAccounts(token);
    const accountId = accounts[0]?.id ?? status.accountId;
    // Create DB if missing
    if (!status.dbExists) {
        const s = ora(`Creating database "${project.dbName}"...`).start();
        try {
            const db = await createD1Database(token, accountId, project.dbName);
            setProject({ ...project, dbId: db.uuid });
            status.dbId = db.uuid;
            s.succeed(`Created "${project.dbName}"  ${chalk.dim(db.uuid)}`);
        }
        catch (err) {
            s.fail('Failed to create DB');
            throw err;
        }
    }
    // Apply schema if missing
    if (!status.schemaApplied && status.dbId) {
        const s = ora('Applying schema...').start();
        try {
            const sql = readFileSync(findSchema(), 'utf8');
            await executeD1Sql(token, accountId, status.dbId, sql);
            s.succeed('Schema applied');
        }
        catch (err) {
            s.fail('Schema failed');
            console.log(chalk.dim('  Run `prerender-edge migrate --cloudflare` to retry.'));
            throw err;
        }
    }
    // Scaffold files if missing
    if (!status.workerFilesExist) {
        await scaffoldWorker(workerDir, status.dbId, project.dbName, project.workerName);
    }
    if (!status.middlewareExists) {
        scaffoldMiddleware();
    }
    // Pages env vars
    if (project.pagesProject && !status.pagesEnvSet && project.workerSecret) {
        const workerUrl = project.workerUrl ?? '';
        await setPagesEnvVars(token, accountId, project.pagesProject, workerUrl, project.workerSecret);
    }
    // Deploy if not deployed
    if (!status.workerDeployed) {
        const deploy = await confirm({ message: 'Deploy the worker now?', default: true });
        if (deploy) {
            await deployCommand({ workerSecret: project.workerSecret, workerDir });
        }
        else {
            console.log(chalk.dim(`\n  Run: prerender-edge deploy\n`));
        }
    }
    else {
        console.log(chalk.bold.green('\n  ✓ All missing steps completed!\n'));
    }
}
// ── Helpers ───────────────────────────────────────────────────────────────────
async function pushSecrets(token, project, workerDir) {
    const { spawnSync } = await import('child_process');
    if (!project.workerSecret) {
        console.log(chalk.yellow('  No WORKER_SECRET in config. Re-run `prerender-edge init`.'));
        return;
    }
    const s = ora('Setting worker secrets...').start();
    const cmd = (secret, value) => spawnSync('npx', ['wrangler', 'secret', 'put', secret, '--env='], {
        cwd: workerDir,
        input: value + '\n',
        encoding: 'utf8',
        shell: true,
        env: { ...process.env, CLOUDFLARE_API_TOKEN: token },
    });
    const r1 = cmd('WORKER_SECRET', project.workerSecret);
    const r2 = cmd('SITE_URL', project.siteUrl);
    if (r1.status === 0 && r2.status === 0) {
        s.succeed('Secrets set (WORKER_SECRET, SITE_URL)');
    }
    else {
        s.warn('Could not set secrets via wrangler — try manually:');
        console.log(chalk.dim(`  cd "${workerDir}"`));
        console.log(chalk.dim(`  npx wrangler secret put WORKER_SECRET`));
        console.log(chalk.dim(`  npx wrangler secret put SITE_URL`));
    }
}
async function scaffoldWorker(workerDir, dbId, dbName, workerName) {
    const tplDir = findWorkerTemplate();
    if (!tplDir) {
        console.log(chalk.yellow('  Worker template not found — skipping scaffold.'));
        return;
    }
    try {
        copyDir(tplDir, workerDir);
        const wranglerPath = join(workerDir, 'wrangler.toml');
        if (existsSync(wranglerPath)) {
            let w = readFileSync(wranglerPath, 'utf8');
            w = w
                .replace(/database_id\s*=\s*""/, `database_id   = "${dbId}"`)
                .replace(/database_name\s*=\s*"[^"]*"/, `database_name = "${dbName}"`)
                .replace(/^name\s*=\s*"[^"]*"/m, `name = "${workerName}"`);
            writeFileSync(wranglerPath, w);
        }
        console.log(chalk.dim(`  ✓ Worker files scaffolded → ${workerDir}`));
    }
    catch (e) {
        console.log(chalk.yellow(`  Could not scaffold worker: ${e.message}`));
    }
}
function scaffoldMiddleware() {
    const tpl = findMiddlewareTemplate();
    if (!tpl)
        return;
    const dest = resolve(process.cwd(), 'functions/_middleware.ts');
    if (!existsSync(dest)) {
        mkdirSync(dirname(dest), { recursive: true });
        copyFileSync(tpl, dest);
        console.log(chalk.dim(`  ✓ Middleware scaffolded → functions/_middleware.ts`));
    }
    else {
        console.log(chalk.dim(`  – Middleware already exists → functions/_middleware.ts`));
    }
}
async function setPagesEnvVars(token, accountId, pagesProject, workerUrl, workerSecret) {
    const s = ora(`Setting Pages env vars on "${pagesProject}"...`).start();
    try {
        await updatePagesEnvVars(token, accountId, pagesProject, {
            WORKER_URL: workerUrl,
            WORKER_SECRET: workerSecret,
        });
        s.succeed(`Pages env vars set (WORKER_URL, WORKER_SECRET)`);
        return;
    }
    catch (err) {
        s.stop();
        const msg = err instanceof Error ? err.message : String(err);
        const isNotFound = msg.toLowerCase().includes('not found') || msg.includes('project');
        const isAuthError = msg.includes('10000') || msg.includes('Authentication') ||
            msg.includes('403') || msg.includes('401');
        if (isNotFound) {
            console.log(chalk.yellow(`\n  Cloudflare Pages project "${pagesProject}" not found.`));
            console.log(chalk.dim('  It looks like your site is not hosted on Cloudflare Pages.'));
        }
        else if (isAuthError) {
            console.log(chalk.yellow(`\n  Token missing 'pages:write' scope.`));
            console.log(chalk.dim(`  Run ${chalk.cyan('prerender-edge login --force')} and try again.`));
        }
        else {
            console.log(chalk.yellow(`\n  Could not set Pages env vars: ${msg}`));
        }
        // Try wrangler CLI as fallback (only if project might exist)
        if (!isNotFound) {
            const { spawnSync } = await import('child_process');
            const r1 = spawnSync('npx wrangler', ['pages', 'env', 'put', 'WORKER_URL', '--project-name', pagesProject, '--env', 'production'], { input: workerUrl + '\n', shell: true, encoding: 'utf8', stdio: 'pipe' });
            const r2 = spawnSync('npx wrangler', ['pages', 'env', 'put', 'WORKER_SECRET', '--project-name', pagesProject, '--env', 'production'], { input: workerSecret + '\n', shell: true, encoding: 'utf8', stdio: 'pipe' });
            if (r1.status === 0 && r2.status === 0) {
                console.log(chalk.green('  ✓ Pages env vars set via wrangler CLI'));
                return;
            }
        }
        // Ask the user where their site is hosted
        const platform = await select({
            message: 'Where is your site hosted?',
            choices: [
                { name: 'Cloudflare Pages', value: 'cf-pages' },
                { name: 'Vercel', value: 'vercel' },
                { name: 'Netlify', value: 'netlify' },
                { name: 'Other / I\'ll set it myself', value: 'other' },
            ],
        });
        showEnvInstructions(platform, pagesProject, workerUrl, workerSecret);
    }
}
function showEnvInstructions(platform, pagesProject, workerUrl, workerSecret) {
    console.log(chalk.bold.yellow('\n  ┌─ Add these environment variables to your site ─────────────────┐'));
    console.log(chalk.bold.yellow('  └────────────────────────────────────────────────────────────────┘\n'));
    console.log(`  ${chalk.bold('Variable name')}     ${chalk.bold('Value')}`);
    console.log(`  ${'─'.repeat(62)}`);
    console.log(`  ${chalk.green('WORKER_URL')}        ${chalk.cyan(workerUrl)}`);
    console.log(`  ${chalk.green('WORKER_SECRET')}     ${chalk.cyan(workerSecret)}\n`);
    if (platform === 'cf-pages') {
        console.log(chalk.bold('  How to add on Cloudflare Pages:\n'));
        console.log(`  ${chalk.cyan('1.')} Go to: ${chalk.underline('https://dash.cloudflare.com')}`);
        console.log(`  ${chalk.cyan('2.')} Workers & Pages → ${chalk.bold(pagesProject)} → Settings → Environment variables`);
        console.log(`  ${chalk.cyan('3.')} Click ${chalk.bold('"Add variable"')} → paste the names and values above`);
        console.log(`  ${chalk.cyan('4.')} Set for ${chalk.bold('Production')} (and Preview if needed) → Save`);
        console.log(`  ${chalk.cyan('5.')} Deployments tab → ${chalk.bold('"Retry deployment"')} to apply\n`);
    }
    else if (platform === 'vercel') {
        console.log(chalk.bold('  How to add on Vercel:\n'));
        console.log(`  ${chalk.cyan('1.')} Go to: ${chalk.underline('https://vercel.com/dashboard')}`);
        console.log(`  ${chalk.cyan('2.')} Select your project → Settings → Environment Variables`);
        console.log(`  ${chalk.cyan('3.')} Add ${chalk.green('WORKER_URL')} and ${chalk.green('WORKER_SECRET')} with the values above`);
        console.log(`  ${chalk.cyan('4.')} Select environment: ${chalk.bold('Production')} → Save`);
        console.log(`  ${chalk.cyan('5.')} Redeploy the project for the vars to take effect\n`);
        console.log(chalk.dim('  Or via Vercel CLI:'));
        console.log(chalk.dim(`    vercel env add WORKER_URL production`));
        console.log(chalk.dim(`    vercel env add WORKER_SECRET production\n`));
    }
    else if (platform === 'netlify') {
        console.log(chalk.bold('  How to add on Netlify:\n'));
        console.log(`  ${chalk.cyan('1.')} Go to: ${chalk.underline('https://app.netlify.com')}`);
        console.log(`  ${chalk.cyan('2.')} Select your site → Site configuration → Environment variables`);
        console.log(`  ${chalk.cyan('3.')} Click ${chalk.bold('"Add a variable"')} → add the names and values above`);
        console.log(`  ${chalk.cyan('4.')} Trigger a new deploy for the vars to take effect\n`);
        console.log(chalk.dim('  Or via Netlify CLI:'));
        console.log(chalk.dim(`    netlify env:set WORKER_URL "${workerUrl}"`));
        console.log(chalk.dim(`    netlify env:set WORKER_SECRET "${workerSecret}"\n`));
    }
    else {
        console.log(chalk.bold('  Add these to your hosting provider\'s environment variables:\n'));
        console.log(`  ${chalk.green('WORKER_URL')}    = ${chalk.cyan(workerUrl)}`);
        console.log(`  ${chalk.green('WORKER_SECRET')} = ${chalk.cyan(workerSecret)}\n`);
        console.log(chalk.dim('  These are usually found under:'));
        console.log(chalk.dim('  Project Settings → Environment Variables / Build & Deploy → Environment\n'));
    }
    console.log(chalk.dim('  Once added, the middleware will automatically use your worker.\n'));
}
// ── Initial cache trigger ─────────────────────────────────────────────────────
async function triggerInitialCache(workerUrl, workerSecret, siteUrl) {
    console.log('\n' + chalk.bold('  Triggering initial cache generation...\n'));
    console.log(chalk.dim(`  The worker will fetch your sitemap at ${siteUrl}/sitemap.xml`));
    console.log(chalk.dim('  and render each page using Cloudflare Browser Rendering.\n'));
    const s = ora('Starting cache generation (this runs in the background)...').start();
    try {
        // Give the worker a few seconds to fully initialize after deploy
        await new Promise((r) => setTimeout(r, 3000));
        const resp = await fetch(`${workerUrl}/api/cache/generate`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${workerSecret}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ force: true }),
        });
        if (resp.ok) {
            const result = await resp.json();
            if (result.success) {
                s.succeed(`Cache generated: ${result.pages_synced} page(s) cached in ${Math.round((result.time_ms ?? 0) / 1000)}s`);
            }
            else {
                s.warn('Cache generation started but returned an error — check logs with: prerender-edge logs');
            }
        }
        else if (resp.status === 401) {
            s.warn('Worker not ready yet (auth failed) — run `prerender-edge cache refresh` in a minute');
        }
        else {
            s.warn(`Cache generation returned ${resp.status} — run \`prerender-edge cache refresh\` manually`);
        }
    }
    catch {
        s.warn('Could not reach worker yet — it may still be starting up.');
        console.log(chalk.dim('  Run `prerender-edge cache refresh` in ~1 minute to trigger caching.\n'));
    }
    console.log(chalk.dim('\n  After caching, test with:'));
    console.log(chalk.cyan(`  curl -A "Googlebot/2.1" ${siteUrl}/`));
    console.log(chalk.dim('  You should see full HTML, not <div id="root"></div>\n'));
}
//# sourceMappingURL=init-cloudflare.js.map