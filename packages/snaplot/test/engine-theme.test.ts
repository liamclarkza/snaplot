// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SeriesSpec } from '../src/engine/spec';
import { type EngineFakes, f, installEngineFakes } from './fakes/engine';

// Ported from src/core/Chart.append.test.ts (plan M2). CSS custom properties
// come from the computed-style fake.

let fakes: EngineFakes;
beforeEach(() => {
  fakes = installEngineFakes();
});
afterEach(() => fakes.uninstall());

describe('engine live theme refresh', () => {
  it('refreshTheme picks up changed --chart-* tokens without a remount', () => {
    fakes.style.set('--chart-bg', '#ffffff');
    fakes.style.set('--chart-text', '#111111');

    const chart = fakes.engine({ series: [{ label: 'v', yColumn: 1 }] as SeriesSpec[] }, [
      f([1, 2]),
      f([10, 20]),
    ]);
    expect(chart.getTheme().backgroundColor).toBe('#ffffff');

    // The app flips its dark theme: same chart instance, new token values.
    fakes.style.set('--chart-bg', '#14161f');
    fakes.style.set('--chart-text', '#e2e2e5');
    chart.refreshTheme();

    expect(chart.getTheme().backgroundColor).toBe('#14161f');
    expect(chart.getTheme().textColor).toBe('#e2e2e5');
  });

  it('refreshTheme is a no-op when the resolved theme is unchanged', () => {
    const chart = fakes.engine({ series: [{ label: 'v', yColumn: 1 }] as SeriesSpec[] }, [
      f([1, 2]),
      f([10, 20]),
    ]);
    const before = chart.getTheme();
    chart.refreshTheme();
    // Identity preserved: no repaint-triggering theme swap happened.
    expect(chart.getTheme()).toBe(before);
  });
});
