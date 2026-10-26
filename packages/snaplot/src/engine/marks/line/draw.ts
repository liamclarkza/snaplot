/**
 * The line mark's draw half (plan §3.1; M11): a stroke through the points, M4-decimated while a
 * gesture moves the viewport, plus the path builders (linear, stepped, monotone) and the point
 * count the area and band marks share.
 */
import { affineParams } from '../../scales/affine';
import type { Layout, Scale, SeriesSpec } from '../../spec';
import { NO_COLUMNS } from '../columns';
import type { MarkDraw } from '../index';

export interface LineRenderSegment {
  xData: Float64Array;
  yData: Float64Array;
  startIdx: number;
  endIdx: number;
}

/**
 * Line and area chart renderer. Pure function, no state.
 *
 * Interpolation modes:
 * - linear: moveTo/lineTo (fastest, most honest)
 * - monotone: Fritsch-Carlson monotone cubic (no overshoot)
 * - step-before/after/middle: horizontal-then-vertical segments
 *
 * Missing-value handling: non-finite Y (NaN, Infinity) breaks the path,
 * the next valid point starts with moveTo(). `series.spanGaps` skips the
 * break and connects across the gap instead.
 */

export function renderLineSegments(
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

  const interp = series.interpolation ?? 'linear';
  const lineWidth = series.lineWidth ?? 1.5;

  // Clip to plot area
  ctx.save();
  ctx.beginPath();
  ctx.rect(layout.plot.left, layout.plot.top, layout.plot.width, layout.plot.height);
  ctx.clip();

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.globalAlpha = (series.opacity ?? 1) * opacityMultiplier;

  // Apply dash pattern (if configured)
  if (series.dash && series.dash.length > 0) {
    ctx.setLineDash(series.dash);
  }

  const spanGaps = series.spanGaps === true;
  if (interp === 'monotone') {
    drawMonotoneCubicSegments(ctx, segments, scaleX, scaleY, spanGaps);
  } else if (interp.startsWith('step')) {
    drawSteppedSegments(ctx, segments, scaleX, scaleY, interp, spanGaps);
  } else {
    drawLinearSegments(ctx, segments, scaleX, scaleY, spanGaps);
  }

  ctx.stroke();
  ctx.restore();
}

export const lineDraw: MarkDraw = {
  x: 'continuous',
  zeroBased: false,
  cloud: false,
  interaction: 'decimate',
  xColumn: () => 0,
  extentColumns: () => NO_COLUMNS,
  legendFill: () => null,
  draw: (pass) =>
    renderLineSegments(
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

// ─── Linear interpolation ──────────────────────────────────────

function drawLinearSegments(
  ctx: CanvasRenderingContext2D,
  segments: LineRenderSegment[],
  scaleX: Scale,
  scaleY: Scale,
  spanGaps: boolean,
): void {
  ctx.beginPath();
  let moved = false;

  // Hoist affine scale transforms so the hot loop is inline multiply-add
  // instead of a polymorphic dataToPixel call per point; log/custom scales
  // fall back to the method path.
  const ax = affineParams(scaleX);
  const ay = affineParams(scaleY);
  const kx = ax ? ax[0] : 0;
  const bx = ax ? ax[1] : 0;
  const ky = ay ? ay[0] : 0;
  const by = ay ? ay[1] : 0;

  for (const segment of segments) {
    const { xData, yData, startIdx, endIdx } = segment;
    for (let i = startIdx; i <= endIdx; i++) {
      const yVal = yData[i];
      if (!Number.isFinite(yVal)) {
        if (!spanGaps) moved = false;
        continue;
      }

      const px = ax ? xData[i] * kx + bx : scaleX.dataToPixel(xData[i]);
      const py = ay ? yVal * ky + by : scaleY.dataToPixel(yVal);
      if (!Number.isFinite(px) || !Number.isFinite(py)) {
        if (!spanGaps) moved = false;
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
}

// ─── Stepped interpolation ─────────────────────────────────────

function drawSteppedSegments(
  ctx: CanvasRenderingContext2D,
  segments: LineRenderSegment[],
  scaleX: Scale,
  scaleY: Scale,
  mode: string,
  spanGaps: boolean,
): void {
  ctx.beginPath();
  let moved = false;
  let prevPx = 0,
    prevPy = 0;

  for (const segment of segments) {
    const { xData, yData, startIdx, endIdx } = segment;
    for (let i = startIdx; i <= endIdx; i++) {
      const yVal = yData[i];
      if (!Number.isFinite(yVal)) {
        if (!spanGaps) moved = false;
        continue;
      }

      const px = scaleX.dataToPixel(xData[i]);
      const py = scaleY.dataToPixel(yVal);
      if (!Number.isFinite(px) || !Number.isFinite(py)) {
        if (!spanGaps) moved = false;
        continue;
      }

      if (!moved) {
        ctx.moveTo(px, py);
        moved = true;
      } else {
        if (mode === 'step-after') {
          // Horizontal to new X at old Y, then vertical
          ctx.lineTo(px, prevPy);
          ctx.lineTo(px, py);
        } else if (mode === 'step-before') {
          // Vertical at old X to new Y, then horizontal
          ctx.lineTo(prevPx, py);
          ctx.lineTo(px, py);
        } else {
          // step-middle: horizontal to midpoint, vertical, horizontal
          const midX = (prevPx + px) / 2;
          ctx.lineTo(midX, prevPy);
          ctx.lineTo(midX, py);
          ctx.lineTo(px, py);
        }
      }
      prevPx = px;
      prevPy = py;
    }
  }
}

// ─── Monotone cubic (Fritsch-Carlson) ──────────────────────────

/**
 * Fritsch-Carlson monotone cubic interpolation.
 * Guarantees no overshoot between data points.
 * Per spec §4.4: "critical for metrics that can't go negative"
 */
function drawMonotoneCubicSegments(
  ctx: CanvasRenderingContext2D,
  segments: LineRenderSegment[],
  scaleX: Scale,
  scaleY: Scale,
  spanGaps: boolean,
): void {
  ctx.beginPath();
  let px: number[] = [];
  let py: number[] = [];

  const flushRun = () => {
    drawMonotoneRun(ctx, px, py);
    px = [];
    py = [];
  };

  // Runs accumulate across segment boundaries: a ring buffer splits
  // logically contiguous data into two physical segments, and flushing
  // between them would leave a visible gap in the curve at the seam.
  for (const segment of segments) {
    const { xData, yData, startIdx, endIdx } = segment;
    for (let i = startIdx; i <= endIdx; i++) {
      const yVal = yData[i];
      if (!Number.isFinite(yVal)) {
        if (!spanGaps) flushRun();
        continue;
      }
      const x = scaleX.dataToPixel(xData[i]);
      const y = scaleY.dataToPixel(yVal);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        if (!spanGaps) flushRun();
        continue;
      }
      px.push(x);
      py.push(y);
    }
  }

  flushRun();
}

function drawMonotoneRun(ctx: CanvasRenderingContext2D, px: number[], py: number[]): void {
  const n = px.length;
  if (n === 0) return;
  if (n === 1) {
    ctx.moveTo(px[0], py[0]);
    return;
  }
  if (n === 2) {
    ctx.moveTo(px[0], py[0]);
    ctx.lineTo(px[1], py[1]);
    return;
  }

  // Compute tangent slopes
  const dx: number[] = new Array(n - 1);
  const dy: number[] = new Array(n - 1);
  const slopes: number[] = new Array(n - 1);

  for (let i = 0; i < n - 1; i++) {
    dx[i] = px[i + 1] - px[i];
    dy[i] = py[i + 1] - py[i];
    slopes[i] = dx[i] === 0 ? 0 : dy[i] / dx[i];
  }

  // Compute tangents using Fritsch-Carlson method
  const tangents: number[] = new Array(n);
  tangents[0] = slopes[0];
  tangents[n - 1] = slopes[n - 2];

  for (let i = 1; i < n - 1; i++) {
    if (slopes[i - 1] * slopes[i] <= 0) {
      // Sign change → zero tangent (monotonicity constraint)
      tangents[i] = 0;
    } else {
      // Harmonic mean
      tangents[i] = (slopes[i - 1] + slopes[i]) / 2;
    }
  }

  // Fritsch-Carlson monotonicity correction
  for (let i = 0; i < n - 1; i++) {
    if (slopes[i] === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }

    const alpha = tangents[i] / slopes[i];
    const beta = tangents[i + 1] / slopes[i];

    // Ensure we stay in the monotonicity region
    const s = alpha * alpha + beta * beta;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      tangents[i] = tau * alpha * slopes[i];
      tangents[i + 1] = tau * beta * slopes[i];
    }
  }

  // Draw using bezierCurveTo
  ctx.moveTo(px[0], py[0]);

  for (let i = 0; i < n - 1; i++) {
    const d = dx[i] / 3;
    ctx.bezierCurveTo(
      px[i] + d,
      py[i] + tangents[i] * d,
      px[i + 1] - d,
      py[i + 1] - tangents[i + 1] * d,
      px[i + 1],
      py[i + 1],
    );
  }
}

// ─── Utility ────────────────────────────────────────────────────

export function segmentPointCount(segments: Array<{ startIdx: number; endIdx: number }>): number {
  let count = 0;
  for (const segment of segments) {
    count += segment.endIdx - segment.startIdx + 1;
  }
  return count;
}
