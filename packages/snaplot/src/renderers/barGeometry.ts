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
  fallbackWidth: number,
): number {
  if (centers.length <= 1) return fallbackWidth;

  const prevGap = ordinal > 0 ? Math.abs(centers[ordinal] - centers[ordinal - 1]) : Infinity;
  const nextGap = ordinal < centers.length - 1 ? Math.abs(centers[ordinal + 1] - centers[ordinal]) : Infinity;
  const width = Math.min(prevGap, nextGap);
  return Number.isFinite(width) && width > 0 ? width : fallbackWidth;
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
