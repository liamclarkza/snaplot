import { describe, expect, it } from 'vitest';
import { niceStep, niceRange, niceTicks } from './niceNumbers';

describe('niceStep', () => {
  it('returns the raw range when count <= 1', () => {
    expect(niceStep(0, 100, 1)).toBe(100);
    expect(niceStep(0, 100, 0)).toBe(100);
  });

  it('picks 1, 2, 5 or 10 times a power of ten', () => {
    // For 0..10 with 6 ticks, raw step = 2, fraction = 2, magnitude = 1 → niceF = 2, step = 2
    expect(niceStep(0, 10, 6)).toBe(2);
    // For 0..100 with 6 ticks, raw step = 20, fraction = 2, magnitude = 10 → step = 20
    expect(niceStep(0, 100, 6)).toBe(20);
    // For 0..1000 with 6 ticks, raw step = 200, magnitude = 100 → step = 200
    expect(niceStep(0, 1000, 6)).toBe(200);
  });

  it('snaps up to the next nice boundary rather than down', () => {
    // raw step ~1.8, magnitude 1, fraction 1.8 → above SQRT_2 (1.41), so niceF = 2
    expect(niceStep(0, 9, 6)).toBe(2);
  });

  it('handles sub-unit ranges', () => {
    // 0..0.1 / 5 ticks → raw step 0.025, magnitude 0.01, fraction 2.5
    // (2.5 < sqrt(10)) so niceF = 2 → step = 0.02
    expect(niceStep(0, 0.1, 5)).toBe(0.02);
  });

  it('handles negative ranges symmetrically', () => {
    // -10..10 / 5 → raw step 5, magnitude 1, fraction 5 → niceF = 5, step = 5
    expect(niceStep(-10, 10, 5)).toBe(5);
  });
});

describe('niceRange', () => {
  it('returns a unit frame when min === max === 0', () => {
    expect(niceRange(0, 0, 5)).toEqual([-1, 1]);
  });

  it('pads around a constant non-zero value', () => {
    const [lo, hi] = niceRange(50, 50, 5);
    expect(lo).toBeLessThan(50);
    expect(hi).toBeGreaterThan(50);
  });

  it('rounds outward to nice boundaries', () => {
    const [lo, hi] = niceRange(3, 97, 6);
    expect(lo).toBeLessThanOrEqual(3);
    expect(hi).toBeGreaterThanOrEqual(97);
    // Both endpoints should be multiples of the nice step
    const step = niceStep(3, 97, 6);
    expect(lo / step).toBeCloseTo(Math.round(lo / step));
    expect(hi / step).toBeCloseTo(Math.round(hi / step));
  });
});

describe('niceTicks', () => {
  it('returns [] when count <= 0', () => {
    expect(niceTicks(0, 100, 0)).toEqual([]);
  });

  it('returns [min] when min === max', () => {
    expect(niceTicks(5, 5, 6)).toEqual([5]);
  });

  it('produces integer ticks for small integer ranges', () => {
    expect(niceTicks(0, 5, 6)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(niceTicks(-2, 3, 6)).toEqual([-2, -1, 0, 1, 2, 3]);
  });

  it('avoids floating-point drift on tenths', () => {
    const ticks = niceTicks(0, 1, 11);
    // Key invariant: every tick is exactly representable as i * step,
    // not accumulated via tick += step (which would drift).
    for (const t of ticks) {
      const scaled = Math.round(t * 10);
      expect(Math.abs(t * 10 - scaled)).toBeLessThan(1e-9);
    }
  });

  it('covers the requested range', () => {
    const ticks = niceTicks(17, 83, 6);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    expect(ticks[0]).toBeLessThanOrEqual(83);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(17);
  });

  it('returns roughly `count` ticks for typical ranges', () => {
    const ticks = niceTicks(0, 100, 6);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    expect(ticks.length).toBeLessThanOrEqual(11);
  });

  it('is stable on reused inputs', () => {
    const a = niceTicks(0, 100, 6);
    const b = niceTicks(0, 100, 6);
    expect(a).toEqual(b);
  });

  it('falls back to [min] when step degenerates (Infinity range)', () => {
    const ticks = niceTicks(0, Infinity, 6);
    expect(ticks).toEqual([0]);
  });

  it('falls back to [min] when min is NaN', () => {
    // NaN propagates through the step calculation; the Number.isFinite
    // guard catches it and we return the requested start value.
    const ticks = niceTicks(NaN, 100, 6);
    expect(ticks.length).toBeGreaterThan(0);
    expect(Number.isNaN(ticks[0])).toBe(true);
  });

  it('handles a negative-to-positive range with zero as a tick', () => {
    // niceTicks rounds inward, so the first/last tick can sit strictly
    // inside [min, max]. What we actually guarantee is that zero is a
    // tick for ranges straddling it.
    const ticks = niceTicks(-50, 50, 6);
    expect(ticks).toContain(0);
    expect(ticks[0]).toBeGreaterThanOrEqual(-50);
    expect(ticks[ticks.length - 1]).toBeLessThanOrEqual(50);
  });

  it('subdivides zoomed domains that straddle a single integer', () => {
    // Regression: the integer fast-path used to fire whenever exactly one
    // integer fell in the range, collapsing deep-zoom axes to one tick.
    const ticks = niceTicks(49.7, 50.3, 6);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    expect(ticks.some((t) => t < 50)).toBe(true);
    expect(ticks.some((t) => t > 50)).toBe(true);
  });

  it('subdivides very narrow zoomed domains around an integer', () => {
    const ticks = niceTicks(49.95, 50.05, 6);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
  });

  it('subdivides a zoomed domain entirely between two integers', () => {
    const ticks = niceTicks(1.2, 1.8, 6);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
  });

  it('subdivides zoomed domains containing exactly two integers', () => {
    // Regression: even with two integer ticks the axis felt bare at
    // deep zoom; fall through to nice-step so we get finer ticks.
    const ticks = niceTicks(42.8, 44.3, 6);
    expect(ticks.length).toBeGreaterThanOrEqual(4);
  });
});
