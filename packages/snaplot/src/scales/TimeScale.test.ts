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

describe('calendar-aligned ticks', () => {
  const DAY = 86_400_000;
  // 2026-06-05T16:00Z, a fixed reference point.
  const NOW = 1780704000000;

  function scaleFor(days: number, pxWidth = 640): TimeScale {
    const s = new TimeScale('x', NOW - days * DAY, NOW);
    s.setPixelRange(0, pxWidth);
    return s;
  }

  it('day-level ticks land on local midnights', () => {
    const ticks = scaleFor(14).ticks(6);
    expect(ticks.length).toBeGreaterThanOrEqual(4);
    for (const t of ticks) {
      const d = new Date(t);
      expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([0, 0, 0]);
    }
  });

  it('week-level ticks land on local Monday midnights', () => {
    const ticks = scaleFor(60).ticks(8);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    for (const t of ticks) {
      const d = new Date(t);
      expect(d.getDay()).toBe(1);
      expect(d.getHours()).toBe(0);
    }
  });

  it('month-level ticks land on the 1st of real calendar months', () => {
    const ticks = scaleFor(300).ticks(6);
    expect(ticks.length).toBeGreaterThanOrEqual(4);
    for (const t of ticks) {
      const d = new Date(t);
      expect(d.getDate()).toBe(1);
      expect(d.getHours()).toBe(0);
    }
  });

  it('year-level ticks land on January 1st', () => {
    const s = new TimeScale('x', NOW - 4 * 365 * DAY, NOW);
    s.setPixelRange(0, 500);
    const ticks = s.ticks(5);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    for (const t of ticks) {
      const d = new Date(t);
      expect(d.getMonth()).toBe(0);
      expect(d.getDate()).toBe(1);
    }
  });

  it('steps down the ladder on narrow charts instead of arbitrary linear dates', () => {
    // 90 days at 300px targets ~2 labels, which picks a 2-month interval;
    // only one 1st-of-month lands inside, so the scale must retry with
    // smaller calendar intervals rather than emit even subdivisions.
    const ticks = scaleFor(90, 300).ticks(6);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    for (const t of ticks) {
      const d = new Date(t);
      expect(d.getHours()).toBe(0);
      expect(d.getDate() === 1 || d.getDay() === 1).toBe(true);
    }
  });

  it('honors the count cap instead of ignoring it', () => {
    const many = scaleFor(90, 1200).ticks(12);
    const few = scaleFor(90, 1200).ticks(3);
    expect(few.length).toBeLessThan(many.length);
    expect(few.length).toBeLessThanOrEqual(6);
  });

  it('fills the 6-to-12-month ladder gap with calendar ticks, not linear fallback', () => {
    // 300 days used to exceed the 30-day "month" reach and fall back to an
    // arbitrary even subdivision; now it walks real month boundaries.
    const ticks = scaleFor(300).ticks(6);
    const allFirsts = ticks.every((t) => new Date(t).getDate() === 1);
    expect(allFirsts).toBe(true);
  });

  it('drops the time suffix for day-boundary labels in sub-30-day domains', () => {
    const s = scaleFor(14);
    const [firstTick] = s.ticks(6);
    const label = s.tickFormat(firstTick);
    // A midnight tick reads "Jun 1", never "Jun 1 02:00 AM".
    expect(label).not.toMatch(/\d:\d\d/);
  });

  it('renders month boundaries as the bare month name in day-domain charts', () => {
    const s = scaleFor(120);
    const monthStart = s.ticks(6).find((t) => new Date(t).getDate() === 1);
    expect(monthStart).toBeDefined();
    const label = s.tickFormat(monthStart!);
    expect(label).not.toMatch(/\d/);
  });
});
