import { describe, expect, it } from 'vitest';
import { TimeScale } from './TimeScale';

describe('TimeScale.tickFormat', () => {
  it('renders a non-negative sub-second label for pre-1970 epochs', () => {
    // Regression: `Math.floor(value) % 1000` keeps the dividend's sign, so a
    // negative (pre-epoch) millisecond value produced a ".-500" suffix.
    const scale = new TimeScale('x', -800, -300); // domain 500ms, sub-second path
    const label = scale.tickFormat(-500);

    expect(label.endsWith('.500')).toBe(true);
    expect(label).not.toContain('-');
  });

  it('still renders the fractional part for post-1970 epochs', () => {
    const scale = new TimeScale('x', 300, 800);
    expect(scale.tickFormat(500).endsWith('.500')).toBe(true);
  });
});
