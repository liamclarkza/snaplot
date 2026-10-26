// @vitest-environment jsdom
// One update path (plan D16, P6): each option change falls into a class, and the class decides
// the work. Presentation, callback, annotation and plugin changes never ingest; data changes
// re-ingest; update(patch) applies every key it names, setOptions(full) compares with the last
// applied value.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debug, type Fakes, installFakes } from '../fakes';
import { at, type FinalHandle, HANDLE_MEMBERS, input, mount } from './contract';

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

/** The axis label texts (the DOM label layer's spans). */
function texts(chart: FinalHandle<Row>): string[] {
  return [...chart.container.querySelectorAll('span')]
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
  it('[arch-03][dataapi-10] presentation changes re-render without an ingest', () => {
    for (const [what, patch] of presentation) {
      const chart = mount<Row>(fakes, base);
      expect(measure(chart, () => chart.update(patch)).ingests, what).toBe(0);
      chart.destroy();
    }
  });

  it('[arch-03] an axis title change relays out and repaints the grid', () => {
    const chart = mount<Row>(fakes, base);
    const work = measure(chart, () => chart.update({ axes: { y: { title: 'Load' } } }));
    expect(work).toMatchObject({ ingests: 0 });
    expect(work.grid).toBeGreaterThan(0);
    expect(texts(chart)).toContain('Load');
  });

  it('[arch-03] a series colour change repaints the data without an ingest', () => {
    const chart = mount<Row>(fakes, base);
    const work = measure(chart, () =>
      chart.update({ series: [{ y: 'cpu', label: 'CPU', color: '#ff0000' }, base.series[1]] }),
    );
    expect(work.ingests).toBe(0);
    expect(work.data).toBeGreaterThan(0);
    expect(chart.getState().series[0].color).toBe('#ff0000');
  });

  it('[dataapi-10] setOptions with an equal complete snapshot does no work at all', () => {
    const chart = mount<Row>(fakes, base);
    const work = measure(chart, () => {
      for (let i = 0; i < 5; i++)
        chart.setOptions({ ...base, series: base.series.map((s) => ({ ...s })) });
    });
    expect(work).toEqual({ ingests: 0, grid: 0, data: 0, overlay: 0 });
  });

  it('[dataapi-10] setOptions compares data by reference: a new array re-ingests once', () => {
    const chart = mount<Row>(fakes, base);
    expect(measure(chart, () => chart.setOptions({ ...base, data: rows.slice() })).ingests).toBe(1);
  });

  it('[dataapi-10] update({ data }) re-ingests even the same array after an in-place edit', () => {
    const data = rows.map((row) => ({ ...row }));
    const chart = mount<Row>(fakes, { ...base, data });
    data[data.length - 1].cpu = 99;
    expect(measure(chart, () => chart.update({ data })).ingests).toBe(1);
    expect(chart.getCursor({ fallback: 'latest' }).points[0].y).toBe(99);
  });

  it('[dxtrial-11:data] two empty data arrays count as equal: 0 ingests', () => {
    const chart = mount<Row>(fakes, { ...base, data: [] });
    expect(measure(chart, () => chart.setOptions({ ...base, data: [] })).ingests).toBe(0);
  });

  it('[arch-03] a field name change re-ingests', () => {
    const chart = mount<Row>(fakes, base);
    const work = measure(chart, () =>
      chart.update({ series: [{ id: 'cpu', y: 'mem', label: 'CPU' }, base.series[1]] }),
    );
    expect(work.ingests).toBe(1);
  });
});

/** The X passes ingest has made: one per source it read (plan §3.4). */
const xPasses = (chart: FinalHandle<any>) =>
  (debug(chart) as unknown as { xValidations: number }).xValidations;

/** Each series' value at the latest X. */
const latest = (chart: FinalHandle<any>) =>
  chart.getCursor({ fallback: 'latest' }).points.map((point) => point.y);

describe('[arch-03] a data or accessor change reads only what it changes (D16, RC1)', () => {
  type Own = { t: number; v: number; c?: string };
  const own = (k: number): Own[] => Array.from({ length: 50 }, (_, t) => ({ t, v: (t * k) % 13 }));

  it("[arch-03] replacing one series' own data reads that source only", () => {
    const b = own(3);
    let reads = 0;
    const y = (row: Own) => {
      reads++;
      return row.v;
    };
    const options = (a: Own[]) => ({
      x: 't',
      series: [
        { id: 'a', data: a, y: 'v' },
        { id: 'b', data: b, y },
      ],
    });
    const chart = mount<Own>(fakes, options(own(1)));
    const before = xPasses(chart);
    reads = 0;
    chart.setOptions(options(own(5)));
    expect(xPasses(chart) - before).toBe(1);
    expect(reads).toBe(0);
    expect(latest(chart)).toEqual([(49 * 5) % 13, (49 * 3) % 13]);
  });

  it('[arch-03] a new accessor identity re-extracts only that series, without an X pass', () => {
    let others = 0;
    const mem = (row: Row) => {
      others++;
      return row.mem;
    };
    const chart = mount<Row>(fakes, {
      ...base,
      series: [
        { id: 'cpu', y: (row: Row) => row.cpu },
        { id: 'mem', y: mem },
      ],
    });
    const before = xPasses(chart);
    others = 0;
    let reads = 0;
    chart.update({
      series: [
        {
          id: 'cpu',
          y: (row: Row) => {
            reads++;
            return row.cpu * 2;
          },
        },
        { id: 'mem', y: mem },
      ],
    });
    expect(xPasses(chart)).toBe(before);
    expect(others).toBe(0);
    expect(reads).toBe(rows.length);
    expect(latest(chart)).toEqual([rows[199].cpu * 2, rows[199].mem]);
  });

  it('[arch-03] a new field name reads that series column, not the X', () => {
    const chart = mount<Row>(fakes, base);
    const before = xPasses(chart);
    chart.update({ series: [{ id: 'cpu', y: 'mem', label: 'CPU' }, base.series[1]] });
    expect(xPasses(chart)).toBe(before);
    expect(latest(chart)).toEqual([rows[199].mem, rows[199].mem]);
  });

  it('[arch-03] a new rowId function reads the ids again, not the X', () => {
    const chart = mount<Row>(fakes, { ...base, rowId: (row: Row) => `a${row.t}` });
    const before = xPasses(chart);
    chart.update({ rowId: (row: Row) => `b${row.t}` });
    expect(xPasses(chart)).toBe(before);
    expect(chart.getCursor({ fallback: 'latest' }).points[0].rowId).toBe('b199');
  });

  it('[arch-03] a source kept across a replacement still appends, and keeps its rows on the next one', () => {
    const b = own(3);
    const options = (a: Own[]) => ({
      x: 't',
      rowId: 't',
      series: [
        { id: 'a', data: a, y: 'v' },
        { id: 'b', data: b, y: 'v' },
      ],
    });
    const chart = mount<Own>(fakes, options(own(1)));
    chart.setOptions(options(own(5)));
    chart.appendData([{ t: 50, v: 99 }], { seriesId: 'b' });
    expect(latest(chart)).toEqual([(49 * 5) % 13, 99]);
    chart.setOptions(options(own(7)));
    const points = chart.getCursor({ fallback: 'latest' }).points;
    expect(points.map((point) => [point.seriesId, point.y, point.rowId])).toEqual([
      ['a', (49 * 7) % 13, 49],
      ['b', 99, 50],
    ]);
  });

  it('[arch-03] replacing one of two sources on a category axis labels it as a new chart would', () => {
    const b: Own[] = [
      { t: 0, c: 'y', v: 3 },
      { t: 1, c: 'z', v: 4 },
    ];
    const options = (a: Own[]) => ({
      x: 'c',
      series: [
        { id: 'a', data: a, y: 'v' },
        { id: 'b', data: b, y: 'v' },
      ],
    });
    const chart = mount<Own>(
      fakes,
      options([
        { t: 0, c: 'x', v: 1 },
        { t: 1, c: 'y', v: 2 },
      ]),
    );
    const next = options([
      { t: 0, c: 'w', v: 5 },
      { t: 1, c: 'y', v: 6 },
    ]);
    chart.setOptions(next);
    const fresh = mount<Own>(fakes, next);
    expect(chart.scale('x')?.categories).toEqual(fresh.scale('x')?.categories);
    chart.setCursor('z');
    expect(chart.getCursor().points.find((point) => point.seriesId === 'b')).toMatchObject({
      x: 'z',
      y: 4,
    });
  });
});

describe('[arch-04][frameworks-02][research-01] functions are read through latest refs', () => {
  it('[arch-04][frameworks-02][research-01] a new onPointClick identity costs nothing and the latest one is called', () => {
    const chart = mount<Row>(fakes, base);
    const calls: string[] = [];
    const work = measure(chart, () => {
      for (let i = 0; i < 5; i++) chart.update({ onPointClick: () => calls.push(`click ${i}`) });
    });
    expect(work).toEqual({ ingests: 0, grid: 0, data: 0, overlay: 0 });
    const target = input(chart);
    const init = {
      ...at(chart, 10, rows[10].cpu),
      bubbles: true,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
    };
    target.dispatchEvent(new PointerEvent('pointermove', init));
    target.dispatchEvent(new PointerEvent('pointerdown', init));
    target.dispatchEvent(new PointerEvent('pointerup', init));
    target.dispatchEvent(
      new MouseEvent('click', { ...at(chart, 10, rows[10].cpu), bubbles: true }),
    );
    expect(calls).toEqual(['click 4']);
  });

  it('[frameworks-02][research-01] a new on<Key>Change identity costs nothing and the latest one is called', () => {
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

  it('[frameworks-02][research-01] a new axis format identity repaints without an ingest and is used', () => {
    const chart = mount<Row>(fakes, base);
    const work = measure(chart, () => {
      for (let i = 0; i < 5; i++)
        chart.update({ axes: { y: { format: (v: number) => `${v} u${i}` } } });
    });
    expect(work.ingests).toBe(0);
    expect(texts(chart).some((text) => text.endsWith(' u4'))).toBe(true);
  });

  it('[dxtrial-11:callbacks] a new tooltip.render identity costs no ingest', () => {
    const chart = mount<Row>(fakes, base);
    const work = measure(chart, () => {
      for (let i = 0; i < 5; i++) chart.update({ tooltip: { render: () => `t${i}` } });
    });
    expect(work.ingests).toBe(0);
  });

  it('[research-01] a new series.format identity costs no ingest, and the latest one formats', () => {
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

  it('[research-01] a new accessor identity re-reads the data without a warning below 10,000 rows', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const chart = mount<Row>(fakes, { ...base, series: [{ id: 'cpu', y: (row: Row) => row.cpu }] });
    for (let i = 0; i < 12; i++)
      chart.update({ series: [{ id: 'cpu', y: (row: Row) => row.cpu * 2 }] });
    expect(chart.getCursor({ fallback: 'latest' }).points[0].y).toBe(rows[199].cpu * 2);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('[gap-annotations-extensibility-05][gap-annotations-extensibility-06] annotations', () => {
  it('[gap-annotations-extensibility-05] reference lines and regions repaint without an ingest', () => {
    const chart = mount<Row>(fakes, base);
    const work = measure(chart, () => {
      chart.update({ referenceLines: [{ axis: 'y', value: 50, label: 'SLO' }] });
      chart.update({ referenceRegions: [{ axis: 'x', from: 10, to: 20, label: 'Deploy' }] });
    });
    expect(work.ingests).toBe(0);
    expect(work.data).toBeGreaterThan(0);
  });

  it('[gap-annotations-extensibility-06] setOptions sees an in-place push into the array it was given', () => {
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
  it('[gap-environments-03] the handle has exactly the fourteen 1.0 members and no resize', () => {
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
