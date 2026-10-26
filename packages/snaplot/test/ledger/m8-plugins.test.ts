// @vitest-environment jsdom
// Known M8 defects in the plugin host and group coordination (plan D21, D17,
// RC1). Public API, fakes and debug() only.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChartGroup } from '../../src/index';
import type { ChartHandle, ChartPlugin } from '../../src/index';
import { debug, type Fakes, installFakes } from '../fakes';

let fakes: Fakes;
beforeEach(() => {
  fakes = installFakes();
});
afterEach(() => {
  fakes.uninstall();
  vi.restoreAllMocks();
});

type Row = { t: number; v: number };
const rows: Row[] = Array.from({ length: 200 }, (_, t) => ({ t, v: 40 + (t % 7) }));

function texts(): string[] {
  return fakes.canvas.all
    .flatMap((record) => record.calls)
    .filter((call) => call.name === 'fillText')
    .map((call) => String(call.args[0]));
}

describe('[gap-annotations-extensibility-07][gap-annotations-extensibility-08] plugins', () => {
  it('[gap-annotations-extensibility-07] an inline plugin with the same id is neither reinstalled nor re-ingests', () => {
    const installs = vi.fn();
    const plugin = (): ChartPlugin<Row> => ({ id: 'note', install: () => installs() });
    const chart = fakes.mount<Row>({
      data: rows,
      x: 't',
      series: [{ y: 'v' }],
      plugins: [plugin()],
    });
    fakes.frames.flush();
    const ingests = debug(chart).ingestCount;
    for (let i = 0; i < 5; i++) chart.update({ plugins: [plugin()] });
    fakes.frames.flush();
    expect(installs).toHaveBeenCalledTimes(1);
    expect(debug(chart).ingestCount).toBe(ingests);
  });

  it('[gap-annotations-extensibility-08] a plugin cannot veto the data layer: a zoom repaints the data', () => {
    const chart = fakes.mount<Row>({
      data: rows,
      x: 't',
      series: [{ y: 'v' }],
      plugins: [{ id: 'veto', beforeDraw: () => false } as ChartPlugin<Row>],
    });
    fakes.frames.flush();
    const before = debug(chart).renderCount.data;
    chart.update({ viewport: { x: [30, 70] } });
    fakes.frames.flush();
    expect(debug(chart).renderCount.data).toBeGreaterThan(before);
  });

  // Plan §5.9 and RC15: a duplicate plugin id throws (M8's plugin host). Today the second is ignored.
  it('[backlog-27] two plugins with the same id throw, naming the id', () => {
    expect(() =>
      fakes.mount<Row>({
        data: rows,
        x: 't',
        series: [{ y: 'v' }],
        plugins: [{ id: 'note' }, { id: 'note' }],
      }),
    ).toThrow(/^snaplot: .*"note"/);
  });

  it('[gap-annotations-extensibility-06:mount] reference lines given at creation are drawn by the first paint', () => {
    // An M1 regression (5106dd4), fixed by M1b (4a042b7): the engine's first
    // paint now waits until the controller has installed the annotation and
    // user plugins. test/ledger/m1-mount.test.ts locks the mount paint itself.
    fakes.mount<Row>({
      data: rows,
      x: 't',
      series: [{ y: 'v' }],
      referenceLines: [{ axis: 'y', value: 43, label: 'Deploy A' }],
    });
    fakes.resizeObserver.deliver();
    fakes.frames.flush();
    expect(texts()).toContain('Deploy A');
  });

  it('[gap-annotations-extensibility-06:mount] a plugin given at creation draws in the first paint', () => {
    const drawn = vi.fn();
    fakes.mount<Row>({
      data: rows,
      x: 't',
      series: [{ y: 'v' }],
      plugins: [{ id: 'overlay', drawAbove: drawn }],
    });
    fakes.resizeObserver.deliver();
    fakes.frames.flush();
    expect(drawn).toHaveBeenCalled();
  });
});

describe('[dataapi-15][arch-13][gap-perf-gate-06] group appends', () => {
  function mountGroup(options: Parameters<typeof createChartGroup>[0]): ChartHandle<Row>[] {
    const group = createChartGroup(options);
    return [0, 1, 2].map(() =>
      fakes.mount<Row>({ data: rows, x: 't', series: [{ y: 'v' }], group }),
    );
  }

  it('[dataapi-15][arch-13][gap-perf-gate-06] an append to one alignPlots member repaints no other member', () => {
    const [a, b, c] = mountGroup({ alignPlots: true, viewport: true });
    fakes.frames.flush();
    const before = [b, c].map((chart) => ({ ...debug(chart).renderCount }));
    for (let i = 0; i < 5; i++) a.appendData([{ t: 200 + i, v: 41 }]);
    fakes.frames.flush();
    expect([b, c].map((chart) => ({ ...debug(chart).renderCount }))).toEqual(before);
  });

  it('an append to a plain group member repaints no other member (control)', () => {
    const [a, b, c] = mountGroup({ viewport: false });
    fakes.frames.flush();
    const before = [b, c].map((chart) => ({ ...debug(chart).renderCount }));
    for (let i = 0; i < 5; i++) a.appendData([{ t: 200 + i, v: 41 }]);
    fakes.frames.flush();
    expect([b, c].map((chart) => ({ ...debug(chart).renderCount }))).toEqual(before);
  });
});
