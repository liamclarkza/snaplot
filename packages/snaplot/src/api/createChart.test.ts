// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChart, createChartGroup, reconcileChart, setChartControls } from './createChart';
import type { ChartHandle, ChartOptions, ChartPoint } from './types';
import { ChartCore } from '../core/Chart';

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
function make<Row>(options: ChartOptions<Row>): ChartHandle<Row> {
  const element = document.createElement('div');
  document.body.append(element);
  const chart = createChart(element, { width: 640, height: 360, autoResize: false, ...options });
  live.push(chart);
  return chart;
}

describe('public chart transactions', () => {
  it('accepts ordinary rows, keeps original identity after sorting and reports actual values', () => {
    const rows = [
      { id: 'b', time: 2, cpu: 20 },
      { id: 'a', time: 1, cpu: 10 },
    ];
    const chart = make({ data: rows, x: 'time', rowId: 'id', series: [{ y: 'cpu' }] });
    const point = chart.getCursorSnapshot({ fallback: 'first' }).points[0];
    expect(point).toMatchObject({ seriesId: 'cpu', rowId: 'a', rowIndex: 1, x: 1, y: 10 });
    expect(point.row).toBe(rows[1]);
    expect(rows[0].time).toBe(2);
  });

  it('atomically changes fields with data and rolls back a malformed next source', () => {
    type Row = { x: number; a?: number; b?: number };
    const chart = make<Row>({ data: [{ x: 1, a: 2 }], x: 'x', series: [{ y: 'a' }] });
    chart.update({ data: [{ x: 3, b: 4 }], series: [{ y: 'b' }] });
    expect(chart.getCursorSnapshot({ fallback: 'latest' }).points[0]).toMatchObject({
      seriesId: 'b',
      y: 4,
    });
    expect(() => chart.update({ data: [{ x: Infinity, b: 9 }] })).toThrow(/X|finite/);
    expect(chart.getCursorSnapshot({ fallback: 'latest' }).points[0]).toMatchObject({
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
    chart.setViewport({ x: { min: 2, max: 8 } });
    chart.setSeriesVisible('a', false);
    chart.setHighlight('b');
    chart.update({ series: [{ y: 'b' }, { y: 'a' }] });
    expect(chart.getState()).toMatchObject({
      hiddenSeries: ['a'],
      highlightedSeries: 'b',
      viewport: { x: { min: 2, max: 8 } },
    });
    const current = chart.getOptions();
    reconcileChart(chart, { ...current, series: [...current.series] });
    expect(chart.getState().viewport.x).toEqual({ min: 2, max: 8 });
  });

  it('resets explicitly undefined optional options and removes omitted declarative props', () => {
    const chart = make({
      data: [{ x: 1, y: 2 }],
      x: 'x',
      series: [{ y: 'y' }],
      axes: { y: { title: 'Value', min: 0 } },
    });
    chart.update({ axes: { y: { title: undefined } } });
    expect(chart.getOptions().axes?.y).toEqual({ min: 0 });
    reconcileChart(chart, { data: [{ x: 1, y: 2 }], x: 'x', series: [{ y: 'y' }] });
    expect(chart.getOptions().axes).toBeUndefined();
  });

  it('keeps category order across replacements and rejects unknown explicit categories', () => {
    const chart = make({
      data: [
        { x: 'B', y: 2 },
        { x: 'A', y: 1 },
      ],
      x: 'x',
      series: [{ y: 'y', type: 'bar' }],
    });
    expect(chart.getAxis('x')?.type).toBe('category');
    chart.update({
      data: [
        { x: 'A', y: 3 },
        { x: 'C', y: 4 },
      ],
    });
    const first = chart.getCursorSnapshot({ fallback: 'first' }).points[0];
    expect(first.x).toBe('A');
    expect(chart.getAxis('x')).toMatchObject({ min: -0.5, max: 2.5 });
    expect(() => chart.update({ axes: { x: { categories: ['A'] } } })).toThrow(/unknown|category/i);
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
    expect(
      chart.getCursorSnapshot().points.map((point) => [point.seriesId, point.x, point.y]),
    ).toEqual([
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
    const latest = chart.getCursorSnapshot({ fallback: 'latest' }).points;
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
      chart.getCursorSnapshot({ fallback: 'latest' }).points.find((point) => point.seriesId === 'a')
        ?.y,
    ).toBe(20);
  });

  it('rejects unordered streaming batches before changing any source', () => {
    const chart = make({ data: [{ x: 2, y: 5 }], x: 'x', series: [{ y: 'y' }] });
    expect(() => chart.appendData([{ x: 1, y: 6 }])).toThrow(/ordered/);
    expect(chart.getCursorSnapshot({ fallback: 'latest' }).points[0].y).toBe(5);
  });

  it('proposes controlled changes without committing or broadcasting them', () => {
    const chart = make({
      data: [
        { x: 0, y: 1 },
        { x: 10, y: 2 },
      ],
      x: 'x',
      series: [{ y: 'y' }],
    });
    const viewport = { x: { min: 0, max: 10 } };
    const changed = vi.fn();
    const hidden = vi.fn();
    setChartControls(chart, {
      viewport,
      hiddenSeries: [],
      onViewportChange: changed,
      onHiddenSeriesChange: hidden,
    });
    chart.setViewport({ x: { min: 2, max: 8 } });
    chart.setSeriesVisible('y', false);
    expect(chart.getState().viewport.x).toEqual(viewport.x);
    expect(chart.getState().hiddenSeries).toEqual([]);
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ x: { min: 2, max: 8 } }));
    expect(hidden).toHaveBeenLastCalledWith(['y']);
  });

  it('retains unchanged plugin instances and gives them the public handle', () => {
    const install = vi.fn();
    const destroy = vi.fn();
    const plugin = { id: 'custom', install, destroy };
    const chart = make({ data: [{ x: 1, y: 2 }], x: 'x', series: [{ y: 'y' }], plugins: [plugin] });
    expect(install).toHaveBeenCalledExactlyOnceWith(chart);
    chart.update({ referenceLines: [{ axis: 'y', value: 4 }] });
    expect(destroy).not.toHaveBeenCalled();
    chart.destroy();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('synchronizes identity across reordered series and disconnects destroyed groups', () => {
    const group = createChartGroup();
    const data = [{ x: 1, a: 2, b: 3 }];
    const first = make({ data, x: 'x', group, series: [{ y: 'a' }, { y: 'b' }] });
    const second = make({ data, x: 'x', group, series: [{ y: 'b' }, { y: 'a' }] });
    first.setHighlight('b');
    expect(second.getState().highlightedSeries).toBe('b');
    group.destroy();
    first.setHighlight('a');
    expect(second.getState().highlightedSeries).toBe('b');
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
      reconcileChart(chart, { ...options, axes: { y: { title } } });
      expect(
        chart
          .getCursorSnapshot({ fallback: 'latest' })
          .points.map((point) => [point.rowIndex, point.y]),
      ).toEqual([
        [2, 2],
        [2, 102],
      ]);
    }
    chart.appendData([{ x: 3, a: 3, b: 103 }]);
    chart.update({ axes: { y: { title: 'Third' } } });
    expect(
      chart
        .getCursorSnapshot({ fallback: 'first' })
        .points.map((point) => [point.rowIndex, point.y]),
    ).toEqual([
      [2, 2],
      [2, 102],
    ]);
    expect(
      chart
        .getCursorSnapshot({ fallback: 'latest' })
        .points.map((point) => [point.rowIndex, point.y]),
    ).toEqual([
      [3, 3],
      [3, 103],
    ]);
    chart.update({ data });
    expect(
      chart
        .getCursorSnapshot({ fallback: 'latest' })
        .points.map((point) => [point.rowIndex, point.y]),
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
    reconcileChart(chart, { ...options, axes: { y: { title: 'Loss' } } });
    expect(chart.getCursorSnapshot({ fallback: 'first' }).points[0]).toMatchObject({
      rowIndex: 0,
      x: 2,
      y: 20,
    });
    expect(chart.getCursorSnapshot({ fallback: 'first' }).points[0].row).toBe(rows[0]);
    chart.appendData([{ x: 3, y: 35 }], { seriesId: 'run', updateLast: true });
    reconcileChart(chart, { ...options, axes: { y: { title: 'Loss again' } } });
    expect(chart.getCursorSnapshot({ fallback: 'latest' }).points[0]).toMatchObject({
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
    for (const title of ['One', 'Two'])
      reconcileChart(chart, { ...options, axes: { y: { title } } });
    expect(chart.getCursorSnapshot({ fallback: 'latest' }).points[0]).toMatchObject({
      rowIndex: 2,
      y: 12,
    });
    chart.appendData({ columns: { x: new Float64Array([3]), y: new Float64Array([13]) } });
    expect(chart.getCursorSnapshot({ fallback: 'latest' }).points[0]).toMatchObject({
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
    expect(chart.getCursorSnapshot({ fallback: 'latest' }).points[0]).toMatchObject({
      x: 'C',
      formattedX: 'C',
      y: 3,
    });
    expect(chart.getAxis('x')).toMatchObject({ min: -0.5, max: 2.5 });
    expect(() => chart.appendData([{ x: 'C', y: 9 }])).toThrow(/duplicate category/);
    expect(chart.getCursorSnapshot({ fallback: 'latest' }).points[0].y).toBe(3);
    chart.appendData([{ x: 'C', y: 4 }], { updateLast: true });
    expect(chart.getCursorSnapshot({ fallback: 'latest' }).points[0]).toMatchObject({
      rowIndex: 2,
      y: 4,
    });
    chart.update({ axes: { y: { title: 'Counts' } } });
    expect(chart.getCursorSnapshot({ fallback: 'latest' }).points[0].x).toBe('C');
  });

  it('rejects invalid controlled snapshots before changing chart data or options', () => {
    const options: ChartOptions<{ x: number; y: number }> = {
      data: [{ x: 0, y: 1 }],
      x: 'x',
      series: [{ y: 'y' }],
    };
    const chart = make(options);
    expect(() =>
      reconcileChart(chart, { ...options, data: [{ x: 2, y: 3 }] }, { hiddenSeries: ['missing'] }),
    ).toThrow(/unknown hidden/);
    expect(chart.getCursorSnapshot({ fallback: 'latest' }).points[0].y).toBe(1);
    expect(() => setChartControls(chart, { viewport: { x: { min: 1, max: 0 } } })).toThrow(
      /min < max/,
    );
    chart.setViewport({ x: { min: 0, max: 5 } });
    expect(chart.getState().viewport.x).toEqual({ min: 0, max: 5 });
  });

  it('freezes cached cursor snapshots without freezing caller-owned rows or metadata', () => {
    const row = { x: 1, y: 2 };
    const meta = { experiment: 'one' };
    const chart = make({ data: [row], x: 'x', series: [{ y: 'y', meta }] });
    chart.setCursor(1);
    const state = chart.getState();
    expect(chart.getState()).toBe(state);
    expect(Object.isFrozen(state.cursor)).toBe(true);
    expect(Object.isFrozen(state.cursor.points)).toBe(true);
    expect(Object.isFrozen(state.cursor.points[0])).toBe(true);
    expect(state.cursor.points[0].row).toBe(row);
    expect(Object.isFrozen(row)).toBe(false);
    expect(Object.isFrozen(meta)).toBe(false);
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
      axes: { y: { rangePadding: 0, roundBounds: false } },
    };
    const secondOptions = {
      ...firstOptions,
      data: [
        { x: 0, y: 100 },
        { x: 1, y: 200 },
      ],
      padding: { left: 100 },
    };
    const first = make({ ...firstOptions, group });
    const second = make({ ...secondOptions, group });
    expect(first.getAxis('y')).toMatchObject({ min: 1, max: 200 });
    first.update({ group: undefined });
    expect(first.getAxis('y')).toMatchObject({ min: 1, max: 3 });
    expect(second.getAxis('y')).toMatchObject({ min: 100, max: 200 });
    expect(first.getLayout().plot.left).toBeLessThan(second.getLayout().plot.left);
    first.update({ group });
    group.destroy();
    expect(first.getAxis('y')).toMatchObject({ min: 1, max: 3 });
    expect(second.getAxis('y')).toMatchObject({ min: 100, max: 200 });
    first.update({
      data: [
        { x: 0, y: 5 },
        { x: 1, y: 10 },
      ],
    });
    expect(first.getCursorSnapshot({ fallback: 'latest' }).points[0].y).toBe(10);
    expect(second.getAxis('y')).toMatchObject({ min: 100, max: 200 });
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
    expect(chart.getCursorSnapshot({ fallback: 'latest' }).points[0]).toMatchObject({
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
    ).toThrow(/schema/);
    expect(chart.getCursorSnapshot({ fallback: 'latest' }).points[0].y).toBe(20);
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
    expect(chart.getCursorSnapshot({ fallback: 'latest' }).points[0]).toMatchObject({
      rowIndex: 3,
      x: 2,
      y: 40,
    });
  });

  it('isolates and reports public plugin failures while completing validated updates', () => {
    const report = vi.spyOn(console, 'error').mockImplementation(() => {});
    const plugin = {
      id: 'throwing',
      install() {
        throw new Error('install');
      },
      onOptionsUpdate() {
        throw new Error('options');
      },
      onDataUpdate() {
        throw new Error('data');
      },
      destroy() {
        throw new Error('destroy');
      },
    };
    const chart = make({ data: [{ x: 0, y: 1 }], x: 'x', series: [{ y: 'y' }], plugins: [plugin] });
    expect(() => chart.update({ data: [{ x: 1, y: 2 }] })).not.toThrow();
    expect(chart.getCursorSnapshot({ fallback: 'latest' }).points[0].y).toBe(2);
    expect(() => chart.update({ data: [{ x: Infinity, y: 3 }] })).toThrow();
    expect(chart.getCursorSnapshot({ fallback: 'latest' }).points[0].y).toBe(2);
    expect(() => chart.destroy()).not.toThrow();
    expect(report).toHaveBeenCalledWith(
      expect.stringContaining('plugin "throwing"'),
      expect.any(Error),
    );
  });

  it('resolves per-datum fill callbacks against retained live row identity', () => {
    const rows = [
      { x: 2, y: 20 },
      { x: 1, y: 10 },
    ];
    const fill = vi.fn(() => '#abcdef');
    const chart = make({
      data: rows,
      x: 'x',
      series: [{ type: 'bar', y: 'y', fill }],
      streaming: { maxPoints: 2 },
    });
    const appended = { x: 3, y: 30 };
    chart.appendData([appended]);
    const draw = vi.mocked(requestAnimationFrame).mock.calls.at(-1)![0];
    draw(0);
    expect(fill).toHaveBeenCalledWith(20, 0, rows[0]);
    expect(fill).toHaveBeenCalledWith(30, 2, appended);
    fill.mockClear();
    chart.update({ axes: { y: { title: 'Updated' } } });
    vi.mocked(requestAnimationFrame).mock.calls.at(-1)![0](16);
    expect(fill).toHaveBeenCalledWith(30, 2, appended);
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
        .getCursorSnapshot({ fallback: 'latest' })
        .points.map((point) => [point.seriesId, point.rowIndex, point.y]),
    ).toEqual([
      ['b', 2, 30],
      ['a', 2, 3],
    ]);
    chart.appendData([{ x: 3, a: 4, b: 40 }]);
    expect(
      chart.getCursorSnapshot({ fallback: 'latest' }).points.map((point) => point.rowIndex),
    ).toEqual([3, 3]);
  });

  it('gives custom tooltips public identity and preserves encoded fields and intervals', () => {
    const row = { x: 'One', y: 4, label: 'Control' };
    const render = vi.fn((_points: readonly ChartPoint<typeof row>[]) => 'custom');
    const xFormat = vi.fn((value: number | string) => `Category ${value}`);
    const chart = make({
      data: [row],
      x: 'x',
      series: [{ type: 'scatter', y: 'y', colorBy: 'label' }],
      tooltip: { render, xFormat },
    });
    const replace = vi.spyOn(ChartCore.prototype, 'replaceSources');
    chart.update({ axes: { y: { title: 'Metric' } } });
    const tooltip = replace.mock.calls[0][0].tooltip!;
    expect(tooltip.xFormat!(0)).toBe('Category One');
    expect(xFormat).toHaveBeenCalledWith('One');
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

  it('retains public beforeDraw cancellation through the plugin bridge', () => {
    const fill = vi.fn(() => '#abcdef');
    let cancelled = true;
    const chart = make({
      data: [{ x: 0, y: 1 }],
      x: 'x',
      series: [{ type: 'bar', y: 'y', fill }],
      plugins: [{ id: 'cancel', beforeDraw: () => (cancelled ? false : undefined) }],
    });
    fill.mockClear();
    vi.mocked(requestAnimationFrame).mock.calls.at(-1)![0](0);
    expect(fill).not.toHaveBeenCalled();
    cancelled = false;
    chart.redraw();
    vi.mocked(requestAnimationFrame).mock.calls.at(-1)![0](16);
    expect(fill).toHaveBeenCalled();
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
      expect(chart.getCursorSnapshot({ fallback: 'latest' }).points[0].y).toBe(10);
      expect(chart.getState()).toBe(before);
    }
    expect(() => chart.setViewport({ x: { min: 0, max: 10 } })).toThrow();
    expect(chart.getState()).toBe(before);
  });

  it('reuses retained options snapshots during cursor-only legend updates', () => {
    const chart = createChart(document.createElement('div'), {
      data: [{ x: 1, y: 10 }],
      x: 'x',
      series: [{ y: 'y' }],
      streaming: { maxPoints: 2 },
    });
    chart.appendData([{ x: 2, y: 20 }]);
    const snapshot = chart.getOptions();
    chart.setCursor(1);
    expect(chart.getOptions()).toBe(snapshot);
    chart.setCursor(2);
    expect(chart.getOptions()).toBe(snapshot);
    chart.appendData([{ x: 3, y: 30 }]);
    expect(chart.getOptions()).not.toBe(snapshot);
    expect(chart.getOptions().data).toEqual([
      { x: 2, y: 20 },
      { x: 3, y: 30 },
    ]);
    chart.destroy();
  });

  it('starts an inherited stream from an empty declared series without lifecycle glue', () => {
    const chart = createChart<{ x: number; y: number }>(document.createElement('div'), {
      x: 'x',
      series: [{ y: 'y' }],
    });
    chart.appendData([{ x: 1, y: 2 }]);
    chart.update({ axes: { y: { title: 'Metric' } } });
    expect(chart.getCursorSnapshot({ fallback: 'latest' }).points[0]).toMatchObject({
      x: 1,
      y: 2,
      rowIndex: 0,
    });
    chart.destroy();
  });
});
