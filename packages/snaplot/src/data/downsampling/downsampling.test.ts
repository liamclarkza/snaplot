import { describe, expect, it } from 'vitest';
import { lttb } from './lttb';
import { m4 } from './m4';

const f = (xs: number[]) => Float64Array.from(xs);

describe('downsampling gaps', () => {
  it('preserves NaN separators in M4 output', () => {
    const [, y] = m4(
      f([0, 1, 2, 3, 4, 5, 6, 7, 8]),
      f([1, 2, 3, NaN, 4, 5, 6, NaN, 7]),
      1,
      0,
      8,
    );

    expect(Array.from(y).filter((value) => Number.isNaN(value))).toHaveLength(2);
  });

  it('preserves NaN separators in LTTB output', () => {
    const [, y] = lttb(
      f([0, 1, 2, 3, 4, 5, 6, 7, 8]),
      f([1, 2, 3, NaN, 4, 5, 6, NaN, 7]),
      5,
    );

    expect(Array.from(y).filter((value) => Number.isNaN(value))).toHaveLength(2);
  });
});

describe('m4 edge continuity', () => {
  it('retains a point left of xMin instead of dropping it into bucket -1', () => {
    // viewportIndices deliberately includes one point left of the viewport for
    // line continuity. The left-of-viewport x=5 must survive; the bug bucketed
    // it negative, colliding with the -1 sentinel and emitting a spurious (0,0).
    const [x, y] = m4(
      f([5, 10, 12, 14, 16, 18]),
      f([50, 100, 120, 140, 160, 180]),
      1,
      10,
      18,
    );

    expect(x[0]).toBe(5);
    expect(y[0]).toBe(50);
    expect(Array.from(x)).not.toContain(0);
  });
});

describe('m4 result buffers', () => {
  it('returns trimmed copies, not views over the full scratch buffer', () => {
    const pixelWidth = 4;
    const n = pixelWidth * 4 + 50; // force the downsampling path
    const xs = Float64Array.from({ length: n }, (_, i) => i);
    const ys = Float64Array.from({ length: n }, (_, i) => Math.sin(i));

    const [x, y] = m4(xs, ys, pixelWidth, 0, n - 1);

    // A subarray view would keep byteLength at the 4*pixelWidth scratch size;
    // a trim-copy shrinks the backing buffer to exactly the emitted length.
    expect(x.buffer.byteLength).toBe(x.length * 8);
    expect(y.buffer.byteLength).toBe(y.length * 8);
    expect(x.length).toBeLessThan(pixelWidth * 4);
  });
});
