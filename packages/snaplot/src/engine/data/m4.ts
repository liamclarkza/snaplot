/**
 * M4 algorithm, pixel-perfect visual aggregation.
 * Jugel et al., VLDB 2014.
 *
 * For each pixel column, retains exactly 4 points: first, last, min, max.
 * Zero visual error compared to rendering all points. O(n) single pass.
 *
 * The series pass decimates lines and areas with it every frame (marks/index.ts), into an
 * `M4Arena` it resets per pass, so a stream does not allocate two output arrays per frame.
 */
export function m4(
  x: Float64Array,
  y: Float64Array,
  pixelWidth: number,
  xMin: number,
  xMax: number,
  arena?: M4Arena,
): [Float64Array, Float64Array] {
  const len = x.length;
  if (len === 0 || pixelWidth <= 0) {
    return [new Float64Array(0), new Float64Array(0)];
  }
  return m4FiniteRun(x, y, 0, len - 1, pixelWidth, xMin, xMax, arena);
}

/**
 * Scratch for M4 output: one pair of buffers that a render pass hands out in slices and resets
 * at its start. Growing replaces the buffers; slices handed out before keep the old ones alive,
 * so they stay valid until the pass that took them is over.
 */
export class M4Arena {
  private x = new Float64Array(0);
  private y = new Float64Array(0);
  private used = 0;

  reset(): void {
    this.used = 0;
  }

  /** Room for `n` points: the buffers and the offset to write at. */
  take(n: number): { x: Float64Array; y: Float64Array; offset: number } {
    if (this.used + n > this.x.length) {
      const size = Math.max(n, this.x.length * 2);
      this.x = new Float64Array(size);
      this.y = new Float64Array(size);
      this.used = 0;
    }
    return { x: this.x, y: this.y, offset: this.used };
  }

  /** Keep the first `n` points of the last `take` and return them as views. */
  keep(offset: number, n: number): [Float64Array, Float64Array] {
    this.used = offset + n;
    return [this.x.subarray(offset, offset + n), this.y.subarray(offset, offset + n)];
  }
}

function m4FiniteRun(
  x: Float64Array,
  y: Float64Array,
  start: number,
  end: number,
  pixelWidth: number,
  xMin: number,
  xMax: number,
  arena?: M4Arena,
): [Float64Array, Float64Array] {
  const len = end - start + 1;
  // If data fits within pixel budget, return as-is (views in a render pass: it only reads them)
  const maxOut = pixelWidth * 4;
  if (len <= maxOut) {
    if (arena) return [x.subarray(start, end + 1), y.subarray(start, end + 1)];
    return [
      Float64Array.from(x.subarray(start, end + 1)),
      Float64Array.from(y.subarray(start, end + 1)),
    ];
  }

  const xRange = xMax - xMin;
  if (xRange <= 0) {
    return [new Float64Array([x[start]]), new Float64Array([y[start]])];
  }

  // Pre-allocate max possible output: 4 per pixel column, plus a break per gap, and a gap needs
  // an empty column (below).
  const room = arena?.take(maxOut + pixelWidth);
  const tmpX = room ? room.x : new Float64Array(maxOut + pixelWidth);
  const tmpY = room ? room.y : new Float64Array(maxOut + pixelWidth);
  const base = room ? room.offset : 0;
  const out = m4Columns(x, y, start, end, pixelWidth, xMin, xRange, tmpX, tmpY, base);

  // In an arena, views of the pass's scratch; alone, a trim-copy, so a caller that keeps the
  // result does not retain the 5 × pixelWidth scratch.
  if (arena) return arena.keep(base, out - base);
  return [tmpX.slice(0, out), tmpY.slice(0, out)];
}

/**
 * The M4 pass itself: points `start`–`end` of x and y into `tmpX` and `tmpY` from `base`, and the
 * index after the last point written. Only numbers and typed arrays: with the arena's property
 * reads in the same function, V8 deoptimised it on every call (insufficient type feedback for the
 * code after the loop) and ran the loop unoptimised, boxing every double, so a stream allocated
 * well over 100 KB a frame.
 */
function m4Columns(
  x: Float64Array,
  y: Float64Array,
  start: number,
  end: number,
  pixelWidth: number,
  xMin: number,
  xRange: number,
  tmpX: Float64Array,
  tmpY: Float64Array,
  base: number,
): number {
  let out = base;

  // Which pixel column a point falls in, clamped at both edges: callers pass a viewport-culled
  // slice that deliberately includes one point just left of xMin (and right of xMax) for line
  // continuity (see viewportIndices), and those join the edge columns.
  const scale = pixelWidth / xRange;
  const last = pixelWidth - 1;

  // One column at a time, with no closure over the running state (V8 keeps captured, mutated
  // variables in a heap context, which made the loop several times slower): the outer loop
  // starts a column at its first finite point, the inner loop takes every point of that column.
  // A gap (a non-finite value) breaks the path only when it leaves at least one pixel column
  // empty: a narrower one would not show, and breaking there would emit up to four points per
  // run in every column, past the budget (dataapi-17).
  let gap = false;
  let previous = -1;
  let i = start;
  while (i <= end) {
    const x0 = x[i];
    const y0 = y[i];
    i++;
    if (x0 - x0 !== 0 || y0 - y0 !== 0) {
      gap = true;
      continue;
    }
    const raw = (x0 - xMin) * scale;
    const bucket = raw < 0 ? 0 : raw >= last ? last : raw | 0;
    if (gap && previous >= 0 && bucket > previous + 1) {
      tmpX[out] = x0;
      tmpY[out] = Number.NaN;
      out++;
    }
    gap = false;

    let lastX = x0;
    let lastY = y0;
    let minX = x0;
    let minY = y0;
    let maxX = x0;
    let maxY = y0;
    let minIdx = i - 1;
    let maxIdx = i - 1;
    while (i <= end) {
      const xi = x[i];
      const yi = y[i];
      if (xi - xi !== 0 || yi - yi !== 0) {
        gap = true;
        i++;
        continue;
      }
      const r = (xi - xMin) * scale;
      if ((r < 0 ? 0 : r >= last ? last : r | 0) !== bucket) break;
      gap = false;
      lastX = xi;
      lastY = yi;
      if (yi < minY) {
        minY = yi;
        minX = xi;
        minIdx = i;
      }
      if (yi > maxY) {
        maxY = yi;
        maxX = xi;
        maxIdx = i;
      }
      i++;
    }

    // Emit in temporal order: first, then min/max (by index), then last.
    tmpX[out] = x0;
    tmpY[out] = y0;
    out++;
    const minFirst = minIdx <= maxIdx;
    const aX = minFirst ? minX : maxX;
    const aY = minFirst ? minY : maxY;
    const bX = minFirst ? maxX : minX;
    const bY = minFirst ? maxY : minY;
    if (aX !== x0 || aY !== y0) {
      tmpX[out] = aX;
      tmpY[out] = aY;
      out++;
    }
    if (bX !== x0 || bY !== y0) {
      tmpX[out] = bX;
      tmpY[out] = bY;
      out++;
    }
    if (
      (lastX !== minX || lastY !== minY) &&
      (lastX !== maxX || lastY !== maxY) &&
      (lastX !== x0 || lastY !== y0)
    ) {
      tmpX[out] = lastX;
      tmpY[out] = lastY;
      out++;
    }
    previous = bucket;
  }
  return out;
}
