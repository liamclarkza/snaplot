// @vitest-environment jsdom
// Streaming through the update path (plan D16, D23, §3.4): appended rows survive every
// non-data update, a fixed follow window, the warnings about replacing streamed data and
// re-ingest churn, and no ring copies for plugins.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debug, type Fakes, installFakes } from '../fakes';
import { mount, range } from './contract';

let fakes: Fakes;
let warn: { mock: { calls: unknown[][] } };
beforeEach(() => {
  fakes = installFakes();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  fakes.uninstall();
  vi.restoreAllMocks();
});

type Sample = { time: number; value: number };
const initial = (): Sample[] => [0, 1, 2, 3, 4].map((time) => ({ time, value: time }));
const warnings = () => warn.mock.calls.map((call) => String(call[0]));

describe('[dataapi-02][dataapi-04] appended rows survive updates', () => {
  it.fails('[dataapi-02] appended rows survive update({ axes }), a style change and setOptions with the same data', () => {
    const data = initial();
    const options = { data, x: 'time', series: [{ y: 'value' }] };
    const chart = mount<Sample>(fakes, options);
    for (const time of [5, 6, 7]) chart.appendData([{ time, value: time * 10 }]);
    chart.update({ axes: { y: { title: 'Value' } } });
    chart.update({ series: [{ y: 'value', lineWidth: 3 }] });
    chart.setOptions({ ...options, series: [{ y: 'value', lineWidth: 3 }] });
    const latest = chart.getCursor({ fallback: 'latest' }).points[0];
    expect(latest).toMatchObject({ x: 7, y: 70, rowIndex: 7 });
    expect(warnings()).toEqual([]);
  });

  it.fails('[dataapi-04] a rows source rejects a columns append with a hint, and changes nothing', () => {
    const chart = mount<Sample>(fakes, { data: initial(), x: 'time', series: [{ y: 'value' }] });
    expect(() =>
      chart.appendData({ columns: { time: new Float64Array([5]), value: new Float64Array([50]) } }),
    ).toThrow(/^snaplot: .*rows/);
    chart.appendData([{ time: 5, value: 50 }]);
    chart.update({ axes: { y: { title: 'Value' } } });
    expect(chart.getCursor({ fallback: 'latest' }).points[0]).toMatchObject({
      x: 5,
      y: 50,
      rowIndex: 5,
    });
  });

  it.fails('[dataapi-04] a columns stream keeps its appended points after an update', () => {
    const chart = mount<Sample>(fakes, {
      data: { columns: { time: new Float64Array([0, 1]), value: new Float64Array([0, 1]) } },
      x: 'time',
      series: [{ y: 'value' }],
    });
    for (const time of [2, 3, 4])
      chart.appendData({
        columns: { time: new Float64Array([time]), value: new Float64Array([time]) },
      });
    chart.update({ axes: { y: { title: 'Value' } } });
    expect(chart.getCursor({ fallback: 'latest' }).points[0]).toMatchObject({
      x: 4,
      y: 4,
      rowIndex: 4,
    });
  });

  it.fails('[dxtrial-11:data] an inline empty data array is the same data: appended rows remain', () => {
    const options = { x: 'time', series: [{ y: 'value' }] };
    const chart = mount<Sample>(fakes, { ...options, data: [] });
    for (let time = 0; time < 30; time++) chart.appendData([{ time, value: time }]);
    for (let i = 0; i < 3; i++) chart.setOptions({ ...options, data: [] });
    expect(chart.getCursor({ fallback: 'latest' }).points[0]).toMatchObject({
      x: 29,
      rowIndex: 29,
    });
    expect(warnings()).toEqual([]);
  });

  it.fails('[dxtrial-11:data] replacing data on a streamed source warns once with the discarded rows', () => {
    const options = { x: 'time', series: [{ y: 'value' }] };
    const chart = mount<Sample>(fakes, { ...options, data: initial() });
    for (const time of [5, 6, 7]) chart.appendData([{ time, value: time }]);
    chart.setOptions({ ...options, data: initial() });
    chart.setOptions({ ...options, data: initial() });
    expect(chart.getCursor({ fallback: 'latest' }).points[0]).toMatchObject({ x: 4 });
    expect(warnings().filter((m) => /streamed/.test(m))).toEqual([
      'snaplot: data replaced on a streamed source; 3 appended rows were discarded. Pass data once (useState/createSignal) or omit it.',
    ]);
  });

  it('[dxtrial-11:data] re-ingesting a 10,000-row source more than 10 times a second warns once', () => {
    const big = Array.from({ length: 10_000 }, (_, t) => ({ time: t, value: t % 17 }));
    const chart = mount<Sample>(fakes, { data: big, x: 'time', series: [{ y: 'value' }] });
    for (let i = 0; i < 12; i++) chart.update({ data: big.slice() });
    expect(warnings().filter((m) => /memoise|appendData/.test(m))).toHaveLength(1);
  });

  it('[dxtrial-11:data] a small source re-ingested often does not warn', () => {
    const chart = mount<Sample>(fakes, { data: initial(), x: 'time', series: [{ y: 'value' }] });
    for (let i = 0; i < 12; i++) chart.update({ data: initial() });
    expect(warnings()).toEqual([]);
  });
});

describe('[dxtrial-19] the follow window', () => {
  it.fails('[dxtrial-19] the follow window has its full width from the first sample', () => {
    const chart = mount<Sample>(fakes, {
      data: [{ time: 100, value: 1 }],
      x: 'time',
      series: [{ y: 'value' }],
      streaming: { followWindow: 60 },
    });
    expect(range(chart, 'x')).toEqual([40, 100]);
    chart.appendData([{ time: 110, value: 2 }]);
    expect(range(chart, 'x')).toEqual([50, 110]);
  });
});

describe('[arch-01] appends with a plugin', () => {
  it.fails('[arch-01] 100 appends with a drawing plugin copy the ring 0 times', () => {
    const chart = mount<Sample>(fakes, {
      data: initial(),
      x: 'time',
      series: [{ y: 'value' }],
      streaming: { maxPoints: 5 },
      plugins: [{ id: 'mark', drawAbove() {} }],
    });
    const before = debug(chart).materializeCount;
    for (let time = 10; time < 110; time++) chart.appendData([{ time, value: time }]);
    fakes.frames.flush();
    expect(debug(chart).materializeCount - before).toBe(0);
  });
});
