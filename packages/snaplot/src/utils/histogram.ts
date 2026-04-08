/**
 * Histogram utility — compute bins from raw data.
 *
 * This is a USER-FACING utility, not called internally by the chart.
 * The chart only renders pre-computed bins. The user controls
 * when and how to bin their data (P3: library never touches your data).
 *
 * Bin methods:
 * - Freedman-Diaconis (default): 2 * IQR * n^(-1/3) — robust to outliers
 * - Sturges: ceil(log2(n) + 1) — simple, good for normal distributions
 * - Scott: 3.5 * sigma / n^(1/3) — optimized for Gaussian data
 *
 * Returns ColumnarData-compatible arrays: edges (N+1) padded to match
 * counts (N+1, last element = 0) so both columns have equal length.
 */

import type { ColumnarData } from '../types';

export interface HistogramBins {
  /** Bin edge values (length = N+1 for N bins) */
  edges: Float64Array;
  /** Count per bin (length = N) */
  counts: Float64Array;
  /** Maximum count */
  maxCount: number;
}

export interface HistogramOptions {
  method?: 'sturges' | 'scott' | 'freedman-diaconis';
  binCount?: number;
}

/**
 * Compute histogram bins from raw values.
 *
 * Usage:
 *   const bins = histogram(rawValues);
 *   const data: ColumnarData = [bins.edges, bins.counts];
 *   // Note: counts is padded with a trailing 0 to match edges length
 */
export function histogram(
  values: Float64Array,
  options?: HistogramOptions,
): HistogramBins {
  const method = options?.method ?? 'freedman-diaconis';
  const explicitBinCount = options?.binCount;

  // Filter NaN
  const valid: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === v) valid.push(v);
  }

  if (valid.length === 0) {
    return { edges: new Float64Array(0), counts: new Float64Array(0), maxCount: 0 };
  }

  valid.sort((a, b) => a - b);
  const n = valid.length;
  const min = valid[0];
  const max = valid[n - 1];

  if (min === max) {
    // Single-value data: one bin centered on the value
    const edges = Float64Array.from([min - 0.5, max + 0.5]);
    const counts = Float64Array.from([n, 0]); // padded
    return { edges, counts, maxCount: n };
  }

  // Determine bin count
  let nBins: number;
  if (explicitBinCount !== undefined) {
    nBins = Math.max(1, Math.round(explicitBinCount));
  } else {
    nBins = computeBinCount(valid, n, min, max, method);
  }

  // Compute edges (N+1 values)
  const binWidth = (max - min) / nBins;
  const edges = new Float64Array(nBins + 1);
  for (let i = 0; i <= nBins; i++) {
    edges[i] = min + i * binWidth;
  }

  // Count values per bin (N values, padded to N+1 with trailing 0)
  const counts = new Float64Array(nBins + 1); // last element stays 0
  let maxC = 0;

  for (const v of valid) {
    let bin = Math.floor((v - min) / binWidth);
    if (bin >= nBins) bin = nBins - 1;
    counts[bin]++;
    if (counts[bin] > maxC) maxC = counts[bin];
  }

  return { edges, counts, maxCount: maxC };
}

function computeBinCount(
  sorted: number[],
  n: number,
  min: number,
  max: number,
  method: string,
): number {
  const range = max - min;

  switch (method) {
    case 'sturges':
      return Math.max(1, Math.ceil(Math.log2(n) + 1));

    case 'scott': {
      const mean = sorted.reduce((s, v) => s + v, 0) / n;
      let variance = 0;
      for (const v of sorted) variance += (v - mean) * (v - mean);
      const sigma = Math.sqrt(variance / n);
      const h = 3.5 * sigma * Math.pow(n, -1 / 3);
      return h > 0 ? Math.ceil(range / h) : Math.ceil(Math.log2(n) + 1);
    }

    case 'freedman-diaconis':
    default: {
      const q1 = sorted[Math.floor(n * 0.25)];
      const q3 = sorted[Math.floor(n * 0.75)];
      const iqr = q3 - q1;
      const h = 2 * iqr * Math.pow(n, -1 / 3);
      return h > 0 ? Math.ceil(range / h) : Math.ceil(Math.log2(n) + 1);
    }
  }
}
