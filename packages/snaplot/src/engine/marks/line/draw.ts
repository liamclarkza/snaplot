/**
 * The line mark's draw half (plan §3.1; M11): a stroke through the points, M4-decimated while a
 * gesture moves the viewport, plus the path builders (linear, stepped, monotone) and the point
 * count the area and band marks share.
 */
import { affineParams } from '../../scales/affine';
import type { InterpolationMode, Layout, Scale, SeriesSpec } from '../../spec';
import { NO_COLUMNS } from '../columns';
import type { MarkDraw } from '../index';

export interface LineRenderSegment {
  xData: Float64Array;
  yData: Float64Array;
  startIdx: number;
  endIdx: number;
}

/**
 * Line renderer. Pure function, no state.
 *
 * Interpolation modes:
 * - linear: moveTo/lineTo (fastest, most honest)
 * - monotone: Fritsch-Carlson monotone cubic (no overshoot)
 * - step-before/after/middle: horizontal-then-vertical segments
 *
 * Missing-value handling: non-finite Y (NaN, Infinity) breaks the path,
 * the next valid point starts with moveTo(). `series.spanGaps` skips the
 * break and connects across the gap instead. A run of one point (a single
 * observation, or a value between two gaps) has no length to stroke, so it
 * paints as a dot the width of the line.
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
  if (segmentPointCount(segments) === 0) return;

  // Clip to plot area
  ctx.save();
  ctx.beginPath();
  ctx.rect(layout.plot.left, layout.plot.top, layout.plot.width, layout.plot.height);
  ctx.clip();
  ctx.globalAlpha = (series.opacity ?? 1) * opacityMultiplier;
  strokeSeriesPath(ctx, segments, scaleX, scaleY, series, color);
  ctx.restore();
}

/**
 * Stroke the path through `segments` in the series' interpolation, dash and width, then the dots
 * of its one-point runs. Shared by the line, area and band marks.
 */
export function strokeSeriesPath(
  ctx: CanvasRenderingContext2D,
  segments: LineRenderSegment[],
  scaleX: Scale,
  scaleY: Scale,
  series: SeriesSpec,
  color: string,
): void {
  const lineWidth = series.lineWidth ?? 1.5;
  if (lineWidth <= 0) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (series.dash && series.dash.length > 0) ctx.setLineDash(series.dash);

  const dots: number[] = [];
  const tracer = new PathTracer(ctx, series.interpolation ?? 'linear');
  ctx.beginPath();
  tracePath(tracer, segments, scaleX, scaleY, series.spanGaps === true, () => {
    if (tracer.count === 1) dots.push(tracer.lastX, tracer.lastY);
  });
  ctx.stroke();

  if (dots.length > 0) {
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.beginPath();
    const radius = Math.max(2, lineWidth);
    for (let i = 0; i < dots.length; i += 2) {
      ctx.moveTo(dots[i] + radius, dots[i + 1]);
      ctx.arc(dots[i], dots[i + 1], radius, 0, Math.PI * 2);
    }
    ctx.fill();
  }
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

// ─── Path tracing ──────────────────────────────────────────────

/**
 * Walk the finite pixel points of `segments` into `tracer`, one run per stretch between gaps
 * (one run in all with `spanGaps`). `endRun` runs after each run is traced, with the tracer
 * still holding its first and last points, so a caller can close it (an area to its baseline)
 * or note a one-point run.
 */
export function tracePath(
  tracer: PathTracer,
  segments: LineRenderSegment[],
  scaleX: Scale,
  scaleY: Scale,
  spanGaps: boolean,
  endRun?: () => void,
): void {
  // Hoist affine scale transforms so the hot loop is inline multiply-add
  // instead of a polymorphic dataToPixel call per point; log/custom scales
  // fall back to the method path.
  const ax = affineParams(scaleX);
  const ay = affineParams(scaleY);
  const kx = ax ? ax[0] : 0;
  const bx = ax ? ax[1] : 0;
  const ky = ay ? ay[0] : 0;
  const by = ay ? ay[1] : 0;

  const finish = () => {
    if (tracer.count === 0) return;
    tracer.end();
    endRun?.();
    tracer.begin();
  };

  tracer.begin();
  // Runs accumulate across segment boundaries: a ring buffer splits
  // logically contiguous data into two physical segments, and breaking
  // between them would leave a visible gap at the seam.
  for (const segment of segments) {
    const { xData, yData, startIdx, endIdx } = segment;
    for (let i = startIdx; i <= endIdx; i++) {
      const yVal = yData[i];
      if (!Number.isFinite(yVal)) {
        if (!spanGaps) finish();
        continue;
      }
      const px = ax ? xData[i] * kx + bx : scaleX.dataToPixel(xData[i]);
      const py = ay ? yVal * ky + by : scaleY.dataToPixel(yVal);
      if (!Number.isFinite(px) || !Number.isFinite(py)) {
        if (!spanGaps) finish();
        continue;
      }
      tracer.point(px, py);
    }
  }
  finish();
}

/**
 * Emits one run of pixel points as path commands in an interpolation mode. Linear and stepped
 * runs stream; monotone runs buffer until `end()`, since each tangent needs both neighbours.
 * `begin(true)` joins the run to the current point with a lineTo instead of a moveTo, so a band
 * can trace its lower edge backwards onto the end of its upper edge.
 */
export class PathTracer {
  count = 0;
  firstX = 0;
  firstY = 0;
  lastX = 0;
  lastY = 0;
  private connect = false;
  private readonly xs: number[] = [];
  private readonly ys: number[] = [];

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly mode: InterpolationMode,
  ) {}

  begin(connect = false): void {
    this.count = 0;
    this.connect = connect;
    this.xs.length = 0;
    this.ys.length = 0;
  }

  point(px: number, py: number): void {
    const { ctx, mode } = this;
    if (mode === 'monotone') {
      this.xs.push(px);
      this.ys.push(py);
    } else if (this.count === 0) {
      if (this.connect) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    } else if (mode === 'linear') {
      ctx.lineTo(px, py);
    } else if (mode === 'step-after') {
      // Horizontal to new X at old Y, then vertical
      ctx.lineTo(px, this.lastY);
      ctx.lineTo(px, py);
    } else if (mode === 'step-before') {
      // Vertical at old X to new Y, then horizontal
      ctx.lineTo(this.lastX, py);
      ctx.lineTo(px, py);
    } else {
      // step-middle: horizontal to midpoint, vertical, horizontal
      const midX = (this.lastX + px) / 2;
      ctx.lineTo(midX, this.lastY);
      ctx.lineTo(midX, py);
      ctx.lineTo(px, py);
    }
    if (this.count === 0) {
      this.firstX = px;
      this.firstY = py;
    }
    this.lastX = px;
    this.lastY = py;
    this.count++;
  }

  end(): void {
    if (this.mode === 'monotone') drawMonotoneRun(this.ctx, this.xs, this.ys, this.connect);
  }
}

// ─── Monotone cubic (Fritsch-Carlson) ──────────────────────────

/**
 * Fritsch-Carlson monotone cubic interpolation.
 * Guarantees no overshoot between data points.
 * Per spec §4.4: "critical for metrics that can't go negative"
 */
function drawMonotoneRun(
  ctx: CanvasRenderingContext2D,
  px: number[],
  py: number[],
  connect: boolean,
): void {
  const n = px.length;
  if (n === 0) return;
  if (connect) ctx.lineTo(px[0], py[0]);
  else ctx.moveTo(px[0], py[0]);
  if (n === 1) return;
  if (n === 2) {
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
