/**
 * histogram2d(x, y, { bins?, xThresholds?, yThresholds? }): count (x, y) pairs into a grid for a
 * heatmap series, as `histogram()` counts values for a histogram. Each axis is binned as
 * `histogram()` bins it (the same rules, nice edges and caps), with at most 200 automatic bins per
 * axis; cell (i, j) holds `xEdges[i] <= x < xEdges[i + 1]` and the same for y, the last bin of
 * each axis also holding its upper edge. Pairs with a non-finite value, or outside the edges, are
 * not counted.
 */
import { type HistogramRule, histogram } from './histogram';
import type { HeatmapGrid } from './types';

/** Options of {@link histogram2d}. */
export interface Histogram2dOptions {
  /**
   * Bins per axis: a count from 1 to 10,000 or a rule for both, or `[x, y]`. An automatic count
   * is capped at 200 per axis.
   * @defaultValue `'freedman-diaconis'` on each axis
   */
  bins?: number | HistogramRule | readonly [number | HistogramRule, number | HistogramRule];
  /** Explicit X edges, strictly increasing; not combined with an X bin count. @defaultValue from `bins` */
  xThresholds?: ArrayLike<number>;
  /** Explicit Y edges, strictly increasing; not combined with a Y bin count. @defaultValue from `bins` */
  yThresholds?: ArrayLike<number>;
}

/** A 2D histogram: the grid a heatmap draws, and its largest count. */
export interface Histogram2d extends HeatmapGrid {
  /** The cells along X. */
  x: {
    /** The cells' edges, ascending: one more than there are cells. */
    edges: Float64Array;
  };
  /** The cells along Y. */
  y: {
    /** The cells' edges, ascending: one more than there are cells. */
    edges: Float64Array;
  };
  /** The count of each cell: X column `i`, Y row `j` at `j × (X cells) + i`. */
  values: Float64Array;
  /** The largest count. */
  maxCount: number;
}

const AUTOMATIC_CAP_2D = 200;
const KEYS = ['bins', 'xThresholds', 'yThresholds'];

function fail(message: string): never {
  const error = new Error(`snaplot: ${message}`);
  error.name = 'SnaplotError';
  throw error;
}

/** The edges of one axis: explicit, a count, or a rule capped at 200 automatic bins. */
function axisEdges(
  values: Float64Array,
  bins: number | HistogramRule | undefined,
  thresholds: ArrayLike<number> | undefined,
): Float64Array {
  if (thresholds !== undefined) return histogram(values, { thresholds }).edges;
  if (typeof bins === 'number') return histogram(values, { bins }).edges;
  const automatic = histogram(values, { bins: bins ?? 'freedman-diaconis' }).edges;
  return automatic.length - 1 > AUTOMATIC_CAP_2D
    ? histogram(values, { bins: AUTOMATIC_CAP_2D }).edges
    : automatic;
}

/** The bin of `v` among `edges` (the last bin holds its upper edge), or -1 outside them. */
function binOf(edges: Float64Array, v: number): number {
  const bins = edges.length - 1;
  if (bins < 1 || v < edges[0] || v > edges[bins]) return -1;
  let lo = 0;
  let hi = bins - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (edges[mid] <= v) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Count (x, y) pairs into a grid for a heatmap series.
 *
 * @example
 * ```ts
 * createChart(element, {
 *   series: [{ type: 'heatmap', id: 'density', data: histogram2d(durations, sizes) }],
 * });
 * ```
 */
export function histogram2d(
  x: Float64Array | readonly number[],
  y: Float64Array | readonly number[],
  options: Histogram2dOptions = {},
): Histogram2d {
  for (const values of [x, y])
    if (!Array.isArray(values) && !(values instanceof Float64Array))
      fail(`histogram2d() takes arrays or Float64Arrays of numbers, not ${typeof values}.`);
  if (x.length !== y.length)
    fail(`histogram2d() needs one y per x: x has ${x.length} values and y ${y.length}.`);
  if (options === null || typeof options !== 'object')
    fail('histogram2d() options must be an object: { bins, xThresholds, yThresholds }.');
  for (const key of Object.keys(options))
    if (!KEYS.includes(key))
      fail(`histogram2d() has no option "${key}". Its options are ${KEYS.join(', ')}.`);
  const [xBins, yBins] = Array.isArray(options.bins)
    ? (options.bins as readonly [number | HistogramRule, number | HistogramRule])
    : [
        options.bins as number | HistogramRule | undefined,
        options.bins as number | HistogramRule | undefined,
      ];
  // The pairs where both values are finite.
  const xs = new Float64Array(x.length);
  const ys = new Float64Array(y.length);
  let n = 0;
  for (let i = 0; i < x.length; i++) {
    const a = x[i];
    const b = y[i];
    if (
      typeof a !== 'number' ||
      typeof b !== 'number' ||
      !Number.isFinite(a) ||
      !Number.isFinite(b)
    )
      continue;
    xs[n] = a;
    ys[n++] = b;
  }
  const px = xs.subarray(0, n);
  const py = ys.subarray(0, n);
  const xEdges = axisEdges(px, xBins, options.xThresholds);
  const yEdges = axisEdges(py, yBins, options.yThresholds);
  const columns = Math.max(0, xEdges.length - 1);
  const values = new Float64Array(columns * Math.max(0, yEdges.length - 1));
  let maxCount = 0;
  for (let k = 0; k < n; k++) {
    const i = binOf(xEdges, px[k]);
    const j = binOf(yEdges, py[k]);
    if (i < 0 || j < 0) continue;
    const c = ++values[j * columns + i];
    if (c > maxCount) maxCount = c;
  }
  return { x: { edges: xEdges }, y: { edges: yEdges }, values, maxCount };
}
