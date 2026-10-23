// Paths shared by the bench drivers.
//
// The bench lock and the A/B extraction cache live in the *main* checkout's `.claude/` directory
// (plan §11.1), so every worktree shares them. A worktree finds the main checkout through git's
// common directory.

import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const benchDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const repoDir = resolve(benchDir, '..');
export const resultsDir = join(benchDir, 'results');
export const gatePath = join(benchDir, 'gate.json');

let main = null;

/** The main checkout (the parent of git's common directory), or this checkout outside git. */
export function mainCheckout() {
  if (main) return main;
  try {
    const common = execFileSync(
      'git',
      ['rev-parse', '--path-format=absolute', '--git-common-dir'],
      { cwd: repoDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    main = dirname(common);
  } catch {
    main = repoDir;
  }
  return main;
}

export function claudeDir() {
  return process.env.SNAPLOT_CLAUDE_DIR ?? join(mainCheckout(), '.claude');
}

/** `mkdir` lock shared by every session that runs Playwright, Docker, `npm ci` or the bench. */
export function lockPath() {
  return process.env.SNAPLOT_BENCH_LOCK ?? join(claudeDir(), 'bench.lock');
}

/** `git archive` extractions, one directory per commit SHA. */
export function abCacheDir() {
  return process.env.SNAPLOT_AB_CACHE ?? join(claudeDir(), 'ab-cache');
}

/**
 * Resolves a path the user typed. `npm run` starts scripts in the bench workspace, so relative
 * paths are taken from where npm was invoked (INIT_CWD), not from bench/.
 */
export function fromInvocation(path) {
  return resolve(process.env.INIT_CWD ?? process.cwd(), path);
}
