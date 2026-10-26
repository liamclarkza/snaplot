/**
 * The area mark's draw half (plan §3.1; M11): a gradient fill down to the plot's bottom edge under
 * a stroke, M4-decimated like a line while a gesture moves the viewport.
 */
import { affineParams } from '../../scales/affine';
import type { Layout, Scale, SeriesSpec } from '../../spec';
import { withAlpha } from '../../theme/color';
import type { MarkDraw } from '../index';
import { NO_COLUMNS } from '../columns';
import { type LineRenderSegment, segmentPointCount } from '../line/draw';

export function renderAreaSegments(
  ctx: CanvasRenderingContext2D,
  segments: LineRenderSegment[],
  scaleX: Scale,
  scaleY: Scale,
  layout: Layout,
  series: SeriesSpec,
  color: string,
  /** Multiplied with `series.opacity`. Used by the highlight system to dim non-highlighted series. */
  opacityMultiplier: number = 1,
): void {
  if (segments.length === 0) return;
  if (segmentPointCount(segments) <= 1) return;

  // Clip to plot area
  ctx.save();
  ctx.beginPath();
  ctx.rect(layout.plot.left, layout.plot.top, layout.plot.width, layout.plot.height);
  ctx.clip();
  ctx.globalAlpha = opacityMultiplier;

  const baselineY = layout.plot.top + layout.plot.height;

  // Gradient fill (alpha 0.3 top → 0.05 bottom, per spec §4.2)
  if (series.fillGradient) {
    const grad = ctx.createLinearGradient(0, layout.plot.top, 0, baselineY);
    grad.addColorStop(0, series.fillGradient.top);
    grad.addColorStop(1, series.fillGradient.bottom);
    ctx.fillStyle = grad;
  } else {
    const grad = ctx.createLinearGradient(0, layout.plot.top, 0, baselineY);
    grad.addColorStop(0, withAlpha(color, 0.3));
    grad.addColorStop(1, withAlpha(color, 0.05));
    ctx.fillStyle = grad;
  }

  // Hoist affine transforms; both the fill and stroke passes reuse them.
  const ax = affineParams(scaleX);
  const ay = affineParams(scaleY);
  const kx = ax ? ax[0] : 0;
  const bx = ax ? ax[1] : 0;
  const ky = ay ? ay[0] : 0;
  const by = ay ? ay[1] : 0;
  const projX = (v: number) => (ax ? v * kx + bx : scaleX.dataToPixel(v));
  const projY = (v: number) => (ay ? v * ky + by : scaleY.dataToPixel(v));

  // Fill each contiguous valid segment separately so NaN gaps stay visible
  // (unless the series opts into spanGaps, which fills straight across).
  const spanGaps = series.spanGaps === true;
  let firstPx = 0;
  let lastPx = 0;
  let hasSegment = false;
  let hasAnySegment = false;

  const closeAndFillSegment = () => {
    ctx.lineTo(lastPx, baselineY);
    ctx.lineTo(firstPx, baselineY);
    ctx.closePath();
    ctx.fill();
  };

  for (const segment of segments) {
    const { xData, yData, startIdx, endIdx } = segment;
    for (let i = startIdx; i <= endIdx; i++) {
      const yVal = yData[i];
      if (!Number.isFinite(yVal)) {
        if (hasSegment && !spanGaps) {
          closeAndFillSegment();
          hasSegment = false;
        }
        continue;
      }

      const px = projX(xData[i]);
      const py = projY(yVal);
      if (!Number.isFinite(px) || !Number.isFinite(py)) {
        if (hasSegment && !spanGaps) {
          closeAndFillSegment();
          hasSegment = false;
        }
        continue;
      }

      if (!hasSegment) {
        ctx.beginPath();
        ctx.moveTo(px, py);
        firstPx = px;
        hasSegment = true;
        hasAnySegment = true;
      } else {
        ctx.lineTo(px, py);
      }
      lastPx = px;
    }
  }

  if (hasSegment) closeAndFillSegment();
  if (!hasAnySegment) {
    ctx.restore();
    return;
  }

  // Stroke the line on top
  ctx.beginPath();
  let hasPath = false;
  for (const segment of segments) {
    const { xData, yData, startIdx, endIdx } = segment;
    for (let i = startIdx; i <= endIdx; i++) {
      const yVal = yData[i];
      if (!Number.isFinite(yVal)) {
        if (!spanGaps) hasPath = false;
        continue;
      }
      const px = projX(xData[i]);
      const py = projY(yVal);
      if (!Number.isFinite(px) || !Number.isFinite(py)) {
        if (!spanGaps) hasPath = false;
        continue;
      }
      if (!hasPath) {
        ctx.moveTo(px, py);
        hasPath = true;
      } else {
        ctx.lineTo(px, py);
      }
    }
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = series.lineWidth ?? 1.5;
  ctx.lineJoin = 'round';
  if (series.dash && series.dash.length > 0) {
    ctx.setLineDash(series.dash);
  }
  ctx.stroke();

  ctx.restore();
}

export const areaDraw: MarkDraw = {
  x: 'continuous',
  zeroBased: false,
  cloud: false,
  interaction: 'decimate',
  xColumn: () => 0,
  extentColumns: () => NO_COLUMNS,
  legendFill: (color) => color,
  draw: (pass) =>
    renderAreaSegments(
      pass.ctx,
      pass.segments,
      pass.xScale,
      pass.yScale,
      pass.engine.layout,
      pass.series,
      pass.color,
      pass.opacity,
    ),
};
