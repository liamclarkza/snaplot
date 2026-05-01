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
