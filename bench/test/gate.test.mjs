import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  evaluateBudgets,
  evaluateProfile,
  listedScenarios,
  loadGate,
  ratioChecks,
  setScenarios,
} from '../lib/gate.mjs';
import { aggregate } from '../lib/stats.mjs';
import { result, runs } from './helpers.mjs';

const gate = loadGate();

function side(entries) {
  return Object.fromEntries(entries.map((list) => [list[0].name, aggregate(list)]));
}

function row(rows, name) {
  const r = rows.find((x) => x.name === name);
  assert.ok(r, `no row for ${name}`);
  return r;
}

describe('gate.json', () => {
  test('every set names known keys and a ratio', () => {
    for (const [name, set] of Object.entries(gate.sets)) {
      assert.ok(set.scenarios === '*' || Array.isArray(set.scenarios), name);
      assert.equal(typeof set.ratio, 'number', name);
    }
    assert.equal(gate.sets.M2.ratio, 1.2);
    assert.equal(gate.sets.M9a.ratio, 1.2);
    assert.equal(gate.sets.M9b.ratio, 1.2);
    assert.equal(gate.floorMs, 0.25);
    assert.equal(setScenarios(gate, 'M14'), null);
  });

  test('every budget scenario is in one of its sets', () => {
    for (const b of gate.budgets) {
      for (const s of b.sets.filter((x) => x !== 'M14')) {
        assert.ok(setScenarios(gate, s).includes(b.scenario), `${b.id} not in ${s}`);
      }
      assert.ok(b.max !== undefined || b.min !== undefined, b.id);
      assert.ok(b.kind === 'time' || b.kind === 'count', b.id);
    }
  });

  test('line-pan-200k is held to 1.2x everywhere, and M7 holds ingest to 0.5x', () => {
    assert.deepEqual(ratioChecks(gate, 'default', 'line-pan-200k', 'busy.median'), [
      { metric: 'busy.median', max: 1.2 },
    ]);
    assert.deepEqual(ratioChecks(gate, 'M7', 'ingest-cols-1m', 'sync.median'), [
      { metric: 'sync.median', max: 0.5 },
    ]);
    assert.deepEqual(ratioChecks(gate, 'M10', 'time-pan-200k', 'busy.median'), [
      { metric: 'busy.median', max: 1.2 },
      { metric: 'busy.p95', max: 1.5 },
    ]);
  });
});

describe('evaluateProfile', () => {
  test('passes within the ratio, fails beyond it on a required scenario', () => {
    const base = side([runs('line-pan-200k', [1, 1, 1]), runs('hover-sweep-50k', [1, 1, 1])]);
    const head = side([
      runs('line-pan-200k', [1.1, 1.1, 1.1]),
      runs('hover-sweep-50k', [1.6, 1.6, 1.6]),
    ]);
    const rows = evaluateProfile({ gate, setName: 'default', base, head });
    assert.equal(row(rows, 'line-pan-200k').verdict, 'ok');
    assert.equal(row(rows, 'hover-sweep-50k').verdict, 'slower');
    assert.equal(row(rows, 'hover-sweep-50k').blocking, true);
  });

  test('a regression outside the required set is reported but never blocks', () => {
    const base = side([runs('scatter-render-10k', [1, 1, 1])]);
    const head = side([runs('scatter-render-10k', [3, 3, 3])]);
    const r = row(evaluateProfile({ gate, setName: 'default', base, head }), 'scatter-render-10k');
    assert.equal(r.blocking, false);
    assert.match(r.verdict, /not required/);
  });

  test('[gap-perf-gate-08] a head-only scenario fails unless gate.json lists it or --allow-new', () => {
    const head = side([runs('brand-new-scenario', [1, 1, 1])]);
    const strict = row(
      evaluateProfile({ gate, setName: 'default', base: {}, head }),
      'brand-new-scenario',
    );
    assert.equal(strict.verdict, 'unlisted');
    assert.equal(strict.blocking, true);
    const allowed = evaluateProfile({ gate, setName: 'default', base: {}, head, allowNew: true });
    assert.equal(row(allowed, 'brand-new-scenario').blocking, false);
    const listed = side([runs('stream20hz-50k-plugin', [1, 1, 1])]);
    assert.equal(
      row(
        evaluateProfile({ gate, setName: 'default', base: {}, head: listed }),
        'stream20hz-50k-plugin',
      ).verdict,
      'new',
    );
    assert.ok(listedScenarios(gate).has('theme-churn-24'));
  });

  test('a base that cannot express the scenario is n/a, not a failure', () => {
    const base = side([
      [result('reingest-rows-200k-title', { unsupported: 'v0.12.0 takes columns' })],
    ]);
    const head = side([runs('reingest-rows-200k-title', [50, 50, 50], { primary: 'sync' })]);
    const r = row(
      evaluateProfile({ gate, setName: 'default', base, head }),
      'reingest-rows-200k-title',
    );
    assert.equal(r.verdict, 'n/a');
    assert.equal(r.blocking, false);
  });

  test('an invalid or erroring head run blocks a required scenario', () => {
    const base = side([runs('line-pan-200k', [1, 1, 1]), runs('hover-sweep-50k', [1, 1, 1])]);
    const head = side([
      [result('line-pan-200k', { valid: false })],
      [result('hover-sweep-50k', { error: 'boom' })],
    ]);
    const rows = evaluateProfile({ gate, setName: 'default', base, head });
    assert.equal(row(rows, 'line-pan-200k').verdict, 'invalid');
    assert.equal(row(rows, 'hover-sweep-50k').verdict, 'error');
    assert.ok(rows.every((r) => r.blocking));
  });

  test('the self-test fails a required ratio outside 1 ± 0.07', () => {
    const base = side([runs('line-pan-200k', [1, 1, 1]), runs('hover-sweep-50k', [1, 1, 1])]);
    const head = side([
      runs('line-pan-200k', [1.05, 1.05, 1.05]),
      runs('hover-sweep-50k', [0.9, 0.9, 0.9]),
    ]);
    const rows = evaluateProfile({ gate, setName: 'default', base, head, selfTest: true });
    assert.equal(row(rows, 'line-pan-200k').verdict, 'ok');
    assert.equal(row(rows, 'hover-sweep-50k').verdict, 'self-test');
  });

  test('sub-floor values compare as equal', () => {
    const base = side([runs('hover-sync-line-200k', [0.05, 0.05, 0.05], { primary: 'sync' })]);
    const head = side([runs('hover-sync-line-200k', [0.2, 0.2, 0.2], { primary: 'sync' })]);
    const r = row(
      evaluateProfile({ gate, setName: 'default', base, head }),
      'hover-sync-line-200k',
    );
    assert.equal(r.ratio, 1);
    assert.equal(r.verdict, 'ok');
  });

  test('heap per operation over 1.5x blocks, with a 16 KB floor', () => {
    const base = side([runs('stream20hz-50k-none', [1, 1, 1], { heapKB: 20 })]);
    const head = side([runs('stream20hz-50k-none', [1, 1, 1], { heapKB: 40 })]);
    const r = row(evaluateProfile({ gate, setName: 'default', base, head }), 'stream20hz-50k-none');
    assert.equal(r.verdict, 'heap');
    const tiny = side([runs('stream20hz-50k-none', [1, 1, 1], { heapKB: 12 })]);
    const small = side([runs('stream20hz-50k-none', [1, 1, 1], { heapKB: 3 })]);
    assert.equal(
      row(
        evaluateProfile({ gate, setName: 'default', base: small, head: tiny }),
        'stream20hz-50k-none',
      ).verdict,
      'ok',
    );
  });

  test('runs that disagree beyond noise.spread mark the row noisy; best compares the fastest runs', () => {
    const base = side([runs('line-pan-200k', [1, 1.05, 3])]);
    const head = side([runs('line-pan-200k', [1.02, 2.9, 3])]);
    const r = row(evaluateProfile({ gate, setName: 'default', base, head }), 'line-pan-200k');
    assert.equal(r.noisy, true);
    assert.match(r.noise, /spread 3×/);
    assert.equal(r.verdict, 'slower');
    assert.equal(r.bestRatio, 1.02);
    const steady = side([runs('line-pan-200k', [1, 1.1, 1.05])]);
    assert.equal(
      row(
        evaluateProfile({ gate, setName: 'default', base: steady, head: steady }),
        'line-pan-200k',
      ).noisy,
      false,
    );
  });

  test('marks noisy rows', () => {
    const base = side([runs('line-pan-200k', [1, 1, 1])]);
    const head = side([runs('line-pan-200k', [2, 2, 2])]);
    const r = row(
      evaluateProfile({ gate, setName: 'default', base, head, noisy: { 'line-pan-200k': true } }),
      'line-pan-200k',
    );
    assert.equal(r.noisy, true);
    assert.equal(r.blocking, true);
  });
});

describe('evaluateBudgets', () => {
  const heads = (scenario, values, overrides) => ({
    desktop: side([runs(scenario, values, overrides)]),
    mobile: side([runs(scenario, values, overrides)]),
  });

  test('time budgets are recorded, and block only in M14 (EXECUTION rule 3)', () => {
    const h = heads('ingest-cols-1m', [100, 100, 100], { primary: 'sync' });
    const inM7 = evaluateBudgets({ gate, setName: 'M7', heads: h, raster: 'gpu' });
    const desktop = inM7.find((b) => b.id === 'ingest-cols-1m-desktop');
    assert.equal(desktop.status, 'missed');
    assert.equal(desktop.blocking, false);
    const inM14 = evaluateBudgets({ gate, setName: 'M14', heads: h, raster: 'gpu' });
    assert.equal(inM14.find((b) => b.id === 'ingest-cols-1m-desktop').blocking, true);
    const strict = evaluateBudgets({ gate, setName: 'M7', heads: h, raster: 'gpu', strict: true });
    assert.equal(strict.find((b) => b.id === 'ingest-cols-1m-desktop').blocking, true);
  });

  test('count budgets (debug counters, bytes, fidelity) block in their own sets', () => {
    const h = heads('stream20hz-50k-plugin', [1, 1, 1], { heapKB: 900 });
    const inM8 = evaluateBudgets({ gate, setName: 'M8', heads: h, raster: 'gpu' });
    assert.ok(inM8.filter((b) => b.id === 'stream20hz-50k-plugin-heap').every((b) => b.blocking));
    const inDefault = evaluateBudgets({ gate, setName: 'default', heads: h, raster: 'gpu' });
    assert.ok(
      inDefault.filter((b) => b.id === 'stream20hz-50k-plugin-heap').every((b) => !b.blocking),
    );
    const fid = heads('scatter-pan-200k', [1, 1, 1], { fidelity: 0.2 });
    const inM11 = evaluateBudgets({ gate, setName: 'M11', heads: fid, raster: 'gpu' });
    assert.ok(
      inM11
        .filter((b) => b.id === 'scatter-pan-200k-fidelity')
        .every((b) => b.status === 'missed' && b.blocking),
    );
    // An unsorted scatter is strided over its whole source: M7's sampling change cut it to 0.58.
    const offaxis = heads('scatter-offaxis-pan-50k', [1, 1, 1], { fidelity: 0.58 });
    for (const set of ['M7', 'M11']) {
      const out = evaluateBudgets({ gate, setName: set, heads: offaxis, raster: 'gpu' });
      const rows = out.filter((b) => b.id === 'scatter-offaxis-pan-50k-fidelity');
      assert.ok(rows.length > 0, set);
      assert.ok(
        rows.every((b) => b.status === 'missed' && b.blocking),
        set,
      );
    }
  });

  test('a budget for another raster mode is not evaluated', () => {
    const h = heads('stream-50hz-idle', [1, 1, 1]);
    const out = evaluateBudgets({ gate, setName: 'M11', heads: h, raster: 'gpu' });
    const idle = out.find((b) => b.id === 'stream-50hz-idle-software');
    assert.match(idle.status, /needs --raster software/);
    assert.equal(idle.blocking, false);
  });

  test('only budgets on measured scenarios are listed', () => {
    const h = heads('line-pan-200k', [1, 1, 1]);
    assert.deepEqual(evaluateBudgets({ gate, setName: 'M14', heads: h, raster: 'gpu' }), []);
  });
});
