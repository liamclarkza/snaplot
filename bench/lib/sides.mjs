// The checkout under test and its bench page build.

import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { repoDir, resultsDir } from './paths.mjs';
import { benchViteConfig } from './vite-config.mjs';

function git(args) {
  return execFileSync('git', args, { cwd: repoDir, encoding: 'utf8' }).trim();
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

/** Builds the bench page into `bench/results/.pages/<id>`. */
export async function buildPage(_side, id) {
  const { build } = await import('vite');
  const outDir = join(resultsDir, '.pages', id);
  await build(benchViteConfig({ outDir }));
  return outDir;
}
