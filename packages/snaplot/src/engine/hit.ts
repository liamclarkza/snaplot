import type { Scale, SeriesSpec, TooltipPoint } from './spec';
import type { DataStore } from './data/DataStore';
import { MOUSE_HIT_RADIUS, TOUCH_HIT_RADIUS } from '../constants';
import { formatReadout, formatValue, formatX, NO_AXIS_FORMAT, scaleStepDecimals } from './format';
import { seriesYColumn } from './marks/columns';
import { markOf, slotOf, TOOLTIP_RANKS, xColumnOf } from './marks/index';
import { histogramBinIndexForDataX, histogramBinRange } from './marks/histogram/hit';
import {
  createScatterStyleResolver,
  type ScatterStyleResolver,
  scatterResolvers,
  scatterTooltipFields,
  type ScatterPalettes,
} from './marks/scatter/encoding';
import type { ChartCore } from './Engine';

/**
 * Hit-testing for finding nearest data points to cursor position.
 *
 * For sorted time-series data, binary search is O(log n), per spec §2:
 * "uPlot's exceptional cursor performance with 100K+ points relies entirely on this"
 *
 * Proximity is chosen per call based on pointer type: fingers get a larger
 * radius (WCAG 2.5.5 tap-target minimum) than a mouse does.
 */

export type PointerKind = 'mouse' | 'touch' | 'pen';

/**
 * Value formatters from `tooltip.xFormat`/`tooltip.yFormat`. When set they
 * populate TooltipPoint.formattedX/formattedY in place of the axes' tick
 * formatting, covering the common "date header, unit suffix" case without
 * a custom tooltip renderer.
 */
export interface TooltipFormatters {
  x?: (x: number, seriesIndex: number) => string;
  y?: (y: number, seriesIndex: number) => string;
  /**
   * The chart's value readout (plan P9), used for formattedY when `y` is
   * not set. Without it, the readout derives its precision from the Y scale.
   */
  readout?: (y: number, seriesIndex: number) => string;
}

/**
 * formattedY: tooltip.yFormat, else a value readout, never a numeric tick
 * format. A time axis reads as a time, through its tick format until M10.
 */
function formatY(
  formatters: TooltipFormatters | undefined,
  yScale: Scale | undefined,
  value: number,
  seriesIndex: number,
): string {
  if (formatters?.y) return formatters.y(value, seriesIndex);
  if (formatters?.readout) return formatters.readout(value, seriesIndex);
  return scaleReadout(yScale, value);
}

/** A value readout on `scale` without a formatter: a time readout, else value precision (P9). */
function scaleReadout(scale: Scale | undefined, value: number): string {
  if (scale?.type === 'time') {
    const time = scale as Scale & { readoutFormat?: (value: number) => string };
    return time.readoutFormat ? time.readoutFormat(value) : scale.tickFormat(value);
  }
  return formatValue(value, scale ? { stepDecimals: scaleStepDecimals(scale) } : {});
}

export class HitTester {
  /** Optional override, takes precedence over the pointer-type default. */
  private proximityOverride: number | null;
  /**
   * Screen-space lookup grids keyed by series index. One slot per scatter
   * series: a single shared slot made two scatter series evict each other
   * on every pointer move, degrading each move to an O(n) rebuild.
   */
  private scatterGridCaches = new Map<number, ScatterGrid>();

  constructor(proximityThreshold?: number) {
    this.proximityOverride = proximityThreshold ?? null;
  }

  /** Pin a fixed proximity threshold, overriding the pointer-type default. */
  setProximity(px: number | null): void {
    this.proximityOverride = px;
  }

  private proximityFor(pointerType: PointerKind | undefined): number {
    if (this.proximityOverride !== null) return this.proximityOverride;
    return pointerType === 'touch' ? TOUCH_HIT_RADIUS : MOUSE_HIT_RADIUS;
  }

  findNearestIndex(store: DataStore, dataX: number): number {
    return store.nearestXIndex(dataX);
  }

  /**
   * Find tooltip points near the cursor. Returns empty array if nothing is
   * within the active proximity radius, tooltip should be hidden.
   */
  findPoints(
    store: DataStore,
    scales: Map<string, Scale>,
    seriesConfigs: SeriesSpec[],
    pixelX: number,
    pixelY: number,
    mode: 'nearest' | 'index' | 'x',
    palette: string[],
    pointerType?: PointerKind,
    scatterPalettes?: ScatterPalettes,
    dataVersion = 0,
    /**
     * Chart-cached style resolver per series. When omitted, one is built
     * per scatter hit, which re-scans the encoded columns.
     */
    getResolver?: (seriesIndex: number) => ScatterStyleResolver,
    formatters?: TooltipFormatters,
    getStore?: (seriesIndex: number) => DataStore,
  ): TooltipPoint[] {
    const xScale = scales.get('x');
    if (!xScale || (!getStore && store.length === 0)) return [];

    const proximity = this.proximityFor(pointerType);

    if (mode === 'index' || mode === 'x') {
      return this.pointsAtIndex(
        store,
        scales,
        seriesConfigs,
        pixelX,
        mode,
        palette,
        formatters,
        getStore,
      );
    }

    return this.nearestPoint(
      store,
      scales,
      seriesConfigs,
      pixelX,
      pixelY,
      palette,
      proximity,
      scatterPalettes ?? { categorical: palette },
      dataVersion,
      getResolver,
      formatters,
      getStore,
    );
  }

  private pointsAtIndex(
    defaultStore: DataStore,
    scales: Map<string, Scale>,
    seriesConfigs: SeriesSpec[],
    pixelX: number,
    mode: 'index' | 'x',
    palette: string[],
    formatters?: TooltipFormatters,
    getStore?: (seriesIndex: number) => DataStore,
  ): TooltipPoint[] {
    const points: TooltipPoint[] = [];

    for (let si = 0; si < seriesConfigs.length; si++) {
      const store = getStore?.(si) ?? defaultStore;
      if (!store.length) continue;
      const sc = seriesConfigs[si];
      if (sc.visible === false) continue;

      const colIdx = seriesYColumn(sc);
      if (colIdx < 1 || colIdx > store.seriesCount) continue;

      const xScale = scales.get(sc.xAxis ?? 'x');
      if (!xScale) continue;

      const targetX = xScale.pixelToData(pixelX);
      const xColumn = xColumnOf(sc);
      // Index mode answers anywhere along X inside the series' extent, plus half its mean sample
      // spacing at either end (plan §5.5); 'x' answers everywhere.
      if (mode === 'index') {
        const first = store.valueAt(xColumn, 0);
        const last = store.valueAt(xColumn, store.length - 1);
        const lo = Math.min(first, last);
        const hi = Math.max(first, last);
        const half = store.length > 1 ? (hi - lo) / (store.length - 1) / 2 : 0;
        const edge = Math.abs(xScale.pixelToData(pixelX + 1) - targetX);
        if (targetX < lo - half - edge || targetX > hi + half + edge) continue;
      }
      let idx = store.nearestXIndex(targetX);
      if (xColumn !== 0) {
        let closest = Infinity;
        for (let i = 0; i < store.length; i++) {
          const distance = Math.abs(store.valueAt(xColumn, i) - targetX);
          if (distance < closest) {
            closest = distance;
            idx = i;
          }
        }
      }
      const yVal = store.yAt(colIdx - 1, idx);
      if (!Number.isFinite(yVal)) continue;

      const yAxisKey = sc.yAxis ?? 'y';
      const yScale = scales.get(yAxisKey);
      if (yScale && !Number.isFinite(yScale.dataToPixel(yVal))) continue;

      const xVal = store.valueAt(xColumn, idx);

      points.push({
        seriesIndex: si,
        dataIndex: idx,
        label: sc.label,
        x: xVal,
        y: yVal,
        color: sc.color ?? palette[(sc.paletteIndex ?? si) % palette.length],
        formattedX: formatters?.x ? formatters.x(xVal, si) : scaleReadout(xScale, xVal),
        formattedY: formatY(formatters, yScale, yVal, si),
      });
    }

    return points;
  }

  private nearestPoint(
    defaultStore: DataStore,
    scales: Map<string, Scale>,
    seriesConfigs: SeriesSpec[],
    pixelX: number,
    pixelY: number,
    palette: string[],
    proximity: number,
    scatterPalettes: ScatterPalettes,
    dataVersion: number,
    getResolver?: (seriesIndex: number) => ScatterStyleResolver,
    formatters?: TooltipFormatters,
    getStore?: (seriesIndex: number) => DataStore,
  ): TooltipPoint[] {
    // Each series' nearest point; every one as near as the nearest (within a pixel) is listed,
    // so coincident points of several series all show.
    const nearest: Array<{ dist: number; point: TooltipPoint }> = [];

    for (let si = 0; si < seriesConfigs.length; si++) {
      const store = getStore?.(si) ?? defaultStore;
      if (!store.length) continue;
      const sc = seriesConfigs[si];
      if (sc.visible === false) continue;

      if (markOf(sc).draw.cloud) {
        const scatterPoint = this.nearestScatterPoint(
          store,
          scales,
          sc,
          si,
          pixelX,
          pixelY,
          palette[(sc.paletteIndex ?? si) % palette.length],
          proximity,
          scatterPalettes,
          dataVersion,
          getResolver,
          formatters,
        );
        if (scatterPoint) {
          const dist = Math.hypot(scatterPoint.pixelX - pixelX, scatterPoint.pixelY - pixelY);
          nearest.push({ dist, point: scatterPoint.point });
        }
        continue;
      }

      const colIdx = seriesYColumn(sc);
      if (colIdx < 1 || colIdx > store.seriesCount) continue;

      const xScale = scales.get(sc.xAxis ?? 'x');
      if (!xScale) continue;

      const yAxisKey = sc.yAxis ?? 'y';
      const yScale = scales.get(yAxisKey);
      if (!yScale) continue;

      // Search all points within `proximity` pixels on this series' X axis
      // so multi-X-axis charts use the correct data-space window.
      const xDataLeft = xScale.pixelToData(pixelX - proximity);
      const xDataRight = xScale.pixelToData(pixelX + proximity);
      const startIdx = Math.max(0, store.lowerBoundX(xDataLeft));
      const endIdx = Math.min(store.length - 1, store.upperBoundX(xDataRight));

      let best = -1;
      let bestDist = Infinity;
      for (let i = startIdx; i <= endIdx; i++) {
        const yVal = store.yAt(colIdx - 1, i);
        if (!Number.isFinite(yVal)) continue;
        const px = xScale.dataToPixel(store.xAt(i));
        const py = yScale.dataToPixel(yVal);
        if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
        const dist = Math.hypot(px - pixelX, py - pixelY);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      }
      if (best < 0) continue;
      const xVal = store.xAt(best);
      const yVal = store.yAt(colIdx - 1, best);
      nearest.push({
        dist: bestDist,
        point: {
          seriesIndex: si,
          dataIndex: best,
          label: sc.label,
          x: xVal,
          y: yVal,
          color: sc.color ?? palette[(sc.paletteIndex ?? si) % palette.length],
          formattedX: formatters?.x ? formatters.x(xVal, si) : scaleReadout(xScale, xVal),
          formattedY: formatY(formatters, yScale, yVal, si),
        },
      });
    }

    let closest = Infinity;
    for (const candidate of nearest) closest = Math.min(closest, candidate.dist);
    if (closest > proximity) return [];
    return nearest.filter((candidate) => candidate.dist <= closest + 1).map(({ point }) => point);
  }

  private nearestScatterPoint(
    store: DataStore,
    scales: Map<string, Scale>,
    sc: SeriesSpec,
    seriesIndex: number,
    pixelX: number,
    pixelY: number,
    fallbackColor: string,
    proximity: number,
    palettes: ScatterPalettes,
    dataVersion: number,
    getResolver?: (seriesIndex: number) => ScatterStyleResolver,
    formatters?: TooltipFormatters,
  ): { point: TooltipPoint; pixelX: number; pixelY: number } | null {
    const xScale = scales.get(sc.xAxis ?? 'x');
    const yScale = scales.get(sc.yAxis ?? 'y');
    if (!xScale || !yScale) return null;

    const yCol = seriesYColumn(sc);
    const xCol = xColumnOf(sc);
    if (xCol < 0 || xCol > store.seriesCount || yCol < 1 || yCol > store.seriesCount) return null;

    const grid = this.getScatterGrid(store, sc, seriesIndex, xScale, yScale, dataVersion);
    const { bestIdx, bestDist } = nearestInGrid(grid, pixelX, pixelY, proximity);
    this.lastVisits = grid.visits;

    if (bestIdx < 0 || bestDist > proximity) return null;

    const xVal = store.valueAt(xCol, bestIdx);
    const yVal = store.valueAt(yCol, bestIdx);
    const style = getResolver
      ? getResolver(seriesIndex)
      : createScatterStyleResolver({
          series: sc,
          fallbackColor,
          fallbackRadius: sc.pointRadius ?? (store.length > 10_000 ? 1.5 : 3),
          palettes,
          columnCount: store.seriesCount + 1,
          ranges: [{ startIdx: 0, endIdx: store.length - 1 }],
          valueAt: (columnIdx, index) => store.valueAt(columnIdx, index),
        });

    return {
      pixelX: grid.pixelX[bestIdx],
      pixelY: grid.pixelY[bestIdx],
      point: {
        seriesIndex,
        dataIndex: bestIdx,
        label: sc.label,
        x: xVal,
        y: yVal,
        color: style.colorAt(bestIdx),
        radius: style.radiusAt(bestIdx),
        formattedX: formatters?.x ? formatters.x(xVal, seriesIndex) : scaleReadout(xScale, xVal),
        formattedY: formatY(formatters, yScale, yVal, seriesIndex),
        fields: scatterTooltipFields(sc, bestIdx, store.seriesCount + 1, (columnIdx, index) =>
          store.valueAt(columnIdx, index),
        ),
        xName: sc.xName,
        yName: sc.yName,
      },
    };
  }

  /**
   * The screen-space grid of a point cloud (cached per series until the data, the scales or the
   * plot change): every visible point's pixel position, bucketed by cell in flat typed arrays
   * (counting sort), so a hover visits a few cells' points (gap-perf-gate-01:hover).
   */
  private getScatterGrid(
    store: DataStore,
    sc: SeriesSpec,
    seriesIndex: number,
    xScale: Scale,
    yScale: Scale,
    dataVersion: number,
  ): ScatterGrid {
    const xCol = xColumnOf(sc);
    const yCol = seriesYColumn(sc);
    const x0 = Math.min(xScale.dataToPixel(xScale.min), xScale.dataToPixel(xScale.max));
    const x1 = Math.max(xScale.dataToPixel(xScale.min), xScale.dataToPixel(xScale.max));
    const y0 = Math.min(yScale.dataToPixel(yScale.min), yScale.dataToPixel(yScale.max));
    const y1 = Math.max(yScale.dataToPixel(yScale.min), yScale.dataToPixel(yScale.max));
    const key = [dataVersion, xCol, yCol, store.length, xScale.min, xScale.max, x0, x1]
      .concat([yScale.min, yScale.max, y0, y1])
      .join('|');

    const cached = this.scatterGridCaches.get(seriesIndex);
    if (cached?.store === store && cached.key === key) return cached;

    // About one point per cell: a few points per searched cell, and as many cells as points.
    const cellSize = Math.min(
      16,
      Math.max(1, Math.sqrt(((x1 - x0 + 1) * (y1 - y0 + 1)) / Math.max(1, store.length))),
    );
    const columns = Math.max(1, Math.ceil((x1 - x0 + 1) / cellSize));
    const rows = Math.max(1, Math.ceil((y1 - y0 + 1) / cellSize));
    const pixelX = new Float64Array(store.length);
    const pixelY = new Float64Array(store.length);
    const cellOf = new Int32Array(store.length);
    const start = new Int32Array(columns * rows + 1);
    for (let i = 0; i < store.length; i++) {
      const px = xScale.dataToPixel(store.valueAt(xCol, i));
      const py = yScale.dataToPixel(store.valueAt(yCol, i));
      pixelX[i] = px;
      pixelY[i] = py;
      // Only points on the plot can be under the pointer.
      if (!(px >= x0 && px <= x1 + 1 && py >= y0 && py <= y1 + 1)) {
        cellOf[i] = -1;
        continue;
      }
      const cell =
        Math.min(rows - 1, Math.floor((py - y0) / cellSize)) * columns +
        Math.min(columns - 1, Math.floor((px - x0) / cellSize));
      cellOf[i] = cell;
      start[cell + 1]++;
    }
    for (let c = 0; c < columns * rows; c++) start[c + 1] += start[c];
    const fill = start.slice(0, columns * rows);
    const points = new Int32Array(start[columns * rows]);
    for (let i = 0; i < store.length; i++) if (cellOf[i] >= 0) points[fill[cellOf[i]]++] = i;

    const entry: ScatterGrid = {
      store,
      key,
      x0,
      y0,
      cellSize,
      columns,
      rows,
      start,
      points,
      pixelX,
      pixelY,
      visits: 0,
    };
    this.scatterGridCaches.set(seriesIndex, entry);
    return entry;
  }

  /** Points the last point-cloud hit examined (the debug hook's `hitVisits`). */
  lastVisits = 0;
}

interface ScatterGrid {
  store: DataStore;
  key: string;
  /** The plot's top-left pixel, the grid's origin, the side of a cell, and its size in cells. */
  x0: number;
  y0: number;
  cellSize: number;
  columns: number;
  rows: number;
  /** Cell c holds `points[start[c] .. start[c + 1])`. */
  start: Int32Array;
  points: Int32Array;
  pixelX: Float64Array;
  pixelY: Float64Array;
  /** Points the last search examined. */
  visits: number;
}

/**
 * The point nearest (px, py) within `radius`: cells in rings outward from the pointer's, stopping
 * once a ring can hold nothing nearer than the best so far.
 */
function nearestInGrid(
  grid: ScatterGrid,
  px: number,
  py: number,
  radius: number,
): { bestIdx: number; bestDist: number } {
  const cell = grid.cellSize;
  const cx = Math.floor((px - grid.x0) / cell);
  const cy = Math.floor((py - grid.y0) / cell);
  const rings = Math.ceil(radius / cell) + 1;
  let bestIdx = -1;
  let bestDist = Infinity;
  let visits = 0;
  const visit = (gx: number, gy: number) => {
    if (gx < 0 || gy < 0 || gx >= grid.columns || gy >= grid.rows) return;
    const cell = gy * grid.columns + gx;
    for (let k = grid.start[cell]; k < grid.start[cell + 1]; k++) {
      const i = grid.points[k];
      visits++;
      const dist = Math.hypot(grid.pixelX[i] - px, grid.pixelY[i] - py);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
  };
  for (let r = 0; r <= rings; r++) {
    // Every point of ring r is at least (r - 1) cells away.
    if (bestDist <= (r - 1) * cell) break;
    if (r === 0) visit(cx, cy);
    for (let d = -r; d <= r && r > 0; d++) {
      visit(cx + d, cy - r);
      visit(cx + d, cy + r);
      if (d !== -r && d !== r) {
        visit(cx - r, cy + d);
        visit(cx + r, cy + d);
      }
    }
  }
  grid.visits = visits;
  return { bestIdx, bestDist };
}

// ─── The mark hit contract ────────────────────────────────────
// What each mark's hit half (`marks/<type>/hit.ts`) answers; the registry (`marks/index.ts`)
// pairs it with the mark's draw half.

/** Where a series sits among the chart's visible slot marks (grouped bars): its index and their count. */
export interface SlotPlace {
  /** The series' position among them in options order, or -1 when it is not one of them. */
  readonly index: number;
  readonly count: number;
}

/** What the overlay pass hands a mark to draw the hover indicator of one tooltip point. */
export interface IndicatorPass {
  readonly engine: ChartCore;
  readonly ctx: CanvasRenderingContext2D;
  readonly point: TooltipPoint;
  readonly series: SeriesSpec;
  readonly store: DataStore;
  readonly xScale: Scale;
  readonly yScale: Scale;
  /** The white halo's strength for the surface: 0.15 on dark backgrounds, else 0.08. */
  readonly ringAlpha: number;
  /** The chart background reads as dark. */
  readonly isDark: boolean;
  readonly slot: SlotPlace;
}

/** The hit half of a mark (`marks/<type>/hit.ts`; M12a). */
export interface MarkHit {
  /**
   * 0: the mark's rows come from the shared hit test (the HitTester: lines, areas, bands and
   * scatter). Above 0, a slot mark: while a visible series has a slot mark, the tooltip shows only
   * the rows of the highest rank among them (histogram 2, bar 1), from `slotPoint`, and a click
   * tests the slot marks' spans (ranks in ascending order) before the nearest point.
   */
  readonly tooltipRank: number;
  /** The tooltip row of series `seriesIndex` at the cursor's X, or null (slot marks). */
  slotPoint?(engine: ChartCore, seriesIndex: number): TooltipPoint | null;
  /** The pixel span along X of a slot point's bar or bin, for a click (slot marks). */
  slotSpan?(
    engine: ChartCore,
    point: TooltipPoint,
    xScale: Scale,
    slot: SlotPlace,
  ): readonly [number, number];
  /** Draws the hover indicator of one tooltip point on the overlay. */
  indicator(pass: IndicatorPass): void;
}

// ─── The chart's hit pipeline ─────────────────────────────────
// The tooltip points under the cursor (the HitTester for lines, areas, bands and scatter; the slot
// marks' own rows for bars and histograms), the point a click lands on, and the histogram bin
// under a data X.

/**
 * The HitTester's formatters: the tooltip's X and value readouts through engine/format.ts, with
 * today's tooltip quirk (no axis format; M10 removes it).
 */
export function tooltipReadouts(engine: ChartCore): TooltipFormatters {
  return {
    x: (x, si) => formatX(engine, x, engine.config.series[si]?.xAxis ?? 'x', NO_AXIS_FORMAT),
    y: (y, si) => formatReadout(engine, si, y, NO_AXIS_FORMAT),
  };
}

/** The highest tooltip rank among the visible series' marks (0 when none is a slot mark). */
export function leadingTooltipRank(engine: ChartCore): number {
  let rank = 0;
  for (const series of engine.config.series) {
    if (series.visible !== false) rank = Math.max(rank, markOf(series).hit.tooltipRank);
  }
  return rank;
}

/** The rows the slot marks of `rank` give at the cursor's X, in series order. */
export function slotTooltipPoints(engine: ChartCore, rank: number): TooltipPoint[] {
  const points: TooltipPoint[] = [];
  if (engine.cursorX === null || !engine.hasData()) return points;
  for (let si = 0; si < engine.config.series.length; si++) {
    const hit = markOf(engine.config.series[si]).hit;
    if (hit.tooltipRank !== rank || !hit.slotPoint) continue;
    const point = hit.slotPoint(engine, si);
    if (point) points.push(point);
  }
  return points;
}

export function updateTooltipPoints(engine: ChartCore): void {
  if (!engine.hasData() || engine.cursorX === null || engine.cursorY === null) {
    engine.tooltipPoints = [];
    return;
  }

  // Slot marks (bars, histograms) answer from their geometry; the shared HitTester answers for
  // lines, areas, bands and scatter. When slot marks lead, the other marks still join: lines at
  // the cursor's X, and the scatter point under the pointer.
  const rank = leadingTooltipRank(engine);
  if (rank > 0) {
    const slots = slotTooltipPoints(engine, rank);
    const series = engine.config.series;
    const isSlot = (s: SeriesSpec) => markOf(s).hit.tooltipRank === rank;
    const lines = hitPoints(engine, 'x', (s) => !isSlot(s) && !markOf(s).draw.cloud);
    const clouds = hitPoints(engine, 'nearest', (s) => !isSlot(s) && markOf(s).draw.cloud);
    engine.tooltipPoints =
      series.length === slots.length
        ? slots
        : [...slots, ...lines, ...clouds].sort((a, b) => a.seriesIndex - b.seriesIndex);
  } else {
    const mode = engine.config.tooltip?.mode ?? 'index';
    // A point cloud answers with the point nearest the pointer, never the nearest X: in a dense
    // cloud the nearest X is rarely the point the reader is on.
    engine.tooltipPoints =
      mode === 'nearest'
        ? hitPoints(engine, 'nearest')
        : [
            ...hitPoints(engine, mode, (s) => !markOf(s).draw.cloud),
            ...hitPoints(engine, 'nearest', (s) => markOf(s).draw.cloud),
          ].sort((a, b) => a.seriesIndex - b.seriesIndex);
  }
}

/**
 * The HitTester's points for the series `include` keeps (all by default). `nearest` hits the
 * pointer; `index` the cursor's X near a series; `x` every series at the cursor's X.
 */
function hitPoints(
  engine: ChartCore,
  mode: 'nearest' | 'index' | 'x',
  include?: (series: SeriesSpec) => boolean,
): TooltipPoint[] {
  const hitX = mode === 'nearest' && engine.mouseX !== null ? engine.mouseX : engine.cursorX!;
  const hitY = mode === 'nearest' && engine.mouseY !== null ? engine.mouseY : engine.cursorY!;
  const palette = engine.categoricalPalette();
  const series = include
    ? engine.config.series.map((s) => (include(s) ? s : { ...s, visible: false }))
    : engine.config.series;
  if (include && series.every((s) => s.visible === false)) return [];
  return engine.hitTester.findPoints(
    engine.sourceStores[0],
    engine.scales,
    series,
    hitX,
    hitY,
    mode,
    palette,
    engine.lastPointerType,
    engine.scatterPalettes(),
    engine.dataVersion,
    (si) => {
      const s = engine.config.series[si];
      const fallback = s.color ?? palette[(s.paletteIndex ?? si) % palette.length];
      return scatterResolvers(engine, si, s, fallback).logicalResolver;
    },
    tooltipReadouts(engine),
    (si) => engine.storeForSeries(si),
  );
}

export function emitPointClick(engine: ChartCore, pixelX: number, pixelY: number): void {
  const palette = engine.categoricalPalette();
  const pointSeries = engine.config.series.map((series) =>
    markOf(series).hit.tooltipRank > 0 ? { ...series, visible: false } : series,
  );
  const points = engine.hitTester.findPoints(
    engine.sourceStores[0],
    engine.scales,
    pointSeries,
    pixelX,
    pixelY,
    'nearest',
    palette,
    engine.lastPointerType,
    engine.scatterPalettes(),
    engine.dataVersion,
    (si) =>
      scatterResolvers(
        engine,
        si,
        engine.config.series[si],
        palette[(engine.config.series[si]?.paletteIndex ?? si) % palette.length],
      ).logicalResolver,
    // The tooltip's readout, so a clicked point reads like its tooltip.
    tooltipReadouts(engine),
    (si) => engine.storeForSeries(si),
  );
  // A click inside a bar or bin wins over the nearest point; the last slot hit wins.
  for (const rank of TOOLTIP_RANKS) {
    for (const point of slotTooltipPoints(engine, rank)) {
      const series = engine.config.series[point.seriesIndex];
      const hit = markOf(series).hit;
      const xScale = engine.scales.get(series.xAxis ?? 'x');
      const yScale = engine.scales.get(series.yAxis ?? 'y');
      if (!xScale || !yScale || !hit.slotSpan || !Number.isFinite(point.y)) continue;
      const top = yScale.dataToPixel(point.y);
      const base = yScale.dataToPixel(yScale.type === 'log' ? yScale.min : 0);
      if (pixelY < Math.min(top, base) || pixelY > Math.max(top, base)) continue;
      const [left, right] = hit.slotSpan(engine, point, xScale, slotOf(engine, series));
      if (pixelX >= Math.min(left, right) && pixelX <= Math.max(left, right)) points.unshift(point);
    }
  }
  const point = points[0];
  if (point) engine.emitEvent('point:click', point);
}

/** Every visible series is a histogram (bins on X), in a chart with one source. */
export function hasOnlyVisibleHistograms(engine: ChartCore): boolean {
  if (engine.sourceStores.length > 1) return false;
  let hasVisibleSeries = false;
  for (const series of engine.config.series) {
    if (series.visible === false) continue;
    hasVisibleSeries = true;
    if (markOf(series).draw.x !== 'bin') return false;
  }
  return hasVisibleSeries;
}

/** The histogram bin under `dataX` (only-histogram charts, which have one source). */
export function resolveHistogramCursor(
  engine: ChartCore,
  dataX: number,
): { dataIndex: number; dataX: number } | null {
  const store = engine.sourceStores[0];
  const dataIndex = histogramBinIndexForDataX(dataX, store);
  if (dataIndex === null) return null;

  const range = histogramBinRange(dataIndex, store);
  if (!range) return null;
  return {
    dataIndex,
    dataX: (range.min + range.max) / 2,
  };
}
