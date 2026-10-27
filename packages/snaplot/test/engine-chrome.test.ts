// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type EngineFakes, f, installEngineFakes } from './fakes/engine';

// The reserveChrome contract (plan §3.2, M9b): chrome such as M12b's legend reserves a strip at
// the top or bottom of the root, and the engine lays out and repaints around it.

let fakes: EngineFakes;
beforeEach(() => {
  fakes = installEngineFakes();
});
afterEach(() => fakes.uninstall());

const config = { series: [{ label: 'v', yColumn: 1 }] };

describe('engine reserveChrome', () => {
  it('moves the plot below a top strip and above a bottom one, then gives the space back', () => {
    const chart = fakes.engine(config, [f([0, 1, 2]), f([5, 6, 7])]);
    const open = { ...chart.getLayout().plot };
    chart.reserveChrome('top', 28);
    // Under the strip the 24 px top gutter narrows to 12: half a tick label and a gap.
    expect(chart.getLayout().plot.top).toBe(open.top + 28 - 12);
    expect(chart.getLayout().plot.height).toBe(open.height - 28 + 12);
    chart.reserveChrome('bottom', 10);
    expect(chart.getLayout().plot.height).toBe(open.height - 38 + 12);
    chart.reserveChrome('top', 0);
    chart.reserveChrome('bottom', Number.NaN);
    expect(chart.getLayout().plot).toEqual(open);
  });

  it('repaints only when the reservation changes', () => {
    const chart = fakes.engine(config, [f([0, 1, 2]), f([5, 6, 7])]);
    chart.paint();
    fakes.frames.flush();
    const before = chart.debugSnapshot().renderCount.grid;
    chart.reserveChrome('top', 20);
    fakes.frames.flush();
    const after = chart.debugSnapshot().renderCount.grid;
    expect(after).toBe(before + 1);
    chart.reserveChrome('top', 20);
    fakes.frames.flush();
    expect(chart.debugSnapshot().renderCount.grid).toBe(after);
  });
});
