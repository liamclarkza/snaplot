// histogram() (plan §3.1, §5.9, RC15): bins capped at 1,000 automatic and
// 10,000 explicit, values on an edge in the upper bin, nice automatic edges,
// shared thresholds across datasets, overflow-safe edges and invalid input
// rejected with a public message.
import { describe, expect, it } from 'vitest';
import { histogram } from '../../src/index';

type Options = Record<string, unknown>;
const bin = (values: readonly number[] | Float64Array, options?: Options) =>
  histogram(values, options as never);

function latency(n: number, outlier?: number): number[] {
  const values = Array.from({ length: n }, (_, i) => 100 + ((i * 37) % 50));
  if (outlier !== undefined) values.push(outlier);
  return values;
}

/** Counts derived from the edges alone: [lo, hi) for every bin but the last, [lo, hi] for it. */
function countsByEdges(values: readonly number[], edges: Float64Array): number[] {
  const last = edges.length - 2;
  return Array.from(
    { length: edges.length - 1 },
    (_, i) =>
      values.filter((v) => v >= edges[i] && (i === last ? v <= edges[i + 1] : v < edges[i + 1]))
        .length,
  );
}

describe('[dataapi-06] bounded and overflow-safe', () => {
  it('[dataapi-06] an outlier returns in under 5 ms with at most 1,000 bins', () => {
    const values = latency(1000, 1e7);
    let best = Number.POSITIVE_INFINITY;
    for (let run = 0; run < 3; run++) {
      const start = performance.now();
      const bins = bin(values);
      best = Math.min(best, performance.now() - start);
      expect(bins.counts.length).toBeLessThanOrEqual(1000);
    }
    expect(best).toBeLessThan(5);
  });

  it('[dataapi-06] explicit bins are capped at 10,000', () => {
    expect(bin(latency(100), { bins: 10_000 }).counts.length).toBe(10_000);
    expect(() => bin(latency(100), { bins: 10_001 })).toThrow(/^snaplot: .*10,000/);
  });

  it('[dataapi-06] edges stay finite and strictly increasing at ±Number.MAX_VALUE', () => {
    const bins = bin([-Number.MAX_VALUE, 0, Number.MAX_VALUE], { bins: 4 });
    expect([...bins.edges].every(Number.isFinite)).toBe(true);
    for (let i = 1; i < bins.edges.length; i++)
      expect(bins.edges[i]).toBeGreaterThan(bins.edges[i - 1]);
    expect(bins.counts.reduce((sum, count) => sum + count, 0)).toBe(3);
  });

  it('[dataapi-06] invalid input throws with a public message', () => {
    expect(() => bin('1,2,3' as never)).toThrow(/^snaplot: histogram/);
    expect(() => bin([1, 2, 3], { bins: 0 })).toThrow(/^snaplot: /);
    expect(() => bin([1, 2, 3], { bins: 2.5 })).toThrow(/^snaplot: /);
    expect(() => bin([1, 2, 3], { bins: 'sturgess' })).toThrow(/^snaplot: .*sturgess/);
    expect(() => bin([1, 2, 3], { thresholds: [3, 2, 1] })).toThrow(/^snaplot: .*thresholds/);
    expect(() => bin([1, 2, 3], { thresholds: [1] })).toThrow(/^snaplot: .*thresholds/);
    expect(() => bin([1, 2, 3], { binCount: 4 })).toThrow(/^snaplot: .*bins/);
  });

  it('no finite values give an empty histogram (control)', () => {
    expect(bin([Number.NaN, Number.POSITIVE_INFINITY]).counts.length).toBe(0);
  });
});

describe('[dataapi-19] edge membership', () => {
  it('[dataapi-19] counts agree with the edges for explicit and automatic bins', () => {
    const values = Array.from({ length: 1000 }, (_, i) => i / 10);
    for (const options of [{ bins: 30 }, { bins: 333 }, {}]) {
      const bins = bin(values, options);
      if (options.bins) expect(bins.counts.length).toBe(options.bins);
      expect([...bins.counts], JSON.stringify(options)).toEqual(countsByEdges(values, bins.edges));
    }
  });

  it('[dataapi-19] explicit bins end exactly at the largest value', () => {
    const values = Array.from({ length: 1000 }, (_, i) => i / 10);
    const bins = bin(values, { bins: 333 });
    expect(bins.counts.length).toBe(333);
    expect(bins.edges[0]).toBe(0);
    expect(bins.edges[bins.edges.length - 1]).toBe(99.9);
  });
});

describe('[dxtrial-14] nice and shareable bins', () => {
  it('[dxtrial-14] automatic edges are multiples of a 1-2-5 width', () => {
    const bins = bin(latency(10_000).map((v, i) => v + (i % 7) * 0.31));
    const width = bins.edges[1] - bins.edges[0];
    const exponent = Math.floor(Math.log10(width));
    const mantissa = Math.round((width / 10 ** exponent) * 1e9) / 1e9;
    expect([1, 2, 2.5, 5]).toContain(mantissa);
    for (const edge of bins.edges)
      expect(Math.abs(edge / width - Math.round(edge / width))).toBeLessThan(1e-6);
  });

  it('[dxtrial-14] thresholds give two datasets the same edges', () => {
    const control = bin(latency(5000).map((v) => v + 20));
    const variant = bin(latency(5000), { thresholds: control.edges });
    expect([...variant.edges]).toEqual([...control.edges]);
    const inRange = latency(5000).filter(
      (v) => v >= control.edges[0] && v <= control.edges[control.edges.length - 1],
    );
    expect(variant.counts.reduce((sum, count) => sum + count, 0)).toBe(inRange.length);
  });

  it('a single repeated value gets one bin around it (control)', () => {
    const bins = bin([7, 7, 7]);
    expect(bins.counts.length).toBe(1);
    expect(bins.edges[0]).toBeLessThan(7);
    expect(bins.edges[1]).toBeGreaterThan(7);
  });
});
