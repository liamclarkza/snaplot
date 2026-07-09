import type { Scale, Layout, SeriesConfig } from '../types';
import { barRectForCategory, categoryWidthFromCenters } from './barGeometry';

export interface BarRenderSegment {
  xData: Float64Array;
  yData: Float64Array;
  startIdx: number;
  endIdx: number;
  /**
   * Logical index of startIdx's datum. Ring-buffer stores wrap, so the
   * physical position differs from the index the user's data was appended
   * at; per-datum fill callbacks receive the logical index. Defaults to
   * startIdx (contiguous stores).
   */
  logicalStartIdx?: number;
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

  // Fill precedence: series.fill (string, or a per-datum callback for
  // emphasis patterns like "highlight the latest bar"), then the series
  // color. `fill: null` keeps the series color; bars cannot be fill-less.
  const fillFn = typeof series.fill === 'function' ? series.fill : null;
  ctx.fillStyle = typeof series.fill === 'string' ? series.fill : color;
  ctx.globalAlpha = (series.opacity ?? 0.85) * opacityMultiplier;

  const centers: number[] = [];
  for (const segment of segments) {
    const { xData, startIdx, endIdx } = segment;
    for (let i = startIdx; i <= endIdx; i++) {
      centers.push(scaleX.dataToPixel(xData[i]));
    }
  }

  // Baseline Y (where value = 0). A log Y scale has no pixel for 0
  // (dataToPixel(0) is NaN), which would skip every bar; anchor those to the
  // scale minimum (the plot bottom) instead.
  const baselinePixel = scaleY.type === 'log'
    ? scaleY.dataToPixel(scaleY.min)
    : scaleY.dataToPixel(0);

  // Fallback category width for a lone/edge bar (viewport culling leaves one
  // visible, or both pixel neighbors are non-finite): derive it from the
  // data-space spacing around the bar projected through the scale, so a
  // single visible bar keeps its data width instead of ballooning to a fixed
  // fraction of the plot.
  const dataCategoryWidthPx = (physIdx: number, xData: Float64Array, centerX: number): number => {
    const n = xData.length;
    if (n > 1) {
      const x = xData[physIdx];
      const prev = physIdx > 0 ? Math.abs(x - xData[physIdx - 1]) : Infinity;
      const next = physIdx < n - 1 ? Math.abs(xData[physIdx + 1] - x) : Infinity;
      const stepData = Math.min(prev, next);
      if (Number.isFinite(stepData) && stepData > 0) {
        const w = Math.abs(scaleX.dataToPixel(x + stepData) - centerX);
        if (Number.isFinite(w) && w > 0) return w;
      }
    }
    return layout.plot.width * 0.5;
  };

  let ordinal = 0;
  for (const segment of segments) {
    const { xData, yData, startIdx, endIdx } = segment;
    const logicalOffset = (segment.logicalStartIdx ?? startIdx) - startIdx;
    for (let i = startIdx; i <= endIdx; i++) {
      const yVal = yData[i];
      const centerX = centers[ordinal++];
      if (!Number.isFinite(yVal)) continue;

      if (!Number.isFinite(centerX)) continue;
      const categoryWidth = categoryWidthFromCenters(
        centers,
        ordinal - 1,
        () => dataCategoryWidthPx(i, xData, centerX),
      );
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

      if (fillFn) ctx.fillStyle = fillFn(yVal, i + logicalOffset);
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
