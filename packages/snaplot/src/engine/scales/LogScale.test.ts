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
});
