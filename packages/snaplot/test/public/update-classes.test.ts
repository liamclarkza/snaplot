// @vitest-environment jsdom
// One update path (plan D16, P6): each option change falls into a class, and the class decides
// the work. Presentation, callback, annotation and plugin changes never ingest; data changes
// re-ingest; update(patch) applies every key it names, setOptions(full) compares with the last
// applied value.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debug, type Fakes, installFakes } from '../fakes';
import { type FinalHandle, HANDLE_MEMBERS, mount } from './contract';

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

const base = {
  data: rows,
  x: 't',
  series: [
    { y: 'cpu', label: 'CPU' },
    { y: 'mem', label: 'Memory' },
  ],
};

/** Ingests and paints caused by `act`, after the frame it scheduled. */
function measure(chart: FinalHandle<Row>, act: () => void) {
  fakes.frames.flush();
  const before = { ...debug(chart).renderCount, ingests: debug(chart).ingestCount };
  act();
  fakes.frames.flush();
  const after = debug(chart);
  return {
    ingests: after.ingestCount - before.ingests,
    grid: after.renderCount.grid - before.grid,
    data: after.renderCount.data - before.data,
    overlay: after.renderCount.overlay - before.overlay,
  };
}

function texts(chart: FinalHandle<Row>): string[] {
  return [...chart.container.querySelectorAll('div')]
    .map((element) => (element.childElementCount === 0 ? (element.textContent ?? '') : ''))
    .filter(Boolean);
}

describe('[arch-03][dataapi-10] presentation changes never ingest (P6)', () => {
  const presentation: Array<[string, Record<string, unknown>]> = [
    ['an axis title', { axes: { y: { title: 'Load' } } }],
    ['axis bounds', { axes: { y: { min: 0, max: 100 } } }],
    ['explicit ticks and grid', { axes: { y: { ticks: [40, 45, 50], grid: false } } }],
    [
      'a series style',
      { series: [{ y: 'cpu', label: 'CPU', lineWidth: 3, dash: [4, 2] }, base.series[1]] },
    ],
    ['a series label', { series: [{ y: 'cpu', label: 'Processor' }, base.series[1]] }],
    ['the theme', { theme: 'dark' }],
    ['the tooltip', { tooltip: { mode: 'nearest' } }],
    ['the cursor', { cursor: false }],
    ['the legend', { legend: false }],
    ['the height', { height: 240 }],
    ['the interaction', { interaction: { zoom: 'xy' } }],
    ['the follow window', { streaming: { followWindow: 50 } }],
    ['the accessible name', { ariaLabel: 'CPU and memory' }],
    ['the locale', { locale: 'de-DE' }],
  ];
  it.fails('[arch-03][dataapi-10] presentation changes re-render without an ingest', () => {
    for (const [what, patch] of presentation) {
      const chart = mount<Row>(fakes, base);
      expect(measure(chart, () => chart.update(patch)).ingests, what).toBe(0);
      chart.destroy();
    }
  });

  it.fails('[arch-03] an axis title change relays out and repaints the grid', () => {
    const chart = mount<Row>(fakes, base);
    const work = measure(chart, () => chart.update({ axes: { y: { title: 'Load' } } }));
    expect(work).toMatchObject({ ingests: 0 });
    expect(work.grid).toBeGreaterThan(0);
    expect(texts(chart)).toContain('Load');
  });

  it.fails('[arch-03] a series colour change repaints the data without an ingest', () => {
    const chart = mount<Row>(fakes, base);
    const work = measure(chart, () =>
      chart.update({ series: [{ y: 'cpu', label: 'CPU', color: '#ff0000' }, base.series[1]] }),
    );
    expect(work.ingests).toBe(0);
    expect(work.data).toBeGreaterThan(0);
    expect(chart.getState().series[0].color).toBe('#ff0000');
  });

  it.fails('[dataapi-10] setOptions with an equal complete snapshot does no work at all', () => {
    const chart = mount<Row>(fakes, base);
    const work = measure(chart, () => {
      for (let i = 0; i < 5; i++)
        chart.setOptions({ ...base, series: base.series.map((s) => ({ ...s })) });
    });
    expect(work).toEqual({ ingests: 0, grid: 0, data: 0, overlay: 0 });
  });

  it.fails('[dataapi-10] setOptions compares data by reference: a new array re-ingests once', () => {
    const chart = mount<Row>(fakes, base);
    expect(measure(chart, () => chart.setOptions({ ...base, data: rows.slice() })).ingests).toBe(1);
  });

  it.fails('[dataapi-10] update({ data }) re-ingests even the same array after an in-place edit', () => {
    const data = rows.map((row) => ({ ...row }));
    const chart = mount<Row>(fakes, { ...base, data });
    data[data.length - 1].cpu = 99;
    expect(measure(chart, () => chart.update({ data })).ingests).toBe(1);
    expect(chart.getCursor({ fallback: 'latest' }).points[0].y).toBe(99);
  });

  it.fails('[dxtrial-11:data] two empty data arrays count as equal: 0 ingests', () => {
    const chart = mount<Row>(fakes, { ...base, data: [] });
    expect(measure(chart, () => chart.setOptions({ ...base, data: [] })).ingests).toBe(0);
  });

  it.fails('[arch-03] a field name change re-ingests', () => {
    const chart = mount<Row>(fakes, base);
    const work = measure(chart, () =>
      chart.update({ series: [{ y: 'mem', label: 'CPU' }, base.series[1]] }),
    );
    expect(work.ingests).toBe(1);
  });
});

describe('[arch-04][frameworks-02][research-01] functions are read through latest refs', () => {
  it.fails('[arch-04][frameworks-02][research-01] a new onPointClick identity costs nothing and the latest one is called', () => {
    const chart = mount<Row>(fakes, base);
    const calls: string[] = [];
    const work = measure(chart, () => {
      for (let i = 0; i < 5; i++) chart.update({ onPointClick: () => calls.push(`click ${i}`) });
    });
    expect(work).toEqual({ ingests: 0, grid: 0, data: 0, overlay: 0 });
  });

  it.fails('[frameworks-02][research-01] a new on<Key>Change identity costs nothing and the latest one is called', () => {
    const chart = mount<Row>(fakes, base);
    const seen: string[] = [];
    const work = measure(chart, () => {
      for (let i = 0; i < 5; i++)
        chart.setOptions({
          ...base,
          onFollowingChange: (following: boolean) => seen.push(`${i}:${following}`),
        });
    });
    expect(work).toEqual({ ingests: 0, grid: 0, data: 0, overlay: 0 });
    chart.update({ viewport: { x: [10, 20] } });
    chart.resumeFollow();
    expect(seen).toEqual(['4:false', '4:true']);
  });

  it.fails('[frameworks-02][research-01] a new axis format identity repaints without an ingest and is used', () => {
    const chart = mount<Row>(fakes, base);
    const work = measure(chart, () => {
      for (let i = 0; i < 5; i++)
        chart.update({ axes: { y: { format: (v: number) => `${v} u${i}` } } });
    });
    expect(work.ingests).toBe(0);
    expect(texts(chart).some((text) => text.endsWith(' u4'))).toBe(true);
  });

  it.fails('[dxtrial-11:callbacks] a new tooltip.render identity costs no ingest', () => {
    const chart = mount<Row>(fakes, base);
    const work = measure(chart, () => {
      for (let i = 0; i < 5; i++) chart.update({ tooltip: { render: () => `t${i}` } });
    });
    expect(work.ingests).toBe(0);
  });

  it.fails('[research-01] a new series.format identity costs no ingest, and the latest one formats', () => {
    const chart = mount<Row>(fakes, base);
    const work = measure(chart, () => {
      for (let i = 0; i < 3; i++)
        chart.update({
          series: [{ y: 'cpu', label: 'CPU', format: (v: number) => `${v} f${i}` }, base.series[1]],
        });
    });
    expect(work.ingests).toBe(0);
    chart.setCursor(10);
    expect(chart.getCursor().points[0].formattedY).toBe('43 f2');
  });

  it.fails('[research-01] a new accessor identity re-reads the data without a warning below 10,000 rows', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const chart = mount<Row>(fakes, { ...base, series: [{ id: 'cpu', y: (row: Row) => row.cpu }] });
    for (let i = 0; i < 12; i++)
      chart.update({ series: [{ id: 'cpu', y: (row: Row) => row.cpu * 2 }] });
    expect(chart.getCursor({ fallback: 'latest' }).points[0].y).toBe(rows[199].cpu * 2);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('[gap-annotations-extensibility-05][gap-annotations-extensibility-06] annotations', () => {
  it.fails('[gap-annotations-extensibility-05] reference lines and regions repaint without an ingest', () => {
    const chart = mount<Row>(fakes, base);
    const work = measure(chart, () => {
      chart.update({ referenceLines: [{ axis: 'y', value: 50, label: 'SLO' }] });
      chart.update({ referenceRegions: [{ axis: 'x', from: 10, to: 20, label: 'Deploy' }] });
    });
    expect(work.ingests).toBe(0);
    expect(work.data).toBeGreaterThan(0);
  });

  it.fails('[gap-annotations-extensibility-06] setOptions sees an in-place push into the array it was given', () => {
    const lines = [{ axis: 'y', value: 45, label: 'Deploy A' }];
    const chart = mount<Row>(fakes, { ...base, referenceLines: lines });
    fakes.frames.flush();
    lines.push({ axis: 'y', value: 47, label: 'Deploy B' });
    chart.setOptions({ ...base, referenceLines: lines });
    fakes.frames.flush();
    const drawn = fakes.canvas.all
      .flatMap((record) => record.calls)
      .filter((call) => call.name === 'fillText')
      .map((call) => String(call.args[0]));
    expect(drawn).toContain('Deploy B');
  });
});

describe('[gap-environments-03] the final handle', () => {
  it.fails('[gap-environments-03] the handle has exactly the fourteen 1.0 members and no resize', () => {
    const chart = mount<Row>(fakes, base);
    const members = new Set<string>();
    for (let o: object | null = chart; o && o !== Object.prototype; o = Object.getPrototypeOf(o))
      for (const key of Object.getOwnPropertyNames(o)) if (key !== 'constructor') members.add(key);
    const publicMembers = [...members].filter((key) =>
      (HANDLE_MEMBERS as readonly string[]).includes(key),
    );
    expect(publicMembers.sort()).toEqual([...HANDLE_MEMBERS].sort());
    for (const removed of [
      'resize',
      'getOptions',
      'getStats',
      'getAxis',
      'getLayout',
      'setViewport',
    ])
      expect(removed in chart).toBe(false);
  });
});
