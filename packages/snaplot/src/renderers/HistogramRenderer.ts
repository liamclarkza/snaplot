import type { Scale, Layout, SeriesConfig } from '../types';

/**
 * Histogram renderer.
 *
 * Expects pre-computed bin data as ColumnarData:
 *   X column = bin edges (N+1 values, sorted)
 *   Y column = bin counts (N+1 values, last is padding 0)
 *
 * The user computes bins via the `histogram()` utility and passes
 * the result as chart data. The renderer only draws.
 */

export function renderHistogram(
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
  // X = bin edges, Y = bin counts. N+1 edges, N bins.
  // The last Y value is padding (0), so we render bins 0..N-1.
  const nBins = Math.max(0, endIdx - startIdx); // endIdx points to last edge
  if (nBins <= 0) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(layout.plot.left, layout.plot.top, layout.plot.width, layout.plot.height);
  ctx.clip();

  ctx.fillStyle = color;
  ctx.globalAlpha = series.opacity ?? 0.75;
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.5;

  const baselineY = scaleY.dataToPixel(0);

  for (let i = startIdx; i < endIdx; i++) {
    const count = yData[i];
    if (count === 0) continue;

    const x1 = scaleX.dataToPixel(xData[i]);
    const x2 = scaleX.dataToPixel(xData[i + 1]);
    const yTop = scaleY.dataToPixel(count);

    const barX = x1 + 0.5;
    const barW = Math.max(1, x2 - x1 - 1);
    const barY = Math.min(yTop, baselineY);
    const barH = Math.abs(yTop - baselineY);

    ctx.fillRect(barX, barY, barW, barH);
    ctx.strokeRect(barX, barY, barW, barH);
  }

  ctx.restore();
}
