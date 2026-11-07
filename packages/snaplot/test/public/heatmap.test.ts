// @vitest-environment jsdom
// The heatmap series through the public API: rows that run along X or up the plot, grids,
// streaming with a bounded history, empty cells and gaps, the colour scale, and the cursor.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { histogram2d } from '../../src/index';
import { debug, type Fakes, installFakes } from '../fakes';
import { hoverAt, mount, range } from './contract';

let fakes: Fakes;
beforeEach(() => {
  fakes = installFakes();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  fakes.uninstall();
  vi.restoreAllMocks();
});

type Procedure = { t: number; db: (number | null)[] };
/** Five channels, the middle one never measured, at 2404–2408 MHz. */
const procedure = (t: number, base = -6): Procedure => ({
  t,
  db: [base, base + 1, null, base + 2, base + 3],
});
const bins = { start: 2404, step: 1, count: 5 };

describe('heatmap rows', () => {
  it('runs rows up the plot with y, bins across X, and ends both axes at the cells', () => {
    const chart = mount<Procedure>(fakes, {
      data: [0, 1, 2, 3].map((t) => procedure(t)),
      series: [{ type: 'heatmap', id: 'response', y: 't', values: 'db', bins }],
    });
    fakes.frames.flush();
    expect(range(chart, 'x')).toEqual([2403.5, 2408.5]);
    expect(range(chart, 'y')).toEqual([-0.5, 3.5]);
    expect(debug(chart).heatmapRasters).toBe(1);
  });

  it('runs rows along the chart x by default (a spectrogram)', () => {
    const chart = mount<Procedure>(fakes, {
      data: [0, 1, 2, 3].map((t) => procedure(t)),
      x: 't',
      series: [{ type: 'heatmap', id: 'power', values: 'db', bins }],
    });
    fakes.frames.flush();
    expect(range(chart, 'x')).toEqual([-0.5, 3.5]);
    expect(range(chart, 'y')).toEqual([2403.5, 2408.5]);
  });

  it('reads the cell under the pointer: its X, its Y and its value', () => {
    const chart = mount<Procedure>(fakes, {
      data: [0, 1, 2, 3].map((t) => procedure(t)),
      series: [{ type: 'heatmap', id: 'response', y: 't', values: 'db', bins }],
      axes: { x: { title: 'Frequency' }, y: { title: 'Time' } },
    });
    fakes.frames.flush();
    hoverAt(chart, 2405.2, 2.1);
    const point = chart.getCursor().points[0];
    expect(point).toMatchObject({
      seriesId: 'response',
      x: 2405,
      y: 2,
      value: -5,
      bin: 1,
      rowIndex: 2,
      xRange: { min: 2404.5, max: 2405.5 },
      yRange: { min: 1.5, max: 2.5 },
    });
    expect(point.formattedValue).toBe('-5');
  });

  it('reports no point over an empty cell (null is not zero)', () => {
    const chart = mount<Procedure>(fakes, {
      data: [0, 1, 2, 3].map((t) => procedure(t)),
      series: [{ type: 'heatmap', id: 'response', y: 't', values: 'db', bins }],
    });
    fakes.frames.flush();
    hoverAt(chart, 2406, 1);
    expect(chart.getCursor().points).toEqual([]);
  });

  it('streams rows with a bounded history: maxPoints keeps the latest', () => {
    const chart = mount<Procedure>(fakes, {
      data: [],
      series: [{ type: 'heatmap', id: 'response', y: 't', values: 'db', bins }],
      streaming: { maxPoints: 3 },
    });
    for (let t = 0; t < 10; t++) chart.appendData([procedure(t)]);
    fakes.frames.flush();
    expect(range(chart, 'y')).toEqual([6.5, 9.5]);
    hoverAt(chart, 2404, 9);
    expect(chart.getCursor().points[0]).toMatchObject({ y: 9, value: -6, rowIndex: 9 });
  });

  it('leaves a missing bin empty instead of stretching its neighbours', () => {
    const chart = mount<{ t: number; v: number[] }>(fakes, {
      data: [0, 1].map((t) => ({ t, v: [1, 2, 3, 4] })),
      x: 't',
      // 2426 to 2428 are missing: a gap, not two cells three wide.
      series: [
        { type: 'heatmap', id: 'v', values: 'v', bins: { centers: [2424, 2425, 2429, 2430] } },
      ],
    });
    fakes.frames.flush();
    hoverAt(chart, 0, 2427);
    expect(chart.getCursor().points).toEqual([]);
    hoverAt(chart, 0, 2425.4);
    expect(chart.getCursor().points[0]).toMatchObject({ y: 2425, value: 2 });
  });
});

describe('heatmap grids', () => {
  it('draws a histogram2d grid', () => {
    const xs = [0, 0.5, 1.5, 2.5, 2.6];
    const ys = [0, 0.2, 1.1, 1.9, 1.95];
    const grid = histogram2d(xs, ys, { bins: [3, 2] });
    expect(grid.values.length).toBe(6);
    expect(grid.maxCount).toBe(2);
    const chart = mount(fakes, { series: [{ type: 'heatmap', id: 'density', data: grid }] });
    fakes.frames.flush();
    expect(range(chart, 'x')).toEqual([0, 2.6]);
    expect(range(chart, 'y')).toEqual([0, 1.95]);
  });
});

describe('heatmap updates', () => {
  it('reads another values field from the streamed rows after update({ series })', () => {
    type Row = { t: number; a: number[]; b: number[] };
    const series = (values: 'a' | 'b') => ({
      type: 'heatmap',
      id: 'h',
      y: 't',
      values,
      bins: { start: 0, step: 1, count: 2 },
    });
    const chart = mount<Row>(fakes, { data: [], series: [series('a')] });
    for (let t = 0; t < 4; t++) chart.appendData([{ t, a: [t, t], b: [-t, -t] }]);
    fakes.frames.flush();
    chart.update({ series: [series('b')] });
    fakes.frames.flush();
    hoverAt(chart, 1, 2);
    expect(chart.getCursor().points[0]).toMatchObject({ y: 2, value: -2 });
    expect(debug(chart).heatmapRasters).toBe(2);
  });
});
