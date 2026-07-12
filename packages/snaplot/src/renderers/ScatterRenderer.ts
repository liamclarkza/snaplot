import type { Scale, Layout, SeriesConfig } from '../types';
import { affineParams } from '../scales/affine';
import {
  createScatterStyleResolver,
  type IndexRange,
  parseHex,
  type ScatterStyleResolver,
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

// Stamp canvases are pure functions of their key, so one module-level cache
// serves every chart instance; sharing helps dashboards where many charts use
// the same theme. Eviction is LRU: hits re-insert so hot stamps survive.
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

/** Radius passed here must already be quantized (see quantizeRadius). */
function getStamp(
  roundedRadius: number,
  color: string,
  alpha: number,
  shape: string,
  dpr: number,
): OffscreenCanvas | HTMLCanvasElement {
  const key = `${shape}|${roundedRadius}|${color}|${alpha}|${dpr}`;
  const cached = stampCacheMap.get(key);
  if (cached) {
    // Re-insert so Map iteration order tracks recency and eviction is LRU.
    stampCacheMap.delete(key);
    stampCacheMap.set(key, cached);
    return cached;
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

  stampCacheMap.set(key, canvas);
  if (stampCacheMap.size > STAMP_CACHE_MAX) {
    const oldest = stampCacheMap.keys().next().value;
    if (oldest) stampCacheMap.delete(oldest);
  }
  return canvas;
}

/**
 * Stamps are rasterized at a 0.1px-quantized radius; the blit box must use
 * the same value or the sprite gets sub-pixel scaled and blurs.
 */
function quantizeRadius(radius: number): number {
  return Math.round(radius * 10) / 10;
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
  cache?: ScatterSeriesCache,
  resolver?: ScatterStyleResolver,
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
    cache,
    resolver,
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
  cache?: ScatterSeriesCache,
  /**
   * Style resolver built by the chart once per data/config change. When
   * omitted (tests, direct calls) one is built from the segment data,
   * which re-scans the encoded columns on every call.
   */
  resolver?: ScatterStyleResolver,
  /**
   * Draw every Nth point (interaction pass while the viewport moves).
   * 1 = full fidelity. Ignored by density rendering.
   */
  sampleStride: number = 1,
  /** Use Safari-friendly batched vector marks during an active viewport gesture. */
  interactionFastPath: boolean = false,
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
    drawHeatmapSegments(
      ctx,
      segments,
      scaleX,
      scaleY,
      layout,
      cache ?? new ScatterSeriesCache(),
      series.heatmapBinSize,
      series.heatmapGradient,
    );
  } else {
    drawStampedSegments(
      ctx,
      segments,
      scaleX,
      scaleY,
      layout,
      series,
      color,
      palettes,
      cache,
      resolver,
      sampleStride,
      interactionFastPath,
    );
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
  cache?: ScatterSeriesCache,
  chartResolver?: ScatterStyleResolver,
  sampleStride: number = 1,
  interactionFastPath: boolean = false,
): void {
  const count = segmentPointCount(segments);
  const radius = series.pointRadius ?? (count > 10_000 ? 1.5 : 3);
  const alpha = series.opacity ?? (count > 10_000 ? 0.4 : 0.8);
  const dpr = layout.dpr;
  const shape = series.pointShape ?? 'circle';
  const resolver = chartResolver ?? buildSegmentResolver(segments, series, color, radius, palettes);

  const constantRadius = quantizeRadius(radius);
  const constantStamp = !resolver.variableColor && !resolver.variableRadius
    ? getStamp(constantRadius, color, alpha, shape, dpr)
    : null;
  const constantStampSize = constantRadius * 2 + 2;
  const constantOffset = constantRadius + 1;

  // Points outside the plot rect are clipped away anyway; skipping them
  // here saves the drawImage call. Matters for arbitrary-xDataIndex series,
  // which reach this loop unculled. The margin must cover the largest marker
  // the resolver can produce (a sizeBy range max well above the base radius),
  // or a big edge-straddling bubble whose body overlaps the plot gets dropped.
  const maxRadius = Math.max(constantRadius, radius, resolver.maxRadius, 8);
  const pxMin = layout.plot.left - maxRadius;
  const pxMax = layout.plot.left + layout.plot.width + maxRadius;
  const pyMin = layout.plot.top - maxRadius;
  const pyMax = layout.plot.top + layout.plot.height + maxRadius;

  // Hoist affine scale transforms out of the loop; log/custom scales keep
  // the method-call path.
  const ax = affineParams(scaleX);
  const ay = affineParams(scaleY);
  const kx = ax ? ax[0] : 0;
  const bx = ax ? ax[1] : 0;
  const ky = ay ? ay[0] : 0;
  const by = ay ? ay[1] : 0;

  const stampTable = cache
    ? cache.stampTableFor(resolver, alpha, shape, dpr)
    : new Map<number, OffscreenCanvas | HTMLCanvasElement>();

  const stride = Math.max(1, Math.floor(sampleStride));

  // Safari performs poorly when a pan frame issues hundreds of tiny,
  // translucent canvas-to-canvas drawImage calls. For fixed-radius marks,
  // batch geometry by the resolver's colour bins during the gesture. A
  // constant-colour series becomes one fill; a continuous colour encoding is
  // capped at its small bin count. The settled repaint returns to stamps,
  // preserving exact per-point alpha accumulation at rest.
  if (interactionFastPath && !resolver.variableRadius) {
    drawBatchedInteractionPoints(
      ctx,
      segments,
      scaleX,
      scaleY,
      resolver,
      constantRadius,
      alpha,
      shape,
      stride,
      pxMin,
      pxMax,
      pyMin,
      pyMax,
      ax,
      ay,
    );
    return;
  }

  // drawImage with a canvas source is a fast GPU blit, no path overhead
  for (const segment of segments) {
    const { xData, yData, startIdx, endIdx } = segment;
    for (let i = startIdx; i <= endIdx; i += stride) {
      const yVal = yData[i];
      if (!Number.isFinite(yVal)) continue;

      const px = ax ? xData[i] * kx + bx : scaleX.dataToPixel(xData[i]);
      const py = ay ? yVal * ky + by : scaleY.dataToPixel(yVal);
      // Cull off-plot points. A non-finite px/py passes these comparisons
      // (every compare with NaN is false) but drawImage ignores non-finite
      // coordinates, so such a point draws nothing either way.
      if (px < pxMin || px > pxMax || py < pyMin || py > pyMax) continue;

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

      const pointRadius = quantizeRadius(resolver.radiusAt(i));
      const bin = resolver.colorBinAt(i);
      // bin >= -1 and quantized radius has one decimal, so the pair packs
      // into one integer key: no string allocation per point.
      const tableKey = (bin + 2) * 16384 + Math.round(pointRadius * 10);
      let stamp = stampTable.get(tableKey);
      if (!stamp) {
        stamp = getStamp(pointRadius, resolver.colorForBin(bin), alpha, shape, dpr);
        stampTable.set(tableKey, stamp);
      }
      const stampSize = pointRadius * 2 + 2;
      const offset = pointRadius + 1;
      ctx.drawImage(stamp, px - offset, py - offset, stampSize, stampSize);
    }
  }
}

function drawBatchedInteractionPoints(
  ctx: CanvasRenderingContext2D,
  segments: ScatterRenderSegment[],
  scaleX: Scale,
  scaleY: Scale,
  resolver: ScatterStyleResolver,
  radius: number,
  alpha: number,
  shape: string,
  stride: number,
  pxMin: number,
  pxMax: number,
  pyMin: number,
  pyMax: number,
  ax: ReturnType<typeof affineParams>,
  ay: ReturnType<typeof affineParams>,
): void {
  const buckets = new Map<number, number[]>();
  const kx = ax?.[0] ?? 0;
  const bx = ax?.[1] ?? 0;
  const ky = ay?.[0] ?? 0;
  const by = ay?.[1] ?? 0;

  for (const segment of segments) {
    const { xData, yData, startIdx, endIdx } = segment;
    for (let i = startIdx; i <= endIdx; i += stride) {
      const y = yData[i];
      if (!Number.isFinite(y)) continue;
      const px = ax ? xData[i] * kx + bx : scaleX.dataToPixel(xData[i]);
      const py = ay ? y * ky + by : scaleY.dataToPixel(y);
      if (px < pxMin || px > pxMax || py < pyMin || py > pyMax) continue;
      const bin = resolver.colorBinAt(i);
      let coordinates = buckets.get(bin);
      if (!coordinates) {
        coordinates = [];
        buckets.set(bin, coordinates);
      }
      coordinates.push(px, py);
    }
  }

  const parentAlpha = ctx.globalAlpha;
  ctx.globalAlpha = parentAlpha * alpha;
  for (const [bin, coordinates] of buckets) {
    ctx.beginPath();
    for (let i = 0; i < coordinates.length; i += 2) {
      const px = coordinates[i];
      const py = coordinates[i + 1];
      if (shape === 'square') {
        ctx.rect(px - radius, py - radius, radius * 2, radius * 2);
      } else if (shape === 'diamond') {
        ctx.moveTo(px, py - radius);
        ctx.lineTo(px + radius, py);
        ctx.lineTo(px, py + radius);
        ctx.lineTo(px - radius, py);
        ctx.closePath();
      } else {
        ctx.moveTo(px + radius, py);
        ctx.arc(px, py, radius, 0, Math.PI * 2);
      }
    }
    ctx.fillStyle = resolver.colorForBin(bin);
    ctx.fill();
  }
  ctx.globalAlpha = parentAlpha;
}

/**
 * Fallback resolver for direct renderScatter calls that do not come from a
 * chart instance: derives encoding state from the segment arrays alone.
 */
function buildSegmentResolver(
  segments: ScatterRenderSegment[],
  series: SeriesConfig,
  color: string,
  radius: number,
  palettes: ScatterPalettes,
): ScatterStyleResolver {
  const ranges: IndexRange[] = segments.map((segment) => ({
    startIdx: segment.startIdx,
    endIdx: segment.endIdx,
  }));
  const colorData = segments[0]?.colorData;
  const sizeData = segments[0]?.sizeData;
  const colorBy = series.colorBy;
  const colorIdx = typeof colorBy === 'number' ? colorBy : colorBy?.dataIndex;
  const sizeBy = series.sizeBy;
  const sizeIdx = typeof sizeBy === 'number' ? sizeBy : sizeBy?.dataIndex;

  let columnCount = Math.max(series.xDataIndex ?? 0, seriesYDataIndex(series)) + 1;
  if (colorData && colorIdx !== undefined) columnCount = Math.max(columnCount, colorIdx + 1);
  if (sizeData && sizeIdx !== undefined) columnCount = Math.max(columnCount, sizeIdx + 1);

  return createScatterStyleResolver({
    series,
    fallbackColor: color,
    fallbackRadius: radius,
    palettes,
    columnCount,
    ranges,
    valueAt(columnIdx, index) {
      if (columnIdx === series.xDataIndex) return segments[0]?.xData[index] ?? Number.NaN;
      if (columnIdx === seriesYDataIndex(series)) return segments[0]?.yData[index] ?? Number.NaN;
      if (columnIdx === colorIdx) return colorData?.[index] ?? Number.NaN;
      if (columnIdx === sizeIdx) return sizeData?.[index] ?? Number.NaN;
      return Number.NaN;
    },
  });
}

// ─── Heatmap: 2D histogram for extreme point counts ────────────

interface HeatmapCacheEntry {
  canvas: OffscreenCanvas | HTMLCanvasElement;
  xData: Float64Array;
  yData: Float64Array;
  segmentKey: string;
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
}

/**
 * Per-series render cache, owned by the chart instance and passed into
 * renderScatterSegments. Heatmap bitmaps used to live in a module-level
 * single slot; two density series (or two charts) then invalidated each
 * other every frame and paid a full O(n) rebin per repaint.
 * `gradientKey` is a stable join of the configured stops so a theme swap
 * invalidates the cache without us tracking the array identity.
 */
export class ScatterSeriesCache {
  heatmap: HeatmapCacheEntry | null = null;

  private stampTable = new Map<number, OffscreenCanvas | HTMLCanvasElement>();
  private stampTableResolver: ScatterStyleResolver | null = null;
  private stampTableSig = '';

  /**
   * Numeric-keyed stamp lookup for the variable-style path, so the per
   * point cost is integer math plus a Map hit instead of building a
   * string key. Reset whenever the resolver or the stamp parameters
   * change; both are stable across the frames of a gesture.
   */
  stampTableFor(
    resolver: ScatterStyleResolver,
    alpha: number,
    shape: string,
    dpr: number,
  ): Map<number, OffscreenCanvas | HTMLCanvasElement> {
    const sig = alpha + '|' + shape + '|' + dpr;
    if (this.stampTableResolver !== resolver || this.stampTableSig !== sig) {
      this.stampTable.clear();
      this.stampTableResolver = resolver;
      this.stampTableSig = sig;
    }
    return this.stampTable;
  }
}

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
  cache: ScatterSeriesCache,
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
    .map((segment) => {
      const first = segment.startIdx;
      const last = segment.endIdx;
      return [
        first,
        last,
        segment.xData[first],
        segment.xData[last],
        segment.yData[first],
        segment.yData[last],
      ].join(':');
    })
    .join('|');

  // Check cache: reuse if data, viewport, and gradient haven't changed
  const cached = cache.heatmap;
  if (
    cached &&
    cached.xData === firstSegment.xData &&
    cached.yData === firstSegment.yData &&
    cached.segmentKey === segmentKey &&
    cached.w === w &&
    cached.h === h &&
    cached.dpr === dpr &&
    cached.dataLen === dataLen &&
    cached.xMin === scaleX.min &&
    cached.xMax === scaleX.max &&
    cached.yMin === scaleY.min &&
    cached.yMax === scaleY.max &&
    cached.binSize === bs &&
    cached.gradientKey === gradientKey
  ) {
    ctx.drawImage(cached.canvas, plot.left, plot.top, plot.width, plot.height);
    return;
  }

  // Pre-parse the gradient once per render; fall back to Viridis.
  const parsedStops = gradient && gradient.length >= 2
    ? gradient.map(parseHex)
    : null;

  // Bin all points. Affine scales fold the whole data-to-bin transform
  // into one multiply-add per axis.
  const bins = new Uint32Array(w * h);
  let maxCount = 0;

  const ax = affineParams(scaleX);
  const ay = affineParams(scaleY);
  const binScale = dpr / binPx;
  const kx = ax ? ax[0] * binScale : 0;
  const bx = ax ? (ax[1] - plot.left) * binScale : 0;
  const ky = ay ? ay[0] * binScale : 0;
  const by = ay ? (ay[1] - plot.top) * binScale : 0;

  for (const segment of segments) {
    const { xData, yData, startIdx, endIdx } = segment;
    for (let i = startIdx; i <= endIdx; i++) {
      const yVal = yData[i];
      if (!Number.isFinite(yVal)) continue;

      const px = Math.floor(
        ax ? xData[i] * kx + bx : ((scaleX.dataToPixel(xData[i]) - plot.left) * dpr) / binPx,
      );
      const py = Math.floor(
        ay ? yVal * ky + by : ((scaleY.dataToPixel(yVal) - plot.top) * dpr) / binPx,
      );

      // The bounds checks also reject NaN from non-finite X values.
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
  cache.heatmap = {
    canvas: tmpCanvas,
    xData: firstSegment.xData,
    yData: firstSegment.yData,
    segmentKey,
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
