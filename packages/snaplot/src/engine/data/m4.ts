/**
 * M4 algorithm, pixel-perfect visual aggregation.
 * Jugel et al., VLDB 2014.
 *
 * For each pixel column, retains exactly 4 points: first, last, min, max.
 * Zero visual error compared to rendering all points. O(n) single pass.
 *
 * This is a UTILITY, not called implicitly in the render path.
 */
export function m4(
  x: Float64Array,
  y: Float64Array,
  pixelWidth: number,
  xMin: number,
  xMax: number,
): [Float64Array, Float64Array] {
  const len = x.length;
  if (len === 0 || pixelWidth <= 0) {
    return [new Float64Array(0), new Float64Array(0)];
  }
  return m4FiniteRun(x, y, 0, len - 1, pixelWidth, xMin, xMax);
}

function m4FiniteRun(
  x: Float64Array,
  y: Float64Array,
  start: number,
  end: number,
  pixelWidth: number,
  xMin: number,
  xMax: number,
): [Float64Array, Float64Array] {
  const len = end - start + 1;
  // If data fits within pixel budget, return as-is
  const maxOut = pixelWidth * 4;
  if (len <= maxOut) {
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
  const tmpX = new Float64Array(maxOut + pixelWidth);
  const tmpY = new Float64Array(maxOut + pixelWidth);
  let out = 0;

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

  // Trim-copy rather than subarray: a subarray view retains the full
  // 4*pixelWidth scratch buffers for as long as the caller holds the result,
  // and hands back what looks like a shared buffer. m4 is opt-in and not a
  // per-frame call, so the small copy is cheap.
  return [tmpX.slice(0, out), tmpY.slice(0, out)];
}
