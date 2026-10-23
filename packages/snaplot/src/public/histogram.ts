/**
 * histogram(values, { bins?, thresholds? }) (plan §3.1, §5.9, dataapi-06,
 * dataapi-19, dxtrial-14). A user-facing utility: the chart draws the bins it
 * returns and never bins data itself.
 *
 * - Automatic bins come from a rule (Freedman–Diaconis by default), are capped
 *   at 1,000, and sit on nice edges: multiples of a 1, 2, 2.5 or 5 × 10ⁿ width.
 * - An explicit count (at most 10,000) spreads its edges evenly from the
 *   smallest to the largest value, both exact.
 * - `thresholds` gives the edges, so two datasets binned with the same
 *   thresholds compare bin for bin. Values outside them are not counted.
 * - Bin `i` holds `edges[i] <= v < edges[i + 1]`; the last bin also holds its
 *   upper edge. Counts are found by searching the edges, so they always agree.
 * - Edges stay finite and strictly increasing up to ±Number.MAX_VALUE.
 */
import { fail, suggest } from '../engine/errors';
import type { HistogramBins } from './types';

/** The rules that pick an automatic bin count. */
export type HistogramRule = 'freedman-diaconis' | 'sturges' | 'scott';

/** Options of {@link histogram}. */
export interface HistogramOptions {
  /**
   * A bin count from 1 to 10,000, or the rule that picks one (capped at 1,000 bins on nice edges).
   * @defaultValue `'freedman-diaconis'`
   */
  bins?: number | HistogramRule;
  /**
   * Explicit edges, strictly increasing: pass one histogram's `edges` to bin another dataset the
   * same way. Values outside the first and last edge are not counted. Not combined with `bins`.
   * @defaultValue computed from `bins`
   */
  thresholds?: ArrayLike<number>;
}

const RULES: readonly HistogramRule[] = ['freedman-diaconis', 'sturges', 'scott'];
const AUTOMATIC_CAP = 1000;
const EXPLICIT_CAP = 10_000;
const OPTION_HINTS: Record<string, string> = {
  binCount: 'Use bins.',
  method: `Use bins: ${RULES.map((rule) => `'${rule}'`).join(' | ')}.`,
};

/**
 * Count values into bins for a histogram series.
 *
 * @example
 * ```ts
 * const before = histogram(latencyBefore);
 * const after = histogram(latencyAfter, { thresholds: before.edges });
 * createChart(element, {
 *   series: [
 *     { id: 'before', type: 'histogram', data: before },
 *     { id: 'after', type: 'histogram', data: after },
 *   ],
 * });
 * ```
 */
export function histogram(
  values: Float64Array | readonly number[],
  options: HistogramOptions = {},
): HistogramBins {
  if (!Array.isArray(values) && !(values instanceof Float64Array))
    fail(`histogram() takes an array or a Float64Array of numbers, not ${typeof values}.`);
  if (options === null || typeof options !== 'object')
    fail('histogram() options must be an object: { bins } or { thresholds }.');
  for (const key of Object.keys(options)) {
    if (key === 'bins' || key === 'thresholds') continue;
    const hint =
      OPTION_HINTS[key] ??
      (suggest(key, ['bins', 'thresholds'])
        ? `Did you mean "${suggest(key, ['bins', 'thresholds'])}"?`
        : 'Its options are bins and thresholds.');
    fail(`histogram() has no option "${key}". ${hint}`);
  }
  const { bins, thresholds } = options;
  if (bins !== undefined && thresholds !== undefined)
    fail('histogram() takes bins or thresholds, not both.');
  if (bins !== undefined && typeof bins !== 'string') {
    if (typeof bins !== 'number' || !Number.isInteger(bins) || bins < 1 || bins > EXPLICIT_CAP)
      fail(
        `histogram() bins must be a whole number from 1 to 10,000 or a rule, not ${String(bins)}.`,
      );
  }
  if (typeof bins === 'string' && !RULES.includes(bins as HistogramRule)) {
    const close = suggest(bins, RULES);
    fail(
      `histogram() bins "${bins}" is not a rule. Use ${RULES.map((rule) => `'${rule}'`).join(', ')}${close ? `; did you mean '${close}'?` : '.'}`,
    );
  }

  const sorted = finiteSorted(values);
  if (thresholds !== undefined) return count(sorted, checkedThresholds(thresholds));
  if (sorted.length === 0)
    return { edges: new Float64Array(0), counts: new Float64Array(0), maxCount: 0 };
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  if (min === max) return count(sorted, around(min));
  if (typeof bins === 'number') return count(sorted, even(min, max, bins));
  const rule = (bins ?? 'freedman-diaconis') as HistogramRule;
  const automatic = Math.min(AUTOMATIC_CAP, binCount(sorted, rule));
  return count(sorted, nice(min, max, automatic) ?? even(min, max, automatic));
}

/** The finite values, sorted ascending (a copy; the input is not touched). */
function finiteSorted(values: Float64Array | readonly number[]): Float64Array {
  const out = new Float64Array(values.length);
  let n = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (typeof v === 'number' && Number.isFinite(v)) out[n++] = v;
  }
  return out.subarray(0, n).sort();
}

function checkedThresholds(thresholds: ArrayLike<number>): Float64Array {
  if (!thresholds || typeof thresholds !== 'object' || typeof thresholds.length !== 'number')
    fail('histogram() thresholds must be an array of edges, such as another histogram’s edges.');
  if (thresholds.length < 2)
    fail(`histogram() thresholds need at least 2 edges, not ${thresholds.length}.`);
  const edges = Float64Array.from(thresholds);
  for (let i = 0; i < edges.length; i++) {
    if (!Number.isFinite(edges[i]))
      fail(`histogram() thresholds must be finite; edge ${i} is ${edges[i]}.`);
    if (i > 0 && edges[i] <= edges[i - 1])
      fail(`histogram() thresholds must be strictly increasing; edge ${i} is ${edges[i]}.`);
  }
  return edges;
}

/** One bin around a single repeated value, wide enough to be strictly increasing at any magnitude. */
function around(value: number): Float64Array {
  const half = Math.max(0.5, Math.abs(value) * 1e-9);
  let lo = value - half;
  let hi = value + half;
  if (!Number.isFinite(hi)) [lo, hi] = [value - 2 * half, value];
  if (!Number.isFinite(lo)) [lo, hi] = [value, value + 2 * half];
  return Float64Array.of(lo, hi);
}

/**
 * `n` even bins from `min` to `max`, both exact. Interpolating (instead of
 * `min + i × width`) keeps every edge finite when `max − min` overflows.
 * A range too narrow for `n` distinct edges gets fewer bins.
 */
function even(min: number, max: number, n: number): Float64Array {
  for (let bins = n; bins >= 1; bins = Math.floor(bins / 2)) {
    const edges = new Float64Array(bins + 1);
    edges[0] = min;
    edges[bins] = max;
    for (let i = 1; i < bins; i++) {
      const t = i / bins;
      edges[i] = min * (1 - t) + max * t;
    }
    if (increasing(edges)) return edges;
  }
  return Float64Array.of(min, max);
}

/**
 * About `n` bins on multiples of a nice width (1, 2, 2.5 or 5 × 10ⁿ) that
 * cover `[min, max]`, at most 1,000 of them; `undefined` when the edges would
 * not be finite.
 */
function nice(min: number, max: number, n: number): Float64Array | undefined {
  const raw = max / n - min / n;
  if (!(raw > 0) || !Number.isFinite(raw)) return undefined;
  const exponent = Math.floor(Math.log10(raw));
  const mantissa = [1, 2, 2.5, 5].find((m) => m * 10 ** exponent >= raw * (1 - 1e-12));
  const step = mantissa === undefined ? 10 ** (exponent + 1) : mantissa * 10 ** exponent;
  return Number.isFinite(step) ? niceFrom(min, max, step) : undefined;
}

/** Edges at multiples of `step`, widening the step until at most 1,000 bins cover the data. */
function niceFrom(min: number, max: number, start: number): Float64Array | undefined {
  let step = start;
  for (let guard = 0; guard < 64; guard++) {
    let first = Math.floor(min / step);
    let last = Math.ceil(max / step);
    while (first * step > min) first--;
    while (last * step < max) last++;
    if (last - first <= AUTOMATIC_CAP) {
      const edges = new Float64Array(last - first + 1);
      for (let i = 0; i < edges.length; i++) edges[i] = (first + i) * step;
      return edges.every(Number.isFinite) && increasing(edges) ? edges : undefined;
    }
    step = nextNice(step);
    if (!Number.isFinite(step)) return undefined;
  }
  return undefined;
}

function nextNice(step: number): number {
  const exponent = Math.floor(Math.log10(step) + 1e-12);
  const mantissa = Math.round((step / 10 ** exponent) * 1e9) / 1e9;
  if (mantissa < 2) return 2 * 10 ** exponent;
  if (mantissa < 2.5) return 2.5 * 10 ** exponent;
  if (mantissa < 5) return 5 * 10 ** exponent;
  return 10 ** (exponent + 1);
}

function increasing(edges: Float64Array): boolean {
  for (let i = 1; i < edges.length; i++) if (!(edges[i] > edges[i - 1])) return false;
  return true;
}

/** The automatic bin count of a rule, at least 1. */
function binCount(sorted: Float64Array, rule: HistogramRule): number {
  const n = sorted.length;
  const sturges = Math.ceil(Math.log2(n) + 1);
  if (rule === 'sturges') return Math.max(1, sturges);
  const min = sorted[0];
  const max = sorted[n - 1];
  let width: number;
  if (rule === 'scott') {
    let mean = 0;
    for (let i = 0; i < n; i++) mean += sorted[i] / n;
    let variance = 0;
    for (let i = 0; i < n; i++) variance += ((sorted[i] - mean) * (sorted[i] - mean)) / n;
    width = 3.5 * Math.sqrt(variance) * n ** (-1 / 3);
  } else {
    const iqr = sorted[Math.floor(n * 0.75)] - sorted[Math.floor(n * 0.25)];
    width = 2 * iqr * n ** (-1 / 3);
  }
  const range = max / 2 - min / 2;
  const bins = width > 0 && Number.isFinite(width) ? Math.ceil(range / (width / 2)) : sturges;
  return Number.isFinite(bins) ? Math.max(1, bins) : AUTOMATIC_CAP;
}

/** Count sorted values into the bins of `edges` (upper edge in the last bin). */
function count(sorted: Float64Array, edges: Float64Array): HistogramBins {
  const bins = edges.length - 1;
  const counts = new Float64Array(Math.max(0, bins));
  if (bins < 1) return { edges, counts, maxCount: 0 };
  const lo = edges[0];
  const hi = edges[bins];
  let bin = 0;
  for (let i = 0; i < sorted.length; i++) {
    const v = sorted[i];
    if (v < lo || v > hi) continue;
    // Values are sorted, so the bin only moves forward.
    while (bin < bins - 1 && v >= edges[bin + 1]) bin++;
    counts[bin]++;
  }
  let maxCount = 0;
  for (let i = 0; i < bins; i++) if (counts[i] > maxCount) maxCount = counts[i];
  return { edges, counts, maxCount };
}
