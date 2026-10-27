import { describe, expect, it } from 'vitest';
import { LogScale } from './LogScale';

describe('LogScale', () => {
  it('does not coerce non-positive data values to the axis floor', () => {
    const scale = new LogScale('y', 1, 100);
    scale.setPixelRange(100, 0);

    expect(scale.dataToPixel(0)).toBeNaN();
    expect(scale.dataToPixel(-1)).toBeNaN();
    expect(scale.dataToPixel(Number.NaN)).toBeNaN();
    expect(scale.dataToPixel(10)).toBeGreaterThan(0);
  });

  it('labels an axis under a decade with nice values rather than two sub-ticks', () => {
    // 0.13–0.34 holds only 0.2 and 0.3 of the 1-2-5 ladder.
    expect(new LogScale('y', 0.13, 0.34).ticks()).toEqual([0.15, 0.2, 0.25, 0.3]);
    // A decade or more keeps the ladder.
    expect(new LogScale('y', 1, 1000).ticks()).toEqual([1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]);
  });
});
