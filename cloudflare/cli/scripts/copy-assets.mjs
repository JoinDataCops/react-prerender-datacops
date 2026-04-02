/**
 * Prebuild script — copies SQL schemas and template source files
 * into assets/ so the npm package is fully self-contained.
 *
 * Run automatically via "prebuild" npm hook before tsc.
 */

import { copyFileSync, mkdirSync, readdirSync, statSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliDir = resolve(__dirname, '..');
const cloudflareDir = resolve(cliDir, '..');
const projectRoot = resolve(cloudflareDir, '..');

function mkdir(p) {
  mkdirSync(p, { recursive: true });
}

function cp(src, dest) {
  try {
    copyFileSync(src, dest);
    console.log(`  ✓ ${relative(cliDir, dest)}`);
  } catch (e) {
    console.warn(`  ⚠ Could not copy ${relative(projectRoot, src)}: ${e.message}`);
  }
}

/** Recursively copy a directory */
function cpDir(src, dest) {
  mkdir(dest);
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      cpDir(srcPath, destPath);
    } else {
      cp(srcPath, destPath);
    }
  }
}

console.log('\nCopying assets...');

// ── SQL Schemas ───────────────────────────────────────────────────────────────
mkdir(resolve(cliDir, 'assets/schemas'));

cp(
  resolve(cloudflareDir, 'd1-schema.sql'),
  resolve(cliDir, 'assets/schemas/d1-schema.sql'),
);

cp(
  resolve(projectRoot, 'database-schema.sql'),
  resolve(cliDir, 'assets/schemas/postgres-schema.sql'),
);

// ── Cloudflare Worker templates ───────────────────────────────────────────────
const workerSrc = resolve(cloudflareDir, 'workers/backend/src');
const workerDest = resolve(cliDir, 'assets/templates/cloudflare/worker/src');
mkdir(workerDest);

try {
  cpDir(workerSrc, workerDest);
} catch {
  console.warn('  ⚠ Worker src not found — skipping');
}

// wrangler.toml template
cp(
  resolve(cloudflareDir, 'workers/backend/wrangler.toml'),
  resolve(cliDir, 'assets/templates/cloudflare/worker/wrangler.toml'),
);

// package.json + tsconfig.json are maintained directly in
// assets/templates/cloudflare/worker/ (not copied from source,
// because the source has repo-specific paths like ../../d1-schema.sql)

// CF middleware
mkdir(resolve(cliDir, 'assets/templates/cloudflare'));
cp(
  resolve(cloudflareDir, 'functions/_middleware.ts'),
  resolve(cliDir, 'assets/templates/cloudflare/_middleware.ts'),
);

// ── Supabase Edge Function templates ─────────────────────────────────────────
const edgeSrc = resolve(projectRoot, 'edge-functions');
const edgeDest = resolve(cliDir, 'assets/templates/supabase/edge-functions');
mkdir(edgeDest);

try {
  cpDir(edgeSrc, edgeDest);
} catch {
  console.warn('  ⚠ edge-functions/ not found — skipping');
}

// Supabase middleware
mkdir(resolve(cliDir, 'assets/templates/supabase'));
cp(
  resolve(projectRoot, 'middleware.ts'),
  resolve(cliDir, 'assets/templates/supabase/_middleware.ts'),
);

console.log('\nAssets ready.\n');
