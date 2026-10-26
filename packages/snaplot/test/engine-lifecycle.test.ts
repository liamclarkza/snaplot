// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ColumnarData } from '../src/engine/spec';
import { type EngineFakes, f, installEngineFakes, replaceData } from './fakes/engine';

// Ported from src/core/Chart.append.test.ts (plan M2).

let fakes: EngineFakes;
beforeEach(() => {
  fakes = installEngineFakes();
});
afterEach(() => fakes.uninstall());

describe('engine lifecycle + config integrity', () => {
  it('does not mutate the caller config object when constructing a chart', () => {
    const config = { series: [{ label: 'value', yColumn: 1 }] };
    fakes.engine(config, [f([1, 2]), f([10, 20])]);

    // initAxes writes x/y into config.axes; that must land on the chart's own
    // copy, not the object the caller passed in.
    expect(config).not.toHaveProperty('axes');
  });

  it('two charts built from one config object do not share axis state', () => {
    const config = { series: [{ label: 'value', yColumn: 1 }] };
    const data: ColumnarData = [f([1, 2]), f([10, 20])];
    const a = fakes.engine(config, data);
    const b = fakes.engine(config, data);

    expect(config).not.toHaveProperty('axes');
    expect(a.getOptions().axes).not.toBe(b.getOptions().axes);
  });

  it('ignores mutating public calls after destroy()', () => {
    const config = { series: [{ label: 'v', yColumn: 1 }] };
    const chart = fakes.engine(config, [f([1, 2]), f([10, 20])]);

    chart.destroy();
    chart.appendToSource(0, [f([3]), f([30])]);
    replaceData(chart, config, [f([1, 2, 3, 4]), f([1, 2, 3, 4])]);

    expect(chart.getStats()).toMatchObject({
      dataVersion: 0,
      setDataCount: 0,
      appendDataCount: 0,
    });
  });

  it('does not snap a synced cursor to column 0 for an off-axis scatter', () => {
    const chart = fakes.engine(
      { series: [{ label: 'pts', type: 'scatter', yColumn: 2, xColumn: 1 }] },
      [f([0, 1, 2]), f([0, 10, 20]), f([5, 6, 7])],
    );
    const moves: Array<[number | null, number | null]> = [];
    chart.on('cursor:move', (dataX, dataIdx) => moves.push([dataX, dataIdx]));

    chart.setCursorDataX(1.5);

    // The cursor stays at the raw X; no column-0 row index is reported.
    expect(moves).toEqual([[1.5, null]]);
  });
});
