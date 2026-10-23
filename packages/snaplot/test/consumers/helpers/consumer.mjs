// Shared helpers for the consumer scenarios (run inside the consumer project that
// scripts/check-consumers.mjs creates; never imported by the library's own tests).
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const consumerDir = process.env.SNAPLOT_CONSUMER_DIR ?? process.cwd();
/** The installed package: the extracted `npm pack` tarball. */
export const packageDir = join(consumerDir, 'node_modules/snaplot');
export const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
/** What `npm pack --json` reported for the tarball (files, sizes). */
export const packed = JSON.parse(readFileSync(join(consumerDir, 'pack.json'), 'utf8'));

/** Every JavaScript subpath of the exports map, e.g. `snaplot`, `snaplot/react`. */
export const jsEntries = Object.keys(manifest.exports)
  .filter((key) => key !== './package.json' && !key.endsWith('.css'))
  .map((key) => (key === '.' ? 'snaplot' : `snaplot/${key.slice(2)}`));

/** Runs a command in the consumer project and returns its exit status and output. */
export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: consumerDir,
    encoding: 'utf8',
    env: { ...process.env, NODE_OPTIONS: '' },
    ...options,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
}

/** Runs a Node script (a file in the consumer project, or `-e`/`--input-type` code). */
export function node(args, options) {
  return run(process.execPath, args, options);
}

export function write(relativePath, contents) {
  writeFileSync(join(consumerDir, relativePath), contents);
}

/** Reads a file of the installed package. */
export function packageFile(relativePath) {
  return readFileSync(join(packageDir, relativePath), 'utf8');
}
