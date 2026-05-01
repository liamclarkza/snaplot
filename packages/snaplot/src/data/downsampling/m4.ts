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

  if (hasGaps(x, y)) {
    return m4Gapped(x, y, pixelWidth, xMin, xMax);
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
    return [Float64Array.from(x.subarray(start, end + 1)), Float64Array.from(y.subarray(start, end + 1))];
  }

  const xRange = xMax - xMin;
  if (xRange <= 0) {
    return [new Float64Array([x[start]]), new Float64Array([y[start]])];
  }

  // Pre-allocate max possible output (4 per pixel column)
  const tmpX = new Float64Array(maxOut);
  const tmpY = new Float64Array(maxOut);
  let out = 0;

  // Track state per pixel column
  let curBucket = -1;
  let firstX = 0, firstY = 0;
  let lastX = 0, lastY = 0;
  let minY = Infinity, minX = 0;
  let maxY_ = -Infinity, maxX = 0;
  let minIdx = 0, maxIdx = 0;

  function flushBucket() {
    if (curBucket < 0) return;

    // Emit in temporal order: first, then min/max (by index), then last
    tmpX[out] = firstX; tmpY[out] = firstY; out++;

    if (minIdx <= maxIdx) {
      if (minX !== firstX || minY !== firstY) {
        tmpX[out] = minX; tmpY[out] = minY; out++;
      }
      if (maxX !== firstX || maxY_ !== firstY) {
        tmpX[out] = maxX; tmpY[out] = maxY_; out++;
      }
    } else {
      if (maxX !== firstX || maxY_ !== firstY) {
        tmpX[out] = maxX; tmpY[out] = maxY_; out++;
      }
      if (minX !== firstX || minY !== firstY) {
        tmpX[out] = minX; tmpY[out] = minY; out++;
      }
    }

    if ((lastX !== minX || lastY !== minY) && (lastX !== maxX || lastY !== maxY_) && (lastX !== firstX || lastY !== firstY)) {
      tmpX[out] = lastX; tmpY[out] = lastY; out++;
    }
  }

  for (let i = start; i <= end; i++) {
    const xi = x[i];
    const yi = y[i];

    // Which pixel column does this point fall in?
    const bucket = Math.min(
      Math.floor(((xi - xMin) / xRange) * pixelWidth),
      pixelWidth - 1,
    );

    if (bucket !== curBucket) {
      flushBucket();
      curBucket = bucket;
      firstX = xi; firstY = yi;
      lastX = xi; lastY = yi;
      minY = yi; minX = xi; minIdx = i;
      maxY_ = yi; maxX = xi; maxIdx = i;
    } else {
      lastX = xi; lastY = yi;
      if (yi < minY) { minY = yi; minX = xi; minIdx = i; }
      if (yi > maxY_) { maxY_ = yi; maxX = xi; maxIdx = i; }
    }
  }

  flushBucket();

  return [tmpX.subarray(0, out), tmpY.subarray(0, out)];
}

function m4Gapped(
  x: Float64Array,
  y: Float64Array,
  pixelWidth: number,
  xMin: number,
  xMax: number,
): [Float64Array, Float64Array] {
  const outX: number[] = [];
  const outY: number[] = [];
  let runStart = -1;

  const flushRun = (end: number) => {
    if (runStart < 0) return;
    const [runX, runY] = m4FiniteRun(x, y, runStart, end, pixelWidth, xMin, xMax);
    if (outX.length > 0) {
      outX.push(x[runStart]);
      outY.push(Number.NaN);
    }
    for (let i = 0; i < runX.length; i++) {
      outX.push(runX[i]);
      outY.push(runY[i]);
    }
    runStart = -1;
  };

  for (let i = 0; i < x.length; i++) {
    if (Number.isFinite(x[i]) && Number.isFinite(y[i])) {
      if (runStart < 0) runStart = i;
    } else {
      flushRun(i - 1);
    }
  }
  flushRun(x.length - 1);

  return [Float64Array.from(outX), Float64Array.from(outY)];
}

function hasGaps(x: Float64Array, y: Float64Array): boolean {
  for (let i = 0; i < x.length; i++) {
    if (!Number.isFinite(x[i]) || !Number.isFinite(y[i])) return true;
  }
  return false;
}
