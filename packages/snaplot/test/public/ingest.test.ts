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
  it('[dataapi-03] typed columns read appended row ids from the rowId column', () => {
    const chart = mount({
      data: {
        columns: {
          t: Float64Array.of(0, 1),
          v: Float64Array.of(1, 2),
          id: Float64Array.of(10, 11),
        },
      },
      x: 't',
      rowId: 'id',
      series: [{ y: 'v' }],
    });
    const batch = (t: number, id: number) => ({
      columns: { t: Float64Array.of(t), v: Float64Array.of(t + 1), id: Float64Array.of(id) },
    });
    chart.appendData(batch(2, 12));
    expect(latest(chart)).toMatchObject({ x: 2, y: 3, rowId: 12 });
    expect(thrown(() => chart.appendData(batch(3, 11)))).toMatch(
      /^snaplot: .*rowId 11 is already in the chart/,
    );
    // The ids come from one place: rowIds beside the id column would disagree with it.
    expect(thrown(() => chart.appendData({ ...batch(3, 13), rowIds: [99] }))).toMatch(
      /^snaplot: .*row ids come from column "id"/,
    );
    expect(latest(chart)).toMatchObject({ x: 2, rowId: 12 });
    // An update re-reads the retained columns, ids included, and appends keep using the column.
    chart.update({ axes: { y: { title: 'Kept' } } });
    expect(thrown(() => chart.appendData(batch(3, 12)))).toMatch(/rowId 12 is already/);
    chart.appendData(batch(3, 13));
    expect(latest(chart)).toMatchObject({ x: 3, rowId: 13 });
  });

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

  // A bar series holds one bar per category. An append that repeats a category throws at the
  // append, so a later update() never inherits a source it would reject (the dataapi-03 crash).
  it('[dataapi-03] a bar append that repeats a category throws and changes nothing', () => {
    const bars = () =>
      mount({
        data: [
          { m: 'A', v: 1 },
          { m: 'B', v: 2 },
        ],
        x: 'm',
        series: [{ type: 'bar', y: 'v' }],
      });
    const cases: Array<[Record<string, unknown>[], { updateLast?: boolean }]> = [
      // A new category twice, an earlier one twice, and the latest bar twice by updateLast.
      [
        [
          { m: 'D', v: 3 },
          { m: 'D', v: 4 },
        ],
        {},
      ],
      [
        [
          { m: 'C', v: 3 },
          { m: 'C', v: 4 },
        ],
        {},
      ],
      [
        [
          { m: 'B', v: 3 },
          { m: 'B', v: 4 },
        ],
        { updateLast: true },
      ],
      // The latest bar again without updateLast.
      [[{ m: 'B', v: 3 }], {}],
    ];
    for (const [batch, options] of cases) {
      const chart = bars();
      expect(thrown(() => chart.appendData(batch, options))).toMatch(
        /^snaplot: appendData\(\) to series "v": bar series "v" has the same category twice/,
      );
      expect(chart.getAxis('x')).toMatchObject({ min: -0.5, max: 1.5 });
      expect(latest(chart)).toMatchObject({ x: 'B', y: 2 });
      expect(() => chart.update({ axes: { y: { title: 'Load' } } })).not.toThrow();
      chart.appendData([{ m: 'E', v: 5 }]);
      expect(latest(chart)).toMatchObject({ x: 'E', y: 5 });
      expect(() => chart.update({ axes: { y: { title: 'Load 2' } } })).not.toThrow();
    }
    // Control: updateLast corrects the latest bar.
    const chart = bars();
    chart.appendData([{ m: 'B', v: 7 }], { updateLast: true });
    expect(latest(chart)).toMatchObject({ x: 'B', y: 7 });
    expect(() => chart.update({ axes: { y: { title: 'Load' } } })).not.toThrow();
  });

  // rowId is an accessor like y (D16): an update re-reads it over the retained rows.
  const keyed = () =>
    mount({
      data: [
        { x: 0, y: 1, id: 'a', key: 'A' },
        { x: 1, y: 2, id: 'b', key: 'B' },
      ],
      x: 'x',
      rowId: 'id',
      series: [{ y: 'y' }],
    });

  it('[dataapi-02][dataapi-03] removing rowId from a streamed row source drops its ids', () => {
    const chart = keyed();
    chart.appendData([{ x: 2, y: 3, id: 'c', key: 'C' }]);
    chart.update({ rowId: undefined });
    expect(latest(chart)).toMatchObject({ x: 2, rowIndex: 2 });
    expect(latest(chart).rowId).toBeUndefined();
    expect(() => chart.appendData([{ x: 3, y: 4, id: 'd', key: 'D' }])).not.toThrow();
    expect(latest(chart)).toMatchObject({ x: 3, rowIndex: 3 });
    expect(latest(chart).rowId).toBeUndefined();
  });

  it('[dataapi-02][dataapi-03] changing rowId on a streamed row source reads every id again', () => {
    const chart = keyed();
    chart.appendData([{ x: 2, y: 3, id: 'c', key: 'C' }]);
    chart.update({ rowId: 'key' });
    expect(first(chart)).toMatchObject({ x: 0, rowId: 'A' });
    expect(latest(chart)).toMatchObject({ x: 2, rowId: 'C' });
    chart.appendData([{ x: 3, y: 4, id: 'd', key: 'D' }]);
    expect(latest(chart)).toMatchObject({ x: 3, rowId: 'D' });
    // Ids are unique under the new field: 'A' is taken, the old id 'a' is not an id any more.
    expect(thrown(() => chart.appendData([{ x: 4, y: 5, id: 'e', key: 'A' }]))).toMatch(
      /rowId "A" is already in the chart/,
    );
    chart.appendData([{ x: 4, y: 5, id: 'f', key: 'a' }]);
    expect(latest(chart)).toMatchObject({ x: 4, rowId: 'a' });
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

  // A batch is taken whole whatever its size: the engine and the retained rows and ids grow
  // together, so an update() re-ingests every appended point (D23).
  const BIG = 200_000;
  it('[dataapi-03] an append of 200,000 rows keeps every row through an update', () => {
    const chart = mount({ data: [{ t: 0, v: 0 }], x: 't', series: [{ y: 'v' }] });
    const batch = Array.from({ length: BIG }, (_, i) => ({ t: i + 1, v: i }));
    chart.appendData(batch);
    expect(latest(chart)).toMatchObject({ x: BIG, y: BIG - 1, rowIndex: BIG });
    expect(latest(chart).row).toBe(batch[BIG - 1]);
    chart.update({ axes: { y: { title: 'Kept' } } });
    expect(latest(chart)).toMatchObject({ x: BIG, y: BIG - 1, rowIndex: BIG });
    expect(latest(chart).row).toBe(batch[BIG - 1]);
    chart.appendData([{ t: BIG + 1, v: 1 }]);
    expect(latest(chart)).toMatchObject({ x: BIG + 1, rowIndex: BIG + 1 });
  });

  it('[dataapi-03] an append of 200,000 rows with row ids keeps every id through an update', () => {
    const chart = mount({
      data: [{ id: 'a', t: 0, v: 0 }],
      x: 't',
      rowId: 'id',
      series: [{ y: 'v' }],
    });
    const batch = Array.from({ length: BIG }, (_, i) => ({ id: `r${i}`, t: i + 1, v: i }));
    chart.appendData(batch);
    expect(latest(chart)).toMatchObject({ x: BIG, rowIndex: BIG, rowId: `r${BIG - 1}` });
    expect(latest(chart).row).toBe(batch[BIG - 1]);
    chart.update({ axes: { y: { title: 'Kept' } } });
    expect(latest(chart)).toMatchObject({ x: BIG, rowIndex: BIG, rowId: `r${BIG - 1}` });
    expect(latest(chart).row).toBe(batch[BIG - 1]);
    // The appended ids are in the window: a repeat still throws.
    expect(thrown(() => chart.appendData([{ id: 'r7', t: BIG + 1, v: 1 }]))).toMatch(
      /rowId "r7" is already in the chart/,
    );
  });

  it('[dataapi-03] an append of 200,000 { columns, rowIds } keeps every id through an update', () => {
    const chart = mount({
      data: { columns: { t: Float64Array.of(0), v: Float64Array.of(0) }, rowIds: ['a'] },
      x: 't',
      series: [{ y: 'v' }],
    });
    chart.appendData({
      columns: {
        t: Float64Array.from({ length: BIG }, (_, i) => i + 1),
        v: Float64Array.from({ length: BIG }, (_, i) => i),
      },
      rowIds: Array.from({ length: BIG }, (_, i) => `r${i}`),
    });
    expect(latest(chart)).toMatchObject({ x: BIG, y: BIG - 1, rowId: `r${BIG - 1}` });
    chart.update({ axes: { y: { title: 'Kept' } } });
    expect(latest(chart)).toMatchObject({ x: BIG, y: BIG - 1, rowId: `r${BIG - 1}` });
    expect(
      thrown(() =>
        chart.appendData({
          columns: { t: Float64Array.of(BIG + 1), v: Float64Array.of(1) },
          rowIds: ['r7'],
        }),
      ),
    ).toMatch(/rowId "r7" is already in the chart/);
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

  // The forming-bucket pattern AppendOptions.updateLast documents, started from empty data:
  // the first updateLast has no row to replace, so it appends, and indices stay 0, 1, 2.
  const bucket = [
    [{ x: 0, y: 1, id: 'b0' }],
    [{ x: 0, y: 2, id: 'b0' }],
    [
      { x: 0, y: 3, id: 'b0' },
      { x: 1, y: 1, id: 'b1' },
    ],
    [
      { x: 1, y: 5, id: 'b1' },
      { x: 2, y: 1, id: 'b2' },
    ],
  ];
  const at = (chart: ChartHandle<any>, x: number) => {
    chart.setCursor(x);
    return chart.getCursorSnapshot().points[0];
  };
  const formed = [
    { x: 0, y: 3, rowIndex: 0, rowId: 'b0' },
    { x: 1, y: 5, rowIndex: 1, rowId: 'b1' },
    { x: 2, y: 1, rowIndex: 2, rowId: 'b2' },
  ];

  it('[dataapi-03] updateLast on empty data keeps original row indices', () => {
    const chart = mount({ data: [], x: 'x', rowId: 'id', series: [{ y: 'y' }] });
    for (const batch of bucket) chart.appendData(batch, { updateLast: true });
    expect([0, 1, 2].map((x) => at(chart, x))).toMatchObject(formed);
    expect([0, 1, 2].map((x) => at(chart, x).row)).toEqual([bucket[2][0], ...bucket[3]]);
    chart.update({ axes: { y: { title: 'Kept' } } });
    expect([0, 1, 2].map((x) => at(chart, x))).toMatchObject(formed);
    chart.appendData([{ x: 3, y: 1, id: 'b3' }]);
    expect(at(chart, 3)).toMatchObject({ x: 3, rowIndex: 3, rowId: 'b3' });
  });

  it('[dataapi-03] updateLast on empty { columns, rowIds } keeps original row indices', () => {
    const empty = { x: new Float64Array(0), y: new Float64Array(0) };
    const chart = mount({ data: { columns: empty, rowIds: [] }, x: 'x', series: [{ y: 'y' }] });
    for (const batch of bucket)
      chart.appendData(
        {
          columns: {
            x: Float64Array.from(batch, (row) => row.x),
            y: Float64Array.from(batch, (row) => row.y),
          },
          rowIds: batch.map((row) => row.id),
        },
        { updateLast: true },
      );
    expect([0, 1, 2].map((x) => at(chart, x))).toMatchObject(formed);
    chart.update({ axes: { y: { title: 'Kept' } } });
    expect([0, 1, 2].map((x) => at(chart, x))).toMatchObject(formed);
    chart.appendData({ columns: { x: Float64Array.of(3), y: Float64Array.of(1) }, rowIds: ['b3'] });
    expect(at(chart, 3)).toMatchObject({ x: 3, rowIndex: 3, rowId: 'b3' });
  });
});

// Streaming keeps to the layered canvases (plan §3.4): an append repaints the data layer, and
// the grid and overlay only when the axes or the series change.
describe('[gap-scale-longevity-03:ingest] appends do no work they do not need', () => {
  it('[gap-scale-longevity-03:ingest] appends with known colorBy labels repaint the data layer only', () => {
    const kinds = ['a', 'b', 'c', 'd'];
    const n = 3_000;
    const chart = mount(
      {
        data: Array.from({ length: n }, (_, i) => ({ x: i, y: Math.sin(i / 50), k: kinds[i % 4] })),
        x: 'x',
        series: [{ type: 'scatter', y: 'y', colorBy: 'k', tooltipFields: ['k'] }],
        streaming: { maxPoints: n },
      },
      { width: 800, height: 400 },
    );
    fakes.frames.flush();
    const before = { ...debug(chart).renderCount };
    for (let i = 0; i < 20; i++) {
      chart.appendData([{ x: n + i, y: 0.5, k: kinds[i % 4] }]);
      fakes.frames.flush();
    }
    const after = debug(chart).renderCount;
    expect(after.grid).toBe(before.grid);
    expect(after.overlay).toBe(before.overlay);
    expect(after.data).toBeGreaterThan(before.data);
  });
});

// Category codes are positions on the axis. A cursor, a pinned or controlled viewport and a
// group's X range hold codes, so a label keeps its code while its rows are retained (D23).
describe('[dataapi-05] category codes stay with their labels', () => {
  /** The points the cursor finds at a category label, as [series, label, y]. */
  const pointsAt = (chart: ChartHandle<any>, label: string) => {
    chart.setCursor(label);
    return chart.getCursorSnapshot().points.map((point) => [point.seriesId, point.x, point.y]);
  };

  it('[dataapi-05] sources on one axis that append different new labels in one call keep them apart', () => {
    const chart = mount({
      data: [{ a: 'P', b: 'Q', y1: 1, y2: 2 }],
      x: 'a',
      series: [
        { id: 's1', type: 'scatter', y: 'y1' },
        { id: 's2', type: 'scatter', y: 'y2', x: 'b' },
      ],
    });
    chart.appendData([{ a: 'C', b: 'D', y1: 3, y2: 4 }]);
    // Four labels, four slots: P and Q from the data, then C and D.
    expect(chart.getAxis('x')).toMatchObject({ type: 'category', min: 0, max: 3 });
    expect(pointsAt(chart, 'C')).toContainEqual(['s1', 'C', 3]);
    expect(pointsAt(chart, 'D')).toContainEqual(['s2', 'D', 4]);
    chart.update({ axes: { y: { title: 'Load' } } });
    expect(chart.getAxis('x')).toMatchObject({ type: 'category', min: 0, max: 3 });
    expect(pointsAt(chart, 'C')).toContainEqual(['s1', 'C', 3]);
    expect(pointsAt(chart, 'D')).toContainEqual(['s2', 'D', 4]);
  });

  it('[dataapi-05] a streamed category axis keeps its codes through an unrelated update', () => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];
    const chart = mount({
      data: [{ m: 'Jan', y: 1 }],
      x: 'm',
      series: [{ y: 'y' }],
      streaming: { maxPoints: 5 },
    });
    for (const [i, m] of months.entries()) if (i > 0) chart.appendData([{ m, y: i + 1 }]);
    // Apr to Aug are retained, at the codes they were appended with.
    const full = chart.getAxis('x');
    expect(full).toMatchObject({ type: 'category', min: 3, max: 7 });
    // Zoom to Jun and Jul, as a gesture or a controlled viewport pins them.
    const zoom = { min: 4.75, max: 6.25 };
    chart.setViewport({ x: zoom });
    fakes.frames.flush();
    expect(debug(chart).inViewPoints).toBe(2);
    chart.update({ axes: { y: { title: 'Load' } } });
    fakes.frames.flush();
    expect(chart.getAxis('x')).toMatchObject(zoom);
    expect(debug(chart).inViewPoints).toBe(2);
    expect(pointsAt(chart, 'Jun')).toEqual([['y', 'Jun', 6]]);
    chart.appendData([{ m: 'Sep', y: 9 }]);
    chart.resetViewport();
    expect(chart.getAxis('x')).toMatchObject({ min: 4, max: 8 });
    // Replacing the data rebuilds the categories from the new rows.
    chart.update({
      data: [
        { m: 'Oct', y: 10 },
        { m: 'Nov', y: 11 },
      ],
    });
    chart.resetViewport();
    expect(chart.getAxis('x')).toMatchObject({ min: 0, max: 1 });
  });

  it('[dataapi-05] sources on one axis keep their slot order through an update', () => {
    const chart = mount({
      data: [{ a: 'P', b: 'Q', y1: 1, y2: 2 }],
      x: 'a',
      series: [
        { id: 's1', type: 'scatter', y: 'y1' },
        { id: 's2', type: 'scatter', y: 'y2', x: 'b' },
      ],
    });
    chart.appendData([{ a: 'C', b: 'D', y1: 3, y2: 4 }]);
    /** The label of each slot, read by moving the cursor to its code. */
    const slots = () =>
      [0, 1, 2, 3].map((code) => {
        chart.setCursor(code);
        return chart.getCursorSnapshot().x;
      });
    expect(slots()).toEqual(['P', 'Q', 'C', 'D']);
    chart.update({ axes: { y: { title: 'Load' } } });
    expect(slots()).toEqual(['P', 'Q', 'C', 'D']);
    expect(pointsAt(chart, 'Q')).toContainEqual(['s2', 'Q', 2]);
  });
});
