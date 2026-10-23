// What a visual run compares with and what it rendered, shared by playwright.config.ts (which
// applies the comparison), run.mjs (which records both in meta.json) and
// scripts/overhaul/check-visual-diffs.mjs (which judges them). Kept in .mjs so the config, the
// runner and the checker all load it in Node. It also hashes the reference images, so the runner
// and the checker can tell that nothing wrote into a reference after its capture (review #3).
//
// Plan §11.3 G10 sets `maxDiffPixelRatio: 0.002`, with Playwright's per-pixel colour `threshold`
// left at 0.2. M3a review #2 measured what that hides: a theme-wide grid colour change gave
// 0 changed shots of 137, a default line width change 1, and a lineWidth edit to one fixture
// (246 and 72 pixels) none. So this departs from the plan:
// - `--against <ref>` always compares exactly. Both sides render on the same machine in one
//   session, and the reference's second render must already reproduce exactly, so this adds no
//   flakiness.
// - Committed baselines (CI, other machines) keep the plan's ratio, but count every pixel whose
//   colour differs at all (`threshold: 0`).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/** The environment variable that selects EXACT. Every ref from M3a on honours it. */
export const STRICT_ENV = 'SNAPLOT_VISUAL_STRICT';

/** No per-pixel colour tolerance and no differing pixel. */
export const EXACT = Object.freeze({ threshold: 0, maxDiffPixels: 0 });

/** The plan's ratio of differing pixels, counting every pixel whose colour differs at all. */
export const TOLERANCE = Object.freeze({ threshold: 0, maxDiffPixelRatio: 0.002 });

/** playwright.config.ts: the `toHaveScreenshot` settings the environment selects. */
export function screenshotSettings(env) {
  return env[STRICT_ENV] === '1' ? EXACT : TOLERANCE;
}

/**
 * run.mjs: the comparison of a run, recorded in meta.json as `comparison`. A run against a ref is
 * always exact; committed baselines use the tolerance unless `--strict`.
 */
export function comparisonFor({ against, strict }) {
  const exact = Boolean(against || strict);
  return { exact, ...(exact ? EXACT : TOLERANCE) };
}

/** `exact (threshold 0, maxDiffPixels 0)` or `tolerance (threshold 0, maxDiffPixelRatio 0.002)`. */
export function describeComparison(comparison) {
  const settings = Object.entries(comparison)
    .filter(([key]) => key !== 'exact')
    .map(([key, value]) => `${key} ${value}`)
    .join(', ');
  return `${comparison.exact ? 'exact' : 'tolerance'} (${settings})`;
}

/** What the head run renders from: the library package and the dependency pins. */
export const INPUT_PATHS = Object.freeze(['packages/snaplot', 'package.json', 'package-lock.json']);

/**
 * A fingerprint of the render inputs in the working tree at <repoRoot>: the content of every file
 * under INPUT_PATHS that git tracks or would track (ignored files such as test-results and dist
 * are left out). Content, not commits: an edit after the run changes it, a row file or a handoff
 * does not, and the copy that scripts/visual-docker.sh commits afresh gives the same value.
 */
export function headInputs(repoRoot, env = process.env) {
  const options = { cwd: repoRoot, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 };
  const listed = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...INPUT_PATHS],
    options,
  );
  // A tracked file deleted from the working tree is simply absent from the fingerprint.
  const files = [...new Set(listed.split('\0').filter(Boolean))]
    .filter((file) => !file.endsWith('/') && existsSync(join(repoRoot, file)))
    .sort();
  const blobs = files.length
    ? execFileSync('git', ['hash-object', '--stdin-paths'], { ...options, input: files.join('\n') })
        .trim()
        .split('\n')
    : [];
  const hash = createHash('sha256');
  for (const [i, file] of files.entries()) hash.update(`${blobs[i]} ${file}\n`);
  return hash.digest('hex');
}

/** The `.png` files under <dir>, as `/`-separated paths relative to it, sorted. */
export function listPngs(dir, base = dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listPngs(path, base));
    else if (entry.name.endsWith('.png')) out.push(relative(base, path).split('\\').join('/'));
  }
  return out.sort();
}

/** The SHA-256 of some bytes, in hex. */
export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * The SHA-256 of each shot's image `<dir>/<shot><suffix>.png`, by shot name. A shot without an
 * image is left out.
 */
export function shotHashes(dir, shots, suffix = '') {
  const hashes = {};
  for (const shot of shots) {
    const file = join(dir, `${shot}${suffix}.png`);
    if (existsSync(file)) hashes[shot] = sha256(readFileSync(file));
  }
  return hashes;
}

/**
 * How the images in <dir> differ from what the capture recorded (`shots` and their `hashes`):
 * `changed` (another hash, or none recorded), `missing` (a recorded shot's image is gone) and
 * `extra` (an image the capture did not record). Each list is sorted.
 */
export function compareShots(dir, shots, hashes, suffix = '') {
  const listed = new Set(shots);
  const changed = [];
  const missing = [];
  for (const shot of [...listed].sort()) {
    const file = join(dir, `${shot}${suffix}.png`);
    if (!existsSync(file)) missing.push(shot);
    else if (hashes?.[shot] !== sha256(readFileSync(file))) changed.push(shot);
  }
  const ending = `${suffix}.png`;
  const extra = listPngs(dir)
    .filter((f) => f.endsWith(ending))
    .map((f) => f.slice(0, -ending.length))
    .filter((shot) => !listed.has(shot));
  return { changed, missing, extra };
}
