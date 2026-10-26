import { describe, expect, it } from 'vitest';
import { affineParams } from './affine';
import { LinearScale } from './LinearScale';
import { LogScale } from './LogScale';
import { TimeScale } from './TimeScale';

describe('affineParams', () => {
  it('matches dataToPixel across a linear scale domain', () => {
    const scale = new LinearScale('y', -50, 120);
    scale.setPixelRange(400, 20);
    const params = affineParams(scale);
    expect(params).not.toBeNull();
    const [k, b] = params!;
    for (const v of [-50, -12.5, 0, 33.3, 120]) {
      expect(v * k + b).toBeCloseTo(scale.dataToPixel(v), 6);
    }
  });

  it('stays within a hundredth of a pixel on epoch-millisecond time domains', () => {
    const min = 1_700_000_000_000;
    const max = min + 86_400_000;
    const scale = new TimeScale('x', min, max);
    scale.setPixelRange(40, 940);
    const params = affineParams(scale);
    expect(params).not.toBeNull();
    const [k, b] = params!;
    for (const v of [min, min + 1000, min + 43_200_000, max - 1, max]) {
      expect(Math.abs(v * k + b - scale.dataToPixel(v))).toBeLessThan(0.01);
    }
  });

  it('rejects log scales', () => {
    const scale = new LogScale('y', 1, 1000);
    scale.setPixelRange(400, 20);
    expect(affineParams(scale)).toBeNull();
  });

  it('rejects degenerate domains', () => {
    const flat = new LinearScale('y', 5, 5);
    flat.setPixelRange(0, 100);
    expect(affineParams(flat)).toBeNull();

    const nan = new LinearScale('y', Number.NaN, 10);
    nan.setPixelRange(0, 100);
    expect(affineParams(nan)).toBeNull();
  });
});
