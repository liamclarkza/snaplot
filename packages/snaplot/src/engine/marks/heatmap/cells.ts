/**
 * The heatmap's cell geometry: the span of each cell along one axis, from cell centres, edges or a
 * regular step, and which cell each device pixel of the plot shows. A leaf module: the public
 * layer reads the bins with it too.
 */
import type { DataStore } from '../../data/DataStore';
import type { HeatmapSpec, Scale } from '../../spec';

/**
 * How much wider than the steps beside it a step between two centres must be to count as a gap
 * (a missing bin or row) rather than an irregular grid: a gap is left empty, not bridged by
 * stretched cells. A log-spaced grid grows by far less per step; one missing bin doubles a step.
 */
export const GAP_RATIO = 1.75;

/**
 * How much wider than the rows' typical step a step between two rows must be to count as a gap. A
 * stream's rows arrive with jitter and the odd late one: a row is stretched across one missing
 * neighbour, and a pause of two rows or more is left empty.
 */
export const ROW_GAP_RATIO = 2.5;

/**
 * The spans of `count` cells centred at `at(0) … at(count - 1)` (ascending), written to `lo` and
 * `hi` from `offset`. Each cell reaches half way to its neighbours, and a step more than
 * `GAP_RATIO` times the smaller step beside it is a gap: the cells either side of it keep the
 * half step of their other side. A lone cell reaches `Infinity` both ways (it fills the plot).
 */
export function spansFromCenters(
  count: number,
  at: (index: number) => number,
  lo: Float64Array,
  hi: Float64Array,
  offset = 0,
): void {
  if (count <= 0) return;
  if (count === 1) {
    lo[offset] = -Infinity;
    hi[offset] = Infinity;
    return;
  }
  // step(k) is the distance from centre k to centre k + 1.
  const step = (k: number) => at(k + 1) - at(k);
  const isGap = (k: number) => {
    if (k < 0 || k >= count - 1) return true;
    const d = step(k);
    const before = k > 0 ? step(k - 1) : Infinity;
    const after = k < count - 2 ? step(k + 1) : Infinity;
    const beside = Math.min(before, after);
    return beside !== Infinity && d > GAP_RATIO * beside;
  };
  // A cell between two gaps takes the smallest step of the grid (never itself a gap).
  let smallest = Infinity;
  for (let k = 0; k < count - 1; k++) smallest = Math.min(smallest, step(k));
  let leftGap = true;
  for (let i = 0; i < count; i++) {
    const rightGap = isGap(i);
    const centre = at(i);
    let left = leftGap ? NaN : step(i - 1) / 2;
    let right = rightGap ? NaN : step(i) / 2;
    if (Number.isNaN(left) && Number.isNaN(right)) left = right = smallest / 2;
    else if (Number.isNaN(left)) left = right;
    else if (Number.isNaN(right)) right = left;
    lo[offset + i] = centre - left;
    hi[offset + i] = centre + right;
    leftGap = rightGap;
  }
}

/** The spans of cells between consecutive `edges` (ascending): `edges.length - 1` cells. */
export function spansFromEdges(edges: ArrayLike<number>): { lo: Float64Array; hi: Float64Array } {
  const count = Math.max(0, edges.length - 1);
  const lo = new Float64Array(count);
  const hi = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    lo[i] = edges[i];
    hi[i] = edges[i + 1];
  }
  return { lo, hi };
}

/** The spans of `count` cells of width `step` centred at `start`, `start + step`, … */
export function spansFromStep(
  start: number,
  step: number,
  count: number,
): { lo: Float64Array; hi: Float64Array } {
  const lo = new Float64Array(count);
  const hi = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    lo[i] = start + (i - 0.5) * step;
    hi[i] = start + (i + 0.5) * step;
  }
  return { lo, hi };
}

/**
 * The cell holding `value`: the last cell whose span starts at or before it, if its span reaches
 * it, else -1. Spans are ascending and do not overlap; a value on a shared edge is the upper
 * cell's. O(log n).
 */
export function cellAt(
  lo: ArrayLike<number>,
  hi: ArrayLike<number>,
  count: number,
  value: number,
): number {
  if (!(count > 0) || !(value >= lo[0])) return -1;
  let a = 0;
  let b = count - 1;
  while (a < b) {
    const mid = (a + b + 1) >> 1;
    if (lo[mid] <= value) a = mid;
    else b = mid - 1;
  }
  return value <= hi[a] ? a : -1;
}

/**
 * The cell each device pixel along one side of the plot shows, or -1: `out[p]` for the pixel whose
 * centre is `start + (p + 0.5) × size / out.length` CSS pixels along `scale`. O(pixels × log cells).
 */
export function pixelCells(
  lo: ArrayLike<number>,
  hi: ArrayLike<number>,
  count: number,
  scale: Scale,
  start: number,
  size: number,
  out: Int32Array,
): Int32Array {
  const per = out.length > 0 ? size / out.length : 0;
  for (let p = 0; p < out.length; p++) {
    out[p] = cellAt(lo, hi, count, scale.pixelToData(start + (p + 0.5) * per));
  }
  return out;
}

/**
 * The rows of a heatmap's store whose cells can reach `[min, max]` along their axis: the rows
 * with a position inside it and one beyond each end. Empty (`from > to`) for an empty store.
 */
export function rowWindow(
  store: DataStore,
  min: number,
  max: number,
): { from: number; to: number } {
  if (store.length === 0) return { from: 0, to: -1 };
  return {
    from: Math.max(0, store.lowerBoundX(min) - 1),
    to: Math.min(store.length - 1, store.upperBoundX(max) + 1),
  };
}

/**
 * The typical step between a store's rows: the median of up to 1,024 steps sampled across it,
 * cached per store and contents, so the draw and the hit test give a row the same span.
 */
const typicalSteps = new WeakMap<DataStore, { key: string; step: number }>();
export function typicalRowStep(store: DataStore): number {
  const last = store.length - 1;
  if (last < 1) return Number.NaN;
  const key = `${store.length}|${store.xAt(0)}|${store.xAt(last)}`;
  const cached = typicalSteps.get(store);
  if (cached?.key === key) return cached.step;
  const stride = Math.max(1, Math.floor(last / 1024));
  const steps: number[] = [];
  for (let i = 0; i < last; i += stride) steps.push(store.xAt(i + 1) - store.xAt(i));
  steps.sort((a, b) => a - b);
  const step = steps[steps.length >> 1];
  typicalSteps.set(store, { key, step });
  return step;
}

/**
 * The spans of rows `from` to `to` (logical indices) of a heatmap's store, into `lo` and `hi` from
 * 0: the grid's own spans, else each row reaching half way to its neighbours. A step more than
 * `ROW_GAP_RATIO` times the rows' typical step is a gap (rows that did not arrive), and the rows either
 * side of it reach half a typical step into it. Compared with the typical step rather than the
 * steps beside it, a stream's jitter (one late row, then an early one) never opens a gap.
 */
export function rowSpans(
  store: DataStore,
  spec: HeatmapSpec,
  from: number,
  to: number,
  lo: Float64Array,
  hi: Float64Array,
): void {
  const count = to - from + 1;
  if (count <= 0) return;
  if (spec.rowLo && spec.rowHi) {
    // A ring keeps a grid's last rows.
    const shift = spec.rowLo.length - store.length;
    for (let i = 0; i < count; i++) {
      lo[i] = spec.rowLo[from + i + shift];
      hi[i] = spec.rowHi[from + i + shift];
    }
    return;
  }
  const last = store.length - 1;
  if (last === 0) {
    lo[0] = -Infinity;
    hi[0] = Infinity;
    return;
  }
  const typical = typicalRowStep(store);
  const half = (step: number) => (step <= ROW_GAP_RATIO * typical ? step / 2 : typical / 2);
  for (let i = 0; i < count; i++) {
    const row = from + i;
    const at = store.xAt(row);
    const right = row < last ? half(store.xAt(row + 1) - at) : Number.NaN;
    const left = row > 0 ? half(at - store.xAt(row - 1)) : right;
    lo[i] = at - left;
    hi[i] = at + (row < last ? right : left);
  }
}

/** The scale a heatmap's rows run along and the one its bins run across. */
export function gridScales(
  spec: HeatmapSpec,
  xScale: Scale,
  yScale: Scale,
): { rowScale: Scale; binScale: Scale } {
  return spec.rows === 'x'
    ? { rowScale: xScale, binScale: yScale }
    : { rowScale: yScale, binScale: xScale };
}
