/**
 * The band mark's draw half (plan §3.1; M11): the region between the upper and lower columns,
 * with the centre line (`yColumn`) on top. Its value axis spans both bounds.
 */
import type { ColumnarSegment } from '../../data/DataStore';
import type { Layout, Scale, SeriesSpec } from '../../spec';
import type { MarkDraw } from '../index';
import { NO_COLUMNS } from '../columns';
import { PathTracer, segmentPointCount, strokeSeriesPath } from '../line/draw';

export interface BandRenderSegment {
  xData: Float64Array;
  centerYData: Float64Array;
  upperYData: Float64Array;
  lowerYData: Float64Array;
  startIdx: number;
  endIdx: number;
}

/**
 * Render a band series: filled region between upper and lower Y columns,
 * with a center line drawn on top. A single visual unit for confidence
 * intervals, error bands, and min/max ranges.
 *
 * Tooltip and cursor snapping use `yColumn` (the center line). The
 * upper/lower fill is purely decorative.
 */
export function renderBandSegments(
  ctx: CanvasRenderingContext2D,
  segments: BandRenderSegment[],
  scaleX: Scale,
  scaleY: Scale,
  layout: Layout,
  series: SeriesSpec,
  color: string,
  opacityMultiplier: number = 1,
): void {
  if (segmentPointCount(segments) === 0) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(layout.plot.left, layout.plot.top, layout.plot.width, layout.plot.height);
  ctx.clip();

  // ── 1. Fill each run where both bounds are finite ─────────
  // A non-finite bound breaks the band, so missing data never bridges a gap. Each run is one
  // closed subpath: the upper edge forwards, then the lower edge backwards.
  if (series.fill !== null) {
    ctx.fillStyle = typeof series.fill === 'string' ? series.fill : color;
    ctx.globalAlpha = (series.opacity ?? 0.15) * opacityMultiplier;
    const tracer = new PathTracer(ctx, series.interpolation ?? 'linear');
    const xs: number[] = [];
    const uppers: number[] = [];
    const lowers: number[] = [];
    const flush = () => {
      if (xs.length > 0) {
        tracer.begin();
        for (let i = 0; i < xs.length; i++) tracer.point(xs[i], uppers[i]);
        tracer.end();
        tracer.begin(true);
        for (let i = xs.length - 1; i >= 0; i--) tracer.point(xs[i], lowers[i]);
        tracer.end();
        ctx.closePath();
      }
      xs.length = 0;
      uppers.length = 0;
      lowers.length = 0;
    };

    ctx.beginPath();
    for (const segment of segments) {
      const { xData, upperYData, lowerYData, startIdx, endIdx } = segment;
      for (let i = startIdx; i <= endIdx; i++) {
        const px = scaleX.dataToPixel(xData[i]);
        const upper = scaleY.dataToPixel(upperYData[i]);
        const lower = scaleY.dataToPixel(lowerYData[i]);
        if (Number.isFinite(px) && Number.isFinite(upper) && Number.isFinite(lower)) {
          xs.push(px);
          uppers.push(upper);
          lowers.push(lower);
        } else {
          flush();
        }
      }
    }
    flush();
    ctx.fill();
  }

  // ── 2. Stroke the center line on top ──────────────────────
  ctx.globalAlpha = opacityMultiplier;
  strokeSeriesPath(
    ctx,
    segments.map(({ xData, centerYData, startIdx, endIdx }) => ({
      xData,
      yData: centerYData,
      startIdx,
      endIdx,
    })),
    scaleX,
    scaleY,
    series,
    color,
  );

  ctx.restore();
}

export function bandRenderSegments(
  segments: ColumnarSegment[],
  xData: Float64Array,
  centerYData: Float64Array,
  upperYData: Float64Array,
  lowerYData: Float64Array,
): BandRenderSegment[] {
  return segments.map((segment) => ({
    xData,
    centerYData,
    upperYData,
    lowerYData,
    startIdx: segment.physicalStart,
    endIdx: segment.physicalEnd,
  }));
}

export const bandDraw: MarkDraw = {
  x: 'continuous',
  zeroBased: false,
  cloud: false,
  interaction: 'none',
  xColumn: () => 0,
  // The value axis spans the bounds too, upper first.
  extentColumns: (series) =>
    series.upperColumn == null && series.lowerColumn == null
      ? NO_COLUMNS
      : [series.upperColumn, series.lowerColumn].filter(
          (column): column is number => column != null,
        ),
  legendFill: (color) => color,
  draw(pass) {
    const { series, store } = pass;
    const upperIdx = series.upperColumn;
    const lowerIdx = series.lowerColumn;
    if (
      upperIdx != null &&
      lowerIdx != null &&
      upperIdx >= 1 &&
      lowerIdx >= 1 &&
      upperIdx <= store.seriesCount &&
      lowerIdx <= store.seriesCount
    ) {
      const upperYData = store.getPhysicalColumn(upperIdx);
      const lowerYData = store.getPhysicalColumn(lowerIdx);
      renderBandSegments(
        pass.ctx,
        bandRenderSegments(pass.runs, pass.xData, pass.yData, upperYData, lowerYData),
        pass.xScale,
        pass.yScale,
        pass.engine.layout,
        series,
        pass.color,
        pass.opacity,
      );
    }
  },
};
