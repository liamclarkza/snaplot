/**
 * Binary search utilities for sorted Float64Arrays.
 * These are the critical performance path for viewport culling,
 * hit-testing, and cursor snapping. O(log n) for all operations.
 */

/**
 * Find the index of the first element >= value (lower bound).
 * If all elements are < value, returns arr.length.
 */
export function lowerBound(arr: Float64Array, value: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Find the index of the last element <= value (upper bound).
 * If all elements are > value, returns -1.
 */
export function upperBound(arr: Float64Array, value: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

/**
 * Find the index of the element nearest to value.
 * Returns 0 for empty arrays.
 */
export function nearestIndex(arr: Float64Array, value: number): number {
  if (arr.length === 0) return 0;
  if (arr.length === 1) return 0;

  const idx = lowerBound(arr, value);

  if (idx === 0) return 0;
  if (idx === arr.length) return arr.length - 1;

  // Compare distance to arr[idx] and arr[idx-1]
  const dPrev = value - arr[idx - 1];
  const dNext = arr[idx] - value;
  return dPrev <= dNext ? idx - 1 : idx;
}

/**
 * Find viewport indices [left, right] for the given data range.
 * Includes ±1 point beyond the viewport so lines entering/leaving
 * the visible area are drawn continuously.
 */
export function viewportIndices(
  xData: Float64Array,
  viewMin: number,
  viewMax: number,
): [number, number] {
  const len = xData.length;
  if (len === 0) return [0, 0];

  const left = Math.max(0, lowerBound(xData, viewMin) - 1);
  const right = Math.min(len - 1, upperBound(xData, viewMax) + 1);

  return [left, right];
}
