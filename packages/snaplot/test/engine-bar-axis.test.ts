// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  bottomTickMarks,
  crispPixel,
  type EngineFakes,
  f,
  installEngineFakes,
  tickValues,
} from './fakes/engine';
import type { ChartCore } from '../src/core/Chart';

// Ported from src/core/Chart.append.test.ts (plan M2). The planned bar axis
// is read from the grid paint: its labels name the slot centres, and its
// bottom tick marks sit on the slot boundaries (the grid values) when the axis
// is planned, or under the labels when it is not.

let fakes: EngineFakes;
beforeEach(() => {
  fakes = installEngineFakes();
});
afterEach(() => fakes.uninstall());

/** Tick-mark pixels expected at `values` on the x axis. */
const pixels = (chart: ChartCore, values: number[]) => values.map((v) => crispPixel(chart, v));

describe('engine bar X-axis planning', () => {
  it('uses regular center ticks and half-interval grid cells for airport-style bars', () => {
    const chart = fakes.engine(
      {
        axes: { x: { type: 'linear' }, y: { type: 'linear', nice: false } },
        series: [{ label: 'departures', type: 'bar', dataIndex: 1 }],
      },
      [
        f([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]),
        f([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
      ],
    );

    const xScale = chart.getAxis('x')!;
    expect(xScale.min).toBe(5);
    expect(xScale.max).toBe(19);
    expect(tickValues(chart)).toEqual([6, 8, 10, 12, 14, 16, 18]);
    expect(bottomTickMarks(fakes, chart)).toEqual(pixels(chart, [5, 7, 9, 11, 13, 15, 17, 19]));
  });

  it('keeps small integer categories at every center with half-slot edges', () => {
    const chart = fakes.engine(
      {
        axes: { x: { type: 'linear' }, y: { type: 'linear', nice: false } },
        series: [{ label: 'score', type: 'bar', dataIndex: 1 }],
      },
      [f([0, 1, 2]), f([4, 5, 6])],
    );

    const xScale = chart.getAxis('x')!;
    expect(xScale.min).toBe(-0.5);
    expect(xScale.max).toBe(2.5);
    expect(tickValues(chart)).toEqual([0, 1, 2]);
    expect(bottomTickMarks(fakes, chart)).toEqual(pixels(chart, [-0.5, 0.5, 1.5, 2.5]));
  });

  it('keeps grouped bars inside the planned outer cells', () => {
    const chart = fakes.engine(
      {
        axes: { x: { type: 'linear' }, y: { type: 'linear', nice: false } },
        series: [
          { label: 'A', type: 'bar', dataIndex: 1 },
          { label: 'B', type: 'bar', dataIndex: 2 },
        ],
      },
      [f([7, 8, 9]), f([1, 2, 3]), f([2, 3, 4])],
    );

    const xScale = chart.getAxis('x')!;
    expect(xScale.min).toBe(6.5);
    expect(xScale.max).toBe(9.5);
  });

  it('expands regular grid cells around irregular outer bar widths', () => {
    const chart = fakes.engine(
      {
        axes: { x: { type: 'linear' }, y: { type: 'linear', nice: false } },
        series: [{ label: 'value', type: 'bar', dataIndex: 1 }],
      },
      [f([0, 1, 100]), f([1, 2, 3])],
    );

    const xScale = chart.getAxis('x')!;
    // The final category's local slot is 99 units wide; whole 20-unit
    // intervals keep its half-slot edge inside the regular grid domain.
    expect(xScale.min).toBe(-10);
    expect(xScale.max).toBe(150);
    expect(tickValues(chart)).toEqual([0, 20, 40, 60, 80, 100, 120, 140]);
  });

  it('keeps legacy bar bounds for nice:false, explicit ticks, and zoomed viewports', () => {
    const optOut = fakes.engine(
      {
        axes: { x: { type: 'linear', nice: false }, y: { type: 'linear', nice: false } },
        series: [{ label: 'departures', type: 'bar', dataIndex: 1 }],
      },
      [
        f([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]),
        f([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
      ],
    );
    expect(optOut.getAxis('x')?.min).toBe(6.5);
    expect(optOut.getAxis('x')?.max).toBe(18.5);
    // No planned slot grid: the tick marks sit under the category labels.
    expect(tickValues(optOut).length).toBeGreaterThan(1);
    expect(bottomTickMarks(fakes, optOut)).toEqual(pixels(optOut, tickValues(optOut)));
    optOut.destroy();

    const explicitTicks = fakes.engine(
      {
        axes: { x: { type: 'linear', ticks: [7, 12, 18] }, y: { type: 'linear', nice: false } },
        series: [{ label: 'departures', type: 'bar', dataIndex: 1 }],
      },
      [
        f([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]),
        f([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
      ],
    );
    expect(explicitTicks.getAxis('x')?.min).toBe(6.5);
    expect(explicitTicks.getAxis('x')?.max).toBe(18.5);
    explicitTicks.destroy();

    const zoomed = fakes.engine(
      {
        axes: { x: { type: 'linear' }, y: { type: 'linear', nice: false } },
        series: [{ label: 'departures', type: 'bar', dataIndex: 1 }],
      },
      [
        f([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]),
        f([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
      ],
    );
    zoomed.setAxis('x', { min: 8, max: 12 });
    expect(zoomed.getAxis('x')?.min).toBe(8);
    expect(zoomed.getAxis('x')?.max).toBe(12);
  });
});
