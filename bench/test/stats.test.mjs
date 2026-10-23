import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { aggregate, flooredRatio, get, median } from '../lib/stats.mjs';
import { result, runs } from './helpers.mjs';

describe('stats', () => {
  test('median ignores non-finite values and averages the middle pair', () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 3, 2]), 2.5);
    assert.equal(median([1, Number.NaN, null, undefined, 5]), 3);
    assert.equal(median([]), null);
  });

  test('[gap-perf-gate-02] the 0.25 ms floor keeps sub-floor noise at 1.0 but sees a 3x sync regression', () => {
    assert.equal(flooredRatio(0.1, 0.05, 0.25), 1);
    assert.ok(Math.abs(flooredRatio(1.8, 0.6, 0.25) - 3) < 1e-9);
    // The old compare.mjs floor (2 ms) made the same regression invisible.
    assert.equal(flooredRatio(1.8, 0.6, 2), 1);
  });

  test('flooredRatio handles missing and zero values', () => {
    assert.equal(flooredRatio(undefined, 1, 0.25), null);
    assert.equal(flooredRatio(0, 0, 0), 1);
    assert.equal(flooredRatio(1, 0, 0), null);
  });

  test('get reads dotted paths', () => {
    assert.equal(get({ a: { b: 2 } }, 'a.b'), 2);
    assert.equal(get({ a: null }, 'a.b'), undefined);
  });

  test('aggregate takes the median of the per-run medians', () => {
    const a = aggregate(runs('line-pan-200k', [1.0, 3.0, 1.2]));
    assert.equal(a.values['busy.median'], 1.2);
    assert.deepEqual(a.primaryRuns, [1, 3, 1.2]);
    assert.equal(a.primaryPath, 'busy.median');
    assert.equal(a.valid, true);
  });

  test('aggregate reports an unsupported scenario and keeps numeric meta', () => {
    const unsupported = aggregate([result('x', { unsupported: 'no rows' })]);
    assert.equal(unsupported.unsupported, 'no rows');
    assert.equal(unsupported.measured, 0);
    const withMeta = aggregate(runs('y', [1, 2, 3], { meta: { share: 0.1, note: 'text' } }));
    assert.equal(withMeta.values['meta.share'], 0.1);
    assert.equal(withMeta.values['meta.note'], undefined);
  });

  test('aggregate marks a scenario invalid when any measured run is', () => {
    const a = aggregate([result('z'), result('z', { valid: false })]);
    assert.equal(a.valid, false);
  });
});
