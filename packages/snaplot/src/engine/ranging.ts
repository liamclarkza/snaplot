/**
 * The domain policy (plan §5.1): each axis' automatic range, from all of the data after a data
 * change and from the visible X window after a viewport change; the bar X-axis plan; and the
 * block-aggregate range indexes that answer viewport queries.
 */
import type { ChartCore } from './Engine';
import { inferPosition } from './layout';
import type { DataStore } from './data/DataStore';
import { seriesYColumn } from './marks/columns';
import { markOf, xColumnOf } from './marks/index';
import { AUTO_RANGE_PADDING, DEFAULT_TICK_COUNT } from '../constants';
import { categoryWidthFromData } from './marks/bar/geometry';
import type { Scale, AxisSpec } from './spec';
import { ColumnRangeIndex, ScatterColumnRangeIndex } from './data/columnRangeIndex';
import { ColumnarStore } from './data/ColumnarStore';
import { niceStep } from './scales/niceNumbers';
import { followWindow, applyFollowWindow } from './viewport';
import { createScale } from './scales/createScale';

export type BarXAxisPlan = {
  values: number[];
  gridValues: number[];
  domainMin: number;
  domainMax: number;
};

/**
 * Range the axes after a data change. When live-follow is active with a
 * window, the X viewport is pinned to the trailing window and only Y
 * auto-ranges; otherwise the normal auto-range runs (which itself respects
 * user-zoomed axes). Returns whether the grid layer needs a repaint.
 */
export function rangeForDataChange(engine: ChartCore): boolean {
  if (engine.following && followWindow(engine) !== undefined && engine.hasData()) {
    return applyFollowWindow(engine);
  }
  return autoRangeTracked(engine);
}

/** Join every scale's key and bounds; used to detect any domain change. */
export function scaleSignature(engine: ChartCore): string {
  let sig = '';
  for (const [key, scale] of engine.scales) sig += key + ':' + scale.min + ':' + scale.max + '|';
  return sig;
}

/**
 * Run auto-range and report whether the grid layer needs a repaint.
 * When no scale moved (zoomed or pinned axes during streaming), ticks
 * and gridlines are unchanged and a data update can skip the grid layer
 * entirely. Bar and histogram X ticks derive from data positions rather
 * than the domain alone, so those charts always repaint the grid.
 */
export function autoRangeTracked(engine: ChartCore): boolean {
  const hasBarLike = engine.config.series.some(
    (s) => s.visible !== false && markOf(s).draw.x !== 'continuous',
  );
  if (hasBarLike) {
    autoRange(engine);
    return true;
  }

  const before = scaleSignature(engine);
  autoRange(engine);
  return scaleSignature(engine) !== before;
}

/**
 * Auto-range both horizontal and vertical axes to fit data.
 * Called on data change (replacement, append, init), NOT on zoom.
 */
export function autoRange(engine: ChartCore): void {
  autoRangeHorizontal(engine);
  autoRangeVertical(engine);
}

/** Auto-range horizontal (bottom/top) axes to full data extent. Skipped per-axis when the user has actively zoomed that axis. */
export function autoRangeHorizontal(engine: ChartCore): void {
  engine.barXAxisPlans.clear();
  if (!engine.hasData()) return;

  const axisConfigs = engine.config.axes ?? {};
  for (const [key, ac] of Object.entries(axisConfigs)) {
    const pos = inferPosition(key, ac.position);
    if (pos !== 'bottom' && pos !== 'top') continue;

    const scale = engine.scales.get(key);
    if (!scale) continue;
    if (ac.auto === false) continue;
    // A user-zoomed axis keeps its viewport, but we still recompute its
    // natural (reset-zoom / `bounds: 'data'`) extent below so streaming data
    // beyond the pre-zoom extent stays reachable by pan/zoom-out instead of
    // being frozen out until `resetZoom()`. We restore the live viewport
    // after the computation.
    const userZoomed = engine.userZoomedAxes.has(key);
    const preservedMin = scale.min;
    const preservedMax = scale.max;
    // Both bounds pinned → restore to those values. Skipping here would
    // leave zoomed state intact after `resetZoom()`.
    if (ac.min !== undefined && ac.max !== undefined) {
      if (!userZoomed) {
        scale.min = ac.min;
        scale.max = ac.max;
      }
      engine.naturalExtent.set(key, [ac.min, ac.max]);
      continue;
    }

    let xMin = Infinity;
    let xMax = -Infinity;
    let xPositiveMin = Infinity;
    let hasXValue = false;
    const visitedColumns = new Map<DataStore, Set<number>>();
    const includeXColumn = (columnIdx: number, store: DataStore) => {
      if (!engine.isValidColumn(columnIdx, store)) return;
      let visited = visitedColumns.get(store);
      if (!visited) {
        visited = new Set();
        visitedColumns.set(store, visited);
      }
      if (visited.has(columnIdx)) return;
      visited.add(columnIdx);
      for (let i = 0; i < store.length; i++) {
        const value = store.valueAt(columnIdx, i);
        if (!Number.isFinite(value)) continue;
        hasXValue = true;
        if (value < xMin) xMin = value;
        if (value > xMax) xMax = value;
        if (value > 0 && value < xPositiveMin) xPositiveMin = value;
      }
    };
    let hasBoundSeries = false;
    for (const [si, s] of engine.config.series.entries()) {
      if ((s.xAxis ?? 'x') !== key || s.visible === false) continue;
      hasBoundSeries = true;
      includeXColumn(xColumnOf(s), engine.storeForSeries(si));
    }
    if (!hasBoundSeries) includeXColumn(0, engine.sourceStores[0]);
    if (!hasXValue) continue;
    if (scale.type === 'log') {
      if (xMax <= 0 || xPositiveMin === Infinity) continue;
      xMin = xPositiveMin;
    }
    const hasBarSeries = engine.config.series.some(
      (s) => s.visible !== false && (s.xAxis ?? 'x') === key && markOf(s).draw.x !== 'continuous',
    );
    const hasHistogramSeries = engine.config.series.some(
      (s) => s.visible !== false && (s.xAxis ?? 'x') === key && markOf(s).draw.x === 'bin',
    );
    const barStores = [
      ...new Set(
        engine.config.series.flatMap((series, si) =>
          series.visible !== false &&
          (series.xAxis ?? 'x') === key &&
          markOf(series).draw.x !== 'continuous'
            ? [engine.storeForSeries(si)]
            : [],
        ),
      ),
    ];
    const barX =
      barStores.length === 1
        ? barStores[0].x
        : Float64Array.from(
            [...new Set(barStores.flatMap((store) => Array.from(store.x)))].sort((a, b) => a - b),
          );
    // Scatter/heatmap clouds default to a 5% pad so the data fills the plot
    // with just enough breathing room before continuous-domain nicening.
    const isScatterOnly =
      !hasBarSeries &&
      engine.config.series.length > 0 &&
      engine.config.series.every((s) => s.visible === false || markOf(s).draw.cloud);

    if (scale.type === 'log') {
      const [min, max] = paddedLogRange(xMin, xMax, ac.padding ?? AUTO_RANGE_PADDING);
      scale.min = ac.min ?? min;
      scale.max = ac.max ?? max;
    } else if (xMin === xMax) {
      // A single value: one unit either side, or half an hour on a time axis (render-11).
      const half = scale.type === 'time' ? 1_800_000 : 1;
      scale.min = xMin - half;
      scale.max = xMax + half;
    } else if (hasBarSeries && !hasHistogramSeries && barX.length > 1) {
      const canPlanBarTicks =
        scale.type === 'linear' &&
        ac.nice !== false &&
        ac.min === undefined &&
        ac.max === undefined &&
        (!ac.ticks || ac.ticks.length === 0);
      const barPlan = canPlanBarTicks
        ? planBarXAxis(Array.from(barX), xMin, xMax, ac.tickCount ?? DEFAULT_TICK_COUNT)
        : null;
      // Numeric bars span the first slot's left edge to the last slot's right edge: the tick plan
      // places ticks and grid cells, but never widens the domain into phantom slots (visuals-08).
      if (barPlan) engine.barXAxisPlans.set(key, barPlan);
      const firstPad = categoryWidthFromData((idx) => barX[idx], 0, barX.length) * 0.5;
      const lastPad = categoryWidthFromData((idx) => barX[idx], barX.length - 1, barX.length) * 0.5;
      scale.min = xMin - firstPad;
      scale.max = xMax + lastPad;
    } else if (hasBarSeries && barX.length > 1) {
      const firstPad = categoryWidthFromData((idx) => barX[idx], 0, barX.length) * 0.5;
      const lastPad = categoryWidthFromData((idx) => barX[idx], barX.length - 1, barX.length) * 0.5;
      scale.min = xMin - firstPad;
      scale.max = xMax + lastPad;
    } else if (isScatterOnly) {
      // Nice rounding is the padding when it applies (plan §5.1); otherwise 5%.
      const niced = shouldNiceAutoRange(scale, ac, false);
      const pad = (xMax - xMin) * (ac.padding ?? (niced ? 0 : AUTO_RANGE_PADDING));
      scale.min = xMin - pad;
      scale.max = xMax + pad;
    } else {
      // Horizontal auto-range defaults to zero padding; users can opt in
      // via `axes.[key].padding`.
      const pad = (xMax - xMin) * (ac.padding ?? 0);
      scale.min = xMin - pad;
      scale.max = xMax + pad;
    }

    // Linear continuous domains use regular 1/2/5 tick intervals by default.
    // Bar X axes use their own slot plan above; histogram bounds stay exact.
    // `nice: false` opts out.
    if (shouldNiceAutoRange(scale, ac, hasBarSeries)) {
      niceAutoRange(scale, ac.tickCount ?? DEFAULT_TICK_COUNT);
    }

    // One-signed X never gets an axis across zero (visuals-07).
    if (scale.type === 'linear' && !hasBarSeries) {
      if (ac.min === undefined && xMin >= 0 && scale.min < 0) scale.min = 0;
      if (ac.max === undefined && xMax <= 0 && scale.max > 0) scale.max = 0;
    }

    // Nicening may expand either side, but an explicitly pinned side must
    // remain exactly where the caller put it.
    if (ac.min !== undefined) scale.min = ac.min;
    if (ac.max !== undefined) scale.max = ac.max;

    // Remember the "full" extent so zoom.bounds: 'data' knows how far
    // out reset-zoom would go.
    engine.naturalExtent.set(key, [scale.min, scale.max]);

    // The extent is refreshed above; a user-zoomed axis keeps the viewport
    // it had on entry so streaming appends don't snap it back.
    if (userZoomed) {
      scale.min = preservedMin;
      scale.max = preservedMax;
    }
  }
}

/**
 * Auto-range vertical (left/right) axes to fit the data visible in the current X viewport.
 * Called on zoom/pan (viewport change) AND on data change.
 * This is the key to "zoom X, Y follows" behavior.
 *
 * `fromViewport` marks the pan/zoom path, which runs once per gesture
 * frame: it answers range queries from block-aggregate indexes instead of
 * scanning every visible point. Data-change callers keep the direct scan
 * because their data version bump would invalidate any index anyway.
 */
export function autoRangeVertical(engine: ChartCore, fromViewport = false): void {
  if (!engine.hasData()) return;

  const axisConfigs = engine.config.axes ?? {};
  for (const [key, scale] of engine.scales) {
    const ac = axisConfigs[key];
    if (!ac) continue;
    const pos = inferPosition(key, ac.position);
    if (pos !== 'left' && pos !== 'right') continue;
    if (ac.auto === false) continue;
    if (engine.userZoomedAxes.has(key)) continue;
    // Both bounds pinned → restore to those values. Skipping here would
    // leave zoomed state intact after `resetZoom()`.
    if (ac.min !== undefined && ac.max !== undefined) {
      scale.min = ac.min;
      scale.max = ac.max;
      continue;
    }

    let yMin = Infinity;
    let yMax = -Infinity;
    let hasValue = false;

    const includeRange = (range: [number, number] | null) => {
      if (!range) return;
      hasValue = true;
      if (range[0] < yMin) yMin = range[0];
      if (range[1] > yMax) yMax = range[1];
    };

    const includeColumnRange = (
      columnIdx: number,
      startIdx: number,
      endIdx: number,
      store: DataStore,
    ) => {
      includeRange(
        columnRange(engine, columnIdx, startIdx, endIdx, scale.type, fromViewport, store),
      );
    };
    const includeColumnForScatterViewport = (
      yColumnIdx: number,
      xColumnIdx: number,
      xScale: Scale | undefined,
      store: DataStore,
    ) => {
      includeRange(
        scatterViewportColumnRange(
          engine,
          yColumnIdx,
          xColumnIdx,
          xScale,
          scale.type,
          fromViewport,
          store,
        ),
      );
    };

    for (const [si, s] of engine.config.series.entries()) {
      if ((s.yAxis ?? 'y') !== key || s.visible === false) continue;

      const store = engine.storeForSeries(si);
      const xScale = engine.scales.get(s.xAxis ?? 'x') ?? engine.scales.get('x');
      const xColumnIdx = xColumnOf(s);
      let startIdx = 0;
      let endIdx = store.length - 1;
      if (xScale && xColumnIdx === 0) {
        [startIdx, endIdx] = store.getViewportIndices(xScale.min, xScale.max);
      }

      const yColumnIdx = seriesYColumn(s) - 1;
      if (xColumnIdx !== 0 && engine.isValidColumn(xColumnIdx, store)) {
        includeColumnForScatterViewport(yColumnIdx, xColumnIdx, xScale, store);
      } else {
        includeColumnRange(yColumnIdx, startIdx, endIdx, store);
      }
      for (const column of markOf(s).draw.extentColumns(s)) {
        includeColumnRange(column - 1, startIdx, endIdx, store);
      }
    }

    // For zero-based marks (bars, histograms), always include 0 as the baseline
    const hasBarOrHist = engine.config.series.some(
      (s) => (s.yAxis ?? 'y') === key && s.visible !== false && markOf(s).draw.zeroBased,
    );
    if (!hasValue) continue;

    if (hasBarOrHist && scale.type !== 'log') {
      if (yMin > 0) yMin = 0;
      if (yMax < 0) yMax = 0;
    }

    if (scale.type === 'log') {
      const [min, max] = paddedLogRange(yMin, yMax, ac.padding ?? AUTO_RANGE_PADDING);
      if (ac.min === undefined) scale.min = min;
      if (ac.max === undefined) scale.max = max;
    } else {
      // One domain policy (plan §5.1): nice rounding is the padding. The 5% pad applies only when
      // nice is off (or the axis sets its own padding), so a maximum of 100 reads 0–100.
      const niced = shouldNiceAutoRange(scale, ac, false);
      const pad = (yMax - yMin) * (ac.padding ?? (niced ? 0 : AUTO_RANGE_PADDING));
      const equalSpan = yMin === yMax ? (yMin === 0 ? 1 : Math.abs(yMin) * 0.1) : 0;
      if (ac.min === undefined) {
        const min = yMin - (equalSpan || pad);
        scale.min = hasBarOrHist ? Math.min(0, min) : min;
      }
      if (ac.max === undefined) {
        const max = yMax + (equalSpan || pad);
        scale.max = hasBarOrHist ? Math.max(0, max) : max;
      }
    }

    if (shouldNiceAutoRange(scale, ac, false)) {
      niceAutoRange(scale, ac.tickCount ?? DEFAULT_TICK_COUNT);
    }
    // One-signed data never gets an axis across zero (visuals-07, render-22).
    if (scale.type !== 'log') {
      if (ac.min === undefined && yMin >= 0 && scale.min < 0) scale.min = 0;
      if (ac.max === undefined && yMax <= 0 && scale.max > 0) scale.max = 0;
    }

    // Preserve one-sided explicit domains after automatic nicening.
    if (ac.min !== undefined) scale.min = ac.min;
    if (ac.max !== undefined) scale.max = ac.max;

    // Remember the "full" extent so zoom.bounds: 'data' knows how far
    // out reset-zoom would go.
    engine.naturalExtent.set(key, [scale.min, scale.max]);
  }
}

export function ensureRangeIndexesFresh(engine: ChartCore): void {
  if (engine.rangeIndexVersion === engine.dataVersion) return;
  engine.rangeIndexVersion = engine.dataVersion;
  engine.columnRangeIndexes.clear();
  engine.scatterRangeIndexes.clear();
}

export function invalidateRangeCache(engine: ChartCore): void {
  engine.rangeIndexVersion = -1;
  engine.columnRangeIndexes.clear();
  engine.scatterRangeIndexes.clear();
  engine.scatterSeriesCaches.clear();
  engine.scatterEncodingCache.clear();
}

export function columnRange(
  engine: ChartCore,
  columnIdx: number,
  startIdx: number,
  endIdx: number,
  scaleType: Scale['type'],
  useIndex: boolean,
  store: DataStore,
): [number, number] | null {
  if (columnIdx < 0 || columnIdx >= store.seriesCount) return null;
  const start = Math.max(0, startIdx);
  const end = Math.min(store.length - 1, endIdx);
  if (end < start) return null;
  const positiveOnly = scaleType === 'log';

  if (useIndex) {
    ensureRangeIndexesFresh(engine);
    const cacheKey = engine.sourceStores.indexOf(store) + ':' + columnIdx;
    let index = engine.columnRangeIndexes.get(cacheKey);
    if (!index) {
      // Physical column columnIdx + 1: column 0 is X, series are 1-based.
      index = new ColumnRangeIndex(store.getPhysicalColumn(columnIdx + 1));
      engine.columnRangeIndexes.set(cacheKey, index);
    }
    // Segments map the logical range onto live physical ranges, so ring
    // buffers never query dead slots between head and tail.
    let min = Infinity;
    let max = -Infinity;
    for (const segment of store.getSegments(start, end)) {
      const range = index.query(segment.physicalStart, segment.physicalEnd, positiveOnly);
      if (!range) continue;
      if (range[0] < min) min = range[0];
      if (range[1] > max) max = range[1];
    }
    return min === Infinity ? null : [min, max];
  }

  let min = Infinity;
  let max = -Infinity;
  for (let i = start; i <= end; i++) {
    const v = store.yAt(columnIdx, i);
    if (!Number.isFinite(v) || (positiveOnly && v <= 0)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return min === Infinity ? null : [min, max];
}

export function scatterViewportColumnRange(
  engine: ChartCore,
  yColumnIdx: number,
  xColumnIdx: number,
  xScale: Scale | undefined,
  scaleType: Scale['type'],
  useIndex: boolean,
  store: DataStore,
): [number, number] | null {
  if (yColumnIdx < 0 || yColumnIdx >= store.seriesCount) return null;
  if (!engine.isValidColumn(xColumnIdx, store)) return null;

  const xMin = xScale?.min ?? -Infinity;
  const xMax = xScale?.max ?? Infinity;
  const positiveOnly = scaleType === 'log';

  // The sorted-permutation index assumes physical position == logical
  // position, which only holds for the plain columnar store. Ring buffers
  // fall back to the direct scan.
  if (useIndex && store instanceof ColumnarStore) {
    ensureRangeIndexesFresh(engine);
    const key = engine.sourceStores.indexOf(store) + ':' + xColumnIdx + ':' + yColumnIdx;
    let index = engine.scatterRangeIndexes.get(key);
    if (!index) {
      index = new ScatterColumnRangeIndex(
        store.getPhysicalColumn(xColumnIdx),
        store.getPhysicalColumn(yColumnIdx + 1),
      );
      engine.scatterRangeIndexes.set(key, index);
    }
    return index.query(xMin, xMax, positiveOnly);
  }

  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < store.length; i++) {
    const x = store.valueAt(xColumnIdx, i);
    if (!Number.isFinite(x)) continue;
    if (x < xMin || x > xMax) continue;
    const v = store.yAt(yColumnIdx, i);
    if (!Number.isFinite(v) || (positiveOnly && v <= 0)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return min === Infinity ? null : [min, max];
}

export function paddedLogRange(min: number, max: number, padding: number): [number, number] {
  const safeMin = Math.max(min, 1e-10);
  const safeMax = Math.max(max, safeMin);
  if (safeMin === safeMax) return [safeMin / 10, safeMax * 10];
  const logMin = Math.log10(safeMin);
  const logMax = Math.log10(safeMax);
  const logPad = (logMax - logMin) * padding;
  return [10 ** (logMin - logPad), 10 ** (logMax + logPad)];
}

export function shouldNiceAutoRange(
  scale: Scale,
  axis: AxisSpec,
  hasExactGeometry: boolean,
): boolean {
  if (hasExactGeometry || scale.type === 'time') return false;
  // Linear axes get clean 1/2/5 bounds by default. Log axes retain their
  // existing opt-in behavior because their padded powers-of-ten extent is
  // already meaningful; `nice: true` still rounds it to full decades.
  return scale.type === 'linear' ? axis.nice !== false : axis.nice === true;
}

/**
 * Expand a linear domain until the tick step selected from that domain is
 * stable. One pass can widen the range enough to select the next 1/2/5
 * interval, leaving a non-tick boundary behind (for example [-100, -85]
 * selecting a 10-unit step). A bounded loop keeps the range deterministic
 * while avoiding any renderer-specific endpoint insertion.
 */
export function niceAutoRange(scale: Scale, tickCount: number): void {
  // niceRange treats one or two requested ticks as a two-reference
  // fallback. Reapplying that fallback can keep widening the domain, so
  // leave those intentionally sparse ranges at their first result.
  const maxPasses = tickCount <= 2 ? 1 : 8;
  for (let pass = 0; pass < maxPasses; pass++) {
    const previousMin = scale.min;
    const previousMax = scale.max;
    scale.nice(tickCount);
    if (scale.min === previousMin && scale.max === previousMax) break;
  }
}

/**
 * Plan automatic numeric bar centers and cell boundaries together, so
 * category padding cannot leave partial cells after tick thinning.
 */
export function planBarXAxis(
  rawValues: number[],
  xMin: number,
  xMax: number,
  tickCount: number,
): BarXAxisPlan | null {
  const values = Array.from(new Set(rawValues.filter((value) => Number.isFinite(value)))).sort(
    (a, b) => a - b,
  );
  if (values.length < 2 || !(xMax > xMin)) return null;

  let minimumGap = Infinity;
  for (let i = 1; i < values.length; i++) {
    const gap = values[i] - values[i - 1];
    if (gap > 0 && gap < minimumGap) minimumGap = gap;
  }
  if (!Number.isFinite(minimumGap)) return null;

  // Keep the interval readable at the requested density, but never let it
  // be narrower than the closest category spacing. The lower bound avoids
  // introducing multiple ticks inside a single category slot.
  const targetCount = Math.max(3, Math.floor(tickCount));
  const suggested = niceStep(xMin, xMax, targetCount);
  const minimumNice = niceIntervalAtLeast(minimumGap);
  const interval = Math.max(suggested, minimumNice);
  if (!(interval > 0) || !Number.isFinite(interval)) return null;

  const roundingEpsilon = 1e-12;
  let centerMin = Math.floor(xMin / interval + roundingEpsilon) * interval;
  let centerMax = Math.ceil(xMax / interval - roundingEpsilon) * interval;

  // The bar mark sizes each category from its nearest local neighbor. For
  // irregular spacing, the outermost bar can therefore extend beyond a
  // simple half-interval edge. Keep expanding by whole tick intervals until
  // every category slot fits while retaining a regular grid.
  let geometryMin = Infinity;
  let geometryMax = -Infinity;
  for (let i = 0; i < rawValues.length; i++) {
    const value = rawValues[i];
    if (!Number.isFinite(value)) continue;
    const width = categoryWidthFromData((index) => rawValues[index], i, rawValues.length);
    geometryMin = Math.min(geometryMin, value - width * 0.5);
    geometryMax = Math.max(geometryMax, value + width * 0.5);
  }
  if (!Number.isFinite(geometryMin) || !Number.isFinite(geometryMax)) return null;
  const leftGap = (centerMin - interval * 0.5 - geometryMin) / interval;
  const rightGap = (geometryMax - centerMax - interval * 0.5) / interval;
  const leftSteps = leftGap > roundingEpsilon ? Math.ceil(leftGap - roundingEpsilon) : 0;
  const rightSteps = rightGap > roundingEpsilon ? Math.ceil(rightGap - roundingEpsilon) : 0;
  if (
    !Number.isSafeInteger(leftSteps) ||
    !Number.isSafeInteger(rightSteps) ||
    leftSteps > 10_000 ||
    rightSteps > 10_000
  )
    return null;
  centerMin -= leftSteps * interval;
  centerMax += rightSteps * interval;
  if (!Number.isFinite(centerMin) || !Number.isFinite(centerMax)) return null;

  const count = Math.round((centerMax - centerMin) / interval) + 1;
  // A malformed or extremely fine input should fall back to the existing
  // category path instead of allocating an unbounded tick list.
  if (count < 2 || count > 10_000) return null;

  const centers: number[] = [];
  const gridValues: number[] = [];
  const clean = (value: number) => Number(value.toPrecision(15));
  for (let i = 0; i < count; i++) {
    centers.push(clean(centerMin + i * interval));
    gridValues.push(clean(centerMin - interval / 2 + i * interval));
  }
  gridValues.push(clean(centerMax + interval / 2));
  return {
    values: centers,
    gridValues,
    domainMin: gridValues[0],
    domainMax: gridValues[gridValues.length - 1],
  };
}

export function niceIntervalAtLeast(value: number): number {
  if (!(value > 0) || !Number.isFinite(value)) return 0;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const fraction = value / magnitude;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return niceFraction * magnitude;
}

/**
 * Create, keep or drop each axis' scale for the options (`x` and `y` always exist), pin the
 * configured bounds, range the axes, and apply a configured follow window.
 */
export function initAxes(engine: ChartCore): void {
  const axisConfigs = engine.config.axes ?? {};

  // Ensure X and Y axes exist
  if (!axisConfigs.x) {
    axisConfigs.x = { type: 'linear' };
  }
  if (!axisConfigs.y) {
    axisConfigs.y = { type: 'linear' };
  }
  // Write back so layout.ts and axes/render.ts can see all axes
  engine.config.axes = axisConfigs;

  for (const key of Array.from(engine.scales.keys())) {
    if (!axisConfigs[key]) {
      engine.scales.delete(key);
      engine.naturalExtent.delete(key);
      engine.userZoomedAxes.delete(key);
    }
  }

  for (const [key, ac] of Object.entries(axisConfigs)) {
    if (!engine.scales.has(key) || engine.scales.get(key)!.type !== (ac.type ?? 'linear')) {
      const scale = createScale(ac.type ?? 'linear', key, ac.min, ac.max);
      engine.scales.set(key, scale);
    } else {
      const existing = engine.scales.get(key)!;
      if (!engine.userZoomedAxes.has(key)) {
        if (ac.min !== undefined) existing.min = ac.min;
        if (ac.max !== undefined) existing.max = ac.max;
      }
    }
  }

  // One locale and calendar for every scale's labels (plan D7).
  for (const scale of engine.scales.values()) {
    const labelled = scale as { locale?: string; timeZone?: 'local' | 'UTC' };
    labelled.locale = engine.config.locale;
    if (scale.type === 'time') labelled.timeZone = engine.config.timeZone ?? 'local';
  }

  autoRange(engine);
  // A configured follow window overrides full-extent X on first paint and
  // after a config replace, as long as the user has not paused following.
  if (engine.following) applyFollowWindow(engine);
}
