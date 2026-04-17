import { describe, expect, it } from 'vitest';
import { lowerBound, upperBound, nearestIndex, viewportIndices } from './binarySearch';

const arr = (values: number[]) => Float64Array.from(values);

describe('lowerBound — first index with arr[i] >= value', () => {
  it('returns 0 when value precedes the array', () => {
    expect(lowerBound(arr([1, 2, 3]), 0)).toBe(0);
  });

  it('returns length when value exceeds the array', () => {
    expect(lowerBound(arr([1, 2, 3]), 10)).toBe(3);
  });

  it('returns the index of an exact hit', () => {
    expect(lowerBound(arr([1, 2, 3, 4, 5]), 3)).toBe(2);
  });

  it('returns the first strictly-greater index on miss', () => {
    expect(lowerBound(arr([1, 2, 4, 5]), 3)).toBe(2);
  });

  it('handles duplicates by pointing at the first occurrence', () => {
    expect(lowerBound(arr([1, 2, 2, 2, 3]), 2)).toBe(1);
  });

  it('handles an empty array', () => {
    expect(lowerBound(arr([]), 5)).toBe(0);
  });

  it('handles a single-element array', () => {
    expect(lowerBound(arr([5]), 5)).toBe(0);
    expect(lowerBound(arr([5]), 3)).toBe(0);
    expect(lowerBound(arr([5]), 7)).toBe(1);
  });
});

describe('upperBound — last index with arr[i] <= value', () => {
  it('returns -1 when value precedes the array', () => {
    expect(upperBound(arr([1, 2, 3]), 0)).toBe(-1);
  });

  it('returns length - 1 when value meets or exceeds the array', () => {
    expect(upperBound(arr([1, 2, 3]), 3)).toBe(2);
    expect(upperBound(arr([1, 2, 3]), 10)).toBe(2);
  });

  it('returns the index of the largest element not exceeding the value', () => {
    expect(upperBound(arr([1, 2, 4, 5]), 3)).toBe(1);
  });

  it('handles duplicates by pointing at the last occurrence', () => {
    expect(upperBound(arr([1, 2, 2, 2, 3]), 2)).toBe(3);
  });

  it('handles an empty array', () => {
    expect(upperBound(arr([]), 5)).toBe(-1);
  });

  it('pairs with lowerBound to find a bin for histograms', () => {
    // Histogram bin [edges[b], edges[b+1]) — upperBound gives b directly.
    const edges = arr([0, 1, 2, 3, 4]);
    expect(upperBound(edges, 0.5)).toBe(0); // bin [0, 1)
    expect(upperBound(edges, 2.0)).toBe(2); // bin [2, 3) — left edge inclusive
    expect(upperBound(edges, 3.9)).toBe(3); // bin [3, 4)
    expect(upperBound(edges, 4.0)).toBe(4); // past the last bin, caller rejects
  });
});

describe('nearestIndex', () => {
  it('returns 0 for an empty array', () => {
    expect(nearestIndex(arr([]), 5)).toBe(0);
  });

  it('returns 0 for a single-element array', () => {
    expect(nearestIndex(arr([42]), 5)).toBe(0);
    expect(nearestIndex(arr([42]), 99)).toBe(0);
  });

  it('returns the first index when the value precedes the array', () => {
    expect(nearestIndex(arr([10, 20, 30]), 1)).toBe(0);
  });

  it('returns the last index when the value exceeds the array', () => {
    expect(nearestIndex(arr([10, 20, 30]), 100)).toBe(2);
  });

  it('picks the closer of the two bracketing values', () => {
    expect(nearestIndex(arr([10, 20, 30]), 12)).toBe(0);
    expect(nearestIndex(arr([10, 20, 30]), 17)).toBe(1);
    expect(nearestIndex(arr([10, 20, 30]), 25)).toBe(1);
    expect(nearestIndex(arr([10, 20, 30]), 27)).toBe(2);
  });

  it('on exact midpoint prefers the lower index (ties go left)', () => {
    expect(nearestIndex(arr([10, 20]), 15)).toBe(0);
  });

  it('returns the exact index on a direct hit', () => {
    expect(nearestIndex(arr([1, 2, 3, 4, 5]), 3)).toBe(2);
  });
});

describe('viewportIndices — culling with ±1 margin', () => {
  it('returns [0, 0] for an empty series', () => {
    expect(viewportIndices(arr([]), 0, 10)).toEqual([0, 0]);
  });

  it('clamps to the full range for a viewport covering the data', () => {
    const x = arr([0, 1, 2, 3, 4]);
    expect(viewportIndices(x, -1, 10)).toEqual([0, 4]);
  });

  it('includes one point beyond each edge so entering lines draw continuously', () => {
    const x = arr([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const [left, right] = viewportIndices(x, 3.5, 6.5);
    expect(left).toBe(3); // x[3]=3, the last point before 3.5
    expect(right).toBe(7); // x[7]=7, the first point past 6.5
  });

  it('never returns indices outside the data range', () => {
    const x = arr([0, 1, 2]);
    const [left, right] = viewportIndices(x, -100, 100);
    expect(left).toBe(0);
    expect(right).toBe(2);
  });

  it('degenerate case: viewport entirely below data', () => {
    const x = arr([10, 20, 30]);
    const [left, right] = viewportIndices(x, -5, 0);
    expect(left).toBe(0);
    expect(right).toBeGreaterThanOrEqual(0);
    expect(right).toBeLessThanOrEqual(2);
  });
});
