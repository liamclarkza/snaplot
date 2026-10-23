// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SeriesSpec } from '../src/engine/spec';
import {
  type EngineFakes,
  engineDebug,
  installEngineFakes,
  hoverAt,
  plotPoint,
  press,
  tapAt,
} from './fakes/engine';

// Ported from src/core/Chart.append.test.ts (plan M2). What a data pass drew
// is read from the debug counters; time is pinned so the interaction window
// (INTERACTION_REFINE_MS = 150 ms after the last viewport change) is exact.

const REFINE_MS = 150;

let fakes: EngineFakes;
beforeEach(() => {
  fakes = installEngineFakes();
  vi.spyOn(performance, 'now').mockReturnValue(1_000);
});
afterEach(() => {
  fakes.uninstall();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('engine interaction sampling', () => {
  it('decimates a large line only while a gesture is active, full fidelity at rest', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const n = 5000;
    const xs = new Float64Array(n);
    const ys = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      xs[i] = i;
      ys[i] = Math.sin(i / 20);
    }
    const chart = fakes.engine(
      {
        axes: { x: { type: 'linear' as const }, y: { type: 'linear' as const } },
        series: [{ label: 'v', yColumn: 1, type: 'line' }] as SeriesSpec[],
      },
      [xs, ys],
    );

    // At rest: no decimation, every in-view point is stroked.
    expect(engineDebug(chart).inViewPoints).toBe(n);
    expect(engineDebug(chart).drawnPoints).toBe(n);

    // During a gesture (a key zoom): decimated to at most 4 points per pixel column.
    press(chart, '+');
    fakes.frames.step();
    const during = engineDebug(chart);
    const budget = Math.max(1, Math.round(chart.getLayout().plot.width)) * 4;
    expect(during.inViewPoints).toBeGreaterThan(budget);
    expect(during.drawnPoints).toBeLessThanOrEqual(budget);
    expect(during.drawnPoints).toBeGreaterThan(1);
    expect(during.drawnPoints).toBeLessThan(during.inViewPoints);

    // Once the viewport has been quiet for the refine delay, the full data repaints.
    vi.mocked(performance.now).mockReturnValue(1_000 + REFINE_MS + 1);
    vi.advanceTimersByTime(REFINE_MS);
    fakes.frames.step();
    const settled = engineDebug(chart);
    expect(settled.drawnPoints).toBe(settled.inViewPoints);
    expect(settled.inViewPoints).toBe(during.inViewPoints);
  });

  it('uses a CSS-pixel-scaled interaction budget for every pointer type', () => {
    const n = 4800;
    const xs = new Float64Array(n);
    const ys = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      xs[i] = i;
      ys[i] = i % 10;
    }
    const chart = fakes.engine(
      {
        axes: { x: { type: 'linear' }, y: { type: 'linear' } },
        series: [{ label: 'points', type: 'scatter', xColumn: 0, yColumn: 1 }],
      },
      [xs, ys],
      { width: 400, height: 300 },
    );
    expect(chart.getLayout().plot.width).toBe(320);
    const x = chart.getAxis('x')!;
    // A viewport change to the same window: the interaction pass runs with
    // every point still in view.
    const nudge = () => {
      chart.setAxis('x', { min: x.min, max: x.max });
      fakes.frames.step();
      return engineDebug(chart);
    };

    // After a touch, the budget is 1.5 points per CSS pixel: 320 × 1.5 = 480.
    tapAt(chart, plotPoint(chart), 'touch');
    const touch = nudge();
    expect(touch.inViewPoints).toBe(n);
    expect(touch.drawnPoints).toBe(480);

    // After a mouse move the budget is the same (plan §3.4: max(400, 1.5 × plot width)
    // in-view points, whatever the pointer).
    hoverAt(chart, plotPoint(chart));
    const mouse = nudge();
    expect(mouse.inViewPoints).toBe(n);
    expect(mouse.drawnPoints).toBe(480);
  });
});
