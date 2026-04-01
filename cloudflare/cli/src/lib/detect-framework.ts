/**
 * Auto-detects the frontend framework from the project's package.json.
 *
 * Target: pure SPAs that render into a single root <div> with no SSR/SSG.
 * Next.js, Nuxt, Remix, SvelteKit etc. already have built-in SSR —
 * prerender-edge is not designed for them.
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

export interface FrameworkInfo {
  name: string;
  label: string;
  buildCommand: string;
  outputDir: string;
  /** If true, this framework has built-in SSR and doesn't need prerender-edge */
  hasBuiltInSsr?: boolean;
  ssrNote?: string;
}

// ── Supported SPA frameworks ──────────────────────────────────────────────────

export const SPA_FRAMEWORKS: FrameworkInfo[] = [
  {
    name: 'vite-react',
    label: 'React + Vite',
    buildCommand: 'npm run build',
    outputDir: 'dist',
  },
  {
    name: 'vite-vue',
    label: 'Vue + Vite',
    buildCommand: 'npm run build',
    outputDir: 'dist',
  },
  {
    name: 'vite-svelte',
    label: 'Svelte + Vite  (SPA mode)',
    buildCommand: 'npm run build',
    outputDir: 'dist',
  },
  {
    name: 'vite',
    label: 'Vite (other)',
    buildCommand: 'npm run build',
    outputDir: 'dist',
  },
  {
    name: 'cra',
    label: 'Create React App',
    buildCommand: 'npm run build',
    outputDir: 'build',
  },
  {
    name: 'angular',
    label: 'Angular',
    buildCommand: 'npm run build -- --configuration production',
    outputDir: 'dist/browser',
  },
  {
    name: 'solid',
    label: 'Solid.js',
    buildCommand: 'npm run build',
    outputDir: 'dist',
  },
  {
    name: 'qwik',
    label: 'Qwik (SPA mode)',
    buildCommand: 'npm run build',
    outputDir: 'dist',
  },
];

// ── SSR frameworks — warn user, don't fully block ────────────────────────────

export const SSR_FRAMEWORKS: FrameworkInfo[] = [
  {
    name: 'nextjs',
    label: 'Next.js',
    buildCommand: 'npm run build',
    outputDir: 'out',
    hasBuiltInSsr: true,
    ssrNote:
      'Next.js has built-in SSR/SSG — you likely don\'t need prerender-edge.\n' +
      '  If you\'re using it as a pure SPA with `output: "export"`, that works,\n' +
      '  but consider using Next.js static generation directly instead.',
  },
  {
    name: 'nuxt',
    label: 'Nuxt',
    buildCommand: 'npx nuxt generate',
    outputDir: 'dist',
    hasBuiltInSsr: true,
    ssrNote:
      'Nuxt has built-in SSR/SSG — you likely don\'t need prerender-edge.\n' +
      '  Use `nuxt generate` for static sites or `nuxt build` for SSR.',
  },
  {
    name: 'sveltekit',
    label: 'SvelteKit',
    buildCommand: 'npm run build',
    outputDir: '.svelte-kit/cloudflare',
    hasBuiltInSsr: true,
    ssrNote:
      'SvelteKit has built-in SSR — you likely don\'t need prerender-edge.\n' +
      '  For true SPA mode, use @sveltejs/adapter-static with `fallback: "index.html"`.',
  },
  {
    name: 'remix',
    label: 'Remix',
    buildCommand: 'npm run build',
    outputDir: 'public',
    hasBuiltInSsr: true,
    ssrNote: 'Remix is an SSR framework — prerender-edge is not needed.',
  },
  {
    name: 'gatsby',
    label: 'Gatsby',
    buildCommand: 'npm run build',
    outputDir: 'public',
    hasBuiltInSsr: true,
    ssrNote:
      'Gatsby generates static HTML at build time — prerender-edge is not needed.\n' +
      '  Just deploy your Gatsby build output directly to Cloudflare Pages.',
  },
  {
    name: 'astro',
    label: 'Astro',
    buildCommand: 'npm run build',
    outputDir: 'dist',
    hasBuiltInSsr: true,
    ssrNote:
      'Astro generates static HTML — prerender-edge is not needed for most cases.\n' +
      '  Use prerender-edge only if you have an Astro island SPA with client-only routes.',
  },
];

const ALL_FRAMEWORKS = [...SPA_FRAMEWORKS, ...SSR_FRAMEWORKS];

// ── Dep → framework key map ───────────────────────────────────────────────────

const DEP_MAP: Record<string, string> = {
  // SPA
  '@vitejs/plugin-react': 'vite-react',
  '@vitejs/plugin-react-swc': 'vite-react',
  '@vitejs/plugin-vue': 'vite-vue',
  '@vitejs/plugin-svelte': 'vite-svelte',
  'react-scripts': 'cra',
  '@angular/core': 'angular',
  'solid-js': 'solid',
  '@builder.io/qwik': 'qwik',
  vite: 'vite',
  // SSR (detected to warn user)
  next: 'nextjs',
  nuxt: 'nuxt',
  '@nuxt/core': 'nuxt',
  '@sveltejs/kit': 'sveltekit',
  '@remix-run/react': 'remix',
  '@remix-run/node': 'remix',
  gatsby: 'gatsby',
  astro: 'astro',
};

// Priority: more-specific deps first
const PRIORITY = [
  '@vitejs/plugin-react', '@vitejs/plugin-react-swc',
  '@vitejs/plugin-vue', '@vitejs/plugin-svelte',
  '@sveltejs/kit', 'next', 'nuxt', '@nuxt/core',
  'gatsby', 'astro', '@remix-run/react', '@remix-run/node',
  'react-scripts', '@angular/core', 'solid-js', '@builder.io/qwik',
  'vite',
];

export function detectFramework(projectDir = process.cwd()): FrameworkInfo | null {
  const pkgPath = resolve(projectDir, 'package.json');
  if (!existsSync(pkgPath)) return null;

  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  } catch {
    return null;
  }

  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

  for (const dep of PRIORITY) {
    if (dep in allDeps) {
      const key = DEP_MAP[dep];
      const profile = ALL_FRAMEWORKS.find((f) => f.name === key);
      if (profile) return profile;
    }
  }

  return null;
}

export function getUnknownFramework(): FrameworkInfo {
  return {
    name: 'unknown',
    label: 'Other SPA / Custom',
    buildCommand: 'npm run build',
    outputDir: 'dist',
  };
}
