import type { SeriesConfig } from '../types';

export interface BarRenderPoint {
  centerX: number;
  ordinal: number;
}

export interface BarRect {
  left: number;
  width: number;
}

export function categoryWidthFromCenters(
  centers: number[],
  ordinal: number,
  // Thunk so a caller can derive an expensive fallback (e.g. projecting a
  // data-space spacing) only when the pixel neighbors can't supply a width.
  fallbackWidth: number | (() => number),
): number {
  // Gather only finite, positive neighbor gaps. A non-finite neighbor center
  // (e.g. a log-X point that projects to NaN) must not poison Math.min and
  // collapse the whole category to the fallback; the other neighbor still
  // gives a usable spacing.
  const center = centers[ordinal];
  let width = Infinity;
  if (ordinal > 0 && Number.isFinite(center) && Number.isFinite(centers[ordinal - 1])) {
    const gap = Math.abs(center - centers[ordinal - 1]);
    if (gap > 0) width = Math.min(width, gap);
  }
  if (ordinal < centers.length - 1 && Number.isFinite(center) && Number.isFinite(centers[ordinal + 1])) {
    const gap = Math.abs(centers[ordinal + 1] - center);
    if (gap > 0) width = Math.min(width, gap);
  }
  if (Number.isFinite(width) && width > 0) return width;
  return typeof fallbackWidth === 'function' ? fallbackWidth() : fallbackWidth;
}

export function categoryWidthFromData(
  xAt: (index: number) => number,
  index: number,
  count: number,
  fallbackWidth = 1,
): number {
  if (count <= 1) return fallbackWidth;

  const x = xAt(index);
  const prevGap = index > 0 ? Math.abs(x - xAt(index - 1)) : Infinity;
  const nextGap = index < count - 1 ? Math.abs(xAt(index + 1) - x) : Infinity;
  const width = Math.min(prevGap, nextGap);
  return Number.isFinite(width) && width > 0 ? width : fallbackWidth;
}

export function barRectForCategory(params: {
  centerX: number;
  categoryWidth: number;
  series: SeriesConfig;
  barSeriesIndex: number;
  totalBarSeries: number;
}): BarRect {
  const outerPadding = 0.2;
  const innerPadding = 0.1;
  const widthRatio = params.series.barWidthRatio ?? 0.8;
  const total = Math.max(1, params.totalBarSeries);
  const groupWidth = params.categoryWidth * (1 - outerPadding) * widthRatio;
  const barWidth = groupWidth / total;
  const barGap = barWidth * innerPadding;
  const effectiveBarWidth = Math.max(1, barWidth - barGap);
  const groupLeft = params.centerX - groupWidth / 2;
  return {
    left: groupLeft + params.barSeriesIndex * barWidth + barGap / 2,
    width: effectiveBarWidth,
  };
}
