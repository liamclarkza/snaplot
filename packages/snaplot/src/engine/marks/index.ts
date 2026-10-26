/**
 * The mark registry (plan §3.1): one `Mark` per series type, and the only place the engine looks
 * at `series.type`. A mark has two halves in its folder: `<type>/draw.ts`, its traits, extent
 * columns, legend fill and drawing (`MarkDraw`, below; M11), and `<type>/hit.ts`, its tooltip
 * rows, click target and hover indicator (`MarkHit`, in `../hit.ts`; M12a). The engine modules
 * ask the registry (`markOf`, `xColumnOf` and the traits) instead of naming types.
 *
 * Also here: the series pass (every visible series through its mark, the highlighted one last,
 * with the interaction pass while the viewport moves: M4 decimation for `'decimate'` marks and a
 * sampling stride for `'sample'` marks) and the legend items.
 *
 * Import rule: the mark folders import only types from this module and from `../hit.ts`, never
 * values, so the registry below is built when this module loads, whichever module imports a mark
 * first. Their shared helpers are leaf modules: `columns.ts`, `bar/geometry.ts`,
 * `scatter/encoding.ts` and `../format.ts`.
 */
import type { ChartCore } from '../Engine';
import type { DataPassSeries } from '../debug';
import type { MarkHit, SlotPlace } from '../hit';
import type { ChartType, LegendItem, Scale, SeriesSpec } from '../spec';
import type { ColumnarSegment, DataStore } from '../data/DataStore';
import {
  DEFAULT_INTERACTION_SAMPLING,
  MIN_TOUCH_INTERACTION_SAMPLING,
  TOUCH_INTERACTION_POINTS_PER_PIXEL,
} from '../../constants';
import { m4 } from '../data/m4';
import { type RenderSegment, seriesYColumn, toRenderSegments } from './columns';
import { normalizeScatterColorBy, normalizeScatterSizeBy } from './scatter/encoding';
import { lineDraw } from './line/draw';
import { lineHit } from './line/hit';
import { areaDraw } from './area/draw';
import { areaHit } from './area/hit';
import { bandDraw } from './band/draw';
import { bandHit } from './band/hit';
import { scatterDraw } from './scatter/draw';
import { scatterHit } from './scatter/hit';
import { barDraw } from './bar/draw';
import { barHit } from './bar/hit';
import { histogramDraw } from './histogram/draw';
import { histogramHit } from './histogram/hit';

/** What the series pass hands a mark to draw one series on the data layer. */
export interface SeriesPass {
  readonly engine: ChartCore;
  readonly ctx: CanvasRenderingContext2D;
  readonly seriesIndex: number;
  readonly series: SeriesSpec;
  readonly store: DataStore;
  /** The series colour: `series.color`, else its palette slot. */
  readonly color: string;
  readonly xScale: Scale;
  readonly yScale: Scale;
  /** The store's physical runs to draw: those in the X viewport, or all for a mark not culled by X. */
  readonly runs: ColumnarSegment[];
  /** The runs over the series' X, Y, colour and size columns; M4-decimated during a gesture. */
  readonly segments: RenderSegment[];
  /** The physical X and Y columns the runs index. */
  readonly xData: Float64Array;
  readonly yData: Float64Array;
  /** Highlight dimming: `highlight.dimOpacity` while another series is highlighted, else 1. */
  readonly opacity: number;
  /** The series' place among the visible slot marks (grouped bars). */
  readonly slot: SlotPlace;
  /** A `'sample'` mark's stride: draw every `stride`-th point (1 draws all). */
  readonly stride: number;
  /** A gesture is moving the viewport (reduced-fidelity drawing is on). */
  readonly interacting: boolean;
}

/** The draw half of a mark (`marks/<type>/draw.ts`; M11): its traits and its drawing. */
export interface MarkDraw {
  /**
   * How the mark sits along X: `'continuous'` (lines, areas, bands, scatter); `'slot'`, one slot
   * per X value that the visible slot series share side by side (bars); `'bin'`, X holds the bin
   * edges (histograms). Slot and bin marks tick X from their data and repaint the grid with it.
   */
  readonly x: 'continuous' | 'slot' | 'bin';
  /** The mark grows from 0, so a linear value axis includes 0 (bars, histograms). */
  readonly zeroBased: boolean;
  /**
   * A point cloud (scatter): X may be its own column; its X domain is padded; it counts as in view
   * by X and Y; the tooltip is its nearest point; a box selection lists its points; a chart of
   * only clouds draws no crosshair.
   */
  readonly cloud: boolean;
  /** What a gesture changes in the drawing: M4 decimation of the runs, a sampling stride, or none. */
  readonly interaction: 'decimate' | 'sample' | 'none';
  /** The store column holding the series' X: 0 (the source's X) unless the mark reads another. */
  xColumn(series: SeriesSpec): number;
  /** Store columns besides `yColumn` that the value axis spans, in order (a band's bounds). */
  extentColumns(series: SeriesSpec): readonly number[];
  /** The legend swatch fill of a series that sets no `fill`: its colour, or null (stroke marks). */
  legendFill(color: string): string | null;
  /** Draws one series. */
  draw(pass: SeriesPass): void;
}

/** A series type's two halves. */
export interface Mark {
  readonly type: ChartType;
  readonly draw: MarkDraw;
  readonly hit: MarkHit;
}

const MARKS: Readonly<Record<ChartType, Mark>> = {
  line: { type: 'line', draw: lineDraw, hit: lineHit },
  area: { type: 'area', draw: areaDraw, hit: areaHit },
  band: { type: 'band', draw: bandDraw, hit: bandHit },
  scatter: { type: 'scatter', draw: scatterDraw, hit: scatterHit },
  bar: { type: 'bar', draw: barDraw, hit: barHit },
  histogram: { type: 'histogram', draw: histogramDraw, hit: histogramHit },
};

/** The mark that draws `series` (a series without a `type` is a line). */
export function markOf(series: SeriesSpec): Mark {
  return MARKS[series.type ?? 'line'];
}

/** The store column of the series' X: 0, the source's X, unless its mark reads another. */
export function xColumnOf(series: SeriesSpec): number {
  return markOf(series).draw.xColumn(series);
}

/** The slot marks' tooltip ranks, ascending: the order a click tests their spans in. */
export const TOOLTIP_RANKS: readonly number[] = [
  ...new Set(Object.values(MARKS).map((mark) => mark.hit.tooltipRank)),
]
  .filter((rank) => rank > 0)
  .sort((a, b) => a - b);

/** The chart's visible slot-mark series (grouped bars), in options order. */
export function visibleSlots(engine: ChartCore): SeriesSpec[] {
  return engine.config.series.filter((s) => s.visible !== false && markOf(s).draw.x === 'slot');
}

/** The series' place among the chart's visible slot marks (`slots`, by default computed here). */
export function slotOf(
  engine: ChartCore,
  series: SeriesSpec,
  slots: readonly SeriesSpec[] = visibleSlots(engine),
): SlotPlace {
  return { index: slots.indexOf(series), count: slots.length };
}

/** The legend's items: one per series, with its mark's swatch fill. */
export function legendItems(engine: ChartCore): LegendItem[] {
  const palette = engine.categoricalPalette();
  return engine.config.series.map((series, seriesIndex) => {
    const type = series.type ?? 'line';
    const color = series.color ?? palette[(series.paletteIndex ?? seriesIndex) % palette.length];
    const configuredFill = typeof series.fill === 'string' ? series.fill : null;
    const fill =
      series.fill === null ? null : (configuredFill ?? markOf(series).draw.legendFill(color));
    return {
      seriesIndex,
      label: series.label,
      type,
      visible: series.visible !== false,
      color,
      fill,
      lineWidth: series.lineWidth ?? 1.5,
      dash: series.dash ? [...series.dash] : [],
      opacity: series.opacity ?? 1,
      meta: series.meta,
    };
  });
}

// ─── The series pass ──────────────────────────────────────────

export function renderAllSeries(engine: ChartCore): void {
  const ctx = engine.canvasManager.dataCtx;
  const palette = engine.categoricalPalette();
  // Reset per data pass; drawOne sets it when a scatter series samples.
  engine.sampledLastDataRender = false;
  const pass: DataPassSeries[] = [];
  engine.lastDataPass = pass;

  // Count slot-mark series for grouped width calculation. This mapping is
  // position-based (which slot a bar occupies in each group), so it must
  // be computed from config order, not affected by the highlight draw-last pass.
  const slotSeries = visibleSlots(engine);
  const slotIdxFor = new Map<number, number>();
  {
    let i = 0;
    for (let si = 0; si < engine.config.series.length; si++) {
      const s = engine.config.series[si];
      if (s.visible !== false && markOf(s).draw.x === 'slot') {
        slotIdxFor.set(si, i++);
      }
    }
  }

  // Resolve highlight dimming once per draw.
  const highlightCfg = engine.config.highlight;
  const highlightedSi = engine.highlightedSeries;
  const highlightActive = highlightedSi !== null && highlightCfg?.enabled !== false;
  const dimOpacity = highlightCfg?.dimOpacity ?? 0.2;

  // Draw order: when a highlight is active, draw every other series first
  // (dimmed), then the highlighted series on top. Otherwise, draw in config
  // order. This prevents the focused line from being visually composited
  // under later dimmed series.
  const drawOne = (si: number) => {
    const store = engine.storeForSeries(si);
    const series = engine.config.series[si];
    if (!series || series.visible === false) return;
    const mark = markOf(series).draw;

    const color = series.color ?? palette[(series.paletteIndex ?? si) % palette.length];
    const xScale = engine.scales.get(series.xAxis ?? 'x')!;
    const yScale = engine.scales.get(series.yAxis ?? 'y')!;
    if (!xScale || !yScale) return;

    const colIdx = seriesYColumn(series);
    if (colIdx < 1 || colIdx > store.seriesCount) return;

    const type = series.type ?? 'line';
    const xColumnIdx = mark.xColumn(series);
    if (!engine.isValidColumn(xColumnIdx, store)) return;
    const canCullByGlobalX = xColumnIdx === 0;
    const [startIdx, endIdx] = canCullByGlobalX
      ? store.getViewportIndices(xScale.min, xScale.max)
      : [0, store.length - 1];
    const segments = store.getSegments(startIdx, endIdx);
    if (segments.length === 0) return;
    const xData = store.getPhysicalColumn(xColumnIdx);
    const yData = store.getPhysicalColumn(colIdx);
    const colorBy = normalizeScatterColorBy(series.colorBy);
    const sizeBy = normalizeScatterSizeBy(series.sizeBy);
    const renderSegments = toRenderSegments(
      segments,
      xData,
      yData,
      colorBy && engine.isValidColumn(colorBy.column, store)
        ? store.getPhysicalColumn(colorBy.column)
        : undefined,
      sizeBy && engine.isValidColumn(sizeBy.column, store)
        ? store.getPhysicalColumn(sizeBy.column)
        : undefined,
    );

    const opacityMul = highlightActive && si !== highlightedSi ? dimOpacity : 1;
    const record: DataPassSeries = {
      type,
      cloud: mark.cloud,
      xData,
      yData,
      runs: segments,
      stride: 1,
      xMin: xScale.min,
      xMax: xScale.max,
      yMin: yScale.min,
      yMax: yScale.max,
    };
    pass.push(record);

    // The interaction pass: while the viewport is in motion, decimate lines and areas (M4) and
    // cap the scatter points drawn this frame; hit-testing and the settled repaint stay
    // full-fidelity.
    let drawn = renderSegments;
    let sampleStride = 1;
    let interacting = false;
    if (mark.interaction === 'decimate') {
      drawn = decimateLineSegments(engine, renderSegments, xScale);
      if (drawn !== renderSegments) record.decimated = drawn;
    } else if (mark.interaction === 'sample') {
      const budget = interactionSamplingBudget(engine, canCullByGlobalX);
      if (budget !== null && interactionActive(engine)) {
        let visible = 0;
        for (const segment of renderSegments) {
          visible += segment.endIdx - segment.startIdx + 1;
        }
        if (visible > budget) {
          sampleStride = visible / budget;
          engine.sampledLastDataRender = true;
        }
      }
      record.stride = sampleStride;
      interacting = interactionActive(engine);
    }

    mark.draw({
      engine,
      ctx,
      seriesIndex: si,
      series,
      store,
      color,
      xScale,
      yScale,
      runs: segments,
      segments: drawn,
      xData,
      yData,
      opacity: opacityMul,
      slot: { index: slotIdxFor.get(si) ?? 0, count: slotSeries.length },
      stride: sampleStride,
      interacting,
    });
  };

  if (highlightActive) {
    for (let si = 0; si < engine.config.series.length; si++) {
      if (si !== highlightedSi) drawOne(si);
    }
    drawOne(highlightedSi!);
  } else {
    for (let si = 0; si < engine.config.series.length; si++) {
      drawOne(si);
    }
  }
}

/**
 * The most scatter points drawn per frame during a gesture, or null when sampling is off.
 * `culledByX`: the series' X is the store's X, so its segments hold the in-view points only.
 */
export function interactionSamplingBudget(engine: ChartCore, culledByX = false): number | null {
  const configured = engine.config.performance?.interactionSampling;
  if (configured === false) return null;
  if (typeof configured === 'number') return configured > 0 ? configured : null;
  // Plan §3.4's budget, max(400, 1.5 × plot width), counts in-view points. A source culled
  // by X (a sorted scatter) is sampled over the view, so it gets that budget for every
  // pointer. A source that is not culled is strided over its whole length, so the mouse
  // and programmatic changes keep 10,000 until M11 counts its in-view points
  // (gap-perf-gate-01:sampling); touch and pen already had the width-scaled budget.
  if (!culledByX && engine.lastPointerType !== 'touch' && engine.lastPointerType !== 'pen')
    return DEFAULT_INTERACTION_SAMPLING;
  return Math.min(
    DEFAULT_INTERACTION_SAMPLING,
    Math.max(
      MIN_TOUCH_INTERACTION_SAMPLING,
      Math.round(engine.layout.plot.width * TOUCH_INTERACTION_POINTS_PER_PIXEL),
    ),
  );
}

/** True while a gesture is moving the viewport and reduced-fidelity drawing is enabled. */
export function interactionActive(engine: ChartCore): boolean {
  return (
    interactionSamplingBudget(engine) !== null && performance.now() < engine.viewportActiveUntil
  );
}

/**
 * During an active viewport gesture, replace line/area render segments with
 * an M4-decimated copy (first/last/min/max per pixel column) so a wide line
 * strokes ~4 points per column instead of every visible sample. M4 is
 * shape-preserving (the vertical envelope is exact) and gap-aware, and the
 * full data repaints on gesture settle. Returns the segments unchanged when
 * decimation is off, the gesture is idle, or the series already fits the
 * pixel budget. Sets sampledLastDataRender so the settle timer refines.
 */
export function decimateLineSegments(
  engine: ChartCore,
  segments: RenderSegment[],
  xScale: Scale,
): RenderSegment[] {
  if (!interactionActive(engine)) return segments;
  const pixelWidth = Math.max(1, Math.round(engine.layout.plot.width));
  const budget = pixelWidth * 4;

  let total = 0;
  for (const s of segments) total += s.endIdx - s.startIdx + 1;
  if (total <= budget) return segments;

  const out: RenderSegment[] = [];
  for (const s of segments) {
    const [dx, dy] = m4(
      s.xData.subarray(s.startIdx, s.endIdx + 1),
      s.yData.subarray(s.startIdx, s.endIdx + 1),
      pixelWidth,
      xScale.min,
      xScale.max,
    );
    if (dx.length === 0) continue;
    out.push({ xData: dx, yData: dy, startIdx: 0, endIdx: dx.length - 1 });
  }
  if (out.length === 0) return segments;
  engine.sampledLastDataRender = true;
  return out;
}
