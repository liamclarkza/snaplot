import { describe, expect, it } from 'vitest';
import { histogram } from './histogram';

const f = (xs: number[]) => Float64Array.from(xs);

describe('histogram', () => {
  it('filters non-finite values before computing bin domains', () => {
    const bins = histogram(f([1, 2, NaN, Infinity, 3, -Infinity]), { binCount: 2 });

    expect(Array.from(bins.edges)).toEqual([1, 2, 3]);
    expect(Array.from(bins.counts)).toEqual([1, 2]);
    expect(bins.maxCount).toBe(2);
  });

  it('rejects invalid explicit bin counts', () => {
    expect(() => histogram(f([1, 2, 3]), { binCount: Infinity })).toThrow(
      /binCount must be a positive finite number/,
    );
    expect(() => histogram(f([1, 2, 3]), { binCount: 0 })).toThrow(
      /binCount must be a positive finite number/,
    );
    expect(() => histogram(f([]), { binCount: 0 })).toThrow(/positive finite/);
    expect(() => histogram(f([1, 1]), { binCount: Infinity })).toThrow(/positive finite/);
  });

  it('returns exactly one count per interval including constant samples', () => {
    const bins = histogram(f([2, 2, 2]));
    expect([...bins.edges]).toEqual([1.5, 2.5]);
    expect([...bins.counts]).toEqual([3]);
    const several = histogram(f([0, 1, 2, 3, 4, 5]), { binCount: 3 });
    expect(several.edges.length).toBe(several.counts.length + 1);
    expect(several.counts.reduce((sum, value) => sum + value, 0)).toBe(6);
  });

  it('returns a valid empty histogram for no finite observations', () => {
    expect(histogram(f([NaN, Infinity]))).toEqual({ edges: f([]), counts: f([]), maxCount: 0 });
  });

  it('accepts ordinary readonly numeric arrays without mutating them', () => {
    const values = Object.freeze([3, 1, 2]);
    expect(histogram(values, { binCount: 2 }).counts.reduce((sum, value) => sum + value, 0)).toBe(
      3,
    );
    expect(values).toEqual([3, 1, 2]);
  });
});
