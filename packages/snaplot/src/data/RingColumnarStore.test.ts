import { describe, expect, it } from 'vitest';
import { RingColumnarStore } from './RingColumnarStore';
import type { ColumnarData } from '../types';

const f = (xs: number[]) => Float64Array.from(xs);

function rows(data: ColumnarData): number[][] {
  return data.map((col) => Array.from(col));
}

describe('RingColumnarStore', () => {
  it('keeps the initial tail when data is longer than maxLen', () => {
    const store = new RingColumnarStore([f([1, 2, 3, 4]), f([10, 20, 30, 40])], 3);
    expect(store.length).toBe(3);
    expect(rows(store.getData())).toEqual([[2, 3, 4], [20, 30, 40]]);
  });

  it('appends without reallocating logical data and exposes wrapped segments', () => {
    const store = new RingColumnarStore([f([1, 2, 3]), f([10, 20, 30])], 5);

    store.append([f([4, 5]), f([40, 50])]);
    expect(rows(store.getData())).toEqual([[1, 2, 3, 4, 5], [10, 20, 30, 40, 50]]);
    expect(store.getSegments(0, 4)).toEqual([
      { logicalStart: 0, logicalEnd: 4, physicalStart: 0, physicalEnd: 4 },
    ]);

    store.append([f([6, 7]), f([60, 70])]);
    expect(rows(store.getData())).toEqual([[3, 4, 5, 6, 7], [30, 40, 50, 60, 70]]);
    expect(store.getSegments(0, 4)).toEqual([
      { logicalStart: 0, logicalEnd: 2, physicalStart: 2, physicalEnd: 4 },
      { logicalStart: 3, logicalEnd: 4, physicalStart: 0, physicalEnd: 1 },
    ]);
  });

  it('keeps only the appended tail when a chunk exceeds capacity', () => {
    const store = new RingColumnarStore([f([1, 2]), f([10, 20])], 3);
    store.append([f([3, 4, 5, 6]), f([30, 40, 50, 60])]);
    expect(rows(store.getData())).toEqual([[4, 5, 6], [40, 50, 60]]);
    expect(store.xAt(0)).toBe(4);
    expect(store.yAt(0, 2)).toBe(60);
  });

  it('searches and ranges in logical order across wrap', () => {
    const store = new RingColumnarStore([f([1, 2, 3, 4, 5]), f([10, 20, 30, NaN, Infinity])], 5);
    store.append([f([6, 7]), f([60, 70])]);

    expect(store.nearestXIndex(5.6)).toBe(3);
    expect(store.lowerBoundX(5)).toBe(2);
    expect(store.upperBoundX(5)).toBe(2);
    expect(store.getViewportIndices(4.5, 6.2)).toEqual([1, 4]);
    expect(store.yRange([0], 0, 4)).toEqual([30, 70]);
  });

  it('handles zero-capacity streaming as an empty retained window', () => {
    const store = new RingColumnarStore([f([1, 2]), f([10, 20])], 0);
    expect(store.length).toBe(0);
    expect(rows(store.getData())).toEqual([[], []]);
    expect(store.append([f([3]), f([30])])).toBe(false);
    expect(store.length).toBe(0);
  });

  it('validates append shape and global X ordering', () => {
    const store = new RingColumnarStore([f([10, 11]), f([100, 110])], 3);
    expect(() => store.append([f([12]), f([120]), f([1200])] as unknown as ColumnarData))
      .toThrow(/expects 2 columns/);
    expect(() => store.append([f([9]), f([90])]))
      .toThrow(/current last X = 11/);
  });

  it('rejects invalid maxLen values', () => {
    expect(() => new RingColumnarStore([f([1]), f([10])], -1))
      .toThrow(/streaming\.maxLen/);
    expect(() => new RingColumnarStore([f([1]), f([10])], 1.5))
      .toThrow(/streaming\.maxLen/);
  });
});
