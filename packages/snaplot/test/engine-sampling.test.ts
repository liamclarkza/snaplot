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
  it('[gap-perf-gate-10] decimates a large line per CSS column during a gesture and per device column at rest', () => {
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

    // At rest: M4 per device-pixel column (visually lossless), never more than 4 per column.
    const restBudget = (width: number, dpr: number) => Math.max(1, Math.round(width * dpr)) * 4;
    const rest = engineDebug(chart);
    expect(rest.inViewPoints).toBe(n);
    expect(rest.drawnPoints).toBeLessThanOrEqual(
      restBudget(chart.getLayout().plot.width, chart.getLayout().dpr),
    );

    // During a gesture (a key zoom): decimated to at most 4 points per pixel column.
    press(chart, '+');
    fakes.frames.step();
    const during = engineDebug(chart);
    const budget = Math.max(1, Math.round(chart.getLayout().plot.width)) * 4;
    expect(during.inViewPoints).toBeGreaterThan(budget);
    expect(during.drawnPoints).toBeLessThanOrEqual(budget);
    expect(during.drawnPoints).toBeGreaterThan(1);
    expect(during.drawnPoints).toBeLessThan(during.inViewPoints);

    // Once the viewport has been quiet for the refine delay, it repaints at device resolution.
    vi.mocked(performance.now).mockReturnValue(1_000 + REFINE_MS + 1);
    vi.advanceTimersByTime(REFINE_MS);
    fakes.frames.step();
    const settled = engineDebug(chart);
    expect(settled.inViewPoints).toBe(during.inViewPoints);
    expect(settled.drawnPoints).toBeLessThanOrEqual(
      Math.min(
        settled.inViewPoints,
        restBudget(chart.getLayout().plot.width, chart.getLayout().dpr),
      ),
    );
    expect(settled.drawnPoints).toBeGreaterThanOrEqual(during.drawnPoints);
  });

  /**
   * A 4,800-point scatter in a 400 × 300 chart (plot width 320). With `xColumn: 0` the store's
   * X is the scatter's X, so a gesture culls it to the view; with `xColumn: 2` column 0 is the
   * row index and the scatter's own X is unsorted, so it is not culled.
   */
  function scatter(xColumn: 0 | 2) {
    const n = 4800;
    const index = new Float64Array(n);
    const ys = new Float64Array(n);
    const unsorted = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      index[i] = i;
      ys[i] = i % 10;
      unsorted[i] = (i * 7) % n;
    }
    const chart = fakes.engine(
      {
        axes: { x: { type: 'linear' }, y: { type: 'linear' } },
        series: [{ label: 'points', type: 'scatter', xColumn, yColumn: 1 }],
      },
      [index, ys, unsorted],
      { width: 400, height: 300 },
    );
    expect(chart.getLayout().plot.width).toBe(320);
    const x = chart.getAxis('x')!;
    // A viewport change to the same window: the interaction pass runs with
    // every point still in view.
    const nudge = () => {
      chart.setAxis('x', { min: x.min, max: x.max });
      fakes.frames.step();
      const { inViewPoints, drawnPoints } = engineDebug(chart);
      return { inViewPoints, drawnPoints };
    };
    return { chart, n, nudge };
  }

  it('budgets a source culled by X by plot width, for every pointer type', () => {
    const { chart, n, nudge } = scatter(0);
    // Plan §3.4: max(400, 1.5 × plot width) in-view points = 320 × 1.5 = 480.
    tapAt(chart, plotPoint(chart), 'touch');
    expect(nudge()).toEqual({ inViewPoints: n, drawnPoints: 480 });
    hoverAt(chart, plotPoint(chart));
    expect(nudge()).toEqual({ inViewPoints: n, drawnPoints: 480 });
  });

  it('keeps the 10,000-point mouse budget for a source not culled by X', () => {
    // Its stride runs over the whole source, so the width-scaled budget would leave a
    // fraction of it in view (gap-perf-gate-01:sampling, M11). Touch keeps 1.5 per pixel.
    const { chart, n, nudge } = scatter(2);
    tapAt(chart, plotPoint(chart), 'touch');
    expect(nudge()).toEqual({ inViewPoints: n, drawnPoints: 480 });
    // After a mouse move the budget is 10,000 points, so nothing is sampled.
    hoverAt(chart, plotPoint(chart));
    expect(nudge()).toEqual({ inViewPoints: n, drawnPoints: n });
  });
});
