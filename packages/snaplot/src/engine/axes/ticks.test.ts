import { describe, expect, it, vi } from 'vitest';
import { axisTickValues, fitTicks, thinTicks } from './ticks';
import type { Scale } from '../spec';

function linearScale(min: number, max: number, generated: number[]): Scale {
  return {
    type: 'linear',
    key: 'y',
    min,
    max,
    dataToPixel: (v: number) => v,
    pixelToData: (p: number) => p,
    ticks: vi.fn(() => generated),
    tickFormat: (v: number) => String(v),
    nice: () => {},
    setPixelRange: () => {},
  };
}

describe('axisTickValues', () => {
  it('passes tickCount through to the scale as the density hint', () => {
    const scale = linearScale(0, 100, [0, 50, 100]);
    axisTickValues(scale, { tickCount: 3 });
    expect(scale.ticks).toHaveBeenCalledWith(3);
  });

  it('uses explicit ticks, clamped to the visible domain', () => {
    const scale = linearScale(10, 90, [0, 50, 100]);
    const values = axisTickValues(scale, { ticks: [0, 10, 50, 90, 100, Number.NaN] });
    expect(values).toEqual([10, 50, 90]);
    expect(scale.ticks).not.toHaveBeenCalled();
  });
});

describe('thinTicks', () => {
  it('keeps regular intervals and both ends when thinning an aligned continuous axis', () => {
    expect(thinTicks([0, 10, 20, 30, 40, 50, 60], 4, true)).toEqual([0, 20, 40, 60]);
  });
  // gap-overhaul-delta-06: the previous assertion enshrined this collapse
  // (thinTicks([0..50], 4, true) → [0, 50]) as the specification.
  it('[visuals-09] keeps ≥ 3 labels for prime interval counts', () => {
    // Five intervals: no stride divides them, so only the two endpoints survive today.
    expect(thinTicks([0, 10, 20, 30, 40, 50], 4, true).length).toBeGreaterThanOrEqual(3);
  });
  it('keeps short lists intact and thins long lists evenly from the first entry', () => {
    expect(thinTicks([1, 2, 3], 6)).toEqual([1, 2, 3]);
    expect(thinTicks([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 5)).toEqual([0, 2, 4, 6, 8]);
    // 365 daily categories capped to 12 labels: strides of 31.
    const year = Array.from({ length: 365 }, (_, i) => i);
    const thinned = thinTicks(year, 12);
    expect(thinned.length).toBeLessThanOrEqual(12);
    expect(thinned[0]).toBe(0);
  });

  it('never returns fewer than two entries for a multi-entry list', () => {
    expect(thinTicks([1, 2, 3, 4], 0).length).toBeGreaterThanOrEqual(2);
  });
});

describe('fitTicks', () => {
  // Labels 12 px wide on ticks 10 px apart: every second one fits. `first` numbers the first tick.
  const keptOf = (first: number, numbered: boolean) =>
    fitTicks(
      6,
      (i) => [i * 10, i * 10 + 12],
      (i) => String(first + i),
      0,
      false,
      numbered ? (i) => first + i : undefined,
    );

  it('keeps every nth tick from the first when the ticks have no numbers', () => {
    expect(keptOf(1, false)).toEqual([0, 2, 4]);
  });

  it('keeps the ticks whose number the stride divides, wherever the list starts', () => {
    // Ticks 1 to 6, then 2 to 7 once the axis moves on a tick: both keep 2, 4 and 6.
    expect(keptOf(1, true)).toEqual([1, 3, 5]);
    expect(keptOf(2, true)).toEqual([0, 2, 4]);
  });
});
