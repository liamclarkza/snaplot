// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChartSpec, SeriesSpec } from '../src/engine/spec';
import {
  drag,
  type EngineFakes,
  f,
  installEngineFakes,
  plotPoint,
  replaceData,
} from './fakes/engine';
import type { ChartCore } from '../src/engine/Engine';

// Ported from src/core/Chart.append.test.ts (plan M2). Brushes are mouse
// drags on the input layer.

let fakes: EngineFakes;
beforeEach(() => {
  fakes = installEngineFakes();
});
afterEach(() => fakes.uninstall());

/** The pixel of data X `x` at the plot's vertical middle. */
const atX = (chart: ChartCore, x: number) => ({
  x: chart.getAxis('x')!.dataToPixel(x),
  y: plotPoint(chart).y,
});

const ramp = () => {
  const xs = new Float64Array(101);
  const ys = new Float64Array(101);
  for (let i = 0; i <= 100; i++) {
    xs[i] = i;
    ys[i] = i;
  }
  return [xs, ys] as [Float64Array, Float64Array];
};

describe('engine brush selection', () => {
  it('brush mode creates a persistent data-anchored selection without zooming', () => {
    const changes: unknown[] = [];
    const chart = fakes.engine(
      {
        axes: { x: { type: 'linear' as const }, y: { type: 'linear' as const } },
        series: [{ label: 'v', yColumn: 1 }] as SeriesSpec[],
        selection: { mode: 'brush' as const },
      },
      ramp(),
    );
    chart.on('selection:change', (s) => changes.push(s));
    const x = chart.getAxis('x')!;
    const beforeMin = x.min;
    const beforeMax = x.max;

    drag(chart, atX(chart, 20), atX(chart, 60));

    const sel = chart.getSelection();
    expect(sel).not.toBeNull();
    expect(sel!.x.min).toBeCloseTo(20, 6);
    expect(sel!.x.max).toBeCloseTo(60, 6);
    expect(changes.length).toBe(1);
    // Brush must not zoom the viewport.
    expect(x.min).toBe(beforeMin);
    expect(x.max).toBe(beforeMax);

    // The selection is stored in data space, so it survives a zoom.
    chart.setAxis('x', { min: 10, max: 90 });
    expect(chart.getSelection()!.x.min).toBeCloseTo(20, 6);
  });

  it('brush move shifts an existing selection by the drag delta', () => {
    const chart = fakes.engine(
      {
        axes: { x: { type: 'linear' as const }, y: { type: 'linear' as const } },
        series: [{ label: 'v', yColumn: 1 }] as SeriesSpec[],
        selection: { mode: 'brush' as const },
      },
      ramp(),
    );
    chart.setSelection({ x: { min: 20, max: 40 } });

    // Start inside the band (data 30), drag to data 50: delta +20 -> [40, 60].
    drag(chart, atX(chart, 30), atX(chart, 50));

    const sel = chart.getSelection()!;
    expect(sel.x.min).toBeCloseTo(40, 6);
    expect(sel.x.max).toBeCloseTo(60, 6);
  });

  it('setSelection/getSelection round-trips and clearing fires a change', () => {
    const chart = fakes.engine(
      {
        axes: { x: { type: 'linear' as const }, y: { type: 'linear' as const } },
        series: [{ label: 'v', yColumn: 1 }] as SeriesSpec[],
        selection: { mode: 'brush' as const },
      },
      [f([0, 50, 100]), f([1, 2, 3])],
    );
    const changes: unknown[] = [];
    chart.on('selection:change', (s) => changes.push(s));

    chart.setSelection({ x: { min: 30, max: 10 } }); // unordered -> normalized
    expect(chart.getSelection()).toEqual({ x: { min: 10, max: 30 } });
    chart.setSelection({ x: { min: 10, max: 30 } }); // identical -> no event
    chart.setSelection(null);
    expect(chart.getSelection()).toBeNull();

    expect(changes).toEqual([{ x: { min: 10, max: 30 } }, null]);
  });

  it('clears a brush that no longer overlaps replaced data by default', () => {
    const onBrush = vi.fn();
    const config: ChartSpec = {
      axes: { x: { type: 'linear' }, y: { type: 'linear' } },
      series: [{ label: 'v', yColumn: 1 }],
      selection: { mode: 'brush', onBrush },
    };
    const chart = fakes.engine(config, [f([0, 1, 2]), f([1, 2, 3])]);
    chart.setSelection({ x: { min: 0.5, max: 1.5 } });
    replaceData(chart, config, [f([10, 11, 12]), f([4, 5, 6])]);

    expect(chart.getSelection()).toBeNull();
    expect(onBrush).toHaveBeenLastCalledWith(null);
  });

  it('can clamp a brush to the extent of replaced data', () => {
    const config: ChartSpec = {
      axes: { x: { type: 'linear' }, y: { type: 'linear' } },
      series: [{ label: 'v', yColumn: 1 }],
      selection: { mode: 'brush', dataChange: 'clamp' },
    };
    const chart = fakes.engine(config, [f([0, 5, 10]), f([1, 2, 3])]);
    chart.setSelection({ x: { min: 2, max: 8 } });
    replaceData(chart, config, [f([6, 8, 10]), f([4, 5, 6])]);

    expect(chart.getSelection()).toEqual({ x: { min: 6, max: 8 } });
  });
});
