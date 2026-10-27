/**
 * The scatter density map (a 2D histogram drawn with putImageData), for clouds past the point
 * threshold or `renderMode: 'density'`: the lattice-cached path on linear scales and the
 * per-paint path for the rest, the theme ramp and the Viridis fallback.
 */
import type { ChartCore } from '../../Engine';
import type { Layout, Scale } from '../../spec';
import { context2d } from '../../render/surface';
import { affineParams } from '../../scales/affine';
import type { ScatterRenderSegment, ScatterSeriesCache } from './draw';
import { rgbOf } from './encoding';

export function isOffscreenCanvas(
  canvas: OffscreenCanvas | HTMLCanvasElement,
): canvas is OffscreenCanvas {
  return typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas;
}

// ─── Heatmap: 2D histogram for extreme point counts ────────────

export interface HeatmapCacheEntry {
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
  /**
   * On linear scales, the data-space lattice of the bins: data per bin on each axis, the left
   * edge of the first column and the top edge of the first row. The bitmap covers the viewport
   * plus half a span on every side, so a pan at the same zoom draws a shifted window of it.
   */
  lattice?: { perBinX: number; perBinY: number; left: number; top: number };
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

export function drawHeatmapSegments(
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

  const ax = affineParams(scaleX);
  const ay = affineParams(scaleY);
  if (ax && ay) {
    drawLatticeHeatmap(ctx, segments, scaleX, scaleY, layout, cache, binPx, bs, gradient, {
      gradientKey,
      segmentKey,
      dataLen,
    });
    return;
  }

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
  const parsedStops = gradient && gradient.length >= 2 ? gradient.map(rgbOf) : null;

  // Bin all points. Affine scales fold the whole data-to-bin transform
  // into one multiply-add per axis.
  cache.rebins++;
  const bins = new Uint32Array(w * h);
  let maxCount = 0;

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
  const tmpCanvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(w, h)
      : document.createElement('canvas');
  if (!isOffscreenCanvas(tmpCanvas)) {
    tmpCanvas.width = w;
    tmpCanvas.height = h;
  }
  const tmpCtx = context2d(tmpCanvas);
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

/**
 * The density map on linear scales. Points are binned on a lattice fixed in data space that
 * covers the viewport and half a span beyond each edge; the visible window of that bitmap is
 * drawn into the plot. A pan at the same zoom inside the cached area draws a shifted window and
 * rebins nothing (perf:density-cache); a zoom, a resize or new data rebins. Colours are scaled
 * to the busiest bin of the whole cached area, so they hold still during a pan.
 */
function drawLatticeHeatmap(
  ctx: CanvasRenderingContext2D,
  segments: ScatterRenderSegment[],
  scaleX: Scale,
  scaleY: Scale,
  layout: Layout,
  cache: ScatterSeriesCache,
  binPx: number,
  binSize: number,
  gradient: string[] | undefined,
  keys: { gradientKey: string; segmentKey: string; dataLen: number },
): void {
  const { plot, dpr } = layout;
  const spanX = scaleX.max - scaleX.min;
  const spanY = scaleY.max - scaleY.min;
  // Data per bin: a bin is binPx device pixels at the current zoom.
  const perBinX = (spanX * binPx) / (plot.width * dpr);
  const perBinY = (spanY * binPx) / (plot.height * dpr);
  const same = (a: number, b: number) => Math.abs(a - b) <= Math.abs(b) * 1e-9;
  const firstSegment = segments[0];
  const cached = cache.heatmap;
  const lattice = cached?.lattice;
  const reusable =
    cached &&
    lattice &&
    cached.xData === firstSegment.xData &&
    cached.yData === firstSegment.yData &&
    cached.dataLen === keys.dataLen &&
    cached.dpr === dpr &&
    cached.binSize === binSize &&
    cached.gradientKey === keys.gradientKey &&
    same(lattice.perBinX, perBinX) &&
    same(lattice.perBinY, perBinY) &&
    scaleX.min >= lattice.left &&
    scaleX.max <= lattice.left + cached.w * lattice.perBinX &&
    scaleY.max <= lattice.top &&
    scaleY.min >= lattice.top - cached.h * lattice.perBinY;

  let entry = cached;
  if (!reusable) {
    cache.rebins++;
    const left = Math.floor((scaleX.min - spanX / 2) / perBinX) * perBinX;
    const top = Math.ceil((scaleY.max + spanY / 2) / perBinY) * perBinY;
    const w = Math.ceil((2 * spanX) / perBinX) + 2;
    const h = Math.ceil((2 * spanY) / perBinY) + 2;
    const bins = new Uint32Array(w * h);
    let maxCount = 0;
    for (const segment of segments) {
      const { xData, yData, startIdx, endIdx } = segment;
      for (let i = startIdx; i <= endIdx; i++) {
        const yVal = yData[i];
        if (!Number.isFinite(yVal)) continue;
        const px = Math.floor((xData[i] - left) / perBinX);
        const py = Math.floor((top - yVal) / perBinY);
        // The bounds checks also reject NaN from non-finite X values.
        if (px >= 0 && px < w && py >= 0 && py < h) {
          const idx = py * w + px;
          bins[idx]++;
          if (bins[idx] > maxCount) maxCount = bins[idx];
        }
      }
    }
    const canvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(w, h)
        : document.createElement('canvas');
    if (!isOffscreenCanvas(canvas)) {
      canvas.width = w;
      canvas.height = h;
    }
    if (maxCount > 0) {
      const parsedStops = gradient && gradient.length >= 2 ? gradient.map(rgbOf) : null;
      const tmpCtx = context2d(canvas);
      const imageData = tmpCtx.createImageData(w, h);
      const data = imageData.data;
      const logMax = Math.log(1 + maxCount);
      for (let i = 0; i < bins.length; i++) {
        if (bins[i] === 0) continue;
        const [r, g, b] = parsedStops
          ? sampleGradient(parsedStops, Math.log(1 + bins[i]) / logMax)
          : viridisColor(Math.log(1 + bins[i]) / logMax);
        const off = i * 4;
        data[off] = r;
        data[off + 1] = g;
        data[off + 2] = b;
        data[off + 3] = 255;
      }
      tmpCtx.putImageData(imageData, 0, 0);
    }
    entry = {
      canvas,
      xData: firstSegment.xData,
      yData: firstSegment.yData,
      segmentKey: keys.segmentKey,
      w,
      h,
      dpr,
      dataLen: keys.dataLen,
      xMin: scaleX.min,
      xMax: scaleX.max,
      yMin: scaleY.min,
      yMax: scaleY.max,
      binSize,
      gradientKey: keys.gradientKey,
      lattice: { perBinX, perBinY, left, top },
    };
    cache.heatmap = entry;
  }
  if (!entry?.lattice) return;
  const { lattice: grid } = entry;
  const smoothing = ctx.imageSmoothingEnabled;
  // Bins are whole cells: no smoothing between them, and no blur at a sub-bin offset.
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    entry.canvas,
    (scaleX.min - grid.left) / grid.perBinX,
    (grid.top - scaleY.max) / grid.perBinY,
    spanX / grid.perBinX,
    spanY / grid.perBinY,
    plot.left,
    plot.top,
    plot.width,
    plot.height,
  );
  ctx.imageSmoothingEnabled = smoothing;
}

export function segmentPointCount(segments: ScatterRenderSegment[]): number {
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

export function heatmapGradient(engine: ChartCore): string[] | undefined {
  return engine.theme.heatmapGradient ?? engine.theme.sequentialPalette;
}
