// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  dataPoint,
  drag,
  type EngineFakes,
  f,
  hoverAt,
  installEngineFakes,
  pointer,
} from './fakes/engine';

// Ported from src/core/Chart.append.test.ts (plan M2).

let fakes: EngineFakes;
beforeEach(() => {
  fakes = installEngineFakes();
});
afterEach(() => fakes.uninstall());

describe('engine scatter selection', () => {
  it('returns selected scatter points using xDataIndex and y ranges', () => {
    const selections: Array<{ points?: Array<{ dataIndex: number; x: number; y: number }> }> = [];
    const chart = fakes.engine(
      {
        axes: { x: { type: 'linear', nice: false }, y: { type: 'linear', nice: false } },
        zoom: { enabled: false, x: true, y: true },
        selection: { onSelect: (selection) => selections.push(selection) },
        series: [
          {
            label: 'runs',
            type: 'scatter',
            xDataIndex: 1,
            yDataIndex: 2,
            colorBy: { dataIndex: 3, type: 'category', palette: ['#111111', '#eeeeee'] },
          },
        ],
      },
      [f([0, 1, 2, 3]), f([0.1, 0.4, 0.7, 0.9]), f([0.2, 0.5, 0.8, 0.3]), f([0, 1, 1, 0])],
    );

    // A box drag between (0.8, 0.4) and (0.3, 0.9) in data space. It starts
    // inside the plot and ends above it, where the box is clamped to the plot.
    drag(chart, dataPoint(chart, 0.8, 0.4), dataPoint(chart, 0.3, 0.9));

    expect(selections).toHaveLength(1);
    expect(selections[0].points?.map((point) => [point.dataIndex, point.x, point.y])).toEqual([
      [1, 0.4, 0.5],
      [2, 0.7, 0.8],
    ]);
  });

  it('hit-tests scatter with xDataIndex at the pointer instead of snapped column 0', () => {
    const moves: Array<[number | null, number | null]> = [];
    const chart = fakes.engine(
      {
        axes: { x: { type: 'linear', padding: 0 }, y: { type: 'linear', padding: 0 } },
        cursor: { show: true, snap: true },
        tooltip: { show: true, mode: 'nearest' },
        series: [
          {
            label: 'cohorts',
            type: 'scatter',
            xDataIndex: 1,
            yDataIndex: 2,
            colorBy: { dataIndex: 3, type: 'category', palette: ['#111111', '#eeeeee'] },
          },
        ],
      },
      [f([0, 1, 2, 3]), f([-20, 2, 25, -15]), f([10, 17, -5, 12]), f([0, 1, 0, 0])],
    );
    chart.on('cursor:move', (dataX, dataIdx) => {
      moves.push([dataX, dataIdx]);
    });

    hoverAt(chart, dataPoint(chart, -16, 12));

    expect(moves.at(-1)).toEqual([-15, 3]);
  });

  it('coalesces touch cursor updates onto the next animation frame', () => {
    const moves: Array<[number | null, number | null]> = [];
    const chart = fakes.engine(
      {
        axes: { x: { type: 'linear', padding: 0 }, y: { type: 'linear', padding: 0 } },
        tooltip: { show: true, mode: 'nearest' },
        series: [{ label: 'points', type: 'scatter', xDataIndex: 1, yDataIndex: 2 }],
      },
      [f([0, 1, 2]), f([0, 10, 20]), f([0, 10, 20])],
    );
    chart.on('cursor:move', (dataX, dataIdx) => {
      moves.push([dataX, dataIdx]);
    });

    // A finger lands at (10, 10) and drags the cursor to (20, 20) within one frame.
    const touch = { pointerType: 'touch' as const };
    pointer(chart, 'pointerdown', dataPoint(chart, 10, 10), touch);
    pointer(chart, 'pointermove', dataPoint(chart, 20, 20), touch);

    expect(moves).toEqual([]);
    expect(fakes.frames.pending).toBeGreaterThan(0);
    fakes.frames.step();
    expect(moves.at(-1)).toEqual([20, 2]);
    expect(moves).toHaveLength(1);
  });
});
