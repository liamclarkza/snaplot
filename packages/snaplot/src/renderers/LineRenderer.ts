import type { Scale, Layout, SeriesConfig } from '../types';

export interface LineRenderSegment {
  xData: Float64Array;
  yData: Float64Array;
  startIdx: number;
  endIdx: number;
}

export interface BandRenderSegment {
  xData: Float64Array;
  centerYData: Float64Array;
  upperYData: Float64Array;
  lowerYData: Float64Array;
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
 * NaN handling: NaN triggers moveTo() instead of lineTo(), breaking the line.
 * Check via `value !== value` (faster than isNaN()).
 */

export function renderLine(
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
  /** Multiplied with `series.opacity`. Used by the highlight system to dim non-highlighted series. */
  opacityMultiplier: number = 1,
): void {
  renderLineSegments(
    ctx,
    [{ xData, yData, startIdx, endIdx }],
    scaleX,
    scaleY,
    layout,
    series,
    color,
    opacityMultiplier,
  );
}

export function renderLineSegments(
  ctx: CanvasRenderingContext2D,
  segments: LineRenderSegment[],
  scaleX: Scale,
  scaleY: Scale,
  layout: Layout,
  series: SeriesConfig,
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
  ctx.roundRect(layout.plot.left, layout.plot.top, layout.plot.width, layout.plot.height, 4);
  ctx.clip();

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.globalAlpha = (series.opacity ?? 1) * opacityMultiplier;

  // Apply dash pattern (if configured)
  if (series.lineDash && series.lineDash.length > 0) {
    ctx.setLineDash(series.lineDash);
  }

  if (interp === 'monotone') {
    drawMonotoneCubicSegments(ctx, segments, scaleX, scaleY);
  } else if (interp.startsWith('step')) {
    drawSteppedSegments(ctx, segments, scaleX, scaleY, interp);
  } else {
    drawLinearSegments(ctx, segments, scaleX, scaleY);
  }

  ctx.stroke();
  ctx.restore();
}

export function renderArea(
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
  /** Multiplied with `series.opacity`. Used by the highlight system to dim non-highlighted series. */
  opacityMultiplier: number = 1,
): void {
  renderAreaSegments(
    ctx,
    [{ xData, yData, startIdx, endIdx }],
    scaleX,
    scaleY,
    layout,
    series,
    color,
    opacityMultiplier,
  );
}

export function renderAreaSegments(
  ctx: CanvasRenderingContext2D,
  segments: LineRenderSegment[],
  scaleX: Scale,
  scaleY: Scale,
  layout: Layout,
  series: SeriesConfig,
  color: string,
  /** Multiplied with `series.opacity`. Used by the highlight system to dim non-highlighted series. */
  opacityMultiplier: number = 1,
): void {
  if (segments.length === 0) return;
  if (segmentPointCount(segments) <= 1) return;

  // Clip to plot area
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(layout.plot.left, layout.plot.top, layout.plot.width, layout.plot.height, 4);
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

  // Fill each contiguous valid segment separately so NaN gaps stay visible.
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
      if (yVal !== yVal) {
        if (hasSegment) {
          closeAndFillSegment();
          hasSegment = false;
        }
        continue;
      }

      const px = scaleX.dataToPixel(xData[i]);
      const py = scaleY.dataToPixel(yVal);

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
  if (!hasAnySegment) { ctx.restore(); return; }

  // Stroke the line on top
  ctx.beginPath();
  let hasPath = false;
  for (const segment of segments) {
    const { xData, yData, startIdx, endIdx } = segment;
    for (let i = startIdx; i <= endIdx; i++) {
      const yVal = yData[i];
      if (yVal !== yVal) { hasPath = false; continue; }
      const px = scaleX.dataToPixel(xData[i]);
      const py = scaleY.dataToPixel(yVal);
      if (!hasPath) { ctx.moveTo(px, py); hasPath = true; }
      else { ctx.lineTo(px, py); }
    }
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = series.lineWidth ?? 1.5;
  ctx.lineJoin = 'round';
  if (series.lineDash && series.lineDash.length > 0) {
    ctx.setLineDash(series.lineDash);
  }
  ctx.stroke();

  ctx.restore();
}

/**
 * Render a band series: filled region between upper and lower Y columns,
 * with a center line drawn on top. A single visual unit for confidence
 * intervals, error bands, and min/max ranges.
 *
 * Tooltip and cursor snapping use `dataIndex` (the center line). The
 * upper/lower fill is purely decorative.
 */
export function renderBand(
  ctx: CanvasRenderingContext2D,
  xData: Float64Array,
  centerYData: Float64Array,
  upperYData: Float64Array,
  lowerYData: Float64Array,
  startIdx: number,
  endIdx: number,
  scaleX: Scale,
  scaleY: Scale,
  layout: Layout,
  series: SeriesConfig,
  color: string,
  opacityMultiplier: number = 1,
): void {
  renderBandSegments(
    ctx,
    [{ xData, centerYData, upperYData, lowerYData, startIdx, endIdx }],
    scaleX,
    scaleY,
    layout,
    series,
    color,
    opacityMultiplier,
  );
}

export function renderBandSegments(
  ctx: CanvasRenderingContext2D,
  segments: BandRenderSegment[],
  scaleX: Scale,
  scaleY: Scale,
  layout: Layout,
  series: SeriesConfig,
  color: string,
  opacityMultiplier: number = 1,
): void {
  if (segments.length === 0) return;
  if (segmentPointCount(segments) <= 1) return;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(layout.plot.left, layout.plot.top, layout.plot.width, layout.plot.height, 4);
  ctx.clip();

  // ── 1. Fill contiguous bound segments ─────────────────────
  // NaN in either bound breaks the band. Render each segment separately so
  // missing data does not create a filled bridge across the gap.
  const fillColor = series.fill ?? color;
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
        if (!moved) { ctx.moveTo(px, py); moved = true; }
        else { ctx.lineTo(px, py); }
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
      const u = upperYData[i], l = lowerYData[i];
      const valid = u === u && l === l;
      if (valid && runStart < 0) {
        runStart = i;
      } else if (!valid) {
        if (runStart >= 0) {
          runs.push({ xData, centerYData, upperYData, lowerYData, startIdx: runStart, endIdx: i - 1 });
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
        if (yVal !== yVal) { moved = false; continue; }
        const px = scaleX.dataToPixel(xData[i]);
        const py = scaleY.dataToPixel(yVal);
        if (!moved) { ctx.moveTo(px, py); moved = true; }
        else { ctx.lineTo(px, py); }
      }
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = strokeWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (series.lineDash && series.lineDash.length > 0) {
      ctx.setLineDash(series.lineDash);
    }
    ctx.stroke();
  }

  ctx.restore();
}

// ─── Linear interpolation ──────────────────────────────────────

function drawLinearSegments(
  ctx: CanvasRenderingContext2D,
  segments: LineRenderSegment[],
  scaleX: Scale,
  scaleY: Scale,
): void {
  ctx.beginPath();
  let moved = false;

  for (const segment of segments) {
    const { xData, yData, startIdx, endIdx } = segment;
    for (let i = startIdx; i <= endIdx; i++) {
      const yVal = yData[i];
      if (yVal !== yVal) { moved = false; continue; } // NaN gap

      const px = scaleX.dataToPixel(xData[i]);
      const py = scaleY.dataToPixel(yVal);

      if (!moved) { ctx.moveTo(px, py); moved = true; }
      else { ctx.lineTo(px, py); }
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
): void {
  ctx.beginPath();
  let moved = false;
  let prevPx = 0, prevPy = 0;

  for (const segment of segments) {
    const { xData, yData, startIdx, endIdx } = segment;
    for (let i = startIdx; i <= endIdx; i++) {
      const yVal = yData[i];
      if (yVal !== yVal) { moved = false; continue; }

      const px = scaleX.dataToPixel(xData[i]);
      const py = scaleY.dataToPixel(yVal);

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
): void {
  // Collect valid (non-NaN) points
  const px: number[] = [];
  const py: number[] = [];

  for (const segment of segments) {
    const { xData, yData, startIdx, endIdx } = segment;
    for (let i = startIdx; i <= endIdx; i++) {
      const yVal = yData[i];
      if (yVal !== yVal) continue;
      px.push(scaleX.dataToPixel(xData[i]));
      py.push(scaleY.dataToPixel(yVal));
    }
  }

  const n = px.length;
  if (n === 0) return;
  if (n === 1) { ctx.beginPath(); ctx.moveTo(px[0], py[0]); return; }
  if (n === 2) {
    ctx.beginPath();
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
  ctx.beginPath();
  ctx.moveTo(px[0], py[0]);

  for (let i = 0; i < n - 1; i++) {
    const d = dx[i] / 3;
    ctx.bezierCurveTo(
      px[i] + d, py[i] + tangents[i] * d,
      px[i + 1] - d, py[i + 1] - tangents[i + 1] * d,
      px[i + 1], py[i + 1],
    );
  }
}

// ─── Utility ────────────────────────────────────────────────────

function segmentPointCount(segments: Array<{ startIdx: number; endIdx: number }>): number {
  let count = 0;
  for (const segment of segments) {
    count += segment.endIdx - segment.startIdx + 1;
  }
  return count;
}

function withAlpha(hex: string, alpha: number): string {
  // Convert hex to rgba
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
