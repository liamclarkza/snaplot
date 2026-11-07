import type { ChartCore } from './Engine';
import type { SeriesSpec, Layout, ThemeConfig } from './spec';
import type { ColumnarSegment } from './data/DataStore';
import type { LineRenderSegment } from './marks/line/draw';
import type { LabelBox } from './axes/labels';

// ─── Debug counters (plan D31) ──────────────────────────────
// Tests and the bench read these through `chart[Symbol.for('snaplot.debug')]`
// on the public handle; they are not part of any public type. Instrumentation
// only: a data pass records O(series) facts, and point counts are computed
// when a snapshot is read, never on the render path.

/** One visible series in the most recent data-layer pass. */
export interface DataPassSeries {
  type: NonNullable<SeriesSpec['type']>;
  /** A point-cloud mark (scatter): in view by X and Y. */
  cloud: boolean;
  xData: Float64Array;
  yData: Float64Array;
  /** Physical index runs handed to the mark, before any sampling. */
  runs: readonly ColumnarSegment[];
  /** The M4-decimated runs a line or area stroked, when decimation ran. */
  decimated?: readonly LineRenderSegment[];
  /** Scatter interaction-sampling stride (1 draws every point). */
  stride: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

/** An axis label as last laid out: the engine's `LabelBox` (axes/labels.ts). */
export type DebugLabelBox = LabelBox;

/** A point-in-time read of the debug counters. Read it again after acting. */
export interface DebugSnapshot {
  /** Full data ingests: the initial sources and every `replaceSources`. Appends do not count. */
  readonly ingestCount: number;
  /** Per-layer paint counts (a vetoed paint does not count). */
  readonly renderCount: { grid: number; data: number; overlay: number };
  /** The three canvas layers, for pixel hashing. */
  readonly layers: {
    grid: HTMLCanvasElement;
    data: HTMLCanvasElement;
    overlay: HTMLCanvasElement;
  };
  /** Points the last data pass drew inside the viewport, after M4 decimation or scatter sampling. */
  readonly drawnPoints: number;
  /** Points inside the viewport in the last data pass (X range; X and Y for scatter). */
  readonly inViewPoints: number;
  /** Times a ring store rebuilt its logical columns (`RingColumnarStore.materialize` cache misses). */
  readonly materializeCount: number;
  /** The plot rectangle in CSS pixels from the canvases' top-left corner (replaces getLayout()). */
  readonly plot: { left: number; top: number; width: number; height: number };
  /** The last layout: the canvas size, the plot and each axis' side and area (replaces getLayout()). */
  readonly layout: Layout;
  /** The resolved theme roles (replaces getTheme()). */
  readonly theme: Readonly<ThemeConfig>;
  /** Axis labels from the last grid paint, in paint order. */
  labelBoxes(): DebugLabelBox[];
  /** Points the last point-cloud hit test examined. */
  hitVisits: number;
  /** Points the last vertical auto-range read. */
  rangeScanPoints: number;
  /** Density binning passes over the data, summed over the density series. */
  densityRebins: number;
  /** Heatmap bitmaps drawn from the data, summed over the heatmap series. */
  heatmapRasters: number;
}

function countDataPass(pass: readonly DataPassSeries[]): { drawn: number; inView: number } {
  let drawn = 0;
  let inView = 0;
  for (const series of pass) {
    const cloud = series.cloud;
    const visible = (x: number, y: number) =>
      x >= series.xMin &&
      x <= series.xMax &&
      Number.isFinite(y) &&
      (!cloud || (y >= series.yMin && y <= series.yMax));
    let seriesInView = 0;
    for (const run of series.runs) {
      for (let i = run.physicalStart; i <= run.physicalEnd; i++) {
        if (visible(series.xData[i], series.yData[i])) seriesInView++;
      }
    }
    inView += seriesInView;
    if (series.decimated) {
      for (const run of series.decimated) {
        for (let i = run.startIdx; i <= run.endIdx; i++) {
          if (visible(run.xData[i], run.yData[i])) drawn++;
        }
      }
    } else if (series.stride > 1) {
      // Mirrors renderScatterSegments: the (fractional) stride restarts at every run.
      for (const run of series.runs) {
        const start = run.physicalStart;
        for (
          let k = 0, i = start;
          i <= run.physicalEnd;
          i = start + Math.floor(++k * series.stride)
        ) {
          if (visible(series.xData[i], series.yData[i])) drawn++;
        }
      }
    } else {
      drawn += seriesInView;
    }
  }
  return { drawn, inView };
}

/** Copies of the last paint's label boxes, so a reader cannot move the engine's. */
function debugLabelBoxes(labels: readonly LabelBox[] | null): DebugLabelBox[] {
  return (labels ?? []).map((label) => ({ ...label }));
}

/**
 * Internal: the D31 debug counters, exposed on the public handle as
 * `chart[Symbol.for('snaplot.debug')]`. Point counts are computed lazily
 * from the last data pass when first read.
 */
export function debugSnapshot(engine: ChartCore): DebugSnapshot {
  const pass = engine.lastDataPass;
  const labels = engine.lastAxisLabels;
  const canvases = engine.canvasManager;
  let counts: { drawn: number; inView: number } | undefined;
  const count = () => (counts ??= countDataPass(pass));
  return Object.freeze({
    ingestCount: engine.debugCounters.ingestCount,
    renderCount: { ...engine.debugCounters.renderCount },
    layers: {
      grid: canvases.gridCanvas,
      data: canvases.dataCanvas,
      overlay: canvases.overlayCanvas,
    },
    get drawnPoints() {
      return count().drawn;
    },
    get inViewPoints() {
      return count().inView;
    },
    materializeCount: engine.debugCounters.materializeCount,
    hitVisits: engine.hitTester.lastVisits,
    rangeScanPoints: engine.debugCounters.rangeScanPoints,
    densityRebins: [...engine.scatterSeriesCaches.values()].reduce((sum, c) => sum + c.rebins, 0),
    heatmapRasters: engine.debugCounters.heatmapRasters,
    plot: Object.freeze({ ...engine.layout.plot }),
    layout: engine.layout,
    theme: Object.freeze({ ...engine.theme }),
    labelBoxes: () => debugLabelBoxes(labels),
  });
}
