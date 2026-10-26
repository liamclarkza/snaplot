// @vitest-environment jsdom
// M8's update-path locks (plan RC1, D16: one update path with invalidation
// classes). Presentation and callback changes never ingest; appended rows
// survive updates. Public API, fakes and debug() only.
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

type Row = { t: number; cpu: number; mem: number };
const rows: Row[] = Array.from({ length: 200 }, (_, t) => ({
  t,
  cpu: 40 + (t % 7),
  mem: 60 + (t % 5),
}));

function mountCpu(): ChartHandle<Row> {
  return fakes.mount<Row>({
    data: rows,
    x: 't',
    series: [
      { y: 'cpu', label: 'CPU' },
      { y: 'mem', label: 'Memory' },
    ],
  });
}

/** Ingests caused by `act`, after the frame it scheduled has painted. */
function ingestsDuring(chart: ChartHandle<any>, act: () => void): number {
  fakes.frames.flush();
  const before = debug(chart).ingestCount;
  act();
  fakes.frames.flush();
  return debug(chart).ingestCount - before;
}

describe('[arch-03][dataapi-10] presentation changes do not ingest', () => {
  it('[arch-03][dataapi-10] an axis title change does not re-ingest', () => {
    const chart = mountCpu();
    expect(ingestsDuring(chart, () => chart.update({ axes: { y: { title: 'Load' } } }))).toBe(0);
  });

  it('[arch-03] cursor, tooltip and line-width changes do not re-ingest', () => {
    const chart = mountCpu();
    expect(
      ingestsDuring(chart, () => {
        chart.update({ cursor: false });
        chart.update({ tooltip: { mode: 'nearest' } });
        chart.update({
          series: [
            { y: 'cpu', label: 'CPU', lineWidth: 3 },
            { y: 'mem', label: 'Memory' },
          ],
        });
      }),
    ).toBe(0);
  });

  it('an equivalent no-op update does not re-ingest (control)', () => {
    const chart = mountCpu();
    const series = [
      { y: 'cpu', label: 'CPU' },
      { y: 'mem', label: 'Memory' },
    ] as const;
    expect(ingestsDuring(chart, () => chart.update({ series }))).toBe(0);
  });
});

describe('[arch-04][frameworks-02][research-01] callbacks are read through latest refs', () => {
  it('[arch-04][frameworks-02][research-01] a new onPointClick identity does not re-ingest', () => {
    const chart = mountCpu();
    expect(
      ingestsDuring(chart, () => {
        for (let i = 0; i < 5; i++) chart.update({ onPointClick: () => {} });
      }),
    ).toBe(0);
  });

  it('[frameworks-02][research-01] a new axis format identity does not re-ingest', () => {
    const chart = mountCpu();
    expect(
      ingestsDuring(chart, () => {
        for (let i = 0; i < 5; i++) chart.update({ axes: { y: { format: (v) => `${v}%` } } });
      }),
    ).toBe(0);
  });

  it('[dxtrial-11:callbacks] a new tooltip.render identity does not re-ingest', () => {
    const chart = mountCpu();
    expect(
      ingestsDuring(chart, () => {
        for (let i = 0; i < 5; i++) chart.update({ tooltip: { render: () => 'x' } });
      }),
    ).toBe(0);
  });

  it('[research-01] a new series.format identity does not re-ingest', () => {
    const chart = mountCpu();
    expect(
      ingestsDuring(chart, () => {
        for (let i = 0; i < 3; i++)
          chart.update({
            series: [
              { y: 'cpu', label: 'CPU', format: (v) => `${v}%` },
              { y: 'mem', label: 'Memory' },
            ],
          });
      }),
    ).toBe(0);
  });
});

describe('[dxtrial-11:data] re-ingest churn is visible', () => {
  it('[dxtrial-11:data] re-ingesting a 10,000-row source more than 10 times a second warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const big = Array.from({ length: 10_000 }, (_, t) => ({ t, v: t % 17 }));
    const chart = fakes.mount({ data: big, x: 't', series: [{ y: 'v' }] });
    for (let i = 0; i < 12; i++) chart.update({ data: big.slice() });
    const messages = warn.mock.calls.map((call) => String(call[0]));
    expect(messages.filter((m) => /snaplot:.*(memo|appendData)/i.test(m))).toHaveLength(1);
  });
});

describe('[gap-annotations-extensibility-05][gap-annotations-extensibility-06] annotations', () => {
  it('[gap-annotations-extensibility-05] updating only referenceLines does not re-ingest', () => {
    const chart = mountCpu();
    const ingests = ingestsDuring(chart, () => {
      chart.update({ referenceLines: [{ axis: 'y', value: 50, label: 'SLO' }] });
      chart.update({ referenceRegions: [{ axis: 'x', from: 10, to: 20, label: 'Deploy' }] });
    });
    expect(ingests).toBe(0);
  });

  it('[gap-annotations-extensibility-06] an in-place push then update({ referenceLines }) draws the new line', () => {
    const lines = [{ axis: 'y', value: 42, label: 'Deploy A' }];
    const chart = fakes.mount<Row>({
      data: rows,
      x: 't',
      series: [{ y: 'cpu' }],
      referenceLines: lines,
    });
    fakes.frames.flush();
    lines.push({ axis: 'y', value: 44, label: 'Deploy B' });
    chart.update({ referenceLines: lines });
    fakes.frames.flush();
    const drawn = fakes.canvas.all
      .flatMap((record) => record.calls)
      .filter((call) => call.name === 'fillText')
      .map((call) => String(call.args[0]));
    expect(drawn).toContain('Deploy B');
  });
});

describe('[dataapi-04][dataapi-02] appended rows survive updates', () => {
  // Plan D23: a source is rows or columns. The 0.12 docs streamed columns into a rows chart and
  // lost them on the next update; now that append throws, and a one-kind stream keeps its rows.
  it('[dataapi-04] a rows stream keeps appended points after an update; a columns append to it throws', () => {
    type Sample = { time: number; value: number };
    const initial: Sample[] = [0, 1, 2, 3, 4].map((time) => ({ time, value: time }));
    const chart = fakes.mount<Sample>({
      data: initial,
      x: 'time',
      series: [{ y: 'value' }],
    });
    expect(() =>
      chart.appendData({
        columns: { time: new Float64Array([5]), value: new Float64Array([50]) },
      }),
    ).toThrow(/^snaplot: .*rows/);
    for (const [time, value] of [
      [5, 50],
      [6, 51],
      [7, 52],
    ])
      chart.appendData([{ time, value }]);
    chart.update({ axes: { y: { title: 'Value' } } });
    const latest = chart.getCursor({ fallback: 'latest' }).points[0];
    expect(latest).toMatchObject({ x: 7, y: 52 });
    chart.appendData([{ time: 8, value: 53 }]);
    expect(chart.getCursor({ fallback: 'latest' }).points[0].rowIndex).toBe(8);
  });
});

describe('[gap-environments-03] the final handle', () => {
  it('[gap-environments-03] the handle has no resize member', () => {
    const chart = mountCpu();
    expect('resize' in chart).toBe(false);
  });
});
