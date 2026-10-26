// @vitest-environment jsdom
// Declarative state options (plan D3): viewport, selection, hiddenSeries and highlight are
// ordinary options. setOptions(full) applies a state option only when it differs from the value
// last applied from options; update(patch) always applies the state keys it names. Applying an
// option never emits; gestures, resets, group sync and data changes do.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debug, type Fakes, installFakes } from '../fakes';
import { doubleClick, type FinalHandle, mount, range, wheelZoom } from './contract';

let fakes: Fakes;
beforeEach(() => {
  fakes = installFakes();
});
afterEach(() => {
  fakes.uninstall();
  vi.restoreAllMocks();
});

type Row = { t: number; v: number; w: number };
const rows: Row[] = Array.from({ length: 101 }, (_, t) => ({ t, v: 20 + (t % 9), w: 5 + (t % 4) }));
const base = {
  data: rows,
  x: 't',
  series: [
    { y: 'v', label: 'V' },
    { y: 'w', label: 'W' },
  ],
};

function events<Row>(chart: FinalHandle<Row>) {
  const seen: Array<[string, unknown]> = [];
  for (const name of [
    'viewport:change',
    'selection:change',
    'hiddenSeries:change',
    'highlight:change',
    'following:change',
  ] as const)
    chart.on(name, (value: unknown) => seen.push([name, value]));
  return seen;
}

describe('[frameworks-04][frameworks-05][dxtrial-04] viewport', () => {
  it.fails('[frameworks-04] update({ viewport: {} }) resets a chart created with {}', () => {
    const chart = mount<Row>(fakes, { ...base, viewport: {} });
    fakes.frames.flush();
    const full = range(chart, 'x');
    wheelZoom(chart, 50, 24);
    expect(range(chart, 'x')![1]).toBeLessThan(full![1]);
    chart.update({ viewport: {} });
    expect(range(chart, 'x')).toEqual(full);
    expect(chart.getState().viewport).toEqual({});
  });

  it.fails('[frameworks-05] an un-echoed inline viewport never snaps a zoom back', () => {
    const chart = mount<Row>(fakes, { ...base, viewport: {} });
    fakes.frames.flush();
    wheelZoom(chart, 50, 24);
    const zoomed = range(chart, 'x');
    for (let i = 0; i < 3; i++) chart.setOptions({ ...base, viewport: {} });
    expect(range(chart, 'x')).toEqual(zoomed);
  });

  it.fails('[frameworks-05] setOptions with an equal viewport neither repaints nor pins again', () => {
    const options = { ...base, viewport: { x: [10, 40] } };
    const chart = mount<Row>(fakes, options);
    fakes.frames.flush();
    const before = { ...debug(chart).renderCount };
    chart.setOptions({ ...options, viewport: { x: [10, 40] } });
    fakes.frames.flush();
    expect(debug(chart).renderCount).toEqual(before);
    expect(range(chart, 'x')).toEqual([10, 40]);
  });

  it.fails('[frameworks-05] a changed viewport option applies, and removing the option resets', () => {
    const chart = mount<Row>(fakes, { ...base, viewport: { x: [10, 40] } });
    chart.setOptions({ ...base, viewport: { x: [20, 30] } });
    expect(range(chart, 'x')).toEqual([20, 30]);
    chart.setOptions(base);
    expect(chart.getState().viewport).toEqual({});
    expect(range(chart, 'x')).toEqual([0, 100]);
  });

  it.fails('[dxtrial-04][frameworks-05] an X zoom reports only the X axis, once', () => {
    const chart = mount<Row>(fakes, base);
    const seen = events(chart);
    wheelZoom(chart, 50, 24);
    const viewports = seen.filter(([name]) => name === 'viewport:change');
    expect(viewports).toHaveLength(1);
    expect(Object.keys(viewports[0][1] as object)).toEqual(['x']);
    expect(chart.getState().viewport).toEqual(viewports[0][1]);
  });

  it.fails('[dxtrial-04] echoing the reported viewport keeps Y automatic', () => {
    const chart = mount<Row>(fakes, base);
    let reported: object | null = null;
    chart.on('viewport:change', (viewport) => {
      reported = viewport;
    });
    wheelZoom(chart, 50, 24);
    expect(reported).not.toBeNull();
    chart.setOptions({ ...base, viewport: reported });
    chart.setOptions({
      ...base,
      viewport: reported,
      data: rows.map((row) => ({ ...row, v: row.v * 10 })),
    });
    expect(range(chart, 'y')![1]).toBeGreaterThanOrEqual(280);
  });

  it.fails('[frameworks-04] a reset emits {} exactly once, from resetViewport() and from a double-click', () => {
    const chart = mount<Row>(fakes, base);
    wheelZoom(chart, 50, 24);
    const seen = events(chart);
    chart.resetViewport();
    expect(seen.filter(([name]) => name === 'viewport:change').map(([, value]) => value)).toEqual([
      {},
    ]);
    wheelZoom(chart, 50, 24);
    seen.length = 0;
    doubleClick(chart, 50, 24);
    expect(seen.filter(([name]) => name === 'viewport:change').map(([, value]) => value)).toEqual([
      {},
    ]);
  });

  it.fails('[frameworks-04] applying a viewport option never emits; the callback option mirrors the event', () => {
    const onViewportChange = vi.fn();
    const chart = mount<Row>(fakes, { ...base, onViewportChange });
    const seen = events(chart);
    chart.update({ viewport: { x: [10, 20] } });
    chart.setOptions({ ...base, onViewportChange, viewport: { x: [30, 40] } });
    expect(seen.filter(([name]) => name === 'viewport:change')).toEqual([]);
    expect(onViewportChange).not.toHaveBeenCalled();
    chart.resetViewport();
    expect(onViewportChange.mock.calls).toEqual([[{}]]);
  });

  it.fails('[dxtrial-19] update({ viewport: { x } }) pauses following and resumeFollow() resumes', () => {
    const chart = mount<Row>(fakes, { ...base, streaming: { followWindow: 20 } });
    const seen = events(chart);
    expect(chart.getState().following).toBe(true);
    chart.update({ viewport: { x: [10, 20] } });
    expect(chart.getState().following).toBe(false);
    chart.appendData([{ t: 101, v: 1, w: 1 }]);
    expect(range(chart, 'x')).toEqual([10, 20]);
    chart.resumeFollow();
    expect(chart.getState().following).toBe(true);
    expect(range(chart, 'x')).toEqual([81, 101]);
    expect(seen.filter(([name]) => name === 'following:change').map(([, v]) => v)).toEqual([
      false,
      true,
    ]);
  });

  it.fails('[dataapi-14] replacing data outside a pinned X range unpins that axis', () => {
    const chart = mount<Row>(fakes, base);
    chart.update({ viewport: { x: [10, 20] } });
    chart.update({ data: Array.from({ length: 101 }, (_, i) => ({ t: 1000 + i, v: 5, w: 1 })) });
    expect(range(chart, 'x')).toEqual([1000, 1100]);
    expect(chart.getState().viewport).toEqual({});
  });

  it.fails('[dataapi-14] replacing data that overlaps a pinned X range keeps it', () => {
    const chart = mount<Row>(fakes, base);
    chart.update({ viewport: { x: [10, 20] } });
    chart.update({ data: rows.map((row) => ({ ...row, v: row.v + 1 })) });
    expect(range(chart, 'x')).toEqual([10, 20]);
  });
});

describe('[dataapi-16][backlog-02] selection', () => {
  const brush = { ...base, interaction: { drag: 'select' } };

  it('[dataapi-16] a non-finite selection throws and changes nothing', () => {
    const chart = mount<Row>(fakes, brush);
    expect(() => chart.update({ selection: { x: [Number.NaN, 10] } })).toThrow(/selection/);
    expect(chart.getState().selection).toBeNull();
  });

  it.fails('[backlog-02] a selection option applies silently; a data change that clears it emits null', () => {
    const chart = mount<Row>(fakes, brush);
    const seen = events(chart);
    chart.update({ selection: { x: [40, 60] } });
    expect(chart.getState().selection).toEqual({ x: [40, 60] });
    expect(seen).toEqual([]);
    chart.update({ data: Array.from({ length: 10 }, (_, i) => ({ t: 500 + i, v: 1, w: 1 })) });
    expect(chart.getState().selection).toBeNull();
    expect(seen).toEqual([['selection:change', null]]);
  });
});

describe('hiddenSeries and highlight', () => {
  it.fails('[frameworks-05] hiddenSeries applies once per changed value; update({ hiddenSeries: undefined }) shows every series', () => {
    const chart = mount<Row>(fakes, { ...base, hiddenSeries: ['w'] });
    expect(chart.getState().hiddenSeries).toEqual(['w']);
    fakes.frames.flush();
    const before = { ...debug(chart).renderCount };
    chart.setOptions({ ...base, hiddenSeries: ['w'] });
    fakes.frames.flush();
    expect(debug(chart).renderCount).toEqual(before);
    chart.update({ hiddenSeries: undefined });
    expect(chart.getState().hiddenSeries).toEqual([]);
    expect(chart.getState().series.map((s) => s.visible)).toEqual([true, true]);
  });

  it.fails('[frameworks-05] a hiddenSeries option kept in setOptions survives a series change that drops it', () => {
    const chart = mount<Row>(fakes, base);
    chart.update({ hiddenSeries: ['w'] });
    chart.update({ series: [base.series[0]] });
    expect(chart.getState().hiddenSeries).toEqual([]);
    chart.update({ axes: { y: { title: 'Load' } } });
    expect(chart.getState().series.map((s) => s.id)).toEqual(['v']);
  });

  it.fails('[frameworks-04] highlight is a state option: applied silently, compared with the last applied value', () => {
    const onHighlightChange = vi.fn();
    const chart = mount<Row>(fakes, { ...base, onHighlightChange });
    const seen = events(chart);
    chart.update({ highlight: 'w' });
    expect(chart.getState().highlight).toBe('w');
    chart.setOptions({ ...base, onHighlightChange, highlight: 'w' });
    chart.setOptions({ ...base, onHighlightChange, highlight: null });
    expect(chart.getState().highlight).toBeNull();
    expect(seen).toEqual([]);
    expect(onHighlightChange).not.toHaveBeenCalled();
  });

  it('state options naming unknown series throw and change nothing', () => {
    const chart = mount<Row>(fakes, base);
    expect(() => chart.update({ highlight: 'nope' })).toThrow(/"nope"/);
    expect(() => chart.update({ hiddenSeries: ['nope'] })).toThrow(/"nope"/);
    expect(chart.getState()).toMatchObject({ hiddenSeries: [] });
  });
});
