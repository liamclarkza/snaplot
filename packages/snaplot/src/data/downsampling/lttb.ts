/**
 * Largest Triangle Three Buckets (LTTB) downsampling.
 * Sveinn Steinarsson, 2013.
 *
 * Preserves visual shape by selecting points that form the largest
 * triangles with their neighbours. O(n) single pass, directly
 * controllable output size.
 *
 * This is a UTILITY, not called implicitly in the render path.
 * The user controls when and how to downsample (P3: library never touches your data).
 */
export function lttb(
  x: Float64Array,
  y: Float64Array,
  targetCount: number,
): [Float64Array, Float64Array] {
  const len = x.length;

  if (targetCount >= len || targetCount < 3) {
    // Nothing to downsample, or too few buckets to be meaningful
    return [Float64Array.from(x), Float64Array.from(y)];
  }

  if (hasGaps(x, y)) {
    return lttbGapped(x, y, targetCount);
  }

  return lttbFiniteRun(x, y, 0, len - 1, targetCount);
}

function lttbFiniteRun(
  x: Float64Array,
  y: Float64Array,
  start: number,
  end: number,
  targetCount: number,
): [Float64Array, Float64Array] {
  const len = end - start + 1;

  if (targetCount >= len || targetCount < 3) {
    return [Float64Array.from(x.subarray(start, end + 1)), Float64Array.from(y.subarray(start, end + 1))];
  }

  const outX = new Float64Array(targetCount);
  const outY = new Float64Array(targetCount);

  // Always include first point
  outX[0] = x[start];
  outY[0] = y[start];

  const bucketSize = (len - 2) / (targetCount - 2);

  let prevSelectedIdx = start;
  let outIdx = 1;

  for (let bucket = 0; bucket < targetCount - 2; bucket++) {
    // Current bucket range
    const bucketStart = start + Math.floor((bucket + 0) * bucketSize) + 1;
    const bucketEnd = start + Math.floor((bucket + 1) * bucketSize) + 1;

    // Next bucket range (for computing the average point)
    const nextBucketStart = start + Math.floor((bucket + 1) * bucketSize) + 1;
    const nextBucketEnd = Math.min(
      start + Math.floor((bucket + 2) * bucketSize) + 1,
      end + 1,
    );

    // Average of next bucket
    let avgX = 0;
    let avgY = 0;
    const nextLen = nextBucketEnd - nextBucketStart;
    for (let j = nextBucketStart; j < nextBucketEnd; j++) {
      avgX += x[j];
      avgY += y[j];
    }
    avgX /= nextLen;
    avgY /= nextLen;

    // Previous selected point
    const pX = x[prevSelectedIdx];
    const pY = y[prevSelectedIdx];

    // Find the point in the current bucket with the largest triangle area
    let maxArea = -1;
    let maxIdx = bucketStart;

    for (let j = bucketStart; j < bucketEnd; j++) {
      // Triangle area (doubled, no need for the 0.5 factor, we only compare)
      const area = Math.abs(
        (pX - avgX) * (y[j] - pY) - (pX - x[j]) * (avgY - pY),
      );
      if (area > maxArea) {
        maxArea = area;
        maxIdx = j;
      }
    }

    outX[outIdx] = x[maxIdx];
    outY[outIdx] = y[maxIdx];
    prevSelectedIdx = maxIdx;
    outIdx++;
  }

  // Always include last point
  outX[outIdx] = x[end];
  outY[outIdx] = y[end];

  return [outX, outY];
}

function lttbGapped(
  x: Float64Array,
  y: Float64Array,
  targetCount: number,
): [Float64Array, Float64Array] {
  const finiteCount = countFinitePairs(x, y);
  const outX: number[] = [];
  const outY: number[] = [];
  let runStart = -1;

  const flushRun = (end: number) => {
    if (runStart < 0) return;
    const runLen = end - runStart + 1;
    const runTarget = Math.max(
      3,
      Math.min(runLen, Math.round((targetCount * runLen) / Math.max(1, finiteCount))),
    );
    const [runX, runY] = lttbFiniteRun(x, y, runStart, end, runTarget);
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

function countFinitePairs(x: Float64Array, y: Float64Array): number {
  let count = 0;
  for (let i = 0; i < x.length; i++) {
    if (Number.isFinite(x[i]) && Number.isFinite(y[i])) count++;
  }
  return count;
}
