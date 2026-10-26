/**
 * The series pass: every visible series drawn through its mark, the highlighted one last, with
 * the interaction pass while the viewport moves (M4 decimation for lines and areas, a sampling
 * stride for scatter) and the cached scatter style resolvers.
 */
import type { ChartCore } from '../Engine';
import type { DataPassSeries } from '../debug';
import {
  seriesYColumn,
  scatterXColumn,
  normalizeScatterColorBy,
  normalizeScatterSizeBy,
  buildScatterEncodingState,
  resolverFromEncodingState,
} from './scatterEncoding';
import {
  renderLineSegments,
  renderAreaSegments,
  renderBandSegments,
  type LineRenderSegment,
} from './line';
import { ScatterSeriesCache, renderScatterSegments } from './scatter';
import { renderBarsSegments } from './bar';
import { renderHistogramSegments } from './histogram';
import type { ColumnarSegment } from '../data/DataStore';
import {
  DEFAULT_INTERACTION_SAMPLING,
  MIN_TOUCH_INTERACTION_SAMPLING,
  TOUCH_INTERACTION_POINTS_PER_PIXEL,
} from '../../constants';
import type { Scale, SeriesSpec } from '../spec';
import { m4 } from '../data/m4';

export function renderAllSeries(engine: ChartCore): void {
  const ctx = engine.canvasManager.dataCtx;
  const palette = engine.categoricalPalette();
  // Reset per data pass; drawOne sets it when a scatter series samples.
  engine.sampledLastDataRender = false;
  const pass: DataPassSeries[] = [];
  engine.lastDataPass = pass;

  // Count bar-type series for grouped width calculation. This mapping is
  // position-based (which slot a bar occupies in each group), so it must
  // be computed from config order, not affected by the highlight draw-last pass.
  const barSeries = engine.config.series.filter((s) => s.visible !== false && s.type === 'bar');
  const barIdxFor = new Map<number, number>();
  {
    let i = 0;
    for (let si = 0; si < engine.config.series.length; si++) {
      const s = engine.config.series[si];
      if (s.visible !== false && s.type === 'bar') {
        barIdxFor.set(si, i++);
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

    const color = series.color ?? palette[(series.paletteIndex ?? si) % palette.length];
    const xScale = engine.scales.get(series.xAxis ?? 'x')!;
    const yScale = engine.scales.get(series.yAxis ?? 'y')!;
    if (!xScale || !yScale) return;

    const colIdx = seriesYColumn(series);
    if (colIdx < 1 || colIdx > store.seriesCount) return;

    const type = series.type ?? 'line';
    const xColumnIdx = type === 'scatter' ? scatterXColumn(series) : 0;
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
    const renderSeries =
      type === 'scatter' && series.heatmap && !series.heatmapGradient
        ? { ...series, heatmapGradient: heatmapGradient(engine) }
        : series;

    const opacityMul = highlightActive && si !== highlightedSi ? dimOpacity : 1;
    const record: DataPassSeries = {
      type,
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

    switch (type) {
      case 'line': {
        const drawn = decimateLineSegments(engine, renderSegments, xScale);
        if (drawn !== renderSegments) record.decimated = drawn;
        renderLineSegments(
          ctx,
          drawn,
          xScale,
          yScale,
          engine.layout,
          renderSeries,
          color,
          opacityMul,
        );
        break;
      }
      case 'area': {
        const drawn = decimateLineSegments(engine, renderSegments, xScale);
        if (drawn !== renderSegments) record.decimated = drawn;
        renderAreaSegments(
          ctx,
          drawn,
          xScale,
          yScale,
          engine.layout,
          renderSeries,
          color,
          opacityMul,
        );
        break;
      }
      case 'band': {
        const upperIdx = series.upperColumn;
        const lowerIdx = series.lowerColumn;
        if (
          upperIdx != null &&
          lowerIdx != null &&
          upperIdx >= 1 &&
          lowerIdx >= 1 &&
          upperIdx <= store.seriesCount &&
          lowerIdx <= store.seriesCount
        ) {
          const upperYData = store.getPhysicalColumn(upperIdx);
          const lowerYData = store.getPhysicalColumn(lowerIdx);
          renderBandSegments(
            ctx,
            bandRenderSegments(segments, xData, yData, upperYData, lowerYData),
            xScale,
            yScale,
            engine.layout,
            renderSeries,
            color,
            opacityMul,
          );
        }
        break;
      }
      case 'scatter': {
        let cache = engine.scatterSeriesCaches.get(si);
        if (!cache) {
          cache = new ScatterSeriesCache();
          engine.scatterSeriesCaches.set(si, cache);
        }
        // Interaction pass: while the viewport is in motion, cap the
        // points drawn this frame; hit-testing and the settled repaint
        // stay full-fidelity.
        let sampleStride = 1;
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
        renderScatterSegments(
          ctx,
          renderSegments,
          xScale,
          yScale,
          engine.layout,
          renderSeries,
          color,
          opacityMul,
          engine.scatterPalettes(),
          cache,
          scatterResolvers(engine, si, series, color).renderResolver,
          sampleStride,
          interactionActive(engine),
        );
        break;
      }
      case 'bar':
        renderBarsSegments(
          ctx,
          renderSegments,
          xScale,
          yScale,
          engine.layout,
          renderSeries,
          color,
          barIdxFor.get(si) ?? 0,
          barSeries.length,
          opacityMul,
        );
        break;
      case 'histogram':
        renderHistogramSegments(
          ctx,
          renderSegments,
          xScale,
          yScale,
          engine.layout,
          renderSeries,
          color,
          opacityMul,
        );
        break;
    }
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

export function toRenderSegments(
  segments: ColumnarSegment[],
  xData: Float64Array,
  yData: Float64Array,
  colorData?: Float64Array,
  sizeData?: Float64Array,
) {
  return segments.map((segment) => ({
    xData,
    yData,
    colorData,
    sizeData,
    startIdx: segment.physicalStart,
    endIdx: segment.physicalEnd,
    // Ring stores wrap: per-datum callbacks (bar fill) receive logical
    // indices, so carry the logical origin of each physical run.
    logicalStartIdx: segment.logicalStart,
  }));
}

export function bandRenderSegments(
  segments: ColumnarSegment[],
  xData: Float64Array,
  centerYData: Float64Array,
  upperYData: Float64Array,
  lowerYData: Float64Array,
) {
  return segments.map((segment) => ({
    xData,
    centerYData,
    upperYData,
    lowerYData,
    startIdx: segment.physicalStart,
    endIdx: segment.physicalEnd,
  }));
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
  segments: LineRenderSegment[],
  xScale: Scale,
): LineRenderSegment[] {
  if (!interactionActive(engine)) return segments;
  const pixelWidth = Math.max(1, Math.round(engine.layout.plot.width));
  const budget = pixelWidth * 4;

  let total = 0;
  for (const s of segments) total += s.endIdx - s.startIdx + 1;
  if (total <= budget) return segments;

  const out: LineRenderSegment[] = [];
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

export function scatterResolvers(
  engine: ChartCore,
  si: number,
  series: SeriesSpec,
  fallbackColor: string,
) {
  const store = engine.storeForSeries(si);
  const cached = engine.scatterEncodingCache.get(si);
  if (
    cached &&
    cached.series === series &&
    cached.theme === engine.theme &&
    cached.version === engine.dataVersion
  ) {
    return cached;
  }

  const logicalValueAt = (columnIdx: number, index: number) => store.valueAt(columnIdx, index);
  const state = buildScatterEncodingState({
    series,
    fallbackColor,
    fallbackRadius: series.pointRadius ?? (store.length > 10_000 ? 1.5 : 3),
    palettes: engine.scatterPalettes(),
    columnCount: store.seriesCount + 1,
    ranges: [{ startIdx: 0, endIdx: store.length - 1 }],
    valueAt: logicalValueAt,
  });

  const physicalColumns = new Map<number, Float64Array>();
  const physicalValueAt = (columnIdx: number, index: number) => {
    let column = physicalColumns.get(columnIdx);
    if (!column) {
      column = store.getPhysicalColumn(columnIdx);
      physicalColumns.set(columnIdx, column);
    }
    return column[index] ?? Number.NaN;
  };

  const entry = {
    series,
    theme: engine.theme,
    version: engine.dataVersion,
    renderResolver: resolverFromEncodingState(state, physicalValueAt),
    logicalResolver: resolverFromEncodingState(state, logicalValueAt),
  };
  engine.scatterEncodingCache.set(si, entry);
  return entry;
}

export function heatmapGradient(engine: ChartCore): string[] | undefined {
  return engine.theme.heatmapGradient ?? engine.theme.sequentialPalette;
}
