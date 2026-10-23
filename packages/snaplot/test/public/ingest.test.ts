// @vitest-environment jsdom
// Ingest (plan D23, §3.4 "zero-copy typed columns", RC1, RC9, RC15): a source
// is rows or typed columns. Rows are stable-sorted by X with their identity
// kept; typed columns are read in place with one X pass; a sorted scatter keeps
// X order so it can be culled; appends are validated before anything changes.
// Public API, the shared fakes and debug() only.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChartHandle } from '../../src/index';
import { debug, type Fakes, installFakes } from '../fakes';

let fakes: Fakes;
beforeEach(() => {
  fakes = installFakes();
});
afterEach(() => {
  fakes.uninstall();
  vi.restoreAllMocks();
});

type Loose = Record<string, unknown>;
function mount(options: Loose, size?: { width?: number; height?: number }): ChartHandle<any> {
  return fakes.mount(options as never, size);
}

/** Counters the debug symbol gains in M7 (plan D31: the owner adds the counter with the path). */
const counters = (chart: ChartHandle<any>) => debug(chart) as unknown as { xValidations?: number };

const latest = (chart: ChartHandle<any>) =>
  chart.getCursorSnapshot({ fallback: 'latest' }).points[0];
const first = (chart: ChartHandle<any>) => chart.getCursorSnapshot({ fallback: 'first' }).points[0];

function columns(n: number, x: (i: number) => number = (i) => i) {
  return {
    x: Float64Array.from({ length: n }, (_, i) => x(i)),
    y: Float64Array.from({ length: n }, (_, i) => (i * 7919) % 1000),
  };
}

function thrown(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return (error as Error).message;
  }
  return '';
}

describe('[arch-05] typed columns are zero-copy', () => {
  it('[arch-05] the chart reads the caller’s buffers in place', () => {
    const data = columns(10);
    const chart = mount({ data: { columns: data }, x: 'x', series: [{ y: 'y' }] });
    data.y[9] = 4242;
    expect(latest(chart).y).toBe(4242);
  });

  it('[arch-05] X is validated in one pass per source', () => {
    const shared = mount({ data: { columns: columns(100) }, x: 'x', series: [{ y: 'y' }] });
    expect(counters(shared).xValidations).toBe(1);
    const two = mount({
      data: { columns: { ...columns(100), z: new Float64Array(100) } },
      x: 'x',
      series: [{ y: 'y' }, { y: 'z' }, { id: 'own', data: { columns: columns(50) }, y: 'y' }],
    });
    expect(counters(two).xValidations).toBe(2);
    two.update({ data: { columns: { ...columns(100), z: new Float64Array(100) } } });
    expect(counters(two).xValidations).toBe(4);
  });

  it('[arch-05] an append validates only the appended X values', () => {
    const chart = mount({ data: { columns: columns(1000) }, x: 'x', series: [{ y: 'y' }] });
    const before = counters(chart).xValidations ?? Number.NaN;
    chart.appendData({ columns: { x: Float64Array.of(1000, 1001), y: Float64Array.of(1, 2) } });
    expect(counters(chart).xValidations).toBe(before + 1);
  });
});

describe('row sources are sorted for you, with their identity kept', () => {
  it('newest-first rows render in ascending X and rowIds still map', () => {
    const rows = [
      { id: 'c', t: 3, v: 30 },
      { id: 'b', t: 2, v: 20 },
      { id: 'a', t: 1, v: 10 },
    ];
    const chart = mount({ data: rows, x: 't', rowId: 'id', series: [{ y: 'v' }] });
    expect(first(chart)).toMatchObject({ x: 1, y: 10, rowId: 'a', rowIndex: 2 });
    expect(first(chart).row).toBe(rows[2]);
    expect(latest(chart)).toMatchObject({ x: 3, y: 30, rowId: 'c', rowIndex: 0 });
  });

  it('equal X values keep their input order (stable sort)', () => {
    const rows = [
      { t: 2, v: 1 },
      { t: 1, v: 2 },
      { t: 2, v: 3 },
    ];
    const chart = mount({ data: rows, x: 't', series: [{ y: 'v' }] });
    expect(latest(chart)).toMatchObject({ x: 2, y: 3, rowIndex: 2 });
  });
});

describe('[arch-06:ingest][gap-perf-gate-01:storage] sorted scatter keeps X order', () => {
  /** Points drawn during a gesture over 10 % of X, over min(in view, max(400, 1.5 × plot width)). */
  function fidelity(x: (i: number) => number): number {
    const n = 20_000;
    const chart = mount({
      data: { columns: columns(n, x) },
      x: 'x',
      series: [{ type: 'scatter', y: 'y' }],
    });
    fakes.frames.flush();
    chart.setViewport({ x: { min: 0, max: n / 10 } });
    fakes.frames.flush();
    const { drawnPoints, inViewPoints } = debug(chart);
    const budget = Math.max(400, 1.5 * chart.getLayout().plot.width);
    return drawnPoints / Math.min(inViewPoints, budget);
  }

  it('[arch-06:ingest][gap-perf-gate-01:storage] a sorted scatter source is culled by X during a gesture', () => {
    expect(fidelity((i) => i)).toBe(1);
  });

  it('an unsorted scatter source is accepted and keeps its row order (control)', () => {
    const data = { x: Float64Array.of(5, 1, 3), y: Float64Array.of(50, 10, 30) };
    const chart = mount({
      data: { columns: data, rowIds: ['e', 'a', 'c'] },
      x: 'x',
      series: [{ type: 'scatter', y: 'y' }],
    });
    expect(first(chart)).toMatchObject({ x: 5, rowId: 'e', rowIndex: 0 });
  });
});

describe('appends are validated before anything changes', () => {
  it('[dataapi-20] an append before the last retained X throws in public words and changes nothing', () => {
    const chart = mount({
      data: [
        { t: 1, v: 1 },
        { t: 2, v: 2 },
      ],
      x: 't',
      series: [{ y: 'v' }],
    });
    const message = thrown(() => chart.appendData([{ t: 1.5, v: 9 }]));
    expect(message).toMatch(/^snaplot: /);
    expect(message).toMatch(/before the last/);
    expect(latest(chart)).toMatchObject({ x: 2, y: 2 });
  });

  it('[dataapi-03] duplicate rowIds inside one batch throw before any mutation', () => {
    const chart = mount({
      data: [{ id: 'a', t: 1, v: 1 }],
      x: 't',
      rowId: 'id',
      series: [{ y: 'v' }],
    });
    const message = thrown(() =>
      chart.appendData([
        { id: 'b', t: 2, v: 2 },
        { id: 'b', t: 3, v: 3 },
      ]),
    );
    expect(message).toMatch(/^snaplot: .*rowId/);
    expect(latest(chart)).toMatchObject({ x: 1, rowId: 'a' });
  });

  it('[dataapi-03] a rowId may return once its row has left the window', () => {
    const chart = mount({
      data: [{ id: 'a', t: 1, v: 1 }],
      x: 't',
      rowId: 'id',
      series: [{ y: 'v' }],
      streaming: { maxPoints: 2 },
    });
    chart.appendData([{ id: 'b', t: 2, v: 2 }]);
    chart.appendData([{ id: 'c', t: 3, v: 3 }]);
    expect(() => chart.appendData([{ id: 'a', t: 4, v: 4 }])).not.toThrow();
    expect(latest(chart)).toMatchObject({ x: 4, rowId: 'a' });
    expect(() => chart.appendData([{ id: 'c', t: 5, v: 5 }])).toThrow(/rowId/);
  });

  it('[dataapi-03] a row batch without rowId values on a source that has them throws', () => {
    const chart = mount({
      data: [{ id: 'a', t: 1, v: 1 }],
      x: 't',
      rowId: 'id',
      series: [{ y: 'v' }],
    });
    expect(() => chart.appendData([{ t: 2, v: 2 }])).toThrow(/^snaplot: .*rowId/);
    expect(latest(chart)).toMatchObject({ x: 1 });
  });

  it('rows and { columns } cannot be mixed in one source', () => {
    const rows = mount({ data: [{ x: 1, y: 1 }], x: 'x', series: [{ y: 'y' }] });
    expect(thrown(() => rows.appendData({ columns: columns(1, () => 2) }))).toMatch(
      /^snaplot: .*this data is rows, so append rows/,
    );
    const typed = mount({ data: { columns: columns(2) }, x: 'x', series: [{ y: 'y' }] });
    expect(thrown(() => typed.appendData([{ x: 5, y: 5 }]))).toMatch(
      /^snaplot: .*this data is \{ columns \}, so append \{ columns \}/,
    );
    expect(latest(typed)).toMatchObject({ x: 1 });
  });

  it('a row batch is sorted by X before it is appended', () => {
    const chart = mount({ data: [{ x: 1, y: 1 }], x: 'x', series: [{ y: 'y' }] });
    chart.appendData([
      { x: 4, y: 4 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ]);
    expect(latest(chart)).toMatchObject({ x: 4, y: 4, rowIndex: 1 });
    chart.setCursor(2);
    expect(chart.getCursorSnapshot().points[0]).toMatchObject({ x: 2, y: 2, rowIndex: 2 });
  });

  it('a sorted scatter source takes an append before its last X and keeps every point', () => {
    const chart = mount({
      data: [
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ],
      x: 'x',
      series: [{ type: 'scatter', y: 'y' }],
    });
    chart.appendData([{ x: 0, y: 9 }]);
    expect(latest(chart)).toMatchObject({ x: 0, y: 9, rowIndex: 2 });
    chart.update({ axes: { y: { title: 'Kept' } } });
    expect(latest(chart)).toMatchObject({ x: 0, y: 9, rowIndex: 2 });
  });
});
