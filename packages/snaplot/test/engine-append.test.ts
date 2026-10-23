// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ColumnarData, Plugin } from '../src/types';
import { type EngineFakes, f, installEngineFakes, replaceData } from './fakes/engine';

// Ported from src/core/Chart.append.test.ts (plan M2): the engine is built
// through `sources`, appends go to source 0 and replacements through
// replaceSources, the two paths createChart uses.

let fakes: EngineFakes;
beforeEach(() => {
  fakes = installEngineFakes();
});
afterEach(() => fakes.uninstall());

describe('engine appendData', () => {
  it('emits data:update and plugin data hooks with the resulting dataset', () => {
    const seenEvents: number[] = [];
    const seenPluginLengths: number[] = [];
    const plugin: Plugin = {
      id: 'test:data-hook',
      onSetData(_chart, data: ColumnarData) {
        seenPluginLengths.push(data[0].length);
      },
    };

    const chart = fakes.engine({ series: [{ label: 'value', dataIndex: 1 }], plugins: [plugin] }, [
      f([1, 2]),
      f([10, 20]),
    ]);

    chart.on('data:update', (data) => {
      seenEvents.push(data[0].length);
    });

    chart.appendToSource(0, [f([3]), f([30])]);
    chart.appendToSource(0, [f([]), f([])]);

    expect(seenEvents).toEqual([3]);
    expect(seenPluginLengths).toEqual([3]);
    expect(chart.getStats()).toMatchObject({
      dataVersion: 1,
      setDataCount: 0,
      appendDataCount: 1,
    });
  });

  it('tracks setData and render counters in chart stats', () => {
    const config = {
      debug: { stats: true },
      series: [{ label: 'value', dataIndex: 1 }],
    };
    const chart = fakes.engine(config, [f([1, 2]), f([10, 20])]);

    const initialStats = chart.getStats();
    expect(initialStats.renderCount.grid).toBe(1);
    expect(initialStats.renderCount.data).toBe(1);
    expect(initialStats.renderCount.overlay).toBe(1);

    replaceData(chart, config, [f([1, 2, 3]), f([10, 20, 30])]);
    expect(chart.getStats()).toMatchObject({
      dataVersion: 1,
      setDataCount: 1,
      appendDataCount: 0,
    });
  });

  it('uses config.streaming.maxLen as the append retention policy', () => {
    const seenEvents: number[] = [];
    const chart = fakes.engine(
      {
        streaming: { maxLen: 3 },
        series: [{ label: 'value', dataIndex: 1 }],
      },
      [f([1, 2]), f([10, 20])],
    );

    chart.on('data:update', (data) => {
      seenEvents.push(data[0].length);
    });

    chart.appendToSource(0, [f([3, 4]), f([30, 40])]);

    expect(seenEvents).toEqual([3]);
    expect(Array.from(chart.getSourceData(0)[0])).toEqual([2, 3, 4]);
    expect(Array.from(chart.getSourceData(0)[1])).toEqual([20, 30, 40]);
  });
});
