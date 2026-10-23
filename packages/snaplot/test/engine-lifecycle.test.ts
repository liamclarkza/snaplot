// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColumnarData, Plugin } from '../src/types';
import { type EngineFakes, f, installEngineFakes, replaceData } from './fakes/engine';

// Ported from src/core/Chart.append.test.ts (plan M2).

let fakes: EngineFakes;
beforeEach(() => {
  fakes = installEngineFakes();
});
afterEach(() => fakes.uninstall());

describe('engine lifecycle + config integrity', () => {
  it('does not mutate the caller config object when constructing a chart', () => {
    const config = { series: [{ label: 'value', dataIndex: 1 }] };
    fakes.engine(config, [f([1, 2]), f([10, 20])]);

    // initAxes writes x/y into config.axes; that must land on the chart's own
    // copy, not the object the caller passed in.
    expect(config).not.toHaveProperty('axes');
  });

  it('two charts built from one config object do not share axis state', () => {
    const config = { series: [{ label: 'value', dataIndex: 1 }] };
    const data: ColumnarData = [f([1, 2]), f([10, 20])];
    const a = fakes.engine(config, data);
    const b = fakes.engine(config, data);

    expect(config).not.toHaveProperty('axes');
    expect(a.getOptions().axes).not.toBe(b.getOptions().axes);
  });

  it('ignores mutating public calls after destroy()', () => {
    const config = { series: [{ label: 'v', dataIndex: 1 }] };
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

  it('does not count a data-layer paint that a plugin vetoes', () => {
    const chart = fakes.engine(
      {
        debug: { stats: true },
        plugins: [{ id: 'veto-data', beforeDrawData: () => false }],
        series: [{ label: 'v', dataIndex: 1 }],
      },
      [f([1, 2]), f([10, 20])],
    );

    const stats = chart.getStats();
    expect(stats.renderCount.grid).toBe(1);
    expect(stats.renderCount.data).toBe(0);
    expect(stats.renderCount.overlay).toBe(1);
  });

  it('delivers the data payload to a variadic (...args) listener', () => {
    const chart = fakes.engine({ series: [{ label: 'v', dataIndex: 1 }] }, [
      f([1, 2]),
      f([10, 20]),
    ]);

    let received: unknown[] = [];
    chart.on('data:update', (...args) => {
      received = args;
    });

    chart.appendToSource(0, [f([3]), f([30])]);

    expect(received).toHaveLength(1);
    const payload = received[0] as ColumnarData;
    expect(Array.from(payload[0])).toEqual([1, 2, 3]);
  });

  it('does not snap a synced cursor to column 0 for an off-axis scatter', () => {
    const chart = fakes.engine(
      { series: [{ label: 'pts', type: 'scatter', dataIndex: 2, xDataIndex: 1 }] },
      [f([0, 1, 2]), f([0, 10, 20]), f([5, 6, 7])],
    );
    const moves: Array<[number | null, number | null]> = [];
    chart.on('cursor:move', (dataX, dataIdx) => moves.push([dataX, dataIdx]));

    chart.setCursorDataX(1.5);

    // The cursor stays at the raw X; no column-0 row index is reported.
    expect(moves).toEqual([[1.5, null]]);
  });

  it('adds use()-installed plugins to config.plugins', () => {
    const chart = fakes.engine({ series: [{ label: 'v', dataIndex: 1 }] }, [
      f([1, 2]),
      f([10, 20]),
    ]);

    chart.use({ id: 'runtime-added', install: vi.fn() });

    expect(chart.getOptions().plugins?.some((p) => p.id === 'runtime-added')).toBe(true);
  });

  it('does not reinstall unchanged plugins on replaceOptions', () => {
    const install = vi.fn();
    const destroy = vi.fn();
    const plugin: Plugin = { id: 'stable', install, destroy };
    const chart = fakes.engine({ plugins: [plugin], series: [{ label: 'v', dataIndex: 1 }] }, [
      f([1, 2]),
      f([10, 20]),
    ]);

    expect(install).toHaveBeenCalledTimes(1);

    // Fresh config object + fresh array literal, same plugin instance: the
    // plugin set is unchanged, so no destroy/reinstall churn.
    chart.replaceOptions({ plugins: [plugin], series: [{ label: 'v', dataIndex: 1 }] });

    expect(install).toHaveBeenCalledTimes(1);
    expect(destroy).not.toHaveBeenCalled();
  });
});
