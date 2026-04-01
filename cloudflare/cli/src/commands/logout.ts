import chalk from 'chalk';
import { select, confirm } from '@inquirer/prompts';
import { clearAuth, clearConfig, getAuth, getSupabaseAuth, clearSupabaseAuth, getConfigPath } from '../lib/config.js';

export async function logoutCommand(opts: { all?: boolean; supabase?: boolean; cloudflare?: boolean }): Promise<void> {
  if (opts.all) {
    const yes = await confirm({ message: 'Clear ALL config (auth + projects for both backends)?', default: false });
    if (!yes) { console.log(chalk.dim('  Cancelled.')); return; }
    clearConfig();
    console.log(chalk.green('  ✓ All config cleared.'));
    return;
  }

  let target: 'cloudflare' | 'supabase' | 'both';
  if (opts.cloudflare && !opts.supabase) {
    target = 'cloudflare';
  } else if (opts.supabase && !opts.cloudflare) {
    target = 'supabase';
  } else {
    target = await select({
      message: 'Log out from which backend?',
      choices: [
        { name: `Cloudflare  ${getAuth() ? '' : chalk.dim('(not logged in)')}`, value: 'cloudflare' },
        { name: `Supabase    ${getSupabaseAuth() ? '' : chalk.dim('(not logged in)')}`, value: 'supabase' },
        { name: 'Both', value: 'both' },
      ],
    }) as 'cloudflare' | 'supabase' | 'both';
  }

  if (target === 'cloudflare' || target === 'both') {
    clearAuth();
    console.log(chalk.green('  ✓ Logged out from Cloudflare.'));
  }
  if (target === 'supabase' || target === 'both') {
    clearSupabaseAuth();
    console.log(chalk.green('  ✓ Logged out from Supabase.'));
  }

  console.log(chalk.dim(`  Config: ${getConfigPath()}`));
}
