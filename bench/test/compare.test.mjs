import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const compare = join(dirname(fileURLToPath(import.meta.url)), '..', 'compare.mjs');
const scratch = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'bench-compare-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

/** A saved one-sided run (run.mjs output) with one median per scenario. */
function saved(file, scenarios) {
  const aggregates = { desktop: {} };
  for (const [name, { value, primary = 'busy' }] of Object.entries(scenarios)) {
    aggregates.desktop[name] = {
      name,
      area: 'legacy',
      primary,
      primaryPath: `${primary}.median`,
      runs: 3,
      measured: 3,
      valid: true,
      unsupported: null,
      errors: [],
      primaryRuns: [value, value, value],
      values: { [`${primary}.median`]: value },
    };
  }
  const path = join(scratch, file);
  writeFileSync(path, JSON.stringify({ kind: 'run', meta: {}, aggregates }));
  return path;
}

function run(...args) {
  const r = spawnSync(process.execPath, [compare, ...args], { encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

// The pre-M4 compare.mjs gates against the stale tracked baseline (backlog-23), ignores scenarios
// that only the current run has and floors medians at 2 ms (gap-perf-gate-02, -08). These tests
// record the intended behaviour as expected failures until the rewrite flips them.
describe('compare.mjs', () => {
  test('[gap-perf-gate-08] a scenario only in the current run fails unless --allow-new', {
    todo: 'expected failure: flipped by perf(bench): measure main-thread busy time on GPU raster',
  }, () => {
    const base = saved('new-base.json', { 'line-pan-200k': { value: 1 } });
    const current = saved('new-current.json', {
      'line-pan-200k': { value: 1 },
      'not-in-gate-json': { value: 1 },
    });
    const strict = run('--base', base, '--current', current);
    assert.equal(strict.code, 1, strict.out);
    assert.match(strict.out, /unlisted/);
    assert.equal(run('--base', base, '--current', current, '--allow-new').code, 0);
  });

  test('[gap-perf-gate-02] a sub-frame busy regression (0.6 → 1.8 ms) fails', {
    todo: 'expected failure: flipped by perf(bench): measure main-thread busy time on GPU raster',
  }, () => {
    const base = saved('sub-base.json', { 'hover-sweep-50k': { value: 0.6 } });
    const current = saved('sub-current.json', { 'hover-sweep-50k': { value: 1.8 } });
    const r = run('--base', base, '--current', current);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /slower/);
  });

  test('[backlog-23] the tracked baseline is history only: compare needs an explicit base', {
    todo: 'expected failure: flipped by perf(bench): measure main-thread busy time on GPU raster',
  }, () => {
    const current = saved('hist-current.json', { 'line-pan-200k': { value: 1 } });
    const r = run('--current', current);
    assert.equal(r.code, 2);
    assert.match(r.out, /history only/);
  });
});
