import type { Scale, Layout, SeriesConfig } from '../types';
import {
  createScatterStyleResolver,
  type IndexRange,
  parseHex,
  seriesYDataIndex,
  type ScatterPalettes,
} from './scatterEncoding';

export interface ScatterRenderSegment {
  xData: Float64Array;
  yData: Float64Array;
  colorData?: Float64Array;
  sizeData?: Float64Array;
  startIdx: number;
  endIdx: number;
}

/**
 * Scatter plot renderer.
 *
 * Performance strategy (inspired by uPlot):
 * - < 200K points: "Stamp" approach, draw a single circle into a tiny
 *   offscreen canvas once, then drawImage() at each point. This is
 *   dramatically faster than arc() per point because:
 *   1. Arc rasterization happens once, not N times
 *   2. drawImage from canvas is GPU-accelerated bitmap blit
 *   3. No path accumulation overhead
 * - >= 200K points: 2D histogram heatmap via putImageData()
 */

// Cache the stamp canvas per (radius, color, dpr) to avoid recreating each frame
let stampCache: {
  canvas: OffscreenCanvas | HTMLCanvasElement;
  radius: number;
  color: string;
  alpha: number;
  shape: string;
  dpr: number;
} | null = null;

const stampCacheMap = new Map<string, OffscreenCanvas | HTMLCanvasElement>();
const STAMP_CACHE_MAX = 512;
export const SCATTER_DENSITY_THRESHOLD = 200_000;

export function isDensityScatterSeries(series: SeriesConfig, pointCount: number): boolean {
  const renderMode = series.renderMode ?? (series.heatmap ? 'density' : 'auto');
  return renderMode === 'density' || (renderMode === 'auto' && pointCount > SCATTER_DENSITY_THRESHOLD);
}

function isOffscreenCanvas(canvas: OffscreenCanvas | HTMLCanvasElement): canvas is OffscreenCanvas {
  return typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas;
}

function getStamp(
  radius: number,
  color: string,
  alpha: number,
  shape: string,
  dpr: number,
): OffscreenCanvas | HTMLCanvasElement {
  const roundedRadius = Math.round(radius * 10) / 10;
  const key = `${shape}|${roundedRadius}|${color}|${alpha}|${dpr}`;
  const cached = stampCacheMap.get(key);
  if (cached) return cached;

  // Reuse cached stamp if params match
  if (
    stampCache &&
    stampCache.radius === roundedRadius &&
    stampCache.color === color &&
    stampCache.alpha === alpha &&
    stampCache.shape === shape &&
    stampCache.dpr === dpr
  ) {
    return stampCache.canvas;
  }

  const size = Math.ceil((roundedRadius * 2 + 2) * dpr);
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(size, size)
    : document.createElement('canvas');

  if (!isOffscreenCanvas(canvas)) {
    canvas.width = size;
    canvas.height = size;
  }

  const ctx = canvas.getContext('2d')! as CanvasRenderingContext2D;
  ctx.scale(dpr, dpr);

  const center = roundedRadius + 1;
  ctx.beginPath();
  if (shape === 'square') {
    ctx.rect(1, 1, roundedRadius * 2, roundedRadius * 2);
  } else if (shape === 'diamond') {
    ctx.moveTo(center, 1);
    ctx.lineTo(center + roundedRadius, center);
    ctx.lineTo(center, center + roundedRadius);
    ctx.lineTo(1, center);
    ctx.closePath();
  } else {
    ctx.arc(center, center, roundedRadius, 0, Math.PI * 2);
  }
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.fill();

  stampCache = { canvas, radius: roundedRadius, color, alpha, shape, dpr };
  stampCacheMap.set(key, canvas);
  if (stampCacheMap.size > STAMP_CACHE_MAX) {
    const oldest = stampCacheMap.keys().next().value;
    if (oldest) stampCacheMap.delete(oldest);
  }
  return canvas;
}

export function renderScatter(
  ctx: CanvasRenderingContext2D,
  xData: Float64Array,
  yData: Float64Array,
  startIdx: number,
  endIdx: number,
  scaleX: Scale,
  scaleY: Scale,
  layout: Layout,
  series: SeriesConfig,
  color: string,
  /** Multiplied with the per-point alpha. Used by the highlight system to dim non-highlighted series. */
  opacityMultiplier: number = 1,
  palettes: ScatterPalettes = { categorical: [] },
): void {
  renderScatterSegments(
    ctx,
    [{ xData, yData, startIdx, endIdx }],
    scaleX,
    scaleY,
    layout,
    series,
    color,
    opacityMultiplier,
    palettes,
  );
}

export function renderScatterSegments(
  ctx: CanvasRenderingContext2D,
  segments: ScatterRenderSegment[],
  scaleX: Scale,
  scaleY: Scale,
  layout: Layout,
  series: SeriesConfig,
  color: string,
  /** Multiplied with the per-point alpha. Used by the highlight system to dim non-highlighted series. */
  opacityMultiplier: number = 1,
  palettes: ScatterPalettes = { categorical: [] },
): void {
  const count = segmentPointCount(segments);
  if (count <= 0) return;

  // Clip to plot area
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(layout.plot.left, layout.plot.top, layout.plot.width, layout.plot.height, 4);
  ctx.clip();
  // Multiplies cumulatively with the stamp's baked-in alpha during drawImage.
  ctx.globalAlpha = opacityMultiplier;

  if (isDensityScatterSeries(series, count)) {
    drawHeatmapSegments(ctx, segments, scaleX, scaleY, layout, series.heatmapBinSize, series.heatmapGradient);
  } else {
    drawStampedSegments(ctx, segments, scaleX, scaleY, layout, series, color, palettes);
  }

  ctx.restore();
}

// ─── Stamp approach: single arc rasterized once, drawImage per point ────

function drawStampedSegments(
  ctx: CanvasRenderingContext2D,
  segments: ScatterRenderSegment[],
  scaleX: Scale,
  scaleY: Scale,
  layout: Layout,
  series: SeriesConfig,
  color: string,
  palettes: ScatterPalettes,
): void {
  const count = segmentPointCount(segments);
  const radius = series.pointRadius ?? (count > 10_000 ? 1.5 : 3);
  const alpha = series.opacity ?? (count > 10_000 ? 0.4 : 0.8);
  const dpr = layout.dpr;
  const shape = series.pointShape ?? 'circle';
  const ranges: IndexRange[] = segments.map((segment) => ({
    startIdx: segment.startIdx,
    endIdx: segment.endIdx,
  }));
  const colorData = segments[0]?.colorData;
  const sizeData = segments[0]?.sizeData;
  const resolver = createScatterStyleResolver({
    series,
    fallbackColor: color,
    fallbackRadius: radius,
    palettes,
    columnCount: 1 +
      (colorData ? Math.max(series.colorBy && typeof series.colorBy !== 'number' ? series.colorBy.dataIndex : typeof series.colorBy === 'number' ? series.colorBy : 0, 0) : 0) +
      (sizeData ? Math.max(series.sizeBy && typeof series.sizeBy !== 'number' ? series.sizeBy.dataIndex : typeof series.sizeBy === 'number' ? series.sizeBy : 0, 0) : 0),
    ranges,
    valueAt(columnIdx, index) {
      if (columnIdx === series.xDataIndex) return segments[0]?.xData[index] ?? Number.NaN;
      if (columnIdx === seriesYDataIndex(series)) return segments[0]?.yData[index] ?? Number.NaN;
      const colorBy = series.colorBy;
      const colorIdx = typeof colorBy === 'number' ? colorBy : colorBy?.dataIndex;
      if (columnIdx === colorIdx) return colorData?.[index] ?? Number.NaN;
      const sizeBy = series.sizeBy;
      const sizeIdx = typeof sizeBy === 'number' ? sizeBy : sizeBy?.dataIndex;
      if (columnIdx === sizeIdx) return sizeData?.[index] ?? Number.NaN;
      return Number.NaN;
    },
  });

  const constantStamp = !resolver.variableColor && !resolver.variableRadius
    ? getStamp(radius, color, alpha, shape, dpr)
    : null;
  const constantStampSize = radius * 2 + 2;
  const constantOffset = radius + 1;

  // drawImage with a canvas source is a fast GPU blit, no path overhead
  for (const segment of segments) {
    const { xData, yData, startIdx, endIdx } = segment;
    for (let i = startIdx; i <= endIdx; i++) {
      const yVal = yData[i];
      if (yVal !== yVal) continue; // NaN

      const px = scaleX.dataToPixel(xData[i]);
      const py = scaleY.dataToPixel(yVal);

      if (constantStamp) {
        ctx.drawImage(
          constantStamp,
          px - constantOffset,
          py - constantOffset,
          constantStampSize,
          constantStampSize,
        );
        continue;
      }

      const pointRadius = resolver.radiusAt(i);
      const pointColor = resolver.colorAt(i);
      const stamp = getStamp(pointRadius, pointColor, alpha, shape, dpr);
      const stampSize = pointRadius * 2 + 2;
      const offset = pointRadius + 1;
      ctx.drawImage(stamp, px - offset, py - offset, stampSize, stampSize);
    }
  }
}

// ─── Heatmap: 2D histogram for extreme point counts ────────────

// Cache the rendered heatmap to avoid flicker on overlay-only redraws.
// `gradientKey` is a stable join of the configured stops so a theme swap
// invalidates the cache without us tracking the array identity.
let heatmapCache: {
  canvas: OffscreenCanvas | HTMLCanvasElement;
  xData: Float64Array;
  yData: Float64Array;
  segmentKey: string;
  start: number;
  end: number;
  w: number;
  h: number;
  dpr: number;
  dataLen: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  binSize: number;
  gradientKey: string;
} | null = null;

/**
 * Sample a multi-stop gradient at t ∈ [0, 1]. Stops are spaced evenly;
 * interpolation is linear in sRGB (fine for short, theme-matching ramps).
 */
function sampleGradient(stops: [number, number, number][], t: number): [number, number, number] {
  if (stops.length === 1) return stops[0];
  const scaled = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(scaled));
  const f = scaled - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

function drawHeatmapSegments(
  ctx: CanvasRenderingContext2D,
  segments: ScatterRenderSegment[],
  scaleX: Scale,
  scaleY: Scale,
  layout: Layout,
  binSizeCss?: number,
  gradient?: string[],
): void {
  const { plot, dpr } = layout;
  const binPx = Math.max(1, Math.round((binSizeCss ?? 1) * dpr));
  const w = Math.ceil((plot.width * dpr) / binPx);
  const h = Math.ceil((plot.height * dpr) / binPx);
  if (w <= 0 || h <= 0) return;

  const dataLen = segmentPointCount(segments);
  const bs = binSizeCss ?? 1;
  const gradientKey = gradient?.join('|') ?? 'viridis';
  const firstSegment = segments[0];
  const segmentKey = segments
    .map((segment) => `${segment.startIdx}:${segment.endIdx}`)
    .join('|');

  // Check cache: reuse if data, viewport, and gradient haven't changed
  if (
    heatmapCache &&
    heatmapCache.xData === firstSegment.xData &&
    heatmapCache.yData === firstSegment.yData &&
    heatmapCache.segmentKey === segmentKey &&
    heatmapCache.w === w &&
    heatmapCache.h === h &&
    heatmapCache.dpr === dpr &&
    heatmapCache.dataLen === dataLen &&
    heatmapCache.xMin === scaleX.min &&
    heatmapCache.xMax === scaleX.max &&
    heatmapCache.yMin === scaleY.min &&
    heatmapCache.yMax === scaleY.max &&
    heatmapCache.binSize === bs &&
    heatmapCache.gradientKey === gradientKey
  ) {
    ctx.drawImage(heatmapCache.canvas, plot.left, plot.top, plot.width, plot.height);
    return;
  }

  // Pre-parse the gradient once per render; fall back to Viridis.
  const parsedStops = gradient && gradient.length >= 2
    ? gradient.map(parseHex)
    : null;

  // Bin all points
  const bins = new Uint32Array(w * h);
  let maxCount = 0;

  for (const segment of segments) {
    const { xData, yData, startIdx, endIdx } = segment;
    for (let i = startIdx; i <= endIdx; i++) {
      const yVal = yData[i];
      if (yVal !== yVal) continue;

      const px = Math.floor(((scaleX.dataToPixel(xData[i]) - plot.left) * dpr) / binPx);
      const py = Math.floor(((scaleY.dataToPixel(yVal) - plot.top) * dpr) / binPx);

      if (px >= 0 && px < w && py >= 0 && py < h) {
        const idx = py * w + px;
        bins[idx]++;
        if (bins[idx] > maxCount) maxCount = bins[idx];
      }
    }
  }

  if (maxCount === 0) return;

  // Render to temp canvas at bin resolution
  const tmpCanvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(w, h)
    : document.createElement('canvas');
  if (!isOffscreenCanvas(tmpCanvas)) {
    tmpCanvas.width = w;
    tmpCanvas.height = h;
  }
  const tmpCtx = tmpCanvas.getContext('2d')! as CanvasRenderingContext2D;
  const imageData = tmpCtx.createImageData(w, h);
  const data = imageData.data;

  for (let i = 0; i < bins.length; i++) {
    if (bins[i] === 0) continue;

    const t = Math.log(1 + bins[i]) / Math.log(1 + maxCount);
    const [r, g, b] = parsedStops ? sampleGradient(parsedStops, t) : viridisColor(t);
    const off = i * 4;
    data[off] = r;
    data[off + 1] = g;
    data[off + 2] = b;
    data[off + 3] = 255;
  }

  tmpCtx.putImageData(imageData, 0, 0);

  // Cache for subsequent frames (e.g. overlay-only redraws)
  heatmapCache = {
    canvas: tmpCanvas,
    xData: firstSegment.xData,
    yData: firstSegment.yData,
    segmentKey,
    start: firstSegment.startIdx,
    end: segments[segments.length - 1].endIdx,
    w,
    h,
    dpr,
    dataLen,
    xMin: scaleX.min,
    xMax: scaleX.max,
    yMin: scaleY.min,
    yMax: scaleY.max,
    binSize: bs,
    gradientKey,
  };

  ctx.drawImage(tmpCanvas, plot.left, plot.top, plot.width, plot.height);
}

function segmentPointCount(segments: ScatterRenderSegment[]): number {
  let count = 0;
  for (const segment of segments) {
    count += segment.endIdx - segment.startIdx + 1;
  }
  return count;
}

function viridisColor(t: number): [number, number, number] {
  if (t < 0.25) {
    const s = t / 0.25;
    return [Math.round(68 * s), Math.round(1 + 83 * s), Math.round(84 + 86 * s)];
  }
  if (t < 0.5) {
    const s = (t - 0.25) / 0.25;
    return [Math.round(68 - 35 * s), Math.round(84 + 86 * s), Math.round(170 - 10 * s)];
  }
  if (t < 0.75) {
    const s = (t - 0.5) / 0.25;
    return [Math.round(33 + 90 * s), Math.round(170 + 50 * s), Math.round(160 - 80 * s)];
  }
  const s = (t - 0.75) / 0.25;
  return [Math.round(123 + 130 * s), Math.round(220 + 33 * s), Math.round(80 - 60 * s)];
}
