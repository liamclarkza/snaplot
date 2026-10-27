// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChartCore } from '../src/engine/Engine';
import type { SeriesSpec } from '../src/engine/spec';
import { type EngineFakes, f, installEngineFakes, press } from './fakes/engine';

// Ported from src/core/Chart.append.test.ts (plan M2).

let fakes: EngineFakes;
beforeEach(() => {
  fakes = installEngineFakes();
});
afterEach(() => fakes.uninstall());

const streamConfig = {
  axes: { x: { type: 'linear' as const }, y: { type: 'linear' as const } },
  series: [{ label: 'v', yColumn: 1 }] as SeriesSpec[],
  streaming: { followWindow: 10 },
};

/** A horizontal zoom-in at the plot centre (the `+` key). */
const zoomIn = (chart: ChartCore) => press(chart, '+');

describe('engine live-follow viewport', () => {
  it('keeps the plot one width as ticks cross its edges while the window slides', () => {
    // Long tick labels (10,000,000 and on), so an edge tick's label would reach past the plot.
    const step = 3_000_000;
    const chart = fakes.engine({ ...streamConfig, streaming: { followWindow: 100_000_000 } }, [
      f([0, step, 2 * step]),
      f([5, 6, 7]),
    ]);
    const edges = new Set<string>();
    for (let x = 3 * step; x < 400_000_000; x += step) {
      chart.appendToSource(0, [f([x]), f([(x / step) % 7])]);
      fakes.frames.flush();
      const { plot } = chart.getLayout();
      edges.add(`${plot.left}..${plot.left + plot.width}`);
    }
    // Ticks pass through both edges as the window slides; the plot's edges never move.
    expect([...edges]).toHaveLength(1);
  });

  it('starts following and pins the X window to the trailing follow width', () => {
    const chart = fakes.engine(streamConfig, [f([0, 1, 2]), f([5, 6, 7])]);
    expect(chart.isFollowing()).toBe(true);
    // window 10, lastX 2: the window has its full width from the first sample (dxtrial-19).
    expect(chart.getAxis('x')?.min).toBe(-8);
    expect(chart.getAxis('x')?.max).toBe(2);

    // Append past the window: X should scroll to [lastX - 10, lastX].
    chart.appendToSource(0, [f([12, 15]), f([8, 9])]);
    expect(chart.getAxis('x')?.min).toBe(5);
    expect(chart.getAxis('x')?.max).toBe(15);
  });

  it('pauses following on a horizontal zoom and stops scrolling with data', () => {
    const changes: boolean[] = [];
    const chart = fakes.engine(streamConfig, [f([0, 5, 10]), f([1, 2, 3])]);
    chart.on('follow:change', (f2) => changes.push(f2));

    zoomIn(chart);
    expect(chart.isFollowing()).toBe(false);
    expect(changes).toEqual([false]);

    const pausedMin = chart.getAxis('x')?.min;
    const pausedMax = chart.getAxis('x')?.max;
    // Streaming continues but the paused viewport must not move.
    chart.appendToSource(0, [f([20]), f([4])]);
    expect(chart.getAxis('x')?.min).toBe(pausedMin);
    expect(chart.getAxis('x')?.max).toBe(pausedMax);
  });

  it('does not collapse to a zero-span X range with a single point', () => {
    const chart = fakes.engine(streamConfig, [f([42]), f([7])]);
    const x = chart.getAxis('x')!;
    // window 10, lastX 42: the full window, not [42, 42] (dxtrial-19).
    expect(x.min).toBeLessThan(x.max);
    expect(x.min).toBe(32);
    expect(x.max).toBe(42);
  });

  it('setAxis (sync-peer entry) pauses following on a horizontal viewport', () => {
    const changes: boolean[] = [];
    const chart = fakes.engine(streamConfig, [f([0, 5, 10]), f([1, 2, 3])]);
    chart.on('follow:change', (f2) => changes.push(f2));
    expect(chart.isFollowing()).toBe(true);
    // A peer broadcasts a viewport through setAxis; the receiver must stop
    // following so its next tick does not scroll back over the synced window.
    chart.setAxis('x', { min: 2, max: 8 });
    expect(chart.isFollowing()).toBe(false);
    expect(changes).toEqual([false]);
  });

  it('scrollToLatest resumes following and snaps to the newest window', () => {
    const changes: boolean[] = [];
    const chart = fakes.engine(streamConfig, [f([0, 5, 10]), f([1, 2, 3])]);
    chart.on('follow:change', (f2) => changes.push(f2));

    zoomIn(chart);
    chart.appendToSource(0, [f([20]), f([4])]);
    expect(chart.isFollowing()).toBe(false);

    chart.scrollToLatest();
    expect(chart.isFollowing()).toBe(true);
    expect(changes).toEqual([false, true]);
    // lastX 20, window 10 -> [10, 20].
    expect(chart.getAxis('x')?.min).toBe(10);
    expect(chart.getAxis('x')?.max).toBe(20);
  });

  it('without a follow window, isFollowing tracks full-extent auto-range', () => {
    const chart = fakes.engine(
      {
        axes: { x: { type: 'linear' as const }, y: { type: 'linear' as const } },
        series: [{ label: 'v', yColumn: 1 }] as SeriesSpec[],
      },
      [f([0, 1, 2]), f([5, 6, 7])],
    );
    expect(chart.isFollowing()).toBe(true);
    zoomIn(chart);
    expect(chart.isFollowing()).toBe(false);
    chart.scrollToLatest();
    expect(chart.isFollowing()).toBe(true);
    // Full extent restored.
    expect(chart.getAxis('x')?.min).toBe(0);
    expect(chart.getAxis('x')?.max).toBe(2);
  });
});
