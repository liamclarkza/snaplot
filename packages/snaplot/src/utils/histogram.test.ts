import { describe, expect, it } from 'vitest';
import { histogram } from './histogram';

const f = (xs: number[]) => Float64Array.from(xs);

describe('histogram', () => {
  it('filters non-finite values before computing bin domains', () => {
    const bins = histogram(f([1, 2, NaN, Infinity, 3, -Infinity]), { binCount: 2 });

    expect(Array.from(bins.edges)).toEqual([1, 2, 3]);
    expect(Array.from(bins.counts)).toEqual([1, 2, 0]);
    expect(bins.maxCount).toBe(2);
  });

  it('rejects invalid explicit bin counts', () => {
    expect(() => histogram(f([1, 2, 3]), { binCount: Infinity }))
      .toThrow(/binCount must be a positive finite number/);
    expect(() => histogram(f([1, 2, 3]), { binCount: 0 }))
      .toThrow(/binCount must be a positive finite number/);
  });
});
