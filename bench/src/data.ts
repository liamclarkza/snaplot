import type { ColumnarData } from 'snaplot/core';

/** Deterministic PRNG so every bench run sees identical data. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Time-series-shaped scatter/line data: sorted X (cumulative timestamps),
 * Y is a noisy random walk with occasional level shifts so the cloud has
 * visible structure at every zoom level.
 */
export function genTimeSeries(n: number, seed = 1): ColumnarData {
  const rand = mulberry32(seed);
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  let t = 1_700_000_000_000;
  let level = 50;
  let v = 0;
  for (let i = 0; i < n; i++) {
    t += 40 + rand() * 120;
    x[i] = t;
    if (rand() < 0.0008) level += (rand() - 0.5) * 40;
    v = v * 0.98 + (rand() - 0.5) * 3;
    y[i] = level + v + Math.sin(i / 500) * 8;
  }
  return [x, y];
}

/**
 * Tabular scatter data: column 0 is a sorted row index (the default X),
 * columns 1-2 are two correlated metrics (unsorted in value space),
 * column 3 a small-integer category, column 4 a positive continuous size.
 * Used for xDataIndex/yDataIndex, colorBy, and sizeBy scenarios.
 */
export function genTabular(n: number, seed = 7): ColumnarData {
  const rand = mulberry32(seed);
  const row = new Float64Array(n);
  const metricA = new Float64Array(n);
  const metricB = new Float64Array(n);
  const category = new Float64Array(n);
  const size = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    row[i] = i;
    const cat = Math.floor(rand() * 6);
    category[i] = cat;
    // Cluster per category so color/size encodings map to visible groups.
    const cx = (cat - 2.5) * 12;
    const cy = ((cat * 7) % 5) * 9;
    const a = cx + gauss(rand) * 6;
    metricA[i] = a;
    metricB[i] = cy + a * 0.35 + gauss(rand) * 5;
    size[i] = 1 + Math.abs(gauss(rand)) * 40;
  }
  return [row, metricA, metricB, category, size];
}

/** Box-Muller-ish gaussian from a uniform PRNG. */
function gauss(rand: () => number): number {
  let s = 0;
  for (let i = 0; i < 6; i++) s += rand();
  return (s - 3) / 1.5;
}

/** Fresh columns extending an existing time series, for appendData ticks. */
export function genAppendChunk(lastX: number, n: number, seed: number): ColumnarData {
  const rand = mulberry32(seed);
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  let t = lastX;
  for (let i = 0; i < n; i++) {
    t += 40 + rand() * 120;
    x[i] = t;
    y[i] = 50 + Math.sin(t / 60_000) * 20 + (rand() - 0.5) * 6;
  }
  return [x, y];
}
