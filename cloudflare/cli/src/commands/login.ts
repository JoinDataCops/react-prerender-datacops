import chalk from 'chalk';
import ora from 'ora';
import { select, password, confirm } from '@inquirer/prompts';
import open from 'open';
import { setAuth, getAuth, setSupabaseAuth, getSupabaseAuth, getConfigPath } from '../lib/config.js';
import { getUser, listAccounts } from '../lib/cf-api.js';
import { getSbUser } from '../lib/supabase-api.js';
import { startOAuthFlow, CF_DEFAULT_CLIENT_ID } from '../lib/auth.js';

const SB_TOKENS_URL = 'https://app.supabase.com/account/tokens';

// ── Privacy notice — shown once at start of every login ──────────────────────
function printPrivacyNotice(): void {
  const configPath = getConfigPath();
  console.log(
    chalk.dim(
      `\n  🔒 Privacy: All credentials are stored only on your machine at:\n` +
      `     ${configPath}\n` +
      `     We never transmit, collect, or see your tokens.\n`,
    ),
  );
}

export async function loginCommand(opts: {
  token?: string;
  oauth?: string;
  supabase?: boolean;
  force?: boolean;
}): Promise<void> {
  // ── Direct token flags (non-interactive) ─────────────────────────────────
  if (opts.token && !opts.supabase) {
    printPrivacyNotice();
    await saveCfApiToken(opts.token);
    return;
  }
  if (opts.token && opts.supabase) {
    printPrivacyNotice();
    await saveSbToken(opts.token);
    return;
  }

  // ── Choose backend ────────────────────────────────────────────────────────
  let backend: 'cloudflare' | 'supabase';

  if (opts.supabase) {
    backend = 'supabase';
  } else if (opts.oauth) {
    backend = 'cloudflare';
  } else {
    const cfLoggedIn = !!getAuth();
    const sbLoggedIn = !!getSupabaseAuth();

    console.log(chalk.bold.cyan('\n  Login to Prerender Stack\n'));

    if (!opts.force && (cfLoggedIn || sbLoggedIn)) {
      if (cfLoggedIn) {
        console.log(chalk.green(`  ✓ Cloudflare  ${chalk.dim(getAuth()?.email ?? '')}`));
      } else {
        console.log(chalk.dim('  ✗ Cloudflare  (not logged in)'));
      }
      if (sbLoggedIn) {
        console.log(chalk.green(`  ✓ Supabase    ${chalk.dim(getSupabaseAuth()?.email ?? '')}`));
      } else {
        console.log(chalk.dim('  ✗ Supabase    (not logged in)'));
      }
      console.log();
    }

    backend = await select({
      message: 'Log in to which backend?',
      choices: [
        {
          name: `Cloudflare  ${cfLoggedIn && !opts.force ? chalk.dim('(re-auth)') : ''}`,
          value: 'cloudflare',
        },
        {
          name: `Supabase    ${sbLoggedIn && !opts.force ? chalk.dim('(re-auth)') : ''}`,
          value: 'supabase',
        },
      ],
    }) as 'cloudflare' | 'supabase';
  }

  printPrivacyNotice();

  if (backend === 'cloudflare') {
    await cfLoginFlow(opts.oauth);
  } else {
    await sbLoginFlow();
  }
}

// ── Cloudflare ────────────────────────────────────────────────────────────────

async function cfLoginFlow(customClientId?: string): Promise<void> {
  console.log(chalk.bold('  Cloudflare Login\n'));

  const method = await select({
    message: 'How do you want to log in?',
    choices: [
      {
        name: `${chalk.bold('Browser')}  — Opens Cloudflare in your browser, click Allow  ${chalk.green('(recommended)')}`,
        value: 'oauth',
      },
      {
        name: `${chalk.bold('API Token')}  — Paste a token you created manually`,
        value: 'token',
      },
    ],
  });

  if (method === 'oauth') {
    await cfOAuthFlow(customClientId ?? CF_DEFAULT_CLIENT_ID);
  } else {
    await cfApiTokenFlow();
  }
}

async function cfOAuthFlow(clientId: string): Promise<void> {
  console.log(
    chalk.dim(
      '\n  A browser window will open. Log in to Cloudflare and click "Allow".\n' +
      '  Required permissions are requested automatically — you don\'t need to\n' +
      '  create or configure anything manually.\n',
    ),
  );

  const spinner = ora('Opening browser...').start();

  try {
    // Open browser slightly after the local server has started
    // startOAuthFlow() starts the server then waits for callback
    setTimeout(async () => {
      try {
        await open(
          `https://dash.cloudflare.com/oauth2/auth?` +
          `response_type=code` +
          `&client_id=${clientId}` +
          `&redirect_uri=http://localhost:8976/oauth/callback` +
          `&scope=account:read+user:read+workers:edit+workers_scripts:edit+d1:write+pages:edit` +
          `&code_challenge_method=S256`,
        );
      } catch {
        spinner.text = 'Could not open browser automatically — check the URL above';
      }
    }, 300);

    spinner.text = 'Waiting for you to approve in the browser...';

    const tokens = await startOAuthFlow(clientId);
    spinner.succeed('Authorized!');

    const spinner2 = ora('Fetching account info...').start();
    const user = await getUser(tokens.accessToken);
    const accounts = await listAccounts(tokens.accessToken);
    spinner2.stop();

    setAuth({
      token: tokens.accessToken,
      tokenType: 'oauth',
      email: user.email,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
    });

    console.log(chalk.bold.green(`\n  ✓ Logged in as ${chalk.white(user.email)}`));
    if (accounts.length === 1) {
      console.log(chalk.dim(`  Account: ${accounts[0].name}`));
    }
    console.log(chalk.dim(`  Token stored locally — never sent to us.\n`));
  } catch (err) {
    spinner.fail('OAuth failed');
    console.log(chalk.dim('\n  Tip: If the browser did not open, try `prerender-edge login` again\n  or use `prerender-edge login --token <your-api-token>` instead.\n'));
    throw err;
  }
}

async function cfApiTokenFlow(): Promise<void> {
  console.log(chalk.dim('\n  Required permissions when creating the token:'));
  console.log(chalk.dim('  ┌────────────────────────────────────────────────┐'));
  console.log(chalk.dim('  │  Account › D1                   — Edit        │'));
  console.log(chalk.dim('  │  Account › Workers Scripts      — Edit        │'));
  console.log(chalk.dim('  │  Account › Pages                — Edit        │'));
  console.log(chalk.dim('  │  Account › Account Settings     — Read        │'));
  console.log(chalk.dim('  │  User    › User Details         — Read        │'));
  console.log(chalk.dim('  └────────────────────────────────────────────────┘'));

  const openBrowser = await select({
    message: 'Open Cloudflare token creation page?',
    choices: [
      { name: 'Yes, open browser', value: true },
      { name: 'No, I already have a token', value: false },
    ],
  });

  if (openBrowser) {
    await open('https://dash.cloudflare.com/profile/api-tokens/create');
    console.log(chalk.dim('\n  Set the permissions above, create the token, then paste it here.\n'));
  }

  const token = await password({
    message: 'Paste your Cloudflare API token:',
    validate: (v) => (v.trim().length > 10 ? true : 'Token seems too short'),
  });

  await saveCfApiToken(token.trim());
}

async function saveCfApiToken(token: string): Promise<void> {
  const spinner = ora('Verifying token...').start();
  try {
    const user = await getUser(token);
    const accounts = await listAccounts(token);
    spinner.succeed('Token verified');

    setAuth({ token, tokenType: 'apiToken', email: user.email });

    console.log(chalk.bold.green(`\n  ✓ Logged in as ${chalk.white(user.email)}`));
    if (accounts.length === 1) {
      console.log(chalk.dim(`  Account: ${accounts[0].name}`));
    } else {
      console.log(chalk.dim(`  ${accounts.length} accounts — run \`prerender-edge init\` to pick one`));
    }
    console.log(chalk.dim(`  Token stored locally at: ${getConfigPath()}\n`));
  } catch (err) {
    spinner.fail('Token verification failed');
    throw err;
  }
}

// ── Supabase ──────────────────────────────────────────────────────────────────

async function sbLoginFlow(): Promise<void> {
  console.log(chalk.bold('  Supabase Login\n'));
  console.log(chalk.dim(`  Get your Personal Access Token from: ${SB_TOKENS_URL}\n`));

  const openBrowser = await select({
    message: 'Open Supabase token page?',
    choices: [
      { name: 'Yes, open browser', value: true },
      { name: 'No, I have a token', value: false },
    ],
  });

  if (openBrowser) {
    await open(SB_TOKENS_URL);
    console.log(chalk.dim('\n  Create a token (any name), copy it, then paste it here.\n'));
  }

  const token = await password({
    message: 'Paste your Supabase Personal Access Token:',
    validate: (v) => (v.trim().length > 10 ? true : 'Token seems too short'),
  });

  await saveSbToken(token.trim());
}

async function saveSbToken(token: string): Promise<void> {
  const spinner = ora('Verifying token...').start();
  try {
    const user = await getSbUser(token);
    spinner.succeed('Token verified');

    setSupabaseAuth({ token, email: user.email });

    console.log(chalk.bold.green(`\n  ✓ Logged in to Supabase as ${chalk.white(user.email)}`));
    console.log(chalk.dim(`  Token stored locally at: ${getConfigPath()}\n`));
  } catch (err) {
    spinner.fail('Token verification failed');
    console.log(chalk.yellow('  Make sure you used a Personal Access Token from app.supabase.com/account/tokens'));
    throw err;
  }
}
