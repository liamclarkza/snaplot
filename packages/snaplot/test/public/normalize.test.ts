// @vitest-environment jsdom
// The 1.0 option contract (plan §4.4, §5.9, P1, D16, D18): normalize() is the
// one validation layer. It throws `snaplot: <what is wrong>. <how to fix it>`
// at the call that caused it, infers the axis kind from the data, copies
// array- and object-valued options on intake, and maps every public option
// leaf onto the engine. Public API, the shared fakes and debug() only.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ChartHandle, createChart, createChartGroup } from '../../src/index';
import {
  clientPoint,
  debug,
  type Fakes,
  hover,
  installFakes,
  pointerTarget,
  tooltipText,
} from '../fakes';

let fakes: Fakes;
beforeEach(() => {
  fakes = installFakes();
});
afterEach(() => {
  fakes.uninstall();
  vi.restoreAllMocks();
});

/** Options are written in the 1.0 vocabulary; the cast keeps this file independent of the types. */
type Loose = Record<string, unknown>;
function mount(options: Loose, size?: { width?: number; height?: number }): ChartHandle<any> {
  return fakes.mount(options as never, size);
}

const rows = Array.from({ length: 21 }, (_, t) => ({ t, cpu: 40 + (t % 5), mem: 60 - (t % 3) }));

function thrown(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return (error as Error).message;
  }
  return '';
}

function keyZoom(chart: ChartHandle<any>, key = '+'): void {
  (chart.container.firstElementChild as HTMLElement).dispatchEvent(
    new KeyboardEvent('keydown', { bubbles: true, key }),
  );
  fakes.frames.flush();
}

function quiet() {
  return vi.spyOn(console, 'warn').mockImplementation(() => {});
}

describe('§5.9 invalid input throws at the call that caused it', () => {
  it('[dataapi-20] an unknown series type throws, naming the valid types', () => {
    const message = thrown(() =>
      mount({ data: rows, x: 't', series: [{ y: 'cpu', type: 'pie' }] }),
    );
    expect(message).toMatch(/^snaplot: /);
    expect(message).toMatch(/"pie"/);
    expect(message).toMatch(/line.*area.*band.*bar.*histogram.*scatter|line, area/);
  });

  it('[dataapi-13] a y field missing from every row throws with a "did you mean" suggestion', () => {
    const message = thrown(() => mount({ data: rows, x: 't', series: [{ y: 'cpuu' }] }));
    expect(message).toMatch(/^snaplot: /);
    expect(message).toMatch(/"cpuu"/);
    expect(message).toMatch(/did you mean "cpu"/i);
  });

  it('[dataapi-13] an x field missing from every row throws', () => {
    const message = thrown(() => mount({ data: rows, x: 'time', series: [{ y: 'cpu' }] }));
    expect(message).toMatch(/^snaplot: .*"time"/);
    expect(message).toMatch(/did you mean "t"/i);
  });

  it('a field present on some rows only is a gap, not an error', () => {
    const sparse = [{ t: 0, cpu: 1 }, { t: 1 }, { t: 2, cpu: 3 }];
    const chart = mount({ data: sparse, x: 't', series: [{ y: 'cpu' }] });
    expect(chart.getCursorSnapshot({ fallback: 'latest' }).points[0]).toMatchObject({ y: 3 });
  });

  it('[dataapi-20] unsorted typed columns throw and point at rows', () => {
    const message = thrown(() =>
      mount({
        data: { columns: { x: Float64Array.of(0, 2, 1), y: Float64Array.of(1, 2, 3) } },
        x: 'x',
        series: [{ y: 'y' }],
      }),
    );
    expect(message).toMatch(/^snaplot: /);
    expect(message).toMatch(/columns must be sorted by x; pass rows to have them sorted/);
  });

  it('unsorted typed columns are accepted for a scatter series (control)', () => {
    expect(() =>
      mount({
        data: { columns: { x: Float64Array.of(3, 1, 2), y: Float64Array.of(1, 2, 3) } },
        x: 'x',
        series: [{ type: 'scatter', y: 'y' }],
      }),
    ).not.toThrow();
  });

  it('[dxtrial-05] a format on a category axis throws', () => {
    const message = thrown(() =>
      mount({
        data: [
          { m: 'Jan', v: 1 },
          { m: 'Feb', v: 2 },
        ],
        x: 'm',
        series: [{ type: 'bar', y: 'v' }],
        axes: { x: { type: 'category', format: (v: number) => String(v) } },
      }),
    );
    expect(message).toMatch(/^snaplot: /);
    expect(message).toMatch(/format/);
    expect(message).toMatch(/categor/);
  });

  it('[dataapi-20] an unknown axis type throws', () => {
    const message = thrown(() =>
      mount({ data: rows, x: 't', series: [{ y: 'cpu' }], axes: { y: { type: 'logarithmic' } } }),
    );
    expect(message).toMatch(/^snaplot: .*"logarithmic"/);
  });

  it('[dataapi-22] appendData({ seriesId }) on a source other series share throws', () => {
    const chart = mount({ data: rows, x: 't', series: [{ y: 'cpu' }, { y: 'mem' }] });
    const message = thrown(() =>
      chart.appendData([{ t: 30, cpu: 1, mem: 2 }], { seriesId: 'cpu' }),
    );
    expect(message).toMatch(/^snaplot: /);
    expect(message).toMatch(/shar/);
    expect(chart.getCursorSnapshot({ fallback: 'latest' }).points[0].x).toBe(20);
  });

  it('[dataapi-20] a series with no id or y field is named by its path', () => {
    const message = thrown(() =>
      mount({ data: rows, x: 't', series: [{ y: (r: { cpu: number }) => r.cpu }] }),
    );
    expect(message).toMatch(/^snaplot: series\[0\] needs an id: /);
    expect(message).not.toMatch(/series series/);
    expect(
      thrown(() => mount({ data: rows, x: 't', series: [{ y: 'cpu', type: 'pie' }] })),
    ).toMatch(/^snaplot: series "cpu" has unknown type/);
  });

  it('[dataapi-20] a non-array series option throws', () => {
    expect(thrown(() => mount({ data: rows, x: 't', series: { y: 'cpu' } }))).toMatch(
      /^snaplot: .*series/,
    );
  });

  it('[arch-11] invalid streaming options throw in public vocabulary', () => {
    const message = thrown(() =>
      mount({ data: rows, x: 't', series: [{ y: 'cpu' }], streaming: { maxPoints: -5 } }),
    );
    expect(message).toMatch(/^snaplot: .*maxPoints/);
    expect(message).not.toMatch(/maxLen/);
  });
});

describe('[dataapi-22] one policy for unknown series ids and cursor labels: throw, with a suggestion', () => {
  const two = { data: rows, x: 't', series: [{ y: 'cpu' }, { y: 'mem' }] };

  it('[dataapi-22] hiddenSeries and highlight name series ids, at creation and in update()', () => {
    for (const [key, value] of [
      ['hiddenSeries', ['cpus']],
      ['highlight', 'cpus'],
    ] as const) {
      const message = thrown(() => mount({ ...two, [key]: value }));
      expect(message).toMatch(
        new RegExp(`^snaplot: ${key} names "cpus", which is not a series id`),
      );
      expect(message).toMatch(/Did you mean "cpu"\?/);
    }
    const chart = mount({ ...two, highlight: 'mem' });
    expect(thrown(() => chart.update({ highlight: 'zzz' }))).toMatch(
      /^snaplot: highlight names "zzz", which is not a series id/,
    );
    expect(thrown(() => chart.update({ hiddenSeries: ['zzz'] }))).toMatch(
      /^snaplot: hiddenSeries names "zzz", which is not a series id/,
    );
    expect(chart.getState()).toMatchObject({ highlight: 'mem', hiddenSeries: [] });
  });

  it('[dataapi-22] setHighlight() throws on an unknown id, as setSeriesVisible() does', () => {
    const chart = mount(two);
    for (const run of [
      () => chart.setHighlight('cpus'),
      () => chart.setSeriesVisible('cpus', false),
    ]) {
      expect(thrown(run)).toMatch(
        /^snaplot: set\w+\(\) names "cpus", which is not a series id\. Did you mean "cpu"\?/,
      );
    }
    expect(chart.getState()).toMatchObject({ highlight: null, hiddenSeries: [] });
    chart.setHighlight('mem');
    expect(chart.getState().highlight).toBe('mem');
  });

  it('[dataapi-22] setCursor() throws on a string a numeric axis cannot read', () => {
    const chart = mount(two);
    for (const value of ['nope', '12']) {
      expect(thrown(() => chart.setCursor(value))).toMatch(
        new RegExp(
          `^snaplot: setCursor\\(\\) got "${value}", but axis "x" is numeric: give a number`,
        ),
      );
    }
    chart.setCursor(12);
    expect(chart.getCursorSnapshot().x).toBe(12);
  });

  it('[dataapi-22] setCursor() throws on a label that is not a category, and reads ISO dates on a time axis', () => {
    const bars = mount({
      data: [
        { m: 'Jan', v: 1 },
        { m: 'Feb', v: 2 },
      ],
      x: 'm',
      series: [{ type: 'bar', y: 'v' }],
    });
    expect(thrown(() => bars.setCursor('Fev'))).toMatch(
      /^snaplot: setCursor\(\) got "Fev", which is not a category of axis "x"\. Did you mean "Feb"\?/,
    );
    bars.setCursor('Feb');
    expect(bars.getCursorSnapshot().points[0]?.y).toBe(2);

    const days = mount({
      data: [
        { d: '2026-03-01', v: 1 },
        { d: '2026-03-02', v: 2 },
      ],
      x: 'd',
      series: [{ y: 'v' }],
    });
    expect(thrown(() => days.setCursor('2 March'))).toMatch(
      /^snaplot: setCursor\(\) got "2 March", which is not an ISO-8601 date for time axis "x"/,
    );
    days.setCursor('2026-03-02');
    expect(days.getCursorSnapshot().points[0]?.y).toBe(2);
    days.setCursor(new Date(2026, 2, 1));
    expect(days.getCursorSnapshot().points[0]?.y).toBe(1);
  });

  it('[dataapi-22] a group highlights a series some members lack, and throws on one none has', () => {
    const group = createChartGroup();
    const a = mount({ data: rows, x: 't', group, series: [{ y: 'cpu' }] });
    const b = mount({ data: rows, x: 't', group, series: [{ y: 'mem' }] });
    group.setHighlight('cpu');
    expect([a.getState().highlight, b.getState().highlight]).toEqual(['cpu', null]);
    b.setHighlight('mem');
    expect([a.getState().highlight, b.getState().highlight]).toEqual([null, 'mem']);
    expect(thrown(() => group.setHighlight('mems'))).toMatch(
      /^snaplot: setHighlight\(\) names "mems", which is not a series id\. Did you mean "mem"\?/,
    );
    expect(thrown(() => group.setCursor('nope'))).toMatch(/^snaplot: setCursor\(\) got "nope"/);
    group.setCursor(4);
    expect([a.getCursorSnapshot().x, b.getCursorSnapshot().x]).toEqual([4, 4]);
  });
});

describe('[dataapi-07][dxtrial-08] ISO-8601 inference (D18)', () => {
  it('[dataapi-07] date-only strings are calendar dates in the viewer’s time zone', () => {
    const chart = mount({
      data: [
        { day: '2026-03-01', v: 1 },
        { day: '2026-03-02', v: 2 },
      ],
      x: 'day',
      series: [{ y: 'v' }],
    });
    expect(chart.getAxis('x')).toMatchObject({ type: 'time', min: new Date(2026, 2, 1).getTime() });
  });

  it('[dataapi-07] an impossible calendar date throws at its row instead of rolling over', () => {
    for (const bad of ['2026-02-31', '2026-02-29', '2026-04-31T09:00:00Z']) {
      expect(
        thrown(() =>
          mount({
            data: [
              { day: '2026-01-31', v: 1 },
              { day: bad, v: 2 },
            ],
            x: 'day',
            series: [{ y: 'v' }],
          }),
        ),
      ).toMatch(new RegExp(`^snaplot: .*x of row 1 is "${bad}", which is not an ISO-8601 date`));
    }
    const leap = mount({
      data: [
        { day: '2028-02-28', v: 1 },
        { day: '2028-02-29', v: 2 },
      ],
      x: 'day',
      series: [{ y: 'v' }],
    });
    expect(leap.getAxis('x')).toMatchObject({ type: 'time', max: new Date(2028, 1, 29).getTime() });
  });

  it("[dataapi-07] date-only strings are UTC dates with timeZone: 'UTC'", () => {
    const chart = mount({
      data: [
        { day: '2026-03-01', v: 1 },
        { day: '2026-03-02', v: 2 },
      ],
      x: 'day',
      timeZone: 'UTC',
      series: [{ y: 'v' }],
    });
    expect(chart.getAxis('x')).toMatchObject({ type: 'time', min: Date.UTC(2026, 2, 1) });
  });

  it('[dataapi-07] strings with an offset are absolute instants', () => {
    const chart = mount({
      data: [
        { at: '2026-01-01T00:00:00+02:00', v: 1 },
        { at: '2026-01-01T06:30:15.250Z', v: 2 },
      ],
      x: 'at',
      series: [{ y: 'v' }],
    });
    expect(chart.getAxis('x')).toMatchObject({
      type: 'time',
      min: Date.UTC(2025, 11, 31, 22),
      max: Date.UTC(2026, 0, 1, 6, 30, 15, 250),
    });
  });

  it('one string that is not ISO keeps a category axis', () => {
    const chart = mount({
      data: [
        { k: '2026-01-01', v: 1 },
        { k: 'later', v: 2 },
      ],
      x: 'k',
      series: [{ type: 'bar', y: 'v' }],
    });
    expect(chart.getAxis('x')?.type).toBe('category');
  });

  it("[dataapi-07] axes.x.type 'time' rejects a string that is not ISO-8601", () => {
    const message = thrown(() =>
      mount({
        data: [{ k: 'soon', v: 1 }],
        x: 'k',
        series: [{ y: 'v' }],
        axes: { x: { type: 'time' } },
      }),
    );
    expect(message).toMatch(/^snaplot: .*"soon"/);
    expect(message).toMatch(/ISO/);
  });

  it('Dates infer a time axis (control)', () => {
    const chart = mount({
      data: [
        { d: new Date(2026, 0, 1), v: 1 },
        { d: new Date(2026, 0, 2), v: 2 },
      ],
      x: 'd',
      series: [{ y: 'v' }],
    });
    expect(chart.getAxis('x')?.type).toBe('time');
  });
});

describe('intake copies (D16)', () => {
  it('pushing into the caller’s series array after creation changes nothing', () => {
    const series: Loose[] = [{ y: 'cpu' }];
    const chart = mount({ data: rows, x: 't', series });
    series.push({ y: 'mem' });
    chart.update({ axes: { y: { title: 'Load' } } });
    expect(chart.getLegendItems().map((item) => item.id)).toEqual(['cpu']);
  });

  it('pushing into the caller’s referenceLines array after creation draws nothing new', () => {
    const lines: Loose[] = [{ axis: 'y', value: 41, label: 'Deploy A' }];
    const chart = mount({ data: rows, x: 't', series: [{ y: 'cpu' }], referenceLines: lines });
    fakes.frames.flush();
    lines.push({ axis: 'y', value: 43, label: 'Deploy B' });
    chart.update({ axes: { y: { title: 'Load' } } });
    fakes.frames.flush();
    const drawn = fakes.canvas.all
      .flatMap((record) => record.calls)
      .filter((call) => call.name === 'fillText')
      .map((call) => String(call.args[0]));
    expect(drawn).toContain('Deploy A');
    expect(drawn).not.toContain('Deploy B');
  });

  it('mutating the caller’s axes object after creation changes nothing', () => {
    const axes = { y: { min: 0, max: 100 } };
    const chart = mount({ data: rows, x: 't', series: [{ y: 'cpu' }], axes });
    axes.y.max = 50;
    chart.update({ series: [{ y: 'cpu', label: 'CPU' }] });
    expect(chart.getAxis('y')).toMatchObject({ min: 0, max: 100 });
  });
});

describe('§4.4 option leaves reach the engine', () => {
  it("interaction: 'readonly' keeps the viewport on a zoom key (control)", () => {
    const chart = mount({ data: rows, x: 't', series: [{ y: 'cpu' }], interaction: 'readonly' });
    const before = chart.getAxis('x');
    keyZoom(chart);
    expect(chart.getAxis('x')).toEqual(before);
  });

  it("[arch-15] interaction: { zoom: 'xy' } zooms both axes", () => {
    const chart = mount({
      data: rows,
      x: 't',
      series: [{ y: 'cpu' }],
      interaction: { zoom: 'xy' },
    });
    const x = chart.getAxis('x')!;
    const y = chart.getAxis('y')!;
    keyZoom(chart);
    expect(chart.getAxis('x')!.max - chart.getAxis('x')!.min).toBeLessThan(x.max - x.min);
    expect(chart.getAxis('y')!.max - chart.getAxis('y')!.min).toBeLessThan(y.max - y.min);
  });

  it("the default zoom is 'x' for lines", () => {
    const chart = mount({ data: rows, x: 't', series: [{ y: 'cpu' }] });
    const y = chart.getAxis('y');
    keyZoom(chart);
    expect(chart.getAxis('y')).toEqual(y);
  });

  it("[arch-15] the default zoom is 'xy' when every series is scatter", () => {
    const chart = mount({ data: rows, x: 't', series: [{ type: 'scatter', y: 'cpu' }] });
    const y = chart.getAxis('y')!;
    keyZoom(chart);
    expect(chart.getAxis('y')!.max - chart.getAxis('y')!.min).toBeLessThan(y.max - y.min);
  });

  it("[arch-15] interaction: { zoom: 'none' } keeps the viewport on a zoom key", () => {
    const chart = mount({
      data: rows,
      x: 't',
      series: [{ y: 'cpu' }],
      interaction: { zoom: 'none' },
    });
    const before = chart.getAxis('x');
    keyZoom(chart);
    expect(chart.getAxis('x')).toEqual(before);
  });

  it("[arch-15] interaction: { bounds: 'none' } lets a zoom-out leave the data", () => {
    const chart = mount({
      data: rows,
      x: 't',
      series: [{ y: 'cpu' }],
      interaction: { bounds: 'none' },
    });
    keyZoom(chart, '-');
    expect(chart.getAxis('x')!.min).toBeLessThan(0);
  });

  it('[arch-15] cursor: false draws no crosshair', () => {
    const chart = mount({ data: rows, x: 't', series: [{ y: 'cpu' }], cursor: false });
    fakes.frames.flush();
    const overlay = fakes.canvas.of(debug(chart).layers.overlay);
    const before = overlay.calls.length;
    hover(chart, 10, 42);
    fakes.frames.flush();
    const strokes = overlay.calls.slice(before).filter((call) => call.name === 'stroke');
    expect(strokes).toHaveLength(0);
  });

  it('[arch-15] tooltip: false shows no tooltip', () => {
    const shown = mount({ data: rows, x: 't', series: [{ y: 'cpu' }] });
    fakes.frames.flush();
    hover(shown, 10, rows[10].cpu);
    fakes.frames.flush();
    expect(tooltipText()).toMatch(/\d/);
    shown.destroy();
    const silent = mount({ data: rows, x: 't', series: [{ y: 'cpu' }], tooltip: false });
    fakes.frames.flush();
    hover(silent, 10, rows[10].cpu);
    fakes.frames.flush();
    expect(tooltipText()).toBe('');
  });

  it("tooltip: { mode: 'nearest' } is accepted (control)", () => {
    expect(() =>
      mount({ data: rows, x: 't', series: [{ y: 'cpu' }], tooltip: { mode: 'nearest' } }),
    ).not.toThrow();
  });

  it("[arch-15] theme: 'dark' resolves the dark roles on a light page", () => {
    const chart = mount({ data: rows, x: 't', series: [{ y: 'cpu' }], theme: 'dark' });
    const light = mount({ data: rows, x: 't', series: [{ y: 'cpu' }], theme: 'light' });
    expect(chart.getTheme().backgroundColor).not.toBe(light.getTheme().backgroundColor);
    expect(chart.getTheme().textColor).not.toBe(light.getTheme().textColor);
  });

  it('[arch-15] theme tokens set the surface, text and categorical palette', () => {
    const chart = mount({
      data: rows,
      x: 't',
      series: [{ y: 'cpu' }, { y: 'mem' }],
      theme: { surface: '#fafaf7', text: '#202020', categorical: ['#d55e00', '#0072b2'] },
    });
    expect(chart.getTheme()).toMatchObject({ backgroundColor: '#fafaf7', textColor: '#202020' });
    expect(chart.getLegendItems().map((item) => item.color)).toEqual(['#d55e00', '#0072b2']);
  });

  it('[arch-15] series color and dash style the series', () => {
    const chart = mount({
      data: rows,
      x: 't',
      series: [{ y: 'cpu', color: '#cc79a7', dash: [4, 2] }],
    });
    expect(chart.getLegendItems()[0]).toMatchObject({ color: '#cc79a7', dash: [4, 2] });
  });

  it('[arch-15] a bar color function receives the value, the row and the row index', () => {
    const data = [
      { k: 2, v: 20 },
      { k: 1, v: 10 },
    ];
    const color = vi.fn(() => '#e69f00');
    mount({ data, x: 'k', series: [{ type: 'bar', y: 'v', color }] });
    fakes.frames.flush();
    expect(color).toHaveBeenCalledWith(10, data[1], 1);
  });

  it('axis nice: false keeps the data bounds', () => {
    const chart = mount({
      data: [
        { t: 0, v: 3.3 },
        { t: 1, v: 9.7 },
      ],
      x: 't',
      series: [{ y: 'v' }],
      axes: { y: { nice: false } },
    });
    const y = chart.getAxis('y')!;
    expect(y.max).toBeLessThan(10.1);
    expect(y.min).toBeGreaterThan(2.9);
  });

  it('[arch-15] axis min and max accept Dates', () => {
    const start = new Date(2026, 0, 2);
    const end = new Date(2026, 0, 3);
    const chart = mount({
      data: [
        { d: new Date(2026, 0, 1), v: 1 },
        { d: new Date(2026, 0, 4), v: 2 },
      ],
      x: 'd',
      series: [{ y: 'v' }],
      axes: { x: { min: start, max: end } },
    });
    expect(chart.getAxis('x')).toMatchObject({ min: start.getTime(), max: end.getTime() });
  });

  it('[arch-15] explicit ticks accept Dates', () => {
    const ticks = [new Date(2026, 0, 2), new Date(2026, 0, 3)];
    const chart = mount({
      data: [
        { d: new Date(2026, 0, 1), v: 1 },
        { d: new Date(2026, 0, 4), v: 2 },
      ],
      x: 'd',
      series: [{ y: 'v' }],
      axes: { x: { ticks } },
    });
    fakes.frames.flush();
    const labels = debug(chart)
      .labelBoxes()
      .filter((box) => box.axis === 'x' && box.kind === 'tick');
    expect(labels).toHaveLength(2);
  });

  it("[arch-15] an axis format { suffix: '%' } wraps the tick labels", () => {
    const chart = mount({
      data: rows,
      x: 't',
      series: [{ y: 'cpu' }],
      axes: { y: { format: { suffix: '%' } } },
    });
    fakes.frames.flush();
    const labels = debug(chart)
      .labelBoxes()
      .filter((box) => box.axis === 'y' && box.kind === 'tick');
    expect(labels.length).toBeGreaterThan(1);
    for (const label of labels) expect(label.text).toMatch(/%$/);
  });

  it('a format function on a value axis receives a number', () => {
    const format = vi.fn((value: number) => `${value.toFixed(1)} ms`);
    mount({ data: rows, x: 't', series: [{ y: 'cpu' }], axes: { y: { format } } });
    fakes.frames.flush();
    expect(format).toHaveBeenCalled();
    for (const [value] of format.mock.calls) expect(typeof value).toBe('number');
  });

  it('grid: false removes the gridlines of that axis', () => {
    const chart = mount({
      data: rows,
      x: 't',
      series: [{ y: 'cpu' }],
      axes: { x: { grid: false }, y: { grid: false } },
    });
    const gridded = mount({ data: rows, x: 't', series: [{ y: 'cpu' }] });
    fakes.frames.flush();
    const strokes = (handle: ChartHandle<any>) =>
      fakes.canvas.of(debug(handle).layers.grid).calls.filter((call) => call.name === 'lineTo')
        .length;
    expect(strokes(chart)).toBeLessThan(strokes(gridded));
  });

  it('a reference region color fills the region', () => {
    expect(() =>
      mount({
        data: rows,
        x: 't',
        series: [{ y: 'cpu' }],
        referenceRegions: [{ axis: 'x', from: 2, to: 4, label: 'Deploy', color: '#e69f00' }],
      }),
    ).not.toThrow();
  });

  it('[arch-15] a reference region accepts open ends', () => {
    const chart = mount({
      data: rows,
      x: 't',
      series: [{ y: 'cpu' }],
      referenceRegions: [{ axis: 'y', from: 42, to: Number.POSITIVE_INFINITY, label: 'High' }],
    });
    fakes.frames.flush();
    const drawn = fakes.canvas
      .of(debug(chart).layers.data)
      .calls.filter((call) => call.name === 'fillText')
      .map((call) => String(call.args[0]));
    expect(drawn).toContain('High');
  });
});

describe('state options at creation (D3)', () => {
  it('[arch-15] viewport pins only the axes it names', () => {
    const chart = mount({ data: rows, x: 't', series: [{ y: 'cpu' }], viewport: { x: [2, 8] } });
    const auto = mount({ data: rows, x: 't', series: [{ y: 'cpu' }] });
    expect(chart.getAxis('x')).toMatchObject({ min: 2, max: 8 });
    expect(chart.getAxis('y')).toEqual(auto.getAxis('y'));
  });

  it('[arch-15] viewport accepts Dates on a time axis', () => {
    const from = new Date(2026, 0, 2);
    const to = new Date(2026, 0, 3);
    const chart = mount({
      data: [
        { d: new Date(2026, 0, 1), v: 1 },
        { d: new Date(2026, 0, 4), v: 2 },
      ],
      x: 'd',
      series: [{ y: 'v' }],
      viewport: { x: [from, to] },
    });
    expect(chart.getAxis('x')).toMatchObject({ min: from.getTime(), max: to.getTime() });
  });

  it('[arch-15] hiddenSeries hides the series it names', () => {
    const chart = mount({
      data: rows,
      x: 't',
      series: [{ y: 'cpu' }, { y: 'mem' }],
      hiddenSeries: ['mem'],
    });
    expect(chart.getState().hiddenSeries).toEqual(['mem']);
  });

  it('[arch-15] highlight highlights the series it names', () => {
    const chart = mount({
      data: rows,
      x: 't',
      series: [{ y: 'cpu' }, { y: 'mem' }],
      highlight: 'mem',
    });
    expect(chart.getState().highlight).toBe('mem');
  });

  it("[arch-15] selection sets the brush with interaction: { drag: 'select' }", () => {
    const chart = mount({
      data: rows,
      x: 't',
      series: [{ y: 'cpu' }],
      interaction: { drag: 'select' },
      selection: { x: [2, 6] },
    });
    expect(chart.getState().selection).toEqual({ x: [2, 6] });
  });

  it('[arch-15] update({ viewport }) applies the viewport', () => {
    const chart = mount({ data: rows, x: 't', series: [{ y: 'cpu' }] });
    chart.update({ viewport: { x: [4, 12] } } as never);
    expect(chart.getAxis('x')).toMatchObject({ min: 4, max: 12 });
  });
});

// A state option is checked against the chart's axes before anything changes, like the data
// it may arrive with: a rejected call leaves the chart, its options and later calls as they were.
describe('state options are checked before anything changes (D3, D23)', () => {
  const latest = (chart: ChartHandle<any>) =>
    chart.getCursorSnapshot({ fallback: 'latest' }).points[0];

  it('[arch-15] a viewport naming an unknown axis throws at createChart and leaves the container empty', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const observers = fakes.resizeObserver.observerCount;
    const message = thrown(() =>
      createChart(host, {
        data: rows,
        x: 't',
        series: [{ y: 'cpu' }],
        viewport: { z: [0, 1] },
      } as never),
    );
    expect(message).toMatch(/^snaplot: viewport names axis "z", which this chart does not have/);
    expect(host.children).toHaveLength(0);
    expect(fakes.resizeObserver.observerCount).toBe(observers);
  });

  it('[arch-15] a rejected update({ viewport }) changes nothing, and later updates work', () => {
    const chart = mount({ data: rows, x: 't', series: [{ y: 'cpu' }] });
    const x = chart.getAxis('x');
    expect(thrown(() => chart.update({ viewport: { x: [2, 8], z: [0, 1] } } as never))).toMatch(
      /^snaplot: viewport names axis "z"/,
    );
    expect(chart.getAxis('x')).toEqual(x);
    expect(chart.getOptions().viewport).toBeUndefined();
    expect(() => chart.update({ axes: { y: { title: 'Load' } } } as never)).not.toThrow();
    expect(() => chart.update({ data: rows.slice(0, 10) } as never)).not.toThrow();
    expect(latest(chart)).toMatchObject({ x: 9 });
    chart.update({ viewport: { x: [2, 8] } } as never);
    expect(chart.getAxis('x')).toMatchObject({ min: 2, max: 8 });
  });

  it('[dataapi-03][arch-15] a rejected update({ data, viewport }) keeps the old data and row ids', () => {
    const data = Array.from({ length: 5 }, (_, i) => ({ x: i, y: i * 2, id: `r${i}` }));
    const chart = mount({ data, x: 'x', rowId: 'id', series: [{ y: 'y' }] });
    const x = chart.getAxis('x');
    const next = Array.from({ length: 3 }, (_, i) => ({ x: 100 + i, y: i, id: `n${i}` }));
    expect(thrown(() => chart.update({ data: next, viewport: { z: [0, 1] } } as never))).toMatch(
      /^snaplot: viewport names axis "z"/,
    );
    expect(chart.getAxis('x')).toEqual(x);
    expect(latest(chart)).toMatchObject({ x: 4, y: 8, rowIndex: 4, rowId: 'r4' });
    expect(latest(chart).row).toBe(data[4]);
    chart.update({ data: next } as never);
    expect(latest(chart)).toMatchObject({ x: 102, y: 2, rowIndex: 2, rowId: 'n2' });
    expect(latest(chart).row).toBe(next[2]);
  });

  it('[arch-15] a viewport on a log axis needs bounds above 0', () => {
    const options = { data: rows, x: 't', series: [{ y: 'cpu' }], axes: { y: { type: 'log' } } };
    expect(thrown(() => mount({ ...options, viewport: { y: [0, 10] } }))).toMatch(
      /^snaplot: viewport\.y is \[0, 10\], but axis "y" is a log axis/,
    );
    const chart = mount(options);
    const y = chart.getAxis('y');
    expect(thrown(() => chart.update({ viewport: { y: [-1, 10] } } as never))).toMatch(
      /^snaplot: viewport\.y is \[-1, 10\], but axis "y" is a log axis/,
    );
    expect(chart.getAxis('y')).toEqual(y);
    chart.update({ viewport: { y: [1, 100] } } as never);
    expect(chart.getAxis('y')).toMatchObject({ min: 1, max: 100 });
  });
});

describe('on<Key>Change callback options (D16)', () => {
  it('[arch-12] onViewportChange reports the pinned axes as [from, to] tuples', () => {
    const onViewportChange = vi.fn();
    const chart = mount({ data: rows, x: 't', series: [{ y: 'cpu' }], onViewportChange });
    keyZoom(chart);
    expect(onViewportChange).toHaveBeenCalled();
    const viewport = onViewportChange.mock.calls.at(-1)![0] as Record<string, unknown>;
    const x = chart.getAxis('x')!;
    expect(viewport.x).toEqual([x.min, x.max]);
  });

  it('[arch-15] onHiddenSeriesChange, onHighlightChange and onCursorChange are called', () => {
    const onHiddenSeriesChange = vi.fn();
    const onHighlightChange = vi.fn();
    const onCursorChange = vi.fn();
    const chart = mount({
      data: rows,
      x: 't',
      series: [{ y: 'cpu' }, { y: 'mem' }],
      onHiddenSeriesChange,
      onHighlightChange,
      onCursorChange,
    });
    chart.setSeriesVisible('mem', false);
    chart.setHighlight('cpu');
    chart.setCursor(5);
    fakes.frames.flush();
    expect(onHiddenSeriesChange).toHaveBeenLastCalledWith(['mem']);
    expect(onHighlightChange).toHaveBeenLastCalledWith('cpu');
    expect(onCursorChange).toHaveBeenCalled();
  });

  it('[arch-15] onFollowingChange reports a pan away from the latest data', () => {
    const onFollowingChange = vi.fn();
    const chart = mount({
      data: rows,
      x: 't',
      series: [{ y: 'cpu' }],
      streaming: { followWindow: 10 },
      onFollowingChange,
    });
    keyZoom(chart);
    expect(onFollowingChange).toHaveBeenCalledWith(false);
  });

  it('onPointClick receives the clicked point', () => {
    const onPointClick = vi.fn();
    const chart = mount({ data: rows, x: 't', series: [{ y: 'cpu' }], onPointClick });
    fakes.frames.flush();
    const point = clientPoint(chart, 10, rows[10].cpu);
    const target = pointerTarget(chart);
    const init = { ...point, bubbles: true, pointerId: 1, pointerType: 'mouse', button: 0 };
    target.dispatchEvent(new PointerEvent('pointermove', init));
    target.dispatchEvent(new PointerEvent('pointerdown', init));
    target.dispatchEvent(new PointerEvent('pointerup', init));
    target.dispatchEvent(new MouseEvent('click', { ...point, bubbles: true }));
    expect(onPointClick).toHaveBeenCalled();
    expect(onPointClick.mock.calls[0][0]).toMatchObject({ seriesId: 'cpu', x: 10 });
  });
});

describe('options whose behaviour lands later are accepted quietly', () => {
  it('legend, locale, timeZone and height are accepted without a warning', () => {
    const warn = quiet();
    mount({
      data: rows,
      x: 't',
      series: [{ y: 'cpu' }, { y: 'mem' }],
      legend: { position: 'bottom' },
      locale: 'en-GB',
      timeZone: 'UTC',
      height: 240,
    });
    mount({ data: rows, x: 't', series: [{ y: 'cpu' }], legend: 'auto', height: '18rem' });
    expect(warn).not.toHaveBeenCalled();
  });
});
