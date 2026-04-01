/**
 * `prerender-edge init` — Backend selector.
 * Auto-triggers login if not authenticated, then delegates to
 * init-cloudflare.ts or init-supabase.ts.
 */

import chalk from 'chalk';
import { select } from '@inquirer/prompts';
import { isLoggedIn } from '../lib/config.js';
import { loginCommand } from './login.js';
import { initCloudflare } from './init-cloudflare.js';
import { initSupabase } from './init-supabase.js';

export async function initCommand(opts: {
  force?: boolean;
  cloudflare?: boolean;
  supabase?: boolean;
}): Promise<void> {
  console.log(chalk.bold.cyan('\n  Prerender Stack Setup\n'));

  // ── Pick backend first ────────────────────────────────────────────────────
  let backend: 'cloudflare' | 'supabase';

  if (opts.cloudflare) {
    backend = 'cloudflare';
  } else if (opts.supabase) {
    backend = 'supabase';
  } else {
    backend = await select({
      message: 'Which backend do you want to use?',
      choices: [
        {
          name: `Cloudflare  D1 (SQLite) + Workers  — recommended`,
          value: 'cloudflare',
        },
        {
          name: `Supabase    Postgres + Edge Functions`,
          value: 'supabase',
        },
      ],
    }) as 'cloudflare' | 'supabase';
  }

  // ── Auto-login if needed ──────────────────────────────────────────────────
  const login = isLoggedIn();
  const needsLogin =
    (backend === 'cloudflare' && !login.cloudflare) ||
    (backend === 'supabase' && !login.supabase);

  if (needsLogin) {
    console.log(chalk.yellow(`\n  Not logged in to ${backend === 'cloudflare' ? 'Cloudflare' : 'Supabase'} — let's do that first.\n`));
    await loginCommand({
      supabase: backend === 'supabase',
      force: false,
    });
    console.log(chalk.dim('\n  Login complete — continuing setup...\n'));
  }

  // ── Run the backend-specific wizard ──────────────────────────────────────
  if (backend === 'cloudflare') {
    await initCloudflare(opts);
  } else {
    await initSupabase(opts);
  }
}
