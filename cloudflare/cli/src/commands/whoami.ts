import chalk from 'chalk';
import ora from 'ora';
import {
  getAuth, getApiToken, getProject, getConfigPath,
  getSupabaseAuth, getSupabaseProject,
} from '../lib/config.js';
import { getUser, listAccounts } from '../lib/cf-api.js';

export async function whoamiCommand(): Promise<void> {
  const cfAuth = getAuth();
  const cfToken = getApiToken();
  const sbAuth = getSupabaseAuth();

  if (!cfAuth && !sbAuth) {
    console.log(chalk.yellow('\n  Not logged in to either backend.'));
    console.log(chalk.dim('  Run `prerender login` to authenticate.\n'));
    return;
  }

  console.log();

  // ── Cloudflare ────────────────────────────────────────────────────────────
  if (cfAuth && cfToken) {
    const cfSpin = ora('Fetching Cloudflare info...').start();
    try {
      const [user, accounts] = await Promise.all([getUser(cfToken), listAccounts(cfToken)]);
      cfSpin.stop();

      console.log(chalk.bold('  Cloudflare'));
      console.log(`  Email    : ${chalk.cyan(user.email)}`);
      console.log(`  Auth     : ${cfAuth.tokenType}`);
      if (cfAuth.tokenType === 'oauth' && cfAuth.expiresAt) {
        const exp = new Date(cfAuth.expiresAt);
        const ok = exp > new Date();
        console.log(`  Token exp: ${ok ? chalk.green(exp.toLocaleString()) : chalk.red(exp.toLocaleString() + ' EXPIRED')}`);
      }
      if (accounts.length) {
        console.log(`  Accounts : ${accounts.map((a) => a.name).join(', ')}`);
      }

      const project = getProject();
      if (project) {
        console.log(`\n  ${chalk.bold('CF Project')}  ${chalk.cyan(project.name)}`);
        console.log(`  Worker   : ${project.workerName}`);
        console.log(`  D1 DB    : ${project.dbName}  ${chalk.dim(project.dbId)}`);
        console.log(`  URL      : ${project.workerUrl ?? chalk.dim('(not deployed yet)')}`);
        console.log(`  Site     : ${project.siteUrl}`);
      } else {
        console.log(chalk.dim('\n  No CF project configured — run `prerender init --cloudflare`'));
      }
    } catch {
      cfSpin.fail('Could not fetch Cloudflare info (token may be invalid)');
    }
  } else {
    console.log(chalk.dim('  Cloudflare : not logged in'));
  }

  // ── Supabase ──────────────────────────────────────────────────────────────
  console.log();
  if (sbAuth) {
    console.log(chalk.bold('  Supabase'));
    console.log(`  Email    : ${chalk.cyan(sbAuth.email ?? 'unknown')}`);

    const sbProject = getSupabaseProject();
    if (sbProject) {
      console.log(`\n  ${chalk.bold('SB Project')}  ${chalk.cyan(sbProject.name)}  ${chalk.dim(sbProject.ref)}`);
      console.log(`  URL      : ${sbProject.url}`);
      console.log(`  Anon key : ${chalk.dim('(stored in config)')}`);
      console.log(`  Site     : ${sbProject.siteUrl ?? chalk.dim('(not set)')}`);
    } else {
      console.log(chalk.dim('\n  No Supabase project configured — run `prerender init --supabase`'));
    }
  } else {
    console.log(chalk.dim('  Supabase   : not logged in'));
  }

  console.log('\n' + chalk.dim(`  Config: ${getConfigPath()}\n`));
}
