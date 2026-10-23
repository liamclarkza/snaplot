// @vitest-environment jsdom
// Known M7 defects (plan RC1, RC15: normalize and ingest), recorded as expected
// failures. Each `it.fails('[id] …')` states the behaviour M7 must deliver; the
// M7 fix commit flips it to `it`. Public API, fakes and debug() only.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { histogram } from '../../src/index';
import { type Fakes, installFakes } from '../fakes';

let fakes: Fakes;
beforeEach(() => {
  fakes = installFakes();
});
afterEach(() => {
  fakes.uninstall();
  vi.restoreAllMocks();
});

type Row = { id?: string; x: number; y: number };

/** The newest point of the first series, read without a cursor. */
function latest(chart: { getCursorSnapshot(o: { fallback: 'latest' }): any }) {
  return chart.getCursorSnapshot({ fallback: 'latest' }).points[0];
}

describe('[dataapi-03] appendData validates row ids', () => {
  it.fails('[dataapi-03] a duplicate rowId on append throws before any mutation', () => {
    const chart = fakes.mount<Row>({
      data: [
        { id: 'a', x: 1, y: 1 },
        { id: 'b', x: 2, y: 2 },
      ],
      x: 'x',
      rowId: 'id',
      series: [{ y: 'y' }],
    });
    expect(() => chart.appendData([{ id: 'a', x: 3, y: 3 }])).toThrow(/rowId/);
    expect(latest(chart).x).toBe(2);
    // Later updates keep working.
    expect(() => chart.update({ axes: { y: { title: 'Load' } } })).not.toThrow();
  });

  it.fails('[dataapi-03] a column batch without rowIds on a source with rowIds throws', () => {
    const chart = fakes.mount({
      data: {
        columns: { x: new Float64Array([0, 1]), y: new Float64Array([5, 6]) },
        rowIds: ['a', 'b'],
      },
      x: 'x',
      series: [{ y: 'y' }],
    });
    expect(() =>
      chart.appendData({ columns: { x: new Float64Array([2]), y: new Float64Array([7]) } }),
    ).toThrow(/rowId/);
    chart.appendData({
      columns: { x: new Float64Array([2]), y: new Float64Array([7]) },
      rowIds: ['c'],
    });
    expect(latest(chart).rowId).toBe('c');
    expect(() => chart.update({ axes: { y: { title: 'Load' } } })).not.toThrow();
  });
});

describe('[dataapi-05] inferred categories follow the data', () => {
  it.fails('[dataapi-05] replacing data rebuilds the inferred categories', () => {
    const chart = fakes.mount<{ m: string; v: number }>({
      data: [
        { m: 'Jan', v: 1 },
        { m: 'Feb', v: 2 },
      ],
      x: 'm',
      series: [{ type: 'bar', y: 'v' }],
    });
    chart.update({
      data: [
        { m: 'Mar', v: 3 },
        { m: 'Apr', v: 4 },
      ],
    });
    expect(chart.getAxis('x')).toMatchObject({ min: -0.5, max: 1.5 });
    chart.update({
      data: [
        { m: 'Jan', v: 1 },
        { m: 'Feb', v: 2 },
      ],
    });
    expect(chart.getAxis('x')).toMatchObject({ min: -0.5, max: 1.5 });
  });

  it.fails('[gap-scale-longevity-03:ingest] categories stay bounded after 10 × maxPoints string-X appends', () => {
    const chart = fakes.mount<{ k: string; v: number }>({
      data: [{ k: 'item-0', v: 0 }],
      x: 'k',
      series: [{ y: 'v' }],
      streaming: { maxPoints: 3 },
    });
    for (let i = 1; i <= 30; i++) chart.appendData([{ k: `item-${i}`, v: i }]);
    const x = chart.getAxis('x');
    expect((x?.max ?? 0) - (x?.min ?? 0)).toBeLessThanOrEqual(3);
  });
});

describe('[dataapi-07][dxtrial-08] ISO date strings', () => {
  const rows = Array.from({ length: 40 }, (_, day) => ({
    time: new Date(Date.UTC(2026, 0, 1 + day)).toISOString(),
    visits: 100 + day,
  }));

  it.fails('[dataapi-07][dxtrial-08] ISO-8601 strings infer a time axis', () => {
    const chart = fakes.mount({ data: rows, x: 'time', series: [{ y: 'visits' }] });
    expect(chart.getAxis('x')?.type).toBe('time');
    expect(chart.getAxis('x')?.min).toBe(Date.UTC(2026, 0, 1));
  });

  it.fails("[dataapi-07] axes.x.type 'time' accepts ISO strings", () => {
    expect(() =>
      fakes.mount({
        data: rows,
        x: 'time',
        series: [{ y: 'visits' }],
        axes: { x: { type: 'time' } },
      }),
    ).not.toThrow();
  });
});

describe('[dataapi-12] appends keep the axis kind', () => {
  it.fails('[dataapi-12] a number appended to a category axis throws a kind error', () => {
    const chart = fakes.mount<{ x: string | number; y: number }>({
      data: [
        { x: 'A', y: 1 },
        { x: 'B', y: 2 },
      ],
      x: 'x',
      series: [{ y: 'y' }],
    });
    expect(() => chart.appendData([{ x: 5, y: 3 }])).toThrow(/categor/i);
    expect(chart.getAxis('x')?.type).toBe('category');
  });

  it.fails('[dataapi-12] a Date appended to a numeric axis throws', () => {
    const chart = fakes.mount<{ x: number | Date; y: number }>({
      data: [{ x: 1, y: 1 }],
      x: 'x',
      series: [{ y: 'y' }],
    });
    expect(() => chart.appendData([{ x: new Date(2024, 0, 1), y: 3 }])).toThrow();
  });

  it.fails('[dataapi-12] a string appended to a time axis names the kind, not the order', () => {
    const chart = fakes.mount<{ x: Date | string; y: number }>({
      data: [{ x: new Date(2024, 0, 1), y: 1 }],
      x: 'x',
      series: [{ y: 'y' }],
    });
    let message = '';
    try {
      chart.appendData([{ x: 'later', y: 3 }]);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/time|date|string/i);
    expect(message).not.toMatch(/order/i);
  });
});

describe('[dataapi-06][dataapi-19] histogram() binning', () => {
  const latency = (outlier: number) => {
    const values = Array.from({ length: 1000 }, (_, i) => 100 + (i % 50));
    values.push(outlier);
    return values;
  };

  it.fails('[dataapi-06] one outlier cannot make more than 1,000 automatic bins', () => {
    const bins = histogram(latency(1e7));
    expect(bins.counts.length).toBeLessThanOrEqual(1000);
  });

  it.fails('[dataapi-06] a range near ±Number.MAX_VALUE keeps every value', () => {
    const bins = histogram([-1e308, 0, 1e308]);
    expect(bins.counts.reduce((sum, count) => sum + count, 0)).toBe(3);
  });

  it.fails('[dataapi-06] edges stay finite for an extreme range with an explicit bin count', () => {
    const bins = histogram([-Number.MAX_VALUE, Number.MAX_VALUE], { binCount: 4 });
    expect([...bins.edges].every(Number.isFinite)).toBe(true);
  });

  it.fails('[dataapi-06] a single repeated large value gives strictly increasing edges', () => {
    const bins = histogram([1e20, 1e20, 1e20]);
    for (let i = 1; i < bins.edges.length; i++) {
      expect(bins.edges[i]).toBeGreaterThan(bins.edges[i - 1]);
    }
  });

  it.fails('[dataapi-06] an unknown method or a huge bin count is rejected', () => {
    expect(() => histogram([1, 2, 3], { method: 'sturgess' as never })).toThrow();
    expect(() => histogram([1, 2, 3], { binCount: 2e7 })).toThrow();
  });

  it.fails('[dataapi-19] a value on a bin edge lands in the upper bin', () => {
    const values = Array.from({ length: 1000 }, (_, i) => i / 10);
    for (const binCount of [30, 333]) {
      const bins = histogram(values, { binCount });
      const last = bins.edges.length - 1;
      expect(bins.edges[last]).toBeLessThanOrEqual(99.9);
      for (let bin = 0; bin < bins.counts.length; bin++) {
        const lo = bins.edges[bin];
        const hi = bins.edges[bin + 1];
        const byEdges = values.filter((v) => v >= lo && (bin === last - 1 ? v <= hi : v < hi));
        expect(bins.counts[bin], `bin ${bin} of ${binCount}`).toBe(byEdges.length);
      }
    }
  });
});

describe('[dataapi-02] appended rows are retained across updates', () => {
  type Sample = { t: number; v: number };
  const seed: Sample[] = [
    { t: 0, v: 1 },
    { t: 1, v: 2 },
  ];

  it.fails('[dataapi-02] a new accessor identity keeps the appended per-series rows', () => {
    const chart = fakes.mount<Sample>({
      x: 't',
      series: [{ id: 'cpu', data: seed, x: 't', y: (row) => row.v }],
    });
    chart.appendData([{ t: 2, v: 3 }], { seriesId: 'cpu' });
    chart.update({ series: [{ id: 'cpu', data: seed, x: 't', y: (row) => row.v }] });
    expect(latest(chart).x).toBe(2);
  });

  it.fails('[dataapi-02] switching the y field keeps the appended per-series rows', () => {
    type Pair = { t: number; v: number; w: number };
    const rows: Pair[] = [
      { t: 0, v: 1, w: 10 },
      { t: 1, v: 2, w: 20 },
    ];
    const chart = fakes.mount<Pair>({
      x: 't',
      series: [{ id: 'cpu', data: rows, x: 't', y: 'v' }],
    });
    chart.appendData([{ t: 2, v: 3, w: 30 }], { seriesId: 'cpu' });
    chart.update({ series: [{ id: 'cpu', data: rows, x: 't', y: 'w' }] });
    expect(latest(chart)).toMatchObject({ x: 2, y: 30 });
  });
});

describe('[repo-06][arch-12] one always-on validation layer', () => {
  it.fails('[repo-06] configuration warnings are not stripped under NODE_ENV=production', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('NODE_ENV', 'production');
    try {
      fakes.mount({
        data: [
          { t: 0, y: 1 },
          { t: 1, y: 2 },
        ],
        x: 't',
        series: [{ y: 'y' }],
        tooltip: { mode: 'nearest-repo06' as never },
      });
    } finally {
      vi.unstubAllEnvs();
    }
    expect(warn.mock.calls.flat().join(' ')).toMatch(/nearest-repo06/);
  });

  it.fails('[arch-12] zoom.onZoom is not an option: passing it warns as an unknown key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fakes.mount({
      data: [
        { t: 0, y: 1 },
        { t: 1, y: 2 },
      ],
      x: 't',
      series: [{ y: 'y' }],
      zoom: { onZoom: () => {} },
    });
    expect(warn.mock.calls.flat().join(' ')).toMatch(/onZoom/);
  });
});
