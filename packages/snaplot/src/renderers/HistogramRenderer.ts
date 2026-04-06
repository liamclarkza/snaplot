import type { Scale, Layout, SeriesConfig } from '../types';

/**
 * Histogram renderer.
 *
 * Bin calculation methods per spec §4.6:
 * - Freedman-Diaconis (default): 2 * IQR * n^(-1/3) — most robust to outliers
 * - Sturges: ceil(log2(n) + 1)
 * - Scott: 3.5 * sigma / n^(1/3) — optimized for Gaussian data
 *
 * Bins are computed once on data change, stored as edges + counts.
 */

export interface HistogramBins {
  /** Bin edge values (length = binCount + 1) */
  edges: Float64Array;
  /** Count per bin (length = binCount) */
  counts: Float64Array;
  /** Maximum count (for scaling) */
  maxCount: number;
}

/**
 * Calculate histogram bins from raw Y values.
 */
export function calculateBins(
  values: Float64Array,
  method: 'sturges' | 'scott' | 'freedman-diaconis' = 'freedman-diaconis',
  binCount?: number,
): HistogramBins {
  // Filter out NaN
  const valid: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === v) valid.push(v); // not NaN
  }

  if (valid.length === 0) {
    return { edges: new Float64Array(0), counts: new Float64Array(0), maxCount: 0 };
  }

  valid.sort((a, b) => a - b);
  const n = valid.length;
  const min = valid[0];
  const max = valid[n - 1];

  if (min === max) {
    return {
      edges: Float64Array.from([min - 0.5, max + 0.5]),
      counts: Float64Array.from([n]),
      maxCount: n,
    };
  }

  // Determine bin count
  let nBins: number;
  if (binCount !== undefined) {
    nBins = binCount;
  } else {
    nBins = computeBinCount(valid, n, min, max, method);
  }

  nBins = Math.max(1, Math.round(nBins));

  // Compute edges
  const binWidth = (max - min) / nBins;
  const edges = new Float64Array(nBins + 1);
  for (let i = 0; i <= nBins; i++) {
    edges[i] = min + i * binWidth;
  }

  // Count values per bin
  const counts = new Float64Array(nBins);
  let maxC = 0;

  for (const v of valid) {
    let bin = Math.floor((v - min) / binWidth);
    if (bin >= nBins) bin = nBins - 1; // Include max value in last bin
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
      return Math.ceil(Math.log2(n) + 1);

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

/**
 * Render pre-calculated histogram bins as bars.
 */
export function renderHistogram(
  ctx: CanvasRenderingContext2D,
  bins: HistogramBins,
  scaleX: Scale,
  scaleY: Scale,
  layout: Layout,
  series: SeriesConfig,
  color: string,
): void {
  if (bins.counts.length === 0) return;

  // Clip to plot area
  ctx.save();
  ctx.beginPath();
  ctx.rect(layout.plot.left, layout.plot.top, layout.plot.width, layout.plot.height);
  ctx.clip();

  ctx.fillStyle = color;
  ctx.globalAlpha = series.opacity ?? 0.75;
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.5;

  const baselineY = scaleY.dataToPixel(0);

  for (let i = 0; i < bins.counts.length; i++) {
    if (bins.counts[i] === 0) continue;

    const x1 = scaleX.dataToPixel(bins.edges[i]);
    const x2 = scaleX.dataToPixel(bins.edges[i + 1]);
    const yTop = scaleY.dataToPixel(bins.counts[i]);

    const barX = x1 + 0.5; // Small gap between bars
    const barW = Math.max(1, x2 - x1 - 1);
    const barY = Math.min(yTop, baselineY);
    const barH = Math.abs(yTop - baselineY);

    ctx.fillRect(barX, barY, barW, barH);
    ctx.strokeRect(barX, barY, barW, barH);
  }

  ctx.restore();
}
