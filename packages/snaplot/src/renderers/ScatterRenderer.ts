import type { Scale, Layout, SeriesConfig } from '../types';

/**
 * Scatter plot renderer.
 *
 * Performance strategy (inspired by uPlot):
 * - < 200K points: "Stamp" approach — draw a single circle into a tiny
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
  dpr: number;
} | null = null;

function getStamp(
  radius: number,
  color: string,
  alpha: number,
  dpr: number,
): OffscreenCanvas | HTMLCanvasElement {
  // Reuse cached stamp if params match
  if (
    stampCache &&
    stampCache.radius === radius &&
    stampCache.color === color &&
    stampCache.dpr === dpr
  ) {
    return stampCache.canvas;
  }

  const size = Math.ceil((radius * 2 + 2) * dpr);
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(size, size)
    : document.createElement('canvas');

  if (!(canvas instanceof OffscreenCanvas)) {
    canvas.width = size;
    canvas.height = size;
  }

  const ctx = canvas.getContext('2d')! as CanvasRenderingContext2D;
  ctx.scale(dpr, dpr);

  const center = radius + 1;
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.fill();

  stampCache = { canvas, radius, color, dpr };
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
): void {
  const count = endIdx - startIdx + 1;
  if (count <= 0) return;

  // Clip to plot area
  ctx.save();
  ctx.beginPath();
  ctx.rect(layout.plot.left, layout.plot.top, layout.plot.width, layout.plot.height);
  ctx.clip();

  if (series.heatmap || count > 200_000) {
    drawHeatmap(ctx, xData, yData, startIdx, endIdx, scaleX, scaleY, layout, series.heatmapBinSize);
  } else {
    drawStamped(ctx, xData, yData, startIdx, endIdx, scaleX, scaleY, layout, series, color);
  }

  ctx.restore();
}

// ─── Stamp approach: single arc rasterized once, drawImage per point ────

function drawStamped(
  ctx: CanvasRenderingContext2D,
  xData: Float64Array,
  yData: Float64Array,
  start: number,
  end: number,
  scaleX: Scale,
  scaleY: Scale,
  layout: Layout,
  series: SeriesConfig,
  color: string,
): void {
  const count = end - start + 1;
  const radius = series.pointRadius ?? (count > 10_000 ? 1.5 : 3);
  const alpha = series.opacity ?? (count > 10_000 ? 0.4 : 0.8);
  const dpr = layout.dpr;

  const stamp = getStamp(radius, color, alpha, dpr);
  const stampSize = (radius * 2 + 2);
  const offset = radius + 1; // center of stamp in CSS pixels

  // drawImage with a canvas source is a fast GPU blit — no path overhead
  for (let i = start; i <= end; i++) {
    const yVal = yData[i];
    if (yVal !== yVal) continue; // NaN

    const px = scaleX.dataToPixel(xData[i]);
    const py = scaleY.dataToPixel(yVal);

    ctx.drawImage(stamp, px - offset, py - offset, stampSize, stampSize);
  }
}

// ─── Heatmap: 2D histogram for extreme point counts ────────────

// Cache the rendered heatmap to avoid flicker on overlay-only redraws
let heatmapCache: {
  canvas: OffscreenCanvas | HTMLCanvasElement;
  w: number;
  h: number;
  dataLen: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  binSize: number;
} | null = null;

function drawHeatmap(
  ctx: CanvasRenderingContext2D,
  xData: Float64Array,
  yData: Float64Array,
  start: number,
  end: number,
  scaleX: Scale,
  scaleY: Scale,
  layout: Layout,
  binSizeCss?: number,
): void {
  const { plot, dpr } = layout;
  const binPx = Math.max(1, Math.round((binSizeCss ?? 1) * dpr));
  const w = Math.ceil((plot.width * dpr) / binPx);
  const h = Math.ceil((plot.height * dpr) / binPx);
  if (w <= 0 || h <= 0) return;

  const dataLen = end - start + 1;
  const bs = binSizeCss ?? 1;

  // Check cache: reuse if data and viewport haven't changed
  if (
    heatmapCache &&
    heatmapCache.w === w &&
    heatmapCache.h === h &&
    heatmapCache.dataLen === dataLen &&
    heatmapCache.xMin === scaleX.min &&
    heatmapCache.xMax === scaleX.max &&
    heatmapCache.yMin === scaleY.min &&
    heatmapCache.yMax === scaleY.max &&
    heatmapCache.binSize === bs
  ) {
    ctx.drawImage(heatmapCache.canvas, plot.left, plot.top, plot.width, plot.height);
    return;
  }

  // Bin all points
  const bins = new Uint32Array(w * h);
  let maxCount = 0;

  for (let i = start; i <= end; i++) {
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

  if (maxCount === 0) return;

  // Render to temp canvas at bin resolution
  const tmpCanvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(w, h)
    : document.createElement('canvas');
  if (!(tmpCanvas instanceof OffscreenCanvas)) {
    tmpCanvas.width = w;
    tmpCanvas.height = h;
  }
  const tmpCtx = tmpCanvas.getContext('2d')! as CanvasRenderingContext2D;
  const imageData = tmpCtx.createImageData(w, h);
  const data = imageData.data;

  for (let i = 0; i < bins.length; i++) {
    if (bins[i] === 0) continue;

    const t = Math.log(1 + bins[i]) / Math.log(1 + maxCount);
    const [r, g, b] = viridisColor(t);
    const off = i * 4;
    data[off] = r;
    data[off + 1] = g;
    data[off + 2] = b;
    data[off + 3] = 255;
  }

  tmpCtx.putImageData(imageData, 0, 0);

  // Cache for subsequent frames (e.g. overlay-only redraws)
  heatmapCache = { canvas: tmpCanvas, w, h, dataLen, xMin: scaleX.min, xMax: scaleX.max, yMin: scaleY.min, yMax: scaleY.max, binSize: bs };

  ctx.drawImage(tmpCanvas, plot.left, plot.top, plot.width, plot.height);
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
