import type { Scale, SeriesSpec, TooltipPoint } from './spec';
import type { DataStore } from './data/DataStore';
import { MOUSE_HIT_RADIUS, TOUCH_HIT_RADIUS } from '../constants';
import { formatValue, scaleStepDecimals, tooltipFormatters } from './format';
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
  x?: (x: number) => string;
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
  if (yScale?.type === 'time') return yScale.tickFormat(value);
  return formatValue(value, yScale ? { stepDecimals: scaleStepDecimals(yScale) } : {});
}

export class HitTester {
  /** Optional override, takes precedence over the pointer-type default. */
  private proximityOverride: number | null;
  /**
   * Screen-space lookup grids keyed by series index. One slot per scatter
   * series: a single shared slot made two scatter series evict each other
   * on every pointer move, degrading each move to an O(n) rebuild.
   */
  private scatterGridCaches = new Map<number, ScatterGridCache>();

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
        pixelY,
        palette,
        proximity,
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
    pixelY: number,
    palette: string[],
    proximity: number,
    formatters?: TooltipFormatters,
    getStore?: (seriesIndex: number) => DataStore,
  ): TooltipPoint[] {
    const points: TooltipPoint[] = [];

    // Check proximity: cursor must be close to at least one series line (Y distance)
    let closestYDist = Infinity;

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
      if (yScale) {
        const py = yScale.dataToPixel(yVal);
        if (!Number.isFinite(py)) continue;
        closestYDist = Math.min(closestYDist, Math.abs(py - pixelY));
      }

      const xVal = store.valueAt(xColumn, idx);

      points.push({
        seriesIndex: si,
        dataIndex: idx,
        label: sc.label,
        x: xVal,
        y: yVal,
        color: sc.color ?? palette[(sc.paletteIndex ?? si) % palette.length],
        formattedX: formatters?.x ? formatters.x(xVal) : xScale.tickFormat(xVal),
        formattedY: formatY(formatters, yScale, yVal, si),
      });
    }

    // Only show tooltip if cursor is near a series line
    if (closestYDist > proximity) return [];

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
    let bestDist = Infinity;
    let bestPoint: TooltipPoint | null = null;

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
          const dist = (scatterPoint.pixelX - pixelX) ** 2 + (scatterPoint.pixelY - pixelY) ** 2;
          if (dist < bestDist) {
            bestDist = dist;
            bestPoint = scatterPoint.point;
          }
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

      for (let i = startIdx; i <= endIdx; i++) {
        const yVal = store.yAt(colIdx - 1, i);
        if (!Number.isFinite(yVal)) continue;

        const xVal = store.xAt(i);
        const px = xScale.dataToPixel(xVal);
        const py = yScale.dataToPixel(yVal);
        if (!Number.isFinite(px) || !Number.isFinite(py)) continue;

        const dist = (px - pixelX) ** 2 + (py - pixelY) ** 2;
        if (dist < bestDist) {
          bestDist = dist;
          bestPoint = {
            seriesIndex: si,
            dataIndex: i,
            label: sc.label,
            x: xVal,
            y: yVal,
            color: sc.color ?? palette[(sc.paletteIndex ?? si) % palette.length],
            formattedX: formatters?.x ? formatters.x(xVal) : xScale.tickFormat(xVal),
            formattedY: formatY(formatters, yScale, yVal, si),
          };
        }
      }
    }

    // Only return if within proximity threshold
    if (bestPoint && Math.sqrt(bestDist) <= proximity) {
      return [bestPoint];
    }
    return [];
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

    const grid = this.getScatterGrid(
      store,
      sc,
      seriesIndex,
      xScale,
      yScale,
      proximity,
      dataVersion,
    );
    const cx = Math.floor(pixelX / proximity);
    const cy = Math.floor(pixelY / proximity);
    let bestIdx: number | null = null;
    let bestDist = Infinity;

    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        const indices = grid.cells.get(gx * CELL_STRIDE + gy);
        if (!indices) continue;
        for (const idx of indices) {
          const px = grid.pixelX[idx];
          const py = grid.pixelY[idx];
          const dist = (px - pixelX) ** 2 + (py - pixelY) ** 2;
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = idx;
          }
        }
      }
    }

    if (bestIdx === null || Math.sqrt(bestDist) > proximity) return null;

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
        formattedX: formatters?.x ? formatters.x(xVal) : xScale.tickFormat(xVal),
        formattedY: formatY(formatters, yScale, yVal, seriesIndex),
        fields: scatterTooltipFields(sc, bestIdx, store.seriesCount + 1, (columnIdx, index) =>
          store.valueAt(columnIdx, index),
        ),
      },
    };
  }

  private getScatterGrid(
    store: DataStore,
    sc: SeriesSpec,
    seriesIndex: number,
    xScale: Scale,
    yScale: Scale,
    cellSize: number,
    dataVersion: number,
  ): ScatterGridCache {
    const xCol = xColumnOf(sc);
    const yCol = seriesYColumn(sc);
    const key = [
      dataVersion,
      seriesIndex,
      xCol,
      yCol,
      store.length,
      xScale.min,
      xScale.max,
      xScale.dataToPixel(xScale.min),
      xScale.dataToPixel(xScale.max),
      yScale.min,
      yScale.max,
      yScale.dataToPixel(yScale.min),
      yScale.dataToPixel(yScale.max),
      cellSize,
    ].join('|');

    const cached = this.scatterGridCaches.get(seriesIndex);
    if (cached?.store === store && cached.key === key) {
      return cached;
    }

    const cells = new Map<number, number[]>();
    const pixelX = new Float64Array(store.length);
    const pixelY = new Float64Array(store.length);

    for (let i = 0; i < store.length; i++) {
      const x = store.valueAt(xCol, i);
      const y = store.valueAt(yCol, i);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        pixelX[i] = Number.NaN;
        pixelY[i] = Number.NaN;
        continue;
      }
      const px = xScale.dataToPixel(x);
      const py = yScale.dataToPixel(y);
      pixelX[i] = px;
      pixelY[i] = py;
      const cellKey = Math.floor(px / cellSize) * CELL_STRIDE + Math.floor(py / cellSize);
      let bucket = cells.get(cellKey);
      if (!bucket) {
        bucket = [];
        cells.set(cellKey, bucket);
      }
      bucket.push(i);
    }

    const entry: ScatterGridCache = { store, key, cells, pixelX, pixelY };
    this.scatterGridCaches.set(seriesIndex, entry);
    return entry;
  }
}

/**
 * Packs (gx, gy) cell coordinates into one integer Map key, avoiding a
 * string allocation per point on rebuild and per neighbor cell on query.
 * Cell coordinates are pixel positions divided by the hit radius, so their
 * magnitude stays far below the stride.
 */
const CELL_STRIDE = 1 << 20;

interface ScatterGridCache {
  store: DataStore;
  key: string;
  cells: Map<number, number[]>;
  pixelX: Float64Array;
  pixelY: Float64Array;
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
  // lines, areas, bands and scatter.
  const rank = leadingTooltipRank(engine);
  if (rank > 0) {
    engine.tooltipPoints = slotTooltipPoints(engine, rank);
  } else {
    const mode = engine.config.tooltip?.mode ?? 'index';
    const hitX = mode === 'nearest' && engine.mouseX !== null ? engine.mouseX : engine.cursorX;
    const hitY = mode === 'nearest' && engine.mouseY !== null ? engine.mouseY : engine.cursorY;
    const palette = engine.categoricalPalette();
    engine.tooltipPoints = engine.hitTester.findPoints(
      engine.sourceStores[0],
      engine.scales,
      engine.config.series,
      hitX,
      hitY,
      mode,
      palette,
      engine.lastPointerType,
      engine.scatterPalettes(),
      engine.dataVersion,
      (si) => {
        const series = engine.config.series[si];
        const fallback = series.color ?? palette[(series.paletteIndex ?? si) % palette.length];
        return scatterResolvers(engine, si, series, fallback).logicalResolver;
      },
      { ...tooltipFormatters(engine), readout: engine.readoutY },
      (si) => engine.storeForSeries(si),
    );
  }
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
    { ...tooltipFormatters(engine), readout: engine.readoutY },
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
