import { describe, expect, it } from 'vitest';
import { bucketed, DIVERGED_AT, fmt, learningRate, RUNS, STEPS, simulate } from './runs';

const hot = RUNS.findIndex((run) => run.id === 'lr-6e-4');

describe('[experiment-tracker] the simulated runs', () => {
  it('are the same on every load', () => {
    expect(simulate(RUNS[0], 0)['train/loss']).toEqual(simulate(RUNS[0], 0)['train/loss']);
  });

  it('warm the learning rate up for 200 steps, then decay it on a cosine to a tenth', () => {
    const run = RUNS[0];
    expect(learningRate(run, 0)).toBeCloseTo(run.params.lr / 200, 12);
    expect(learningRate(run, 199)).toBeCloseTo(run.params.lr, 12);
    expect(learningRate(run, 200)).toBeCloseTo(run.params.lr, 12);
    expect(learningRate(run, STEPS)).toBeCloseTo(run.params.lr / 10, 12);
  });

  it('fall in loss, and the hot run is NaN from its divergence on', () => {
    const values = RUNS.map((run, i) => simulate(run, i));
    for (const [i, v] of values.entries()) {
      if (i === hot) continue;
      expect(v['train/loss'][0]).toBeGreaterThan(3);
      expect(v['train/loss'][STEPS - 1]).toBeLessThan(1.6);
      expect(v['train/loss'].every(Number.isFinite)).toBe(true);
    }
    const loss = values[hot]['train/loss'];
    expect(Number.isFinite(loss[DIVERGED_AT - 1])).toBe(true);
    expect(loss.slice(DIVERGED_AT).every(Number.isNaN)).toBe(true);
    expect(values[hot]['eval/loss'].filter(Number.isNaN).length).toBe(4);
  });
});

describe('[experiment-tracker] bucketed rows', () => {
  it('give each bucket its mean, min and max, and the first non-finite step of a run', () => {
    const values = new Map([
      ['a', Float64Array.from({ length: STEPS }, (_, i) => i)],
      ['b', Float64Array.from({ length: STEPS }, (_, i) => (i >= 2995 ? Number.NaN : 1))],
    ]);
    const { rows, nonFinite } = bucketed(values, 'train/loss', 300);
    expect(rows.length).toBe(300);
    expect(rows[0]).toMatchObject({ x: 5, a: 4.5, a·min: 0, a·max: 9, b: 1 });
    // The last bucket holds steps 2,990 to 2,999: b's last five are NaN, so they are left out.
    expect(rows[299]).toMatchObject({ a: 2994.5, b: 1, b·max: 1 });
    expect(nonFinite.get('b')).toBe(2995);
    expect(nonFinite.has('a')).toBe(false);
  });

  it('place an evaluation at the step it ran', () => {
    const values = new Map([['a', Float64Array.from({ length: STEPS / 100 }, (_, i) => i)]]);
    const { rows } = bucketed(values, 'eval/loss', STEPS / 100);
    expect(rows.map((row) => row.x).slice(0, 3)).toEqual([100, 200, 300]);
    expect(rows[2]).toMatchObject({ a: 2, a·min: 2, a·max: 2 });
  });
});

describe('[experiment-tracker] fmt', () => {
  it('writes four significant figures, exponents when tiny, NaN and a dash for none', () => {
    expect(fmt(1.23456)).toBe('1.235');
    expect(fmt(0.00012)).toBe('1.2e-4');
    expect(fmt(512)).toBe('512');
    expect(fmt(Number.NaN)).toBe('NaN');
    expect(fmt(null)).toBe('–');
  });
});
