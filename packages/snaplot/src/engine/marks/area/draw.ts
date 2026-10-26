/**
 * The area mark's draw half (plan §3.1; M11): a fill between the curve and zero under a stroke,
 * both in the series' interpolation, M4-decimated like a line while a gesture moves the viewport.
 */
import type { Layout, Scale, SeriesSpec } from '../../spec';
import { withAlpha } from '../../theme/color';
import type { MarkDraw } from '../index';
import { NO_COLUMNS } from '../columns';
import {
  type LineRenderSegment,
  PathTracer,
  segmentPointCount,
  strokeSeriesPath,
  tracePath,
} from '../line/draw';

/**
 * Render an area: `fill` paints exactly as given (`null` paints none); by default a ramp of
 * `color` runs from 30% alpha at the plot edge away from zero to 5% at zero. `opacity` scales the
 * whole mark, fill and stroke, like a line's.
 */
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
  if (segmentPointCount(segments) === 0) return;

  const { plot } = layout;
  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.left, plot.top, plot.width, plot.height);
  ctx.clip();
  ctx.globalAlpha = (series.opacity ?? 1) * opacityMultiplier;

  const fill = areaFill(ctx, layout, series, color, scaleY);
  if (fill) {
    const { baseline } = fill;
    ctx.fillStyle = fill.style;
    // Each run between gaps is its own closed subpath down to zero, so gaps stay visible
    // (unless the series opts into spanGaps, which fills straight across).
    const tracer = new PathTracer(ctx, series.interpolation ?? 'linear');
    ctx.beginPath();
    tracePath(tracer, segments, scaleX, scaleY, series.spanGaps === true, () => {
      ctx.lineTo(tracer.lastX, baseline);
      ctx.lineTo(tracer.firstX, baseline);
      ctx.closePath();
    });
    ctx.fill();
  }

  strokeSeriesPath(ctx, segments, scaleX, scaleY, series, color);
  ctx.restore();
}

/** The area's fill style and the pixel row of zero (clamped into the plot), or null for none. */
function areaFill(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  series: SeriesSpec,
  color: string,
  scaleY: Scale,
): { style: string | CanvasGradient; baseline: number } | null {
  if (series.fill === null) return null;
  const { plot } = layout;
  const top = plot.top;
  const bottom = plot.top + plot.height;
  const zero = scaleY.dataToPixel(0);
  // Zero off a log axis or outside the domain: fill to the nearer edge.
  const baseline = Number.isFinite(zero) ? Math.max(top, Math.min(bottom, zero)) : bottom;
  if (typeof series.fill === 'string') return { style: series.fill, baseline };

  // Strongest at the plot edges, faintest at zero, so negative areas ramp the same way.
  const grad = ctx.createLinearGradient(0, top, 0, bottom);
  const at = plot.height > 0 ? (baseline - top) / plot.height : 1;
  const strong = withAlpha(color, 0.3);
  const faint = withAlpha(color, 0.05);
  if (at > 0) grad.addColorStop(0, strong);
  grad.addColorStop(at, faint);
  if (at < 1) grad.addColorStop(1, strong);
  return { style: grad, baseline };
}

export const areaDraw: MarkDraw = {
  x: 'continuous',
  zeroBased: true,
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
