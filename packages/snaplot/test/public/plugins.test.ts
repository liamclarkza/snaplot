// @vitest-environment jsdom
// The plugin contract (plan D21): { id, install?(chart) → cleanup?, drawBelow?, drawAbove?,
// drawOverlay? }, reconciled by id, each hook isolated, drawn after the built-in annotations of
// its slot, with chart.scale(key) to map data to pixels.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debug, type Fakes, installFakes } from '../fakes';
import { type FinalPlugin, mount } from './contract';

let fakes: Fakes;
beforeEach(() => {
  fakes = installFakes();
});
afterEach(() => {
  fakes.uninstall();
  vi.restoreAllMocks();
});

type Row = { t: number; v: number };
const rows: Row[] = Array.from({ length: 101 }, (_, t) => ({ t, v: 10 + (t % 11) }));
const base = { data: rows, x: 't', series: [{ y: 'v' }] };

/** Records which slot drew what, in order, across the three layers. */
function marker(id: string, log: string[]): FinalPlugin<Row> {
  return {
    id,
    drawBelow: () => log.push(`${id}:below`),
    drawAbove: () => log.push(`${id}:above`),
    drawOverlay: () => log.push(`${id}:overlay`),
  };
}

describe('[gap-annotations-extensibility-07] reconcile by id', () => {
  it('[gap-annotations-extensibility-07] an inline plugin with the same id installs once and draws with its latest hooks', () => {
    const installs = vi.fn();
    const drawn: number[] = [];
    const plugin = (n: number): FinalPlugin<Row> => ({
      id: 'note',
      install: installs,
      drawAbove: () => drawn.push(n),
    });
    const chart = mount<Row>(fakes, { ...base, plugins: [plugin(0)] });
    fakes.frames.flush();
    const ingests = debug(chart).ingestCount;
    for (let i = 1; i <= 5; i++) chart.setOptions({ ...base, plugins: [plugin(i)] });
    fakes.frames.flush();
    expect(installs).toHaveBeenCalledTimes(1);
    expect(debug(chart).ingestCount).toBe(ingests);
    expect(drawn.at(-1)).toBe(5);
  });

  it('[gap-annotations-extensibility-07] install receives the handle; its cleanup runs on removal and on destroy', () => {
    const cleanups: string[] = [];
    const handles: unknown[] = [];
    const plugin = (id: string): FinalPlugin<Row> => ({
      id,
      install(chart) {
        handles.push(chart);
        return () => cleanups.push(id);
      },
    });
    const chart = mount<Row>(fakes, { ...base, plugins: [plugin('a'), plugin('b')] });
    expect(handles).toEqual([chart, chart]);
    chart.update({ plugins: [plugin('b')] });
    expect(cleanups).toEqual(['a']);
    chart.destroy();
    expect(cleanups).toEqual(['a', 'b']);
  });

  it('[backlog-27] two plugins with the same id throw, naming the id', () => {
    expect(() => mount<Row>(fakes, { ...base, plugins: [{ id: 'note' }, { id: 'note' }] })).toThrow(
      /^snaplot: .*"note"/,
    );
  });
});

describe('[gap-annotations-extensibility-09] draw slots and order', () => {
  it('[gap-annotations-extensibility-09] plugins draw in array order, each slot on its own layer', () => {
    const log: string[] = [];
    const chart = mount<Row>(fakes, { ...base, plugins: [marker('a', log), marker('b', log)] });
    fakes.frames.flush();
    expect(log).toEqual(['a:below', 'b:below', 'a:above', 'b:above', 'a:overlay', 'b:overlay']);
    log.length = 0;
    chart.redraw('overlay');
    fakes.frames.flush();
    expect(log).toEqual(['a:overlay', 'b:overlay']);
    log.length = 0;
    chart.redraw('data');
    fakes.frames.flush();
    expect(log).toEqual(['a:above', 'b:above']);
  });

  it('[gap-annotations-extensibility-09] a plugin draws after the built-in reference lines of its slot', () => {
    const order: string[] = [];
    const chart = mount<Row>(fakes, {
      ...base,
      referenceLines: [{ axis: 'y', value: 15, label: 'Limit' }],
      plugins: [
        {
          id: 'after',
          drawAbove(context: CanvasRenderingContext2D) {
            context.fillText('plugin', 0, 0);
          },
        },
      ],
    });
    fakes.frames.flush();
    for (const call of fakes.canvas.of(debug(chart).layers.data).calls)
      if (call.name === 'fillText') order.push(String(call.args[0]));
    expect(order.slice(-2)).toEqual(['Limit', 'plugin']);
  });

  it('[gap-annotations-extensibility-09] draw hooks receive the context, the handle and the plot rectangle', () => {
    const calls: unknown[][] = [];
    const chart = mount<Row>(fakes, {
      ...base,
      plugins: [{ id: 'p', drawAbove: (...args: unknown[]) => calls.push(args) }],
    });
    fakes.frames.flush();
    const [context, handle, plot] = calls[0] as [CanvasRenderingContext2D, unknown, object];
    expect(context).toBe(debug(chart).layers.data.getContext('2d'));
    expect(handle).toBe(chart);
    expect(plot).toEqual(debug(chart).plot);
  });

  it('[gap-annotations-extensibility-08] a plugin cannot veto the data layer: a zoom repaints the data', () => {
    const chart = mount<Row>(fakes, {
      ...base,
      plugins: [{ id: 'veto', beforeDraw: () => false }],
    });
    fakes.frames.flush();
    const before = debug(chart).renderCount.data;
    chart.update({ viewport: { x: [30, 70] } });
    fakes.frames.flush();
    expect(debug(chart).renderCount.data).toBeGreaterThan(before);
  });
});

describe('[gap-annotations-extensibility-11] isolation', () => {
  it('[gap-annotations-extensibility-11] a throwing hook warns once and disables only that plugin', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const good = vi.fn();
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const chart = mount<Row>(fakes, {
      ...base,
      plugins: [
        { id: 'bad', drawAbove: bad, drawOverlay: bad },
        { id: 'good', drawAbove: good },
      ],
    });
    for (let i = 0; i < 3; i++) {
      chart.redraw();
      fakes.frames.flush();
    }
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good.mock.calls.length).toBeGreaterThanOrEqual(3);
    const messages = warn.mock.calls.map((call) => String(call[0]));
    expect(messages.filter((m) => m.includes('"bad"'))).toHaveLength(1);
    expect(messages[0]).toMatch(/^snaplot: plugin "bad".*boom.*disabled/);
  });

  it('[gap-annotations-extensibility-11] a failed install disables the plugin', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const draw = vi.fn();
    mount<Row>(fakes, {
      ...base,
      plugins: [
        {
          id: 'broken',
          install() {
            throw new Error('no');
          },
          drawAbove: draw,
        },
      ],
    });
    fakes.frames.flush();
    expect(draw).not.toHaveBeenCalled();
  });
});

describe('[arch-17] chart.scale(key)', () => {
  it('[arch-17] maps data to pixels and back on linear axes, with the plot edges at the domain', () => {
    const chart = mount<Row>(fakes, base);
    const x = chart.scale('x')!;
    const y = chart.scale('y')!;
    const plot = debug(chart).plot;
    expect(x).toMatchObject({ type: 'linear', horizontal: true, min: 0, max: 100 });
    expect(y.horizontal).toBe(false);
    expect(x.toPixel(0)).toBeCloseTo(plot.left);
    expect(x.toPixel(100)).toBeCloseTo(plot.left + plot.width);
    expect(y.toPixel(y.min)).toBeCloseTo(plot.top + plot.height);
    expect(x.fromPixel(x.toPixel(37))).toBeCloseTo(37);
    expect(chart.scale('nope')).toBeUndefined();
  });

  it('[arch-17] log, time and category axes map their own values', () => {
    const chart = mount<Row>(fakes, {
      data: [
        { day: '2026-03-01', label: 'a', v: 1 },
        { day: '2026-03-02', label: 'b', v: 100 },
      ],
      x: 'day',
      series: [{ y: 'v' }],
      axes: { y: { type: 'log' } },
    });
    const x = chart.scale('x')!;
    const y = chart.scale('y')!;
    expect(x.type).toBe('time');
    expect(x.toPixel('2026-03-01')).toBeCloseTo(x.toPixel(new Date(2026, 2, 1)));
    expect(y.type).toBe('log');
    const mid = y.toPixel(10);
    expect(mid).toBeCloseTo((y.toPixel(1) + y.toPixel(100)) / 2, 0);

    const bars = mount<Row>(fakes, {
      data: [
        { name: 'a', v: 1 },
        { name: 'b', v: 2 },
      ],
      x: 'name',
      series: [{ type: 'bar', y: 'v' }],
    });
    const cat = bars.scale('x')!;
    expect(cat).toMatchObject({ type: 'category', categories: ['a', 'b'] });
    expect(cat.toPixel('b')).toBeCloseTo(cat.toPixel(1));
    expect(cat.toPixel('b')).toBeGreaterThan(cat.toPixel('a'));
  });

  it('[arch-17] a reference line is drawn where scale() says its value is', () => {
    const chart = mount<Row>(fakes, { ...base, referenceLines: [{ axis: 'y', value: 15 }] });
    fakes.frames.flush();
    const y = chart.scale('y')!.toPixel(15);
    const moves = fakes.canvas
      .of(debug(chart).layers.data)
      .calls.filter((call) => call.name === 'moveTo')
      .map((call) => call.args[1] as number);
    expect(moves.some((value) => Math.abs(value - y) < 1)).toBe(true);
  });
});

describe('[arch-10] the legacy hooks are gone', () => {
  it('[arch-10] onDataUpdate, onOptionsUpdate and the 0.12 draw hooks are not called', () => {
    const legacy = vi.fn();
    const chart = mount<Row>(fakes, {
      ...base,
      plugins: [
        {
          id: 'old',
          onDataUpdate: legacy,
          onOptionsUpdate: legacy,
          afterDrawGrid: legacy,
          afterDrawData: legacy,
          afterDrawOverlay: legacy,
          destroy: legacy,
        },
      ],
    });
    chart.appendData([{ t: 101, v: 1 }]);
    chart.update({ axes: { y: { title: 'V' } } });
    fakes.frames.flush();
    chart.destroy();
    expect(legacy).not.toHaveBeenCalled();
  });
});
