import { describe, expect, it } from 'vitest';
import { ColumnRangeIndex, ScatterColumnRangeIndex } from './columnRangeIndex';

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeColumn(n: number, seed: number): Float64Array {
  const rand = lcg(seed);
  const col = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const r = rand();
    if (r < 0.05) col[i] = Number.NaN;
    else if (r < 0.07) col[i] = Number.POSITIVE_INFINITY;
    else col[i] = (rand() - 0.4) * 200;
  }
  return col;
}

function naiveRange(
  col: Float64Array,
  start: number,
  end: number,
  positiveOnly: boolean,
): [number, number] | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = Math.max(0, start); i <= Math.min(col.length - 1, end); i++) {
    const v = col[i];
    if (!Number.isFinite(v) || (positiveOnly && v <= 0)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return min === Number.POSITIVE_INFINITY ? null : [min, max];
}

describe('ColumnRangeIndex', () => {
  it('matches a naive scan across many random ranges', () => {
    const col = makeColumn(10_000, 42);
    const index = new ColumnRangeIndex(col);
    const rand = lcg(7);
    for (let trial = 0; trial < 500; trial++) {
      const a = Math.floor(rand() * col.length);
      const b = Math.floor(rand() * col.length);
      const start = Math.min(a, b);
      const end = Math.max(a, b);
      const positiveOnly = rand() < 0.5;
      expect(index.query(start, end, positiveOnly)).toEqual(
        naiveRange(col, start, end, positiveOnly),
      );
    }
  });

  it('handles ranges that align exactly with block boundaries', () => {
    const col = makeColumn(1024, 3);
    const index = new ColumnRangeIndex(col);
    for (const [start, end] of [
      [0, 255],
      [0, 256],
      [256, 511],
      [255, 256],
      [256, 256],
      [0, 1023],
      [512, 767],
    ] as const) {
      expect(index.query(start, end, false)).toEqual(naiveRange(col, start, end, false));
      expect(index.query(start, end, true)).toEqual(naiveRange(col, start, end, true));
    }
  });

  it('returns null for empty, reversed, and all-NaN ranges', () => {
    const col = Float64Array.from([Number.NaN, Number.NaN, 1, 2, Number.NaN]);
    const index = new ColumnRangeIndex(col);
    expect(index.query(0, 1, false)).toBeNull();
    expect(index.query(3, 2, false)).toBeNull();
    expect(index.query(-5, -1, false)).toBeNull();
    expect(index.query(2, 3, false)).toEqual([1, 2]);
  });

  it('excludes non-positive values from both bounds in positiveOnly mode', () => {
    const col = Float64Array.from([-10, -5, 0, 3, 8]);
    const index = new ColumnRangeIndex(col);
    expect(index.query(0, 4, true)).toEqual([3, 8]);
    expect(index.query(0, 2, true)).toBeNull();
  });

  it('clamps out-of-bounds query indices', () => {
    const col = Float64Array.from([5, 1, 9]);
    const index = new ColumnRangeIndex(col);
    expect(index.query(-100, 100, false)).toEqual([1, 9]);
  });

  it('does not mutate the input column', () => {
    const col = makeColumn(1000, 11);
    const copy = Float64Array.from(col);
    const index = new ColumnRangeIndex(col);
    index.query(0, 999, false);
    index.query(100, 200, true);
    expect(col).toEqual(copy);
  });
});

describe('ScatterColumnRangeIndex', () => {
  function naiveScatterRange(
    x: Float64Array,
    y: Float64Array,
    xMin: number,
    xMax: number,
    positiveOnly: boolean,
  ): [number, number] | null {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < x.length; i++) {
      if (!Number.isFinite(x[i]) || x[i] < xMin || x[i] > xMax) continue;
      const v = y[i];
      if (!Number.isFinite(v) || (positiveOnly && v <= 0)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    return min === Number.POSITIVE_INFINITY ? null : [min, max];
  }

  it('matches a naive filter scan across random windows', () => {
    const x = makeColumn(5000, 13);
    const y = makeColumn(5000, 17);
    const index = new ScatterColumnRangeIndex(x, y);
    const rand = lcg(23);
    for (let trial = 0; trial < 300; trial++) {
      const a = (rand() - 0.4) * 200;
      const b = (rand() - 0.4) * 200;
      const xMin = Math.min(a, b);
      const xMax = Math.max(a, b);
      const positiveOnly = rand() < 0.5;
      expect(index.query(xMin, xMax, positiveOnly)).toEqual(
        naiveScatterRange(x, y, xMin, xMax, positiveOnly),
      );
    }
  });

  it('includes the rightmost in-window point (inclusive upper bound)', () => {
    // Regression: an off-by-one upper bound dropped the largest-X point in
    // the window, so a Y extremum sitting on that point was clipped during
    // viewport auto-range. The rightmost point here carries the Y max.
    const x = Float64Array.from([1, 2, 3, 4, 5]);
    const y = Float64Array.from([10, 20, 30, 40, 50]);
    const index = new ScatterColumnRangeIndex(x, y);
    expect(index.query(2, 3, false)).toEqual([20, 30]);
    expect(index.query(1, 5, false)).toEqual([10, 50]);
    expect(index.query(3, 3, false)).toEqual([30, 30]);
    expect(index.query(2.5, 4.5, false)).toEqual([30, 40]);
  });

  it('returns null when no X falls inside the window', () => {
    const x = Float64Array.from([1, 2, 3]);
    const y = Float64Array.from([10, 20, 30]);
    const index = new ScatterColumnRangeIndex(x, y);
    expect(index.query(4, 9, false)).toBeNull();
    expect(index.query(-5, 0, false)).toBeNull();
  });

  it('handles all-NaN X columns', () => {
    const x = Float64Array.from([Number.NaN, Number.NaN]);
    const y = Float64Array.from([1, 2]);
    const index = new ScatterColumnRangeIndex(x, y);
    expect(index.query(-Infinity, Infinity, false)).toBeNull();
  });

  it('does not mutate the input columns', () => {
    const x = makeColumn(500, 29);
    const y = makeColumn(500, 31);
    const xCopy = Float64Array.from(x);
    const yCopy = Float64Array.from(y);
    const index = new ScatterColumnRangeIndex(x, y);
    index.query(-50, 50, false);
    expect(x).toEqual(xCopy);
    expect(y).toEqual(yCopy);
  });
});
