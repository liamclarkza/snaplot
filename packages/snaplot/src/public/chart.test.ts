// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChart, createChartGroup } from './chart';
import type { ChartHandle, ChartOptions, ChartPoint } from './types';
import { ChartCore } from '../engine/Engine';

const live: Array<{ destroy(): void }> = [];
beforeEach(() => {
  const context = new Proxy(
    {
      canvas: {},
      measureText: (text: string) => ({ width: text.length * 7 }),
      createLinearGradient: () => ({ addColorStop() {} }),
    },
    {
      get(target, key) {
        return Reflect.get(target, key) ?? (() => {});
      },
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  window.matchMedia = vi.fn(() => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  for (const chart of live.splice(0)) chart.destroy();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});
function make<Row = Record<string, any>>(options: ChartOptions<Row>): ChartHandle<Row> {
  const element = document.createElement('div');
  document.body.append(element);
  const chart = createChart(element, { height: 360, ...options });
  live.push(chart);
  return chart;
}

/** Run the animation frames the stubbed requestAnimationFrame queued. */
function flushFrames(): void {
  const queued = vi.mocked(requestAnimationFrame).mock.calls.splice(0);
  for (const [callback] of queued) callback(0);
}

/** The untyped debug symbol (plan D31): test-only, never on ChartHandle. */
function debug(chart: object): Record<string, any> {
  return (chart as Record<symbol, Record<string, any>>)[Symbol.for('snaplot.debug')];
}
/** An axis as `scale(key)` reports it, without the mapping functions. */
function axis(chart: ChartHandle<any>, key: string) {
  const scale = chart.scale(key);
  return scale ? { type: scale.type, min: scale.min, max: scale.max } : undefined;
}

/** The Y range a chart with these options shows on its own. */
function soloY<Row>(options: ChartOptions<Row>) {
  const chart = make(options);
  const y = axis(chart, 'y')!;
  chart.destroy();
  return { min: y.min, max: y.max };
}
/** The union of Y ranges a `yRange` group shares. */
const union = (...ranges: { min: number; max: number }[]) => ({
  min: Math.min(...ranges.map((range) => range.min)),
  max: Math.max(...ranges.map((range) => range.max)),
});

describe('public chart transactions', () => {
  it('accepts ordinary rows, keeps original identity after sorting and reports actual values', () => {
    const rows = [
      { id: 'b', time: 2, cpu: 20 },
      { id: 'a', time: 1, cpu: 10 },
    ];
    const chart = make({ data: rows, x: 'time', rowId: 'id', series: [{ y: 'cpu' }] });
    const point = chart.getCursor({ fallback: 'first' }).points[0];
    expect(point).toMatchObject({ seriesId: 'cpu', rowId: 'a', rowIndex: 1, x: 1, y: 10 });
    expect(point.row).toBe(rows[1]);
    expect(rows[0].time).toBe(2);
  });

  it('atomically changes fields with data and rolls back a malformed next source', () => {
    type Row = { x: number; a?: number; b?: number };
    const chart = make<Row>({ data: [{ x: 1, a: 2 }], x: 'x', series: [{ y: 'a' }] });
    chart.update({ data: [{ x: 3, b: 4 }], series: [{ y: 'b' }] });
    expect(chart.getCursor({ fallback: 'latest' }).points[0]).toMatchObject({
      seriesId: 'b',
      y: 4,
    });
    expect(() => chart.update({ data: [{ x: Infinity, b: 9 }] })).toThrow(/X|finite/);
    expect(chart.getCursor({ fallback: 'latest' }).points[0]).toMatchObject({
      seriesId: 'b',
      y: 4,
    });
  });

  it('keeps zoom and hidden/highlight IDs across equivalent props, data and reordered series', () => {
    const options = {
      data: [
        { x: 0, a: 2, b: 3 },
        { x: 10, a: 4, b: 5 },
      ],
      x: 'x',
      series: [{ y: 'a' }, { y: 'b' }],
    } as const;
    const chart = make(options);
    chart.update({ viewport: { x: [2, 8] }, hiddenSeries: ['a'], highlight: 'b' });
    chart.update({ series: [{ y: 'b' }, { y: 'a' }] });
    expect(chart.getState()).toMatchObject({
      hiddenSeries: ['a'],
      highlight: 'b',
      viewport: { x: [2, 8] },
    });
    // Plan D3: setOptions compares each state key with the value it last applied.
    chart.setOptions({
      ...options,
      series: [{ y: 'b' }, { y: 'a' }],
      viewport: { x: [2, 8] },
      hiddenSeries: ['a'],
      highlight: 'b',
    });
    expect(chart.getState()).toMatchObject({
      hiddenSeries: ['a'],
      highlight: 'b',
      viewport: { x: [2, 8] },
    });
  });

  it('resets explicitly undefined optional options and removes omitted declarative props', () => {
    const data = [
      { x: 1, y: 5 },
      { x: 2, y: 6 },
    ];
    const chart = make({
      data,
      x: 'x',
      series: [{ y: 'y' }],
      axes: { y: { title: 'Value', min: 0 } },
    });
    const titles = () =>
      (debug(chart).labelBoxes() as { kind: string; text: string }[])
        .filter((box) => box.kind === 'title')
        .map((box) => box.text);
    flushFrames();
    expect(titles()).toEqual(['Value']);
    chart.update({ axes: { y: { title: undefined } } });
    flushFrames();
    expect(titles()).toEqual([]);
    expect(axis(chart, 'y')?.min).toBe(0);
    chart.setOptions({ data, x: 'x', series: [{ y: 'y' }] });
    expect(axis(chart, 'y')?.min).toBeGreaterThan(0);
  });

  it('rebuilds inferred categories on replacement and rejects unknown explicit categories', () => {
    const chart = make({
      data: [
        { x: 'B', y: 2 },
        { x: 'A', y: 1 },
      ],
      x: 'x',
      series: [{ y: 'y', type: 'bar' }],
    });
    expect(axis(chart, 'x')?.type).toBe('category');
    chart.update({
      data: [
        { x: 'A', y: 3 },
        { x: 'C', y: 4 },
      ],
    });
    const first = chart.getCursor({ fallback: 'first' }).points[0];
    expect(first.x).toBe('A');
    // Plan D23 (dataapi-05): replacing the data rebuilds the inferred categories, so B is gone.
    expect(axis(chart, 'x')).toMatchObject({ min: -0.5, max: 1.5 });
    expect(() => chart.update({ axes: { x: { categories: ['A'] } } })).toThrow(
      /"C", which is not one of axes\.x\.categories/,
    );
  });

  it('uses independent sample positions without a union grid or interpolation', () => {
    const chart = make({
      x: 'x',
      series: [
        {
          id: 'a',
          data: [
            { x: 0, y: 0 },
            { x: 10, y: 10 },
          ],
          y: 'y',
        },
        {
          id: 'b',
          data: [
            { x: 3, y: 30 },
            { x: 7, y: 70 },
            { x: 12, y: 120 },
          ],
          y: 'y',
        },
      ],
    });
    chart.setCursor(6);
    expect(chart.getCursor().points.map((point) => [point.seriesId, point.x, point.y])).toEqual([
      ['a', 10, 10],
      ['b', 7, 70],
    ]);
  });

  it('appends independently, preserves original row IDs and retains only the configured window', () => {
    const chart = make({
      x: 'x',
      rowId: 'id',
      streaming: { maxPoints: 2 },
      series: [
        { id: 'a', data: [{ id: 'a0', x: 0, y: 0 }], y: 'y' },
        { id: 'b', data: [{ id: 'b0', x: 0, y: 30 }], y: 'y' },
      ],
    });
    chart.appendData(
      [
        { id: 'a1', x: 1, y: 10 },
        { id: 'a2', x: 2, y: 20 },
      ],
      { seriesId: 'a' },
    );
    const latest = chart.getCursor({ fallback: 'latest' }).points;
    expect(latest.find((point) => point.seriesId === 'a')).toMatchObject({
      rowId: 'a2',
      rowIndex: 2,
      x: 2,
      y: 20,
    });
    expect(latest.find((point) => point.seriesId === 'b')).toMatchObject({
      rowId: 'b0',
      x: 0,
      y: 30,
    });
    chart.update({ axes: { y: { title: 'Changed title' } } });
    expect(
      chart.getCursor({ fallback: 'latest' }).points.find((point) => point.seriesId === 'a')?.y,
    ).toBe(20);
  });

  it('rejects unordered streaming batches before changing any source', () => {
    const chart = make({ data: [{ x: 2, y: 5 }], x: 'x', series: [{ y: 'y' }] });
    expect(() => chart.appendData([{ x: 1, y: 6 }])).toThrow(/before the last x/);
    expect(chart.getCursor({ fallback: 'latest' }).points[0].y).toBe(5);
  });

  it('retains unchanged plugin instances and gives them the public handle', () => {
    const cleanup = vi.fn();
    const install = vi.fn(() => cleanup);
    const plugin = { id: 'custom', install };
    const chart = make({ data: [{ x: 1, y: 2 }], x: 'x', series: [{ y: 'y' }], plugins: [plugin] });
    expect(install).toHaveBeenCalledExactlyOnceWith(chart);
    chart.update({ referenceLines: [{ axis: 'y', value: 4 }] });
    expect(cleanup).not.toHaveBeenCalled();
    chart.destroy();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('synchronizes identity across reordered series and disconnects a member that leaves', () => {
    const group = createChartGroup();
    const data = [{ x: 1, a: 2, b: 3 }];
    const first = make({ data, x: 'x', group, series: [{ y: 'a' }, { y: 'b' }] });
    const second = make({ data, x: 'x', group, series: [{ y: 'b' }, { y: 'a' }] });
    first.update({ highlight: 'b' });
    expect(second.getState().highlight).toBe('b');
    second.update({ group: undefined });
    first.update({ highlight: 'a' });
    expect(second.getState().highlight).toBe('b');
  });

  it('rejects incompatible group categories before installing the second chart', () => {
    const group = createChartGroup();
    make({
      data: [{ x: 'a', y: 1 }],
      x: 'x',
      group,
      series: [{ y: 'y' }],
      axes: { x: { categories: ['a', 'b'] } },
    });
    expect(() =>
      make({
        data: [{ x: 'a', y: 1 }],
        x: 'x',
        group,
        series: [{ y: 'y' }],
        axes: { x: { categories: ['b', 'a'] } },
      }),
    ).toThrow(/category order/);
  });

  it('keeps streamed shared rows through fresh complete prop snapshots and style updates', () => {
    const data = [{ x: 0, a: 0, b: 100 }];
    const options = {
      data,
      x: 'x',
      series: [{ y: 'a' }, { y: 'b' }],
      streaming: { maxPoints: 2 },
    } as const;
    const chart = make(options);
    chart.appendData([
      { x: 1, a: 1, b: 101 },
      { x: 2, a: 2, b: 102 },
    ]);
    for (const title of ['First', 'Second']) {
      chart.setOptions({ ...options, axes: { y: { title } } });
      expect(
        chart.getCursor({ fallback: 'latest' }).points.map((point) => [point.rowIndex, point.y]),
      ).toEqual([
        [2, 2],
        [2, 102],
      ]);
    }
    chart.appendData([{ x: 3, a: 3, b: 103 }]);
    chart.update({ axes: { y: { title: 'Third' } } });
    expect(
      chart.getCursor({ fallback: 'first' }).points.map((point) => [point.rowIndex, point.y]),
    ).toEqual([
      [2, 2],
      [2, 102],
    ]);
    expect(
      chart.getCursor({ fallback: 'latest' }).points.map((point) => [point.rowIndex, point.y]),
    ).toEqual([
      [3, 3],
      [3, 103],
    ]);
    chart.update({ data });
    expect(
      chart.getCursor({ fallback: 'latest' }).points.map((point) => [point.rowIndex, point.y]),
    ).toEqual([
      [0, 0],
      [0, 100],
    ]);
  });

  it('keeps original sorted row positions while re-ingesting retained independent rows', () => {
    const rows = [
      { x: 2, y: 20 },
      { x: 1, y: 10 },
    ];
    const options = {
      x: 'x',
      series: [{ id: 'run', data: rows, y: 'y' }],
      streaming: { maxPoints: 2 },
    } as const;
    const chart = make(options);
    chart.appendData([{ x: 3, y: 30 }], { seriesId: 'run' });
    chart.setOptions({ ...options, axes: { y: { title: 'Loss' } } });
    expect(chart.getCursor({ fallback: 'first' }).points[0]).toMatchObject({
      rowIndex: 0,
      x: 2,
      y: 20,
    });
    expect(chart.getCursor({ fallback: 'first' }).points[0].row).toBe(rows[0]);
    chart.appendData([{ x: 3, y: 35 }], { seriesId: 'run', updateLast: true });
    chart.setOptions({ ...options, axes: { y: { title: 'Loss again' } } });
    expect(chart.getCursor({ fallback: 'latest' }).points[0]).toMatchObject({
      rowIndex: 2,
      x: 3,
      y: 35,
    });
  });

  it('retains named-column appends through complete prop reconciliation', () => {
    const data = { columns: { x: new Float64Array([0]), y: new Float64Array([10]) } };
    const options = { data, x: 'x', series: [{ y: 'y' }], streaming: { maxPoints: 2 } } as const;
    const chart = make(options);
    chart.appendData({ columns: { x: new Float64Array([1, 2]), y: new Float64Array([11, 12]) } });
    for (const title of ['One', 'Two']) chart.setOptions({ ...options, axes: { y: { title } } });
    expect(chart.getCursor({ fallback: 'latest' }).points[0]).toMatchObject({
      rowIndex: 2,
      y: 12,
    });
    chart.appendData({ columns: { x: new Float64Array([3]), y: new Float64Array([13]) } });
    expect(chart.getCursor({ fallback: 'latest' }).points[0]).toMatchObject({
      rowIndex: 3,
      y: 13,
    });
  });

  it('appends inferred categories, retains labels and rejects duplicate category bars atomically', () => {
    const chart = make({ data: [{ x: 'A', y: 1 }], x: 'x', series: [{ y: 'y', type: 'bar' }] });
    chart.appendData([
      { x: 'B', y: 2 },
      { x: 'C', y: 3 },
    ]);
    expect(chart.getCursor({ fallback: 'latest' }).points[0]).toMatchObject({
      x: 'C',
      formattedX: 'C',
      y: 3,
    });
    expect(axis(chart, 'x')).toMatchObject({ min: -0.5, max: 2.5 });
    expect(() => chart.appendData([{ x: 'C', y: 9 }])).toThrow(
      /same category twice \("C"\): the batch starts at the latest bar/,
    );
    expect(chart.getCursor({ fallback: 'latest' }).points[0].y).toBe(3);
    chart.appendData([{ x: 'C', y: 4 }], { updateLast: true });
    expect(chart.getCursor({ fallback: 'latest' }).points[0]).toMatchObject({
      rowIndex: 2,
      y: 4,
    });
    chart.update({ axes: { y: { title: 'Counts' } } });
    expect(chart.getCursor({ fallback: 'latest' }).points[0].x).toBe('C');
  });

  it('rejects invalid state options before changing chart data or options', () => {
    const options: ChartOptions<{ x: number; y: number }> = {
      data: [{ x: 0, y: 1 }],
      x: 'x',
      series: [{ y: 'y' }],
    };
    const chart = make(options);
    expect(() =>
      chart.setOptions({ ...options, data: [{ x: 2, y: 3 }], hiddenSeries: ['missing'] }),
    ).toThrow(/hiddenSeries names "missing"/);
    expect(chart.getCursor({ fallback: 'latest' }).points[0].y).toBe(1);
    expect(() => chart.setOptions({ ...options, viewport: { x: [1, 0] } })).toThrow(/from < to/);
    chart.update({ viewport: { x: [0, 5] } });
    expect(chart.getState().viewport.x).toEqual([0, 5]);
  });

  it('freezes cached cursor snapshots without freezing caller-owned rows', () => {
    const row = { x: 1, y: 2 };
    const chart = make({ data: [row], x: 'x', series: [{ y: 'y' }] });
    chart.setCursor(1);
    const state = chart.getState();
    expect(chart.getState()).toBe(state);
    const cursor = chart.getCursor();
    expect(Object.isFrozen(cursor)).toBe(true);
    expect(Object.isFrozen(cursor.points)).toBe(true);
    expect(Object.isFrozen(cursor.points[0])).toBe(true);
    expect(cursor.points[0].row).toBe(row);
    expect(Object.isFrozen(row)).toBe(false);
  });

  // gap-overhaul-delta-06: the Solid link tests this replaced asserted the
  // grouped state itself (aligned gutters, the union Y) and its
  // re-coordination after a member's data changed.
  it('[gap-overhaul-delta-06] keeps plots aligned and Y shared while grouped, including after a member update', () => {
    const group = createChartGroup({ yRange: true, alignPlots: true });
    const rows = (a: number, b: number) => [
      { x: 0, y: a },
      { x: 1, y: b },
    ];
    const firstOptions: Omit<ChartOptions<{ x: number; y: number }>, 'data'> = {
      x: 'x',
      series: [{ y: 'y' }],
      axes: { y: { nice: false } },
    };
    // A title widens the second chart's left gutter; alignPlots widens the first's to match.
    const secondOptions: typeof firstOptions = {
      ...firstOptions,
      axes: { y: { nice: false, title: 'Requests per second' } },
    };
    const own = make({ ...firstOptions, data: rows(1, 3) });
    const ownLeft = debug(own).plot.left;
    const first = make({ ...firstOptions, data: rows(1, 3), group });
    const second = make({ ...secondOptions, data: rows(100, 200), group });
    const aligned = () => {
      const [a, b] = [debug(first).plot, debug(second).plot];
      expect(a.left).toBe(b.left);
      expect(a.width).toBe(b.width);
    };
    const shared = (a: [number, number], b: [number, number]) => {
      const range = union(
        soloY({ ...firstOptions, data: rows(...a) }),
        soloY({ ...secondOptions, data: rows(...b) }),
      );
      expect(axis(first, 'y')).toMatchObject(range);
      expect(axis(second, 'y')).toMatchObject(range);
    };

    shared([1, 3], [100, 200]);
    expect(debug(first).plot.left).toBeGreaterThan(ownLeft);
    aligned();

    second.update({ data: rows(100, 400) });
    shared([1, 3], [100, 400]);
    aligned();

    first.update({ data: rows(-50, 3) });
    shared([-50, 3], [100, 400]);
    aligned();
  });

  it('restores independent chart ranges after leaving or destroying a group', () => {
    const group = createChartGroup({ yRange: true, alignPlots: true });
    const firstOptions: ChartOptions<{ x: number; y: number }> = {
      data: [
        { x: 0, y: 1 },
        { x: 1, y: 3 },
      ],
      x: 'x',
      series: [{ y: 'y' }],
      axes: { y: { nice: false } },
    };
    const secondOptions = {
      ...firstOptions,
      data: [
        { x: 0, y: 100 },
        { x: 1, y: 200 },
      ],
      axes: { y: { nice: false, title: 'Requests per second' } },
    };
    const firstY = soloY(firstOptions);
    const secondY = soloY(secondOptions);
    const first = make({ ...firstOptions, group });
    const second = make({ ...secondOptions, group });
    expect(axis(first, 'y')).toMatchObject(union(firstY, secondY));
    first.update({ group: undefined });
    expect(axis(first, 'y')).toMatchObject(firstY);
    expect(axis(second, 'y')).toMatchObject(secondY);
    expect(debug(first).plot.left).toBeLessThan(debug(second).plot.left);
    first.update({ group });
    second.update({ group: undefined });
    first.update({ group: undefined });
    expect(axis(first, 'y')).toMatchObject(firstY);
    expect(axis(second, 'y')).toMatchObject(secondY);
    first.update({
      data: [
        { x: 0, y: 5 },
        { x: 1, y: 10 },
      ],
    });
    expect(first.getCursor({ fallback: 'latest' }).points[0].y).toBe(10);
    expect(axis(second, 'y')).toMatchObject(secondY);
  });

  it('matches column names independently of key order and rejects schema substitutions', () => {
    const values = new Float64Array([1]);
    const chart = make({
      data: { columns: { x: values, y: values, extra: new Float64Array([30]) } },
      x: 'x',
      series: [{ y: 'y' }],
    });
    chart.appendData({
      columns: {
        extra: new Float64Array([31]),
        y: new Float64Array([20]),
        x: new Float64Array([2]),
      },
    });
    chart.update({ axes: { y: { title: 'Aliased originals' } } });
    expect(chart.getCursor({ fallback: 'latest' }).points[0]).toMatchObject({
      x: 2,
      y: 20,
    });
    expect(() =>
      chart.appendData({
        columns: {
          replacement: new Float64Array([32]),
          y: new Float64Array([30]),
          x: new Float64Array([3]),
        },
      }),
    ).toThrow(/same columns/);
    expect(chart.getCursor({ fallback: 'latest' }).points[0].y).toBe(20);
  });

  it('preserves category scatter encodings across appends, eviction and updates', () => {
    const chart = make({
      data: [
        { x: 5, y: 10, label: 'first' },
        { x: 1, y: 20, label: 'second' },
      ],
      x: 'x',
      series: [{ type: 'scatter', y: 'y', colorBy: 'label' }],
      streaming: { maxPoints: 2 },
    });
    chart.appendData([{ x: 3, y: 30, label: 'third' }]);
    chart.update({ axes: { y: { title: 'Scatter' } } });
    chart.appendData([{ x: 2, y: 40, label: 'first' }]);
    expect(chart.getCursor({ fallback: 'latest' }).points[0]).toMatchObject({
      rowIndex: 3,
      x: 2,
      y: 40,
    });
  });

  it('isolates and reports public plugin failures while completing validated updates', () => {
    const report = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const plugin = {
      id: 'throwing',
      install(): () => void {
        throw new Error('install');
      },
      drawAbove() {
        throw new Error('draw');
      },
    };
    const chart = make({ data: [{ x: 0, y: 1 }], x: 'x', series: [{ y: 'y' }], plugins: [plugin] });
    expect(() => chart.update({ data: [{ x: 1, y: 2 }] })).not.toThrow();
    expect(chart.getCursor({ fallback: 'latest' }).points[0].y).toBe(2);
    expect(() => chart.update({ data: [{ x: Infinity, y: 3 }] })).toThrow();
    expect(chart.getCursor({ fallback: 'latest' }).points[0].y).toBe(2);
    expect(() => chart.destroy()).not.toThrow();
    expect(report).toHaveBeenCalledWith(
      expect.stringMatching(/^snaplot: plugin "throwing" install/),
    );
  });

  it('resolves per-datum color callbacks against retained live row identity', () => {
    const rows = [
      { x: 2, y: 20 },
      { x: 1, y: 10 },
    ];
    const color = vi.fn(() => '#abcdef');
    const chart = make({
      data: rows,
      x: 'x',
      series: [{ type: 'bar', y: 'y', color }],
      streaming: { maxPoints: 2 },
    });
    const appended = { x: 3, y: 30 };
    chart.appendData([appended]);
    const draw = vi.mocked(requestAnimationFrame).mock.calls.at(-1)![0];
    draw(0);
    expect(color).toHaveBeenCalledWith(20, rows[0], 0);
    expect(color).toHaveBeenCalledWith(30, appended, 2);
    color.mockClear();
    chart.update({ axes: { y: { title: 'Updated' } } });
    vi.mocked(requestAnimationFrame).mock.calls.at(-1)![0](16);
    expect(color).toHaveBeenCalledWith(30, appended, 2);
  });

  it('gives newly declared series the retained shared source identities', () => {
    const chart = make({
      data: [{ x: 0, a: 1, b: 10 }],
      x: 'x',
      series: [{ y: 'a' }],
      streaming: { maxPoints: 2 },
    });
    chart.appendData([
      { x: 1, a: 2, b: 20 },
      { x: 2, a: 3, b: 30 },
    ]);
    chart.update({ series: [{ y: 'b' }, { y: 'a' }] });
    expect(
      chart
        .getCursor({ fallback: 'latest' })
        .points.map((point) => [point.seriesId, point.rowIndex, point.y]),
    ).toEqual([
      ['b', 2, 30],
      ['a', 2, 3],
    ]);
    chart.appendData([{ x: 3, a: 4, b: 40 }]);
    expect(chart.getCursor({ fallback: 'latest' }).points.map((point) => point.rowIndex)).toEqual([
      3, 3,
    ]);
  });

  it('gives custom tooltips public identity and preserves encoded fields and intervals', () => {
    const row = { x: 'One', y: 4, label: 'Control' };
    const render = vi.fn((_points: readonly ChartPoint<typeof row>[]) => 'custom');
    const chart = make({
      data: [row],
      x: 'x',
      series: [{ type: 'scatter', y: 'y', colorBy: 'label' }],
      tooltip: { render },
    });
    // A title is a layout change (plan D16): the engine takes new options, not new sources.
    const replace = vi.spyOn(ChartCore.prototype, 'replaceOptions');
    chart.update({ axes: { y: { title: 'Metric' } } });
    const tooltip = replace.mock.calls[0][0].tooltip!;
    tooltip.render!([
      {
        seriesIndex: 0,
        dataIndex: 0,
        label: 'y',
        x: 0,
        y: 4,
        formattedX: 'One',
        formattedY: '4',
        color: '#abcdef',
        radius: 3,
        xRange: { min: 0, max: 1 },
        fields: [{ label: 'label', value: 0, formatted: 'Control' }],
      },
    ]);
    expect(render.mock.calls[0][0][0]).toMatchObject({
      seriesId: 'y',
      rowIndex: 0,
      row,
      x: 'One',
      radius: 3,
      xRange: { min: 0, max: 1 },
      fields: [{ label: 'label', value: 'Control', formatted: 'Control' }],
    });
    expect(render.mock.calls[0][0][0]).not.toHaveProperty('seriesIndex');
    expect(render.mock.calls[0][0][0]).not.toHaveProperty('dataIndex');
  });

  it('rejects invalid axis and viewport bounds without committing replacement data', () => {
    const chart = make({
      data: [
        { x: 1, y: 1 },
        { x: 10, y: 10 },
      ],
      x: 'x',
      series: [{ y: 'y' }],
      axes: { x: { type: 'log' } },
    });
    const before = chart.getState();
    for (const bounds of [{ min: -1 }, { max: Infinity }, { min: 10, max: 1 }]) {
      expect(() => chart.update({ data: [{ x: 20, y: 20 }], axes: { x: bounds } })).toThrow();
      expect(chart.getCursor({ fallback: 'latest' }).points[0].y).toBe(10);
      expect(chart.getState()).toBe(before);
    }
    expect(() => chart.update({ viewport: { x: [0, 10] } })).toThrow();
    expect(chart.getState()).toBe(before);
  });

  it('keeps the state snapshot across cursor-only changes', () => {
    const chart = createChart(document.createElement('div'), {
      data: [{ x: 1, y: 10 }],
      x: 'x',
      series: [{ y: 'y' }],
      streaming: { maxPoints: 2 },
    });
    chart.appendData([{ x: 2, y: 20 }]);
    const snapshot = chart.getState();
    chart.setCursor(1);
    expect(chart.getState()).toBe(snapshot);
    chart.setCursor(2);
    expect(chart.getState()).toBe(snapshot);
    chart.setCursor(null);
    chart.appendData([{ x: 3, y: 30 }]);
    expect(chart.getCursor({ fallback: 'latest' }).points[0]).toMatchObject({ x: 3, y: 30 });
    expect(chart.getCursor({ fallback: 'first' }).points[0]).toMatchObject({ x: 2, y: 20 });
    chart.destroy();
  });

  it('starts an inherited stream from an empty declared series without lifecycle glue', () => {
    const chart = createChart<{ x: number; y: number }>(document.createElement('div'), {
      x: 'x',
      series: [{ y: 'y' }],
    });
    chart.appendData([{ x: 1, y: 2 }]);
    chart.update({ axes: { y: { title: 'Metric' } } });
    expect(chart.getCursor({ fallback: 'latest' }).points[0]).toMatchObject({
      x: 1,
      y: 2,
      rowIndex: 0,
    });
    chart.destroy();
  });
});
