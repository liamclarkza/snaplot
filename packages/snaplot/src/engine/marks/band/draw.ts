/**
 * The band mark's draw half (plan §3.1; M11): the region between the upper and lower columns,
 * with the centre line (`yColumn`) on top. Its value axis spans both bounds.
 */
import type { ColumnarSegment } from '../../data/DataStore';
import type { Layout, Scale, SeriesSpec } from '../../spec';
import type { MarkDraw } from '../index';
import { NO_COLUMNS } from '../columns';
import { segmentPointCount } from '../line/draw';

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
  if (segments.length === 0) return;
  if (segmentPointCount(segments) <= 1) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(layout.plot.left, layout.plot.top, layout.plot.width, layout.plot.height);
  ctx.clip();

  // ── 1. Fill contiguous bound segments ─────────────────────
  // NaN in either bound breaks the band. Render each segment separately so
  // missing data does not create a filled bridge across the gap.
  // Per-datum fill callbacks are a bar-series feature; a band uses one fill.
  const fillColor = typeof series.fill === 'string' ? series.fill : color;
  const fillOpacity = series.opacity ?? 0.15;
  ctx.fillStyle = fillColor;
  ctx.globalAlpha = fillOpacity * opacityMultiplier;

  const fillBandRuns = (runs: BandRenderSegment[]) => {
    if (runs.length === 0) return;
    ctx.beginPath();

    // Forward path along upper edge
    let moved = false;
    for (const run of runs) {
      for (let i = run.startIdx; i <= run.endIdx; i++) {
        const px = scaleX.dataToPixel(run.xData[i]);
        const py = scaleY.dataToPixel(run.upperYData[i]);
        if (!moved) {
          ctx.moveTo(px, py);
          moved = true;
        } else {
          ctx.lineTo(px, py);
        }
      }
    }

    // Reverse path along lower edge
    for (let r = runs.length - 1; r >= 0; r--) {
      const run = runs[r];
      for (let i = run.endIdx; i >= run.startIdx; i--) {
        const px = scaleX.dataToPixel(run.xData[i]);
        const py = scaleY.dataToPixel(run.lowerYData[i]);
        ctx.lineTo(px, py);
      }
    }
    ctx.closePath();
    ctx.fill();
  };

  const runs: BandRenderSegment[] = [];
  let runStart = -1;
  for (const segment of segments) {
    const { xData, centerYData, upperYData, lowerYData, startIdx, endIdx } = segment;
    for (let i = startIdx; i <= endIdx; i++) {
      const u = upperYData[i],
        l = lowerYData[i];
      const valid =
        Number.isFinite(xData[i]) &&
        Number.isFinite(u) &&
        Number.isFinite(l) &&
        Number.isFinite(scaleX.dataToPixel(xData[i])) &&
        Number.isFinite(scaleY.dataToPixel(u)) &&
        Number.isFinite(scaleY.dataToPixel(l));
      if (valid && runStart < 0) {
        runStart = i;
      } else if (!valid) {
        if (runStart >= 0) {
          runs.push({
            xData,
            centerYData,
            upperYData,
            lowerYData,
            startIdx: runStart,
            endIdx: i - 1,
          });
          runStart = -1;
        }
        if (runs.length > 0) {
          fillBandRuns(runs);
          runs.length = 0;
        }
      }
    }

    if (runStart >= 0) {
      runs.push({ xData, centerYData, upperYData, lowerYData, startIdx: runStart, endIdx });
      runStart = -1;
    }
  }
  if (runs.length > 0) fillBandRuns(runs);

  // ── 2. Stroke the center line on top ──────────────────────
  const strokeWidth = series.lineWidth ?? 1.5;
  if (strokeWidth > 0) {
    ctx.globalAlpha = opacityMultiplier;
    ctx.beginPath();
    let moved = false;
    for (const segment of segments) {
      const { xData, centerYData, startIdx, endIdx } = segment;
      for (let i = startIdx; i <= endIdx; i++) {
        const yVal = centerYData[i];
        if (!Number.isFinite(yVal)) {
          moved = false;
          continue;
        }
        const px = scaleX.dataToPixel(xData[i]);
        const py = scaleY.dataToPixel(yVal);
        if (!Number.isFinite(px) || !Number.isFinite(py)) {
          moved = false;
          continue;
        }
        if (!moved) {
          ctx.moveTo(px, py);
          moved = true;
        } else {
          ctx.lineTo(px, py);
        }
      }
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = strokeWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (series.dash && series.dash.length > 0) {
      ctx.setLineDash(series.dash);
    }
    ctx.stroke();
  }

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
