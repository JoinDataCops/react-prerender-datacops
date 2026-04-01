/**
 * `prerender migrate` — Apply or reset the database schema.
 * Supports both Cloudflare D1 and Supabase Postgres.
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import ora from 'ora';
import { select, confirm } from '@inquirer/prompts';
import { getApiToken, getProject, getSupabaseAuth, getSupabaseProject, isLoggedIn } from '../lib/config.js';
import { executeD1Sql, listAccounts } from '../lib/cf-api.js';
import { executeSbSqlFile } from '../lib/supabase-api.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
function findSchema(type) {
    const file = type === 'd1' ? 'd1-schema.sql' : 'postgres-schema.sql';
    const candidates = [
        resolve(__dirname, `../../assets/schemas/${file}`),
        resolve(process.cwd(), 'cloudflare/d1-schema.sql'),
        resolve(process.cwd(), 'database-schema.sql'),
    ];
    for (const p of candidates) {
        if (existsSync(p))
            return p;
    }
    throw new Error(`Schema file not found. Looked in:\n  ${candidates.join('\n  ')}`);
}
const DROP_D1_SQL = `
DROP TABLE IF EXISTS cron_job_runs;
DROP TABLE IF EXISTS static_sitemaps;
DROP TABLE IF EXISTS prerendered_pages;
`;
const DROP_POSTGRES_SQL = `
DROP TABLE IF EXISTS cron_job_runs CASCADE;
DROP TABLE IF EXISTS static_sitemaps CASCADE;
DROP TABLE IF EXISTS prerendered_pages CASCADE;
DROP FUNCTION IF EXISTS public.schedule_cron_job CASCADE;
DROP FUNCTION IF EXISTS public.unschedule_cron_job CASCADE;
DROP FUNCTION IF EXISTS public.get_cron_job_status CASCADE;
`;
export async function migrateCommand(opts) {
    const login = isLoggedIn();
    let backend;
    if (opts.cloudflare) {
        backend = 'cloudflare';
    }
    else if (opts.supabase) {
        backend = 'supabase';
    }
    else if (login.cloudflare && !login.supabase) {
        backend = 'cloudflare';
    }
    else if (!login.cloudflare && login.supabase) {
        backend = 'supabase';
    }
    else {
        backend = await select({
            message: 'Run migration on which backend?',
            choices: [
                { name: 'Cloudflare D1', value: 'cloudflare' },
                { name: 'Supabase Postgres', value: 'supabase' },
            ],
        });
    }
    if (backend === 'cloudflare') {
        await migrateCloudflare(opts.reset);
    }
    else {
        await migrateSupabase(opts.reset);
    }
}
async function migrateCloudflare(reset) {
    const token = getApiToken();
    const project = getProject();
    if (!token || !project) {
        console.log(chalk.red('  Run `prerender login` and `prerender init --cloudflare` first.'));
        process.exit(1);
    }
    const accounts = await listAccounts(token);
    const accountId = accounts[0]?.id;
    if (!accountId) {
        console.log(chalk.red('  No account found.'));
        process.exit(1);
    }
    if (reset) {
        console.log(chalk.red.bold('\n  ⚠  DROP all Cloudflare D1 tables\n'));
        const yes = await confirm({ message: 'All cached data will be lost. Continue?', default: false });
        if (!yes) {
            console.log(chalk.dim('  Cancelled.'));
            return;
        }
        const s = ora('Dropping tables...').start();
        await executeD1Sql(token, accountId, project.dbId, DROP_D1_SQL);
        s.succeed('Tables dropped');
    }
    const sql = readFileSync(findSchema('d1'), 'utf8');
    const s = ora(`Applying D1 schema to "${project.dbName}"...`).start();
    try {
        await executeD1Sql(token, accountId, project.dbId, sql);
        s.succeed(`Schema applied to "${project.dbName}"`);
    }
    catch (err) {
        s.fail('Migration failed');
        throw err;
    }
}
async function migrateSupabase(reset) {
    const auth = getSupabaseAuth();
    const project = getSupabaseProject();
    if (!auth || !project) {
        console.log(chalk.red('  Run `prerender login --supabase` and `prerender init --supabase` first.'));
        process.exit(1);
    }
    if (reset) {
        console.log(chalk.red.bold('\n  ⚠  DROP all Supabase tables\n'));
        const yes = await confirm({ message: 'All cached data will be lost. Continue?', default: false });
        if (!yes) {
            console.log(chalk.dim('  Cancelled.'));
            return;
        }
        const s = ora('Dropping tables...').start();
        await executeSbSqlFile(auth.token, project.ref, DROP_POSTGRES_SQL);
        s.succeed('Tables dropped');
    }
    const sql = readFileSync(findSchema('postgres'), 'utf8');
    const s = ora(`Applying Postgres schema to "${project.name}"...`).start();
    try {
        await executeSbSqlFile(auth.token, project.ref, sql);
        s.succeed(`Schema applied to "${project.name}"`);
    }
    catch (err) {
        s.fail('Migration failed');
        throw err;
    }
}
//# sourceMappingURL=migrate.js.map