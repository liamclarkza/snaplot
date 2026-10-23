// What a visual run compares with, shared by playwright.config.ts (which applies it), run.mjs
// (which chooses it and records it in meta.json) and scripts/overhaul/check-visual-diffs.mjs
// (which judges it). Kept in .mjs so the config, the runner and the checker all load it in Node.
//
// Plan §11.3 G10 sets `maxDiffPixelRatio: 0.002`, with Playwright's per-pixel colour `threshold`
// left at 0.2. M3a review #2 measured what that hides: a theme-wide grid colour change gave
// 0 changed shots of 137, a default line width change 1, and a 72-pixel lineWidth edit to one
// fixture none. So this departs from the plan:
// - `--against <ref>` always compares exactly. Both sides render on the same machine in one
//   session, and the reference's second render must already reproduce exactly, so this adds no
//   flakiness.
// - Committed baselines (CI, other machines) keep the plan's ratio, but count every pixel whose
//   colour differs at all (`threshold: 0`).

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
