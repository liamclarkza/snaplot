import type { Scale, Layout, SeriesConfig } from '../types';

export interface HistogramRenderSegment {
  xData: Float64Array;
  yData: Float64Array;
  startIdx: number;
  endIdx: number;
}

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
  /** Multiplied with `series.opacity`. Used by the highlight system to dim non-highlighted series. */
  opacityMultiplier: number = 1,
): void {
  renderHistogramSegments(
    ctx,
    [{ xData, yData, startIdx, endIdx }],
    scaleX,
    scaleY,
    layout,
    series,
    color,
    opacityMultiplier,
  );
}

export function renderHistogramSegments(
  ctx: CanvasRenderingContext2D,
  segments: HistogramRenderSegment[],
  scaleX: Scale,
  scaleY: Scale,
  layout: Layout,
  series: SeriesConfig,
  color: string,
  /** Multiplied with `series.opacity`. Used by the highlight system to dim non-highlighted series. */
  opacityMultiplier: number = 1,
): void {
  // X = bin edges, Y = bin counts. N+1 edges, N bins.
  // The last Y value is padding (0), so we render bins 0..N-1.
  const nBins = Math.max(0, segmentPointCount(segments) - 1); // last point is the final edge
  if (nBins <= 0) return;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(layout.plot.left, layout.plot.top, layout.plot.width, layout.plot.height, 4);
  ctx.clip();

  ctx.fillStyle = color;
  ctx.globalAlpha = (series.opacity ?? 0.75) * opacityMultiplier;
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.5;

  const baselineY = scaleY.dataToPixel(0);

  for (let s = 0; s < segments.length; s++) {
    const segment = segments[s];
    const nextSegment = segments[s + 1];
    const isLastSegment = s === segments.length - 1;
    const renderEnd = isLastSegment ? segment.endIdx - 1 : segment.endIdx;

    for (let i = segment.startIdx; i <= renderEnd; i++) {
      const count = segment.yData[i];
      if (!Number.isFinite(count) || count <= 0) continue;

      const nextX = i === segment.endIdx && nextSegment
        ? nextSegment.xData[nextSegment.startIdx]
        : segment.xData[i + 1];
      const x1 = scaleX.dataToPixel(segment.xData[i]);
      const x2 = scaleX.dataToPixel(nextX);
      const yTop = scaleY.dataToPixel(count);
      if (!Number.isFinite(x1) || !Number.isFinite(x2) || !Number.isFinite(yTop) || !Number.isFinite(baselineY)) {
        continue;
      }

      const barX = x1 + 0.5;
      const barW = Math.max(1, x2 - x1 - 1);
      const barY = Math.min(yTop, baselineY);
      const barH = Math.abs(yTop - baselineY);

      ctx.fillRect(barX, barY, barW, barH);
      ctx.strokeRect(barX, barY, barW, barH);
    }
  }

  ctx.restore();
}

function segmentPointCount(segments: HistogramRenderSegment[]): number {
  let count = 0;
  for (const segment of segments) {
    count += segment.endIdx - segment.startIdx + 1;
  }
  return count;
}
