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

  const outX = new Float64Array(targetCount);
  const outY = new Float64Array(targetCount);

  // Always include first point
  outX[0] = x[0];
  outY[0] = y[0];

  const bucketSize = (len - 2) / (targetCount - 2);

  let prevSelectedIdx = 0;
  let outIdx = 1;

  for (let bucket = 0; bucket < targetCount - 2; bucket++) {
    // Current bucket range
    const bucketStart = Math.floor((bucket + 0) * bucketSize) + 1;
    const bucketEnd = Math.floor((bucket + 1) * bucketSize) + 1;

    // Next bucket range (for computing the average point)
    const nextBucketStart = Math.floor((bucket + 1) * bucketSize) + 1;
    const nextBucketEnd = Math.min(
      Math.floor((bucket + 2) * bucketSize) + 1,
      len,
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
  outX[outIdx] = x[len - 1];
  outY[outIdx] = y[len - 1];

  return [outX, outY];
}
