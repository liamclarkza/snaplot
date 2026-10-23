import { describe, expect, it } from 'vitest';
import { histogram } from './histogram';

const f = (xs: number[]) => Float64Array.from(xs);

describe('histogram()', () => {
  it('skips non-finite values', () => {
    const bins = histogram(f([1, 2, Number.NaN, Infinity, 3, -Infinity]), { bins: 2 });
    expect([...bins.edges]).toEqual([1, 2, 3]);
    expect([...bins.counts]).toEqual([1, 2]);
    expect(bins.maxCount).toBe(2);
  });

  it('rejects invalid bin counts, rules and thresholds with public messages', () => {
    for (const bins of [Infinity, 0, -1, 2.5, 10_001])
      expect(() => histogram(f([1, 2, 3]), { bins })).toThrow(/^snaplot: histogram\(\) bins/);
    expect(() => histogram(f([1, 2, 3]), { bins: 'sturgess' as never })).toThrow(
      "did you mean 'sturges'",
    );
    expect(() => histogram(f([1, 2]), { bins: 2, thresholds: [0, 1] })).toThrow(/not both/);
    expect(() => histogram(f([1, 2]), { thresholds: [0, Number.NaN, 2] })).toThrow(/finite/);
    expect(() => histogram(f([1, 2]), { binCount: 2 } as never)).toThrow(
      'histogram() has no option "binCount". Use bins.',
    );
  });

  it('gives one count per bin, one bin around a constant value', () => {
    const constant = histogram(f([2, 2, 2]));
    expect([...constant.counts]).toEqual([3]);
    expect(constant.edges[0]).toBeLessThan(2);
    expect(constant.edges[1]).toBeGreaterThan(2);
    const several = histogram(f([0, 1, 2, 3, 4, 5]), { bins: 3 });
    expect(several.edges.length).toBe(several.counts.length + 1);
    expect(several.counts.reduce((sum, value) => sum + value, 0)).toBe(6);
  });

  it('returns an empty histogram for no finite values', () => {
    expect(histogram(f([Number.NaN, Infinity]))).toEqual({
      edges: f([]),
      counts: f([]),
      maxCount: 0,
    });
  });

  it('reads readonly arrays without changing them', () => {
    const values = Object.freeze([3, 1, 2]);
    expect(histogram(values, { bins: 2 }).counts.reduce((sum, value) => sum + value, 0)).toBe(3);
    expect(values).toEqual([3, 1, 2]);
  });

  it('applies each rule, capped at 1,000 nice bins', () => {
    const values = Array.from({ length: 5000 }, (_, i) => Math.sin(i) * 100);
    for (const bins of ['freedman-diaconis', 'sturges', 'scott'] as const) {
      const result = histogram(values, { bins });
      expect(result.counts.length).toBeGreaterThan(1);
      expect(result.counts.length).toBeLessThanOrEqual(1000);
      expect(result.counts.reduce((sum, value) => sum + value, 0)).toBe(values.length);
    }
  });
});
