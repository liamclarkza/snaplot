// The two sides of an A/B. A ref side is extracted with `git archive <sha> | tar -x` into
// `<main>/.claude/ab-cache/<sha>` (cached by SHA; no worktree is registered), installed with
// `npm ci` and built with `npm run build -w packages/snaplot`. The working-tree side builds the
// checkout in place. Each side's bench page is then built from *this* checkout's bench sources
// against that side's `dist`, so both sides run the same harness.

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { benchViteConfig } from './vite-config.mjs';
import { abCacheDir, repoDir, resultsDir } from './paths.mjs';

function git(args, options = {}) {
  return execFileSync('git', args, { cwd: repoDir, encoding: 'utf8', ...options }).trim();
}

/** A filename-safe label for a ref. */
export function labelFor(ref) {
  return ref.replace(/[^A-Za-z0-9._-]+/g, '_');
}

export function resolveRef(ref) {
  let sha;
  try {
    sha = git(['rev-parse', '--verify', `${ref}^{commit}`], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    throw new Error(`cannot resolve git ref "${ref}"`);
  }
  return { kind: 'ref', ref, label: labelFor(ref), sha, short: sha.slice(0, 7) };
}

export function worktreeSide() {
  const sha = git(['rev-parse', 'HEAD']);
  const dirty = git(['status', '--porcelain', '--untracked-files=no']).length > 0;
  return {
    kind: 'worktree',
    ref: 'worktree',
    label: 'worktree',
    sha,
    short: `${sha.slice(0, 7)}${dirty ? '+dirty' : ''}`,
    dirty,
    root: repoDir,
  };
}

/** A clean environment for child npm runs: no npm_* variables leak in from `npm run`. */
function cleanEnv() {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!/^npm_/i.test(key)) env[key] = value;
  }
  env.LEFTHOOK = '0';
  return env;
}

function run(cmd, args, cwd, log) {
  return new Promise((resolve, reject) => {
    log?.(`  $ ${cmd} ${args.join(' ')}  (in ${cwd})`);
    const child = spawn(cmd, args, { cwd, env: cleanEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (d) => {
      output += d;
    });
    child.stderr.on('data', (d) => {
      output += d;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`${cmd} ${args.join(' ')} failed (${code}):\n${output.slice(-4000)}`));
    });
  });
}

function extract(sha, dir) {
  return new Promise((resolve, reject) => {
    mkdirSync(dir, { recursive: true });
    const archive = spawn('git', ['archive', '--format=tar', sha], { cwd: repoDir });
    const tar = spawn('tar', ['-x', '-C', dir]);
    archive.stdout.pipe(tar.stdin);
    let failed = false;
    archive.on('close', (code) => {
      if (code !== 0) {
        failed = true;
        reject(new Error(`git archive ${sha} failed (${code})`));
      }
    });
    tar.on('close', (code) => {
      if (failed) return;
      if (code === 0) resolve();
      else reject(new Error(`tar -x failed (${code})`));
    });
  });
}

export async function buildLibrary(root, log) {
  await run('npm', ['run', 'build', '-w', 'packages/snaplot'], root, log);
}

/**
 * Extracts, installs and builds a ref once per SHA. Work happens in a temporary sibling that is
 * renamed into place when complete, so an interrupted run never leaves a half-built cache entry;
 * a failed attempt is renamed to `<sha>.failed-<time>` (remove it by hand).
 */
export async function prepareRef(side, { log } = {}) {
  const cache = abCacheDir();
  const dir = join(cache, side.sha);
  const marker = join(dir, '.ab-ready.json');
  if (existsSync(marker)) {
    log?.(`${side.ref}: cached at ${dir}`);
    return { ...side, root: dir, cached: true };
  }
  if (existsSync(dir)) {
    throw new Error(`${dir} exists without .ab-ready.json; move it aside and re-run`);
  }
  const tmp = join(cache, `${side.sha}.tmp-${process.pid}`);
  log?.(`${side.ref}: extracting ${side.short} into the A/B cache`);
  const started = Date.now();
  try {
    await extract(side.sha, tmp);
    // Scripts stay off: an extraction inside the main checkout must not install git hooks.
    await run(
      'npm',
      [
        'ci',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--prefer-offline',
        '-w',
        'packages/snaplot',
      ],
      tmp,
      log,
    );
    await buildLibrary(tmp, log);
    if (!existsSync(join(tmp, 'packages', 'snaplot', 'dist', 'index.js'))) {
      throw new Error(`${side.ref}: the build produced no packages/snaplot/dist/index.js`);
    }
    writeFileSync(
      join(tmp, '.ab-ready.json'),
      `${JSON.stringify({ sha: side.sha, ref: side.ref, node: process.version, built: new Date().toISOString() }, null, 2)}\n`,
    );
    renameSync(tmp, dir);
  } catch (err) {
    // Kept for inspection, never deleted: rename it out of the way of the next attempt.
    const failed = join(cache, `${side.sha}.failed-${Date.now()}`);
    if (existsSync(tmp)) renameSync(tmp, failed);
    throw new Error(`${err.message}\n(partial extraction kept at ${failed})`);
  }
  log?.(`${side.ref}: ready in ${Math.round((Date.now() - started) / 1000)}s`);
  return { ...side, root: dir, cached: false };
}

/** Builds the working tree's library unless asked to reuse an existing dist. */
export async function prepareWorktree(side, { log, skipBuild = false } = {}) {
  const dist = join(side.root, 'packages', 'snaplot', 'dist', 'index.js');
  if (skipBuild && existsSync(dist)) {
    log?.('worktree: reusing packages/snaplot/dist (--skip-build)');
  } else {
    log?.('worktree: building packages/snaplot');
    await buildLibrary(side.root, log);
  }
  return side;
}

/** Builds this checkout's bench page against a side's dist into `bench/results/.pages/<id>`. */
export async function buildPage(side, id) {
  const { build } = await import('vite');
  const outDir = join(resultsDir, '.pages', id);
  const dist = join(side.root, 'packages', 'snaplot', 'dist');
  await build(benchViteConfig({ dist, outDir }));
  return outDir;
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
