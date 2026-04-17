import { describe, expect, it } from 'vitest';
import { ColumnarStore } from './ColumnarStore';
import type { ColumnarData } from '../types';

const f = (xs: number[]) => Float64Array.from(xs);

describe('ColumnarStore construction + validate', () => {
  it('accepts a well-formed dataset', () => {
    expect(() => new ColumnarStore([f([1, 2, 3]), f([10, 20, 30])])).not.toThrow();
  });

  it('rejects non-array payloads with a typed error', () => {
    // null has no .length, hits the array-shape branch.
    expect(() => new ColumnarStore(null as unknown as ColumnarData))
      .toThrow(/array of Float64Arrays/);
    // Strings have a .length so we pass the shape guard but fail on the
    // per-column typed-array check. Still a clear, typed message.
    expect(() => new ColumnarStore('oops' as unknown as ColumnarData))
      .toThrow(/is a string/);
  });

  it('rejects an empty dataset with a message explaining the shape', () => {
    expect(() => new ColumnarStore([] as unknown as ColumnarData))
      .toThrow(/at least one column/);
  });

  it('rejects plain arrays (not Float64Array) with a fix suggestion', () => {
    expect(() => new ColumnarStore([[1, 2, 3], [10, 20, 30]] as unknown as ColumnarData))
      .toThrow(/Float64Array/);
    expect(() => new ColumnarStore([[1, 2, 3], [10, 20, 30]] as unknown as ColumnarData))
      .toThrow(/new Float64Array/);
  });

  it('rejects mismatched column lengths with the indices shown', () => {
    expect(() => new ColumnarStore([f([1, 2, 3]), f([10, 20])]))
      .toThrow(/column 1 has 2/i);
  });

  it('rejects unsorted X with neighbour indices + reason', () => {
    expect(() => new ColumnarStore([f([1, 3, 2]), f([10, 30, 20])]))
      .toThrow(/x\[2\] = 2 < x\[1\] = 3/);
    expect(() => new ColumnarStore([f([1, 3, 2]), f([10, 30, 20])]))
      .toThrow(/binary search/);
  });

  it('accepts equal (non-decreasing) X values', () => {
    expect(() => new ColumnarStore([f([1, 2, 2, 3]), f([1, 2, 3, 4])])).not.toThrow();
  });
});

describe('append', () => {
  it('rejects a column-count mismatch with a helpful hint', () => {
    const store = new ColumnarStore([f([1, 2]), f([10, 20])]);
    expect(() => store.append([f([3]), f([30]), f([300])] as unknown as ColumnarData))
      .toThrow(/append\(\) expects 2 columns/);
  });

  it('concatenates data correctly and preserves length', () => {
    const store = new ColumnarStore([f([1, 2]), f([10, 20])]);
    store.append([f([3, 4]), f([30, 40])]);
    expect(store.length).toBe(4);
    expect(Array.from(store.x)).toEqual([1, 2, 3, 4]);
    expect(Array.from(store.y(0))).toEqual([10, 20, 30, 40]);
  });

  it('evicts oldest when maxLen is exceeded', () => {
    const store = new ColumnarStore([f([1, 2, 3]), f([10, 20, 30])]);
    store.append([f([4]), f([40])], 3);
    expect(store.length).toBe(3);
    expect(Array.from(store.x)).toEqual([2, 3, 4]);
    expect(Array.from(store.y(0))).toEqual([20, 30, 40]);
  });

  it('handles a zero-length append as a no-op', () => {
    const store = new ColumnarStore([f([1, 2]), f([10, 20])]);
    store.append([f([]), f([])]);
    expect(store.length).toBe(2);
  });
});

describe('yRange', () => {
  it('returns [min, max] across selected series, skipping NaN', () => {
    const store = new ColumnarStore([f([1, 2, 3, 4]), f([10, NaN, 5, 20])]);
    expect(store.yRange([0], 0, 3)).toEqual([5, 20]);
  });

  it('returns [0, 1] fallback when all values are NaN', () => {
    const store = new ColumnarStore([f([1, 2]), f([NaN, NaN])]);
    expect(store.yRange([0], 0, 1)).toEqual([0, 1]);
  });
});
