import { describe, expect, it } from 'vitest';
import { LinearScale } from './LinearScale';

describe('LinearScale.tickFormat', () => {
  it('formats fractional ticks at the precision the requested count implies', () => {
    // Regression: tickFormat derived its step from DEFAULT_TICK_COUNT (=6)
    // regardless of the count passed to ticks(). On [0, 30] a high count
    // produces a 0.5 step, but the default step (5) is an integer, so every
    // fractional tick was rounded, collapsing 0.5 and 1.0 to the same "1".
    const scale = new LinearScale('x', 0, 30);
    const ticks = scale.ticks(61);

    expect(ticks).toContain(0.5);
    expect(scale.tickFormat(0.5)).not.toBe(scale.tickFormat(1));
    expect(Number(scale.tickFormat(0.5))).toBeCloseTo(0.5);
  });

  it('still formats integer-stepped ticks as integers', () => {
    const scale = new LinearScale('x', 0, 10);
    scale.ticks(6);
    expect(scale.tickFormat(2)).toBe('2');
  });
});
