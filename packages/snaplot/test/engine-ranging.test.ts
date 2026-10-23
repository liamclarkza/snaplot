// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type EngineFakes, f, installEngineFakes, plotPoint, press, wheelAt } from './fakes/engine';

// Ported from src/core/Chart.append.test.ts (plan M2). Zoom and pan come from
// wheel and key events: with `zoom.wheelStep: 1` a 20-unit wheel delta zooms
// by exactly 2×, and ArrowLeft pans 40 px.

let fakes: EngineFakes;
beforeEach(() => {
  fakes = installEngineFakes();
});
afterEach(() => fakes.uninstall());

describe('engine auto-range and log interactions', () => {
  it('nicens linear auto-range by default and honors explicit opt-out', () => {
    const exactChart = fakes.engine(
      {
        axes: { x: { type: 'linear', nice: false }, y: { type: 'linear' } },
        series: [{ label: 'value', type: 'line', dataIndex: 1 }],
      },
      [f([3, 50, 97]), f([0.2, 0.3, 0.4])],
    );

    expect(exactChart.getAxis('x')?.min).toBe(3);
    expect(exactChart.getAxis('x')?.max).toBe(97);
    exactChart.destroy();

    const defaultChart = fakes.engine(
      {
        axes: { x: { type: 'linear' }, y: { type: 'linear' } },
        series: [{ label: 'value', type: 'line', dataIndex: 1 }],
      },
      [f([3, 50, 97]), f([0.2, 0.3, 0.4])],
    );

    expect(defaultChart.getAxis('x')?.min).toBe(0);
    expect(defaultChart.getAxis('x')?.max).toBe(100);
    defaultChart.destroy();

    const niceChart = fakes.engine(
      {
        axes: { x: { type: 'linear', nice: true }, y: { type: 'linear' } },
        series: [{ label: 'value', type: 'line', dataIndex: 1 }],
      },
      [f([3, 50, 97]), f([0.2, 0.3, 0.4])],
    );

    expect(niceChart.getAxis('x')?.min).toBe(0);
    expect(niceChart.getAxis('x')?.max).toBe(100);
  });

  it('uses tickCount to stabilize both automatic bounds and generated intervals', () => {
    const chart = fakes.engine(
      {
        axes: { x: { type: 'linear', tickCount: 3 }, y: { type: 'linear', nice: false } },
        series: [{ label: 'value', type: 'line', dataIndex: 1 }],
      },
      [f([-100, -89]), f([0, 1])],
    );

    const xScale = chart.getAxis('x')!;
    expect(xScale.min).toBe(-100);
    expect(xScale.max).toBe(-80);
    expect(xScale.ticks(3)).toEqual([-100, -90, -80]);
    chart.destroy();

    const sparseChart = fakes.engine(
      {
        axes: { x: { type: 'linear', tickCount: 2 }, y: { type: 'linear', nice: false } },
        series: [{ label: 'value', type: 'line', dataIndex: 1 }],
      },
      [f([-1000, 1]), f([0, 1])],
    );

    expect(sparseChart.getAxis('x')?.min).toBe(-1000);
    expect(sparseChart.getAxis('x')?.max).toBe(1000);
  });

  it('keeps a usable vertical span for constant linear data', () => {
    const chart = fakes.engine(
      {
        axes: {
          x: { type: 'linear', nice: false },
          y: { type: 'linear', nice: false, padding: 0 },
        },
        series: [{ label: 'value', type: 'line', dataIndex: 1 }],
      },
      [f([0, 1, 2]), f([10, 10, 10])],
    );

    const yScale = chart.getAxis('y')!;
    expect(yScale.min).toBe(9);
    expect(yScale.max).toBe(11);
    expect(yScale.max).toBeGreaterThan(yScale.min);
  });

  it('preserves one-sided explicit bounds while nicening the free side', () => {
    const chart = fakes.engine(
      {
        axes: {
          x: { type: 'linear', min: 13, tickCount: 6 },
          y: { type: 'linear', nice: false },
        },
        series: [{ label: 'value', type: 'line', dataIndex: 1 }],
      },
      [f([13, 47]), f([0, 1])],
    );

    const xScale = chart.getAxis('x')!;
    expect(xScale.min).toBe(13);
    expect(xScale.max).toBe(50);
  });

  it('keeps bar X half-slot padding independent of linear nicening', () => {
    const chart = fakes.engine(
      {
        axes: { x: { type: 'linear' }, y: { type: 'linear', nice: false } },
        series: [{ label: 'value', type: 'bar', dataIndex: 1 }],
      },
      [f([7, 9, 11]), f([1, 2, 3])],
    );

    const xScale = chart.getAxis('x')!;
    expect(xScale.min).toBe(5);
    expect(xScale.max).toBe(13);
  });

  it('pads horizontal log axes symmetrically in log space by default', () => {
    const chart = fakes.engine(
      {
        axes: { x: { type: 'log', padding: 0.1 }, y: { type: 'linear' } },
        series: [{ label: 'loss', type: 'line', dataIndex: 1 }],
      },
      [f([1e-4, 1e-3, 1e-2]), f([0.2, 0.3, 0.4])],
    );
    const xScale = chart.getAxis('x')!;
    const leftPad = Math.log10(1e-4) - Math.log10(xScale.min);
    const rightPad = Math.log10(xScale.max) - Math.log10(1e-2);

    expect(leftPad).toBeCloseTo(0.2, 10);
    expect(rightPad).toBeCloseTo(leftPad, 10);
  });

  it('pads vertical log axes symmetrically and ignores non-positive values', () => {
    const chart = fakes.engine(
      {
        axes: { x: { type: 'linear' }, y: { type: 'log', padding: 0.1 } },
        series: [{ label: 'loss', type: 'line', dataIndex: 1 }],
      },
      [f([0, 1, 2, 3]), f([0, 1e-2, 1, 1e2])],
    );
    const yScale = chart.getAxis('y')!;
    const bottomPad = Math.log10(1e-2) - Math.log10(yScale.min);
    const topPad = Math.log10(yScale.max) - Math.log10(1e2);

    expect(bottomPad).toBeCloseTo(0.4, 10);
    expect(topPad).toBeCloseTo(bottomPad, 10);
  });

  it('zooms log axes in log space around the pointer anchor', () => {
    const chart = fakes.engine(
      {
        axes: { x: { type: 'log', min: 1e-5, max: 1e-1 }, y: { type: 'linear' } },
        zoom: { enabled: true, x: true, bounds: 'unbounded', wheelStep: 1 },
        series: [{ label: 'points', type: 'scatter', xDataIndex: 1, yDataIndex: 2 }],
      },
      [f([0, 1, 2]), f([1e-5, 1e-3, 1e-1]), f([0.2, 0.3, 0.4])],
    );
    const xScale = chart.getAxis('x')!;

    // A 2× trackpad pinch-in centred on x = 1e-3.
    wheelAt(
      chart,
      { x: xScale.dataToPixel(1e-3), y: plotPoint(chart).y },
      {
        deltaY: -20,
        ctrlKey: true,
      },
    );

    expect(xScale.min).toBeCloseTo(1e-4, 10);
    expect(xScale.max).toBeCloseTo(1e-2, 10);
  });

  it('keeps log pan clamped without shrinking the viewport at the lower bound', () => {
    const chart = fakes.engine(
      {
        axes: {
          x: { type: 'log', padding: 0 },
          y: { type: 'linear', padding: 0 },
        },
        zoom: {
          enabled: true,
          x: true,
          y: true,
          bounds: { x: 'data', y: 'unbounded' },
        },
        pan: { enabled: true, x: true, y: true },
        series: [{ label: 'points', type: 'scatter', xDataIndex: 1, yDataIndex: 2 }],
      },
      [f([0, 1, 2]), f([1e-5, 1e-3, 1e-1]), f([0.2, 0.3, 0.4])],
    );
    const xScale = chart.getAxis('x')!;
    const initial = { min: xScale.min, max: xScale.max };

    // ArrowLeft pans the view 40 px towards smaller X, into the lower bound.
    press(chart, 'ArrowLeft');

    expect(xScale.min).toBeCloseTo(initial.min, 12);
    expect(xScale.max).toBeCloseTo(initial.max, 12);
  });

  it('keeps xy zoom uniform when one axis reaches its bounds', () => {
    const chart = fakes.engine(
      {
        axes: { x: { type: 'linear' }, y: { type: 'linear' } },
        zoom: {
          enabled: true,
          x: true,
          y: true,
          wheelStep: 1,
          bounds: {
            x: { min: 0, max: 100 },
            y: { min: 0, max: 10 },
          },
        },
        series: [{ label: 'points', dataIndex: 1 }],
      },
      [f([0, 100]), f([0, 10])],
    );

    chart.setAxis('x', { min: 25, max: 75 });
    chart.setAxis('y', { min: 2, max: 8 });

    // A 2× trackpad pinch-out at the plot centre, zooming both axes together.
    wheelAt(chart, plotPoint(chart), { deltaY: 20, ctrlKey: true });

    const xScale = chart.getAxis('x')!;
    const yScale = chart.getAxis('y')!;
    expect(yScale.max - yScale.min).toBeCloseTo(10, 10);
    expect(xScale.max - xScale.min).toBeCloseTo(50 * (10 / 6), 10);
  });

  it('ignores axis-origin zoom events unless axis zooming is enabled', () => {
    const chart = fakes.engine(
      {
        axes: { x: { type: 'linear' }, y: { type: 'linear' } },
        zoom: { enabled: true, x: true, bounds: 'unbounded' },
        series: [{ label: 'value', dataIndex: 1 }],
      },
      [f([0, 100]), f([0, 10])],
    );
    const xScale = chart.getAxis('x')!;
    const { plot } = chart.getLayout();
    const initial = { min: xScale.min, max: xScale.max };
    // A wheel over the X axis gutter, just below the plot.
    const onXAxis = { x: plot.left + plot.width / 2, y: plot.top + plot.height + 8 };

    wheelAt(chart, onXAxis, { deltaY: -20 });

    expect(xScale.min).toBe(initial.min);
    expect(xScale.max).toBe(initial.max);

    chart.setOptions({ zoom: { axis: true } });
    wheelAt(chart, onXAxis, { deltaY: -20 });

    expect(xScale.max - xScale.min).toBeLessThan(initial.max - initial.min);
  });
});
