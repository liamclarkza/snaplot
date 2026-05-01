import type { Scale, Layout, SeriesConfig } from '../types';
import { barRectForCategory, categoryWidthFromCenters } from './barGeometry';

export interface BarRenderSegment {
  xData: Float64Array;
  yData: Float64Array;
  startIdx: number;
  endIdx: number;
}

/**
 * Bar chart renderer. Supports grouped (side-by-side) bars.
 *
 * Width calculation per spec §4.6:
 *   categoryWidth = plotWidth / categoryCount
 *   groupWidth = categoryWidth * (1 - outerPadding)
 *   barWidth = groupWidth / seriesCount
 */

export function renderBars(
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
  /** Index of this series among bar-type series */
  barSeriesIndex: number,
  /** Total number of bar-type series (for grouped width) */
  totalBarSeries: number,
  /** Multiplied with `series.opacity`. Used by the highlight system to dim non-highlighted series. */
  opacityMultiplier: number = 1,
): void {
  renderBarsSegments(
    ctx,
    [{ xData, yData, startIdx, endIdx }],
    scaleX,
    scaleY,
    layout,
    series,
    color,
    barSeriesIndex,
    totalBarSeries,
    opacityMultiplier,
  );
}

export function renderBarsSegments(
  ctx: CanvasRenderingContext2D,
  segments: BarRenderSegment[],
  scaleX: Scale,
  scaleY: Scale,
  layout: Layout,
  series: SeriesConfig,
  color: string,
  /** Index of this series among bar-type series */
  barSeriesIndex: number,
  /** Total number of bar-type series (for grouped width) */
  totalBarSeries: number,
  /** Multiplied with `series.opacity`. Used by the highlight system to dim non-highlighted series. */
  opacityMultiplier: number = 1,
): void {
  if (segments.length === 0) return;

  const count = segmentPointCount(segments);
  if (count === 0) return;

  // Clip to plot area
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(layout.plot.left, layout.plot.top, layout.plot.width, layout.plot.height, 4);
  ctx.clip();

  ctx.fillStyle = color;
  ctx.globalAlpha = (series.opacity ?? 0.85) * opacityMultiplier;

  const centers: number[] = [];
  for (const segment of segments) {
    const { xData, startIdx, endIdx } = segment;
    for (let i = startIdx; i <= endIdx; i++) {
      centers.push(scaleX.dataToPixel(xData[i]));
    }
  }

  // Baseline Y (where value = 0)
  const baselinePixel = scaleY.dataToPixel(0);

  let ordinal = 0;
  for (const segment of segments) {
    const { yData, startIdx, endIdx } = segment;
    for (let i = startIdx; i <= endIdx; i++) {
      const yVal = yData[i];
      const centerX = centers[ordinal++];
      if (!Number.isFinite(yVal)) continue;

      if (!Number.isFinite(centerX)) continue;
      const categoryWidth = categoryWidthFromCenters(centers, ordinal - 1, layout.plot.width * 0.5);
      const rect = barRectForCategory({
        centerX,
        categoryWidth,
        series,
        barSeriesIndex,
        totalBarSeries,
      });
      const barTop = scaleY.dataToPixel(yVal);
      if (!Number.isFinite(barTop) || !Number.isFinite(baselinePixel)) continue;

      // Bar goes from barTop to baseline (supports negative values)
      const y = Math.min(barTop, baselinePixel);
      const h = Math.abs(barTop - baselinePixel);

      ctx.fillRect(rect.left, y, rect.width, h);
    }
  }

  ctx.restore();
}

function segmentPointCount(segments: BarRenderSegment[]): number {
  let count = 0;
  for (const segment of segments) {
    count += segment.endIdx - segment.startIdx + 1;
  }
  return count;
}
