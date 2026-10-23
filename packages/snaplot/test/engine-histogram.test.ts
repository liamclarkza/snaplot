// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tooltipText } from './fakes';
import { type EngineFakes, f, installEngineFakes, tapAt } from './fakes/engine';

// Ported from src/core/Chart.append.test.ts (plan M2).

let fakes: EngineFakes;
beforeEach(() => {
  fakes = installEngineFakes();
});
afterEach(() => fakes.uninstall());

describe('engine histogram cursor', () => {
  it('snaps taps inside a histogram bar to the bin centre', () => {
    const chart = fakes.engine(
      {
        axes: { x: { type: 'linear', nice: false }, y: { type: 'linear' } },
        series: [{ label: 'count', dataIndex: 1, type: 'histogram' }],
      },
      [f([0, 1, 2, 3]), f([10, 20, 30, 0])],
    );
    const xScale = chart.getAxis('x')!;
    const { plot } = chart.getLayout();
    const moves: Array<[number | null, number | null]> = [];
    chart.on('cursor:move', (dataX, dataIdx) => {
      moves.push([dataX, dataIdx]);
    });

    tapAt(chart, { x: xScale.dataToPixel(1.2), y: plot.top + plot.height / 2 });

    expect(moves.at(-1)).toEqual([1.5, 1]);
    expect(chart.getCursorSnapshot({ fallback: 'hide' })).toMatchObject({
      dataIndex: 1,
      dataX: 1.5,
      formattedX: '1 – 2',
      source: 'cursor',
    });
    expect(chart.getCursorSnapshot({ fallback: 'hide' }).points[0]).toMatchObject({
      dataIndex: 1,
      value: 20,
    });
  });

  it('maps the exact final histogram edge to the final bin centre', () => {
    const chart = fakes.engine(
      {
        axes: { x: { type: 'linear', nice: false }, y: { type: 'linear' } },
        series: [{ label: 'count', dataIndex: 1, type: 'histogram' }],
      },
      [f([0, 1, 2, 3]), f([10, 20, 30, 0])],
    );
    const xScale = chart.getAxis('x')!;
    const { plot } = chart.getLayout();

    tapAt(chart, { x: xScale.dataToPixel(3), y: plot.top + plot.height / 2 });

    expect(chart.getCursorSnapshot({ fallback: 'hide' })).toMatchObject({
      dataIndex: 2,
      dataX: 2.5,
      formattedX: '2 – 3',
    });
  });

  it('uses axis category labels in bar tooltip points', () => {
    const labels = ['Accuracy', 'Recall', 'Speed'];
    const chart = fakes.engine(
      {
        axes: {
          x: { type: 'linear', nice: false, tickFormat: (value) => labels[value] ?? '' },
          y: { type: 'linear' },
        },
        series: [{ label: 'score', dataIndex: 1, type: 'bar' }],
      },
      [f([0, 1, 2]), f([0.8, 0.7, 0.9])],
    );
    const xScale = chart.getAxis('x')!;
    const { plot } = chart.getLayout();
    tapAt(chart, { x: xScale.dataToPixel(1), y: plot.top + plot.height / 2 });
    fakes.frames.flush();

    // One bar row reads "x <formattedX>  y <formattedY>".
    expect(tooltipText()).toMatch(/x Recall/);
  });

  it('keeps baseline padding when x zoom shows only positive histogram bins', () => {
    const chart = fakes.engine(
      {
        axes: { x: { type: 'linear', nice: false }, y: { type: 'linear', nice: false } },
        series: [{ label: 'count', dataIndex: 1, type: 'histogram' }],
      },
      [f([0, 1, 2, 3, 4]), f([0, 100, 120, 80, 0])],
    );

    chart.setAxis('x', { min: 1.2, max: 2.8 });

    const yScale = chart.getAxis('y')!;
    expect(yScale.min).toBeLessThan(0);
    expect(yScale.max).toBeGreaterThan(120);
  });
});
