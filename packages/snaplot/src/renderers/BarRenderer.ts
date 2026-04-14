import type { Scale, Layout, SeriesConfig } from '../types';

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
  if (endIdx < startIdx) return;

  const count = endIdx - startIdx + 1;
  if (count === 0) return;

  // Clip to plot area
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(layout.plot.left, layout.plot.top, layout.plot.width, layout.plot.height, 4);
  ctx.clip();

  ctx.fillStyle = color;
  ctx.globalAlpha = (series.opacity ?? 0.85) * opacityMultiplier;

  const outerPadding = 0.2;
  const innerPadding = 0.1;
  const widthRatio = series.barWidthRatio ?? 0.8;

  // Compute bar width based on data point spacing
  let categoryWidth: number;
  if (count > 1) {
    // Use average spacing between adjacent X values
    const xRange = scaleX.dataToPixel(xData[endIdx]) - scaleX.dataToPixel(xData[startIdx]);
    categoryWidth = xRange / (count - 1);
  } else {
    categoryWidth = layout.plot.width * 0.5;
  }

  const groupWidth = categoryWidth * (1 - outerPadding) * widthRatio;
  const barWidth = groupWidth / totalBarSeries;
  const barGap = barWidth * innerPadding;
  const effectiveBarWidth = barWidth - barGap;

  // Baseline Y (where value = 0)
  const baselinePixel = scaleY.dataToPixel(0);

  for (let i = startIdx; i <= endIdx; i++) {
    const yVal = yData[i];
    if (yVal !== yVal) continue; // NaN

    const centerX = scaleX.dataToPixel(xData[i]);
    const groupLeft = centerX - groupWidth / 2;
    const barLeft = groupLeft + barSeriesIndex * barWidth + barGap / 2;
    const barTop = scaleY.dataToPixel(yVal);

    // Bar goes from barTop to baseline (supports negative values)
    const y = Math.min(barTop, baselinePixel);
    const h = Math.abs(barTop - baselinePixel);

    ctx.fillRect(barLeft, y, effectiveBarWidth, h);
  }

  ctx.restore();
}
