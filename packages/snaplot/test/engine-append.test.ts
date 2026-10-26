// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
  it('counts ingests and paints in the debug counters', () => {
    const config = { series: [{ label: 'value', yColumn: 1 }] };
    const chart = fakes.engine(config, [f([1, 2]), f([10, 20])]);

    const initial = chart.debugSnapshot();
    expect(initial.renderCount).toEqual({ grid: 1, data: 1, overlay: 1 });
    expect(initial.ingestCount).toBe(1);

    replaceData(chart, config, [f([1, 2, 3]), f([10, 20, 30])]);
    expect(chart.debugSnapshot().ingestCount).toBe(2);
    chart.appendToSource(0, [f([4]), f([40])]);
    expect(chart.debugSnapshot().ingestCount).toBe(2);
  });

  it('uses config.streaming.maxLen as the append retention policy', () => {
    const chart = fakes.engine(
      {
        streaming: { maxPoints: 3 },
        series: [{ label: 'value', yColumn: 1 }],
      },
      [f([1, 2]), f([10, 20])],
    );

    chart.appendToSource(0, [f([3, 4]), f([30, 40])]);

    expect(Array.from(chart.getSourceData(0)[0])).toEqual([2, 3, 4]);
    expect(Array.from(chart.getSourceData(0)[1])).toEqual([20, 30, 40]);
  });
});
