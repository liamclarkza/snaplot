// @vitest-environment jsdom
// A heatmap's slice through the public API: the row under the cursor from getSlice(), sliceBins(),
// the tooltip's profile, the panel's room in the layout, pins, and the option's checks.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { histogram2d, sliceBins } from '../../src/index';
import { debug, type Fakes, installFakes, tooltipText } from '../fakes';
import { hoverAt, mount } from './contract';

let fakes: Fakes;
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  fakes = installFakes();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  fakes.uninstall();
  vi.restoreAllMocks();
});

type Minute = { t: number; counts: (number | null)[] };
/** Four latency bins of 10 ms from 0 to 40 ms; minute `t` holds t, 2t, 3t and an empty cell. */
const minute = (t: number): Minute => ({ t, counts: [t, 2 * t, 3 * t, null] });
const bins = { start: 5, step: 10, count: 4 };
const minutes = [0, 1, 2, 3, 4].map(minute);
/** Rows along X: each minute a column of cells. */
const along = (slice?: unknown, extra: Record<string, unknown> = {}) => ({
  data: minutes,
  x: 't',
  series: [{ type: 'heatmap', id: 'latency', values: 'counts', bins, slice }],
  ...extra,
});
/** Rows up the plot: each minute a row of cells. */
const up = (slice?: unknown) => ({
  data: minutes,
  series: [{ type: 'heatmap', id: 'latency', y: 't', values: 'counts', bins, slice }],
});

describe('getSlice()', () => {
  it('reads the row under the cursor: its position, its cells and their spans', () => {
    const chart = mount<Minute>(fakes, along());
    fakes.frames.flush();
    expect(chart.getSlice()).toBeNull();
    hoverAt(chart, 2.2, 15);
    const slice = chart.getSlice('latency')!;
    expect(slice).toMatchObject({
      seriesId: 'latency',
      position: 2,
      formattedPosition: '2',
      rowIndex: 2,
      row: minutes[2],
      source: 'cursor',
    });
    expect([...slice.values]).toEqual([2, 4, 6, Number.NaN]);
    expect([...slice.bins.min]).toEqual([0, 10, 20, 30]);
    expect([...slice.bins.max]).toEqual([10, 20, 30, 40]);
  });

  it('reads the row over an empty cell, where the cursor reports no point', () => {
    const chart = mount<Minute>(fakes, along());
    fakes.frames.flush();
    hoverAt(chart, 3, 35);
    expect(chart.getCursor().points).toEqual([]);
    expect(chart.getSlice()?.position).toBe(3);
  });

  it('falls back to the latest or the first row when asked, and reads a position with at', () => {
    const chart = mount<Minute>(fakes, along());
    fakes.frames.flush();
    expect(chart.getSlice('latency', { fallback: 'latest' })).toMatchObject({
      position: 4,
      source: 'latest',
    });
    expect(chart.getSlice('latency', { fallback: 'first' })).toMatchObject({
      position: 0,
      source: 'first',
    });
    expect(chart.getSlice('latency', { at: 1.4 })).toMatchObject({
      position: 1,
      source: 'position',
    });
    // A position past the rows is no row, whatever the fallback.
    expect(chart.getSlice('latency', { at: 40, fallback: 'latest' })).toBeNull();
  });

  it("follows a cursor set from outside (a group's) for rows along X", () => {
    const chart = mount<Minute>(fakes, along());
    fakes.frames.flush();
    chart.setCursor(3);
    expect(chart.getSlice()).toMatchObject({ position: 3, source: 'cursor' });
    chart.setCursor(null);
    expect(chart.getSlice()).toBeNull();
  });

  it('reads rows that run up the plot by the pointer, and not by an X cursor', () => {
    const chart = mount<Minute>(fakes, up());
    fakes.frames.flush();
    hoverAt(chart, 25, 1.2);
    expect(chart.getSlice()).toMatchObject({ position: 1, rowIndex: 1 });
    chart.setCursor(25);
    expect(chart.getSlice()).toBeNull();
  });

  it("reads a grid's column, and the rows a stream kept", () => {
    const grid = mount(fakes, {
      series: [
        { type: 'heatmap', id: 'density', data: histogram2d([1, 1, 3], [1, 3, 3], { bins: 2 }) },
      ],
    });
    fakes.frames.flush();
    const column = grid.getSlice('density', { fallback: 'first' })!;
    expect([...column.values]).toEqual([1, 1]);
    expect(column.row).toBeUndefined();

    const stream = mount<Minute>(fakes, { ...along(), data: [], streaming: { maxPoints: 2 } });
    for (let t = 0; t < 5; t++) stream.appendData([minute(t)]);
    fakes.frames.flush();
    expect(stream.getSlice('latency', { fallback: 'latest' })).toMatchObject({
      position: 4,
      rowIndex: 4,
      row: minute(4),
    });
    expect(stream.getSlice('latency', { fallback: 'first' })?.position).toBe(3);
  });

  it('throws for a series that is not a heatmap of the chart', () => {
    const chart = mount<Minute>(fakes, {
      data: minutes,
      x: 't',
      series: [
        { type: 'heatmap', id: 'latency', values: 'counts', bins },
        { id: 'line', y: (row: Minute) => row.t },
      ],
    });
    expect(() => chart.getSlice('latensy')).toThrow(/not a series.*latency/);
    expect(() => chart.getSlice('line')).toThrow(/not a heatmap series/);
    expect(() => chart.getSlice('latency', { fallback: 'newest' as 'latest' })).toThrow(
      /fallback must be/,
    );
    const lines = mount(fakes, { data: [{ t: 0, v: 1 }], x: 't', series: [{ y: 'v' }] });
    expect(() => lines.getSlice()).toThrow(/this chart has none/);
  });
});

describe('sliceBins()', () => {
  const slice = (values: number[], min: number[], max: number[]) => ({
    values: Float64Array.from(values),
    bins: { min: Float64Array.from(min), max: Float64Array.from(max) },
  });

  it('makes histogram bins of a slice: its edges, its counts and the largest', () => {
    const out = sliceBins(slice([2, 4, 6], [0, 10, 20], [10, 20, 30]));
    expect([...out.edges]).toEqual([0, 10, 20, 30]);
    expect([...out.counts]).toEqual([2, 4, 6]);
    expect(out.maxCount).toBe(6);
  });

  it('counts an empty cell and a negative value as 0, and a gap between cells as an empty bin', () => {
    const out = sliceBins(slice([3, Number.NaN, -2, 5], [0, 10, 30, 40], [10, 20, 40, 50]));
    expect([...out.edges]).toEqual([0, 10, 20, 30, 40, 50]);
    expect([...out.counts]).toEqual([3, 0, 0, 0, 5]);
    expect(out.maxCount).toBe(5);
  });

  it('feeds a histogram series from getSlice()', () => {
    const chart = mount<Minute>(fakes, along());
    fakes.frames.flush();
    const data = sliceBins(chart.getSlice('latency', { fallback: 'latest' })!);
    const detail = mount(fakes, { series: [{ type: 'histogram', id: 'slice', data }] });
    fakes.frames.flush();
    // The histogram's first bin is the slice's first cell.
    expect(detail.getCursor({ fallback: 'first' }).points[0]).toMatchObject({ x: 5, y: 4 });
    expect(() => sliceBins(null as never)).toThrow(/not null/);
  });
});

describe('the slice in the tooltip', () => {
  const picture = () => document.querySelector('.snaplot-tooltip .snaplot-tooltip-slice');

  it('draws the row under the pointer in the built-in tooltip when asked', () => {
    const plain = mount<Minute>(fakes, along());
    fakes.frames.flush();
    hoverAt(plain, 2, 15);
    fakes.frames.flush();
    expect(tooltipText()).toContain('4');
    expect(picture()).toBeNull();
    plain.destroy();

    const chart = mount<Minute>(fakes, along({ tooltip: true }));
    fakes.frames.flush();
    hoverAt(chart, 2, 15);
    fakes.frames.flush();
    expect(picture()?.tagName.toLowerCase()).toBe('svg');
    // No panel was asked for: the plot keeps its width.
    expect(debug(chart).plot.width).toBe(debug(mount<Minute>(fakes, along())).plot.width);
  });
});

describe('the slice panel', () => {
  // Wide enough to spare a panel: the fakes' default host (400 × 200) is not.
  const plotOf = (options: Record<string, unknown>, size = { width: 700, height: 300 }) => {
    const chart = mount<Minute>(fakes, options, size);
    fakes.frames.flush();
    return { chart, plot: debug(chart).plot };
  };

  it('takes its width beside a plot whose rows run along X', () => {
    const bare = plotOf(along()).plot;
    const { plot } = plotOf(along({ panel: true }));
    expect(bare.width - plot.width).toBe(120);
    expect(plot.left).toBe(bare.left);
    expect(plot.height).toBe(bare.height);
    const sized = plotOf(along({ panel: { size: 80 } })).plot;
    expect(bare.width - sized.width).toBe(80);
  });

  it('takes its height above a plot whose rows run up it', () => {
    const bare = plotOf(up()).plot;
    const { plot } = plotOf(up({ panel: true }));
    expect(plot.top - bare.top).toBe(64);
    expect(bare.height - plot.height).toBe(64);
    expect(plot.width).toBe(bare.width);
  });

  it('yields on a chart too small to spare the room', () => {
    const narrow = { width: 260, height: 300 };
    expect(plotOf(along({ panel: true }), narrow).plot.width).toBe(
      plotOf(along(), narrow).plot.width,
    );
    const short = { width: 600, height: 150 };
    expect(plotOf(up({ panel: true }), short).plot.height).toBe(plotOf(up(), short).plot.height);
  });

  it('paints on the overlay alone as the cursor moves, and again when rows arrive', () => {
    const { chart } = plotOf({ ...along({ panel: true }), data: [] });
    chart.appendData(minutes);
    fakes.frames.flush();
    const before = debug(chart).renderCount;
    expect(fakes.canvas.of(debug(chart).layers.overlay).inkSinceClear).toBeGreaterThan(0);
    hoverAt(chart, 2, 15);
    fakes.frames.flush();
    const moved = debug(chart).renderCount;
    expect(moved.data).toBe(before.data);
    expect(moved.overlay).toBe(before.overlay + 1);
    chart.appendData([minute(5)]);
    fakes.frames.flush();
    expect(debug(chart).renderCount.overlay).toBe(moved.overlay + 1);
  });

  it("draws a line through the sliced row, unless the crosshair's own line already does", () => {
    // Dashed strokes on the overlay in the frame after a hover: the crosshair's pass and the cut.
    const dashes = (options: Record<string, unknown>) => {
      const { chart } = plotOf(options);
      const overlay = fakes.canvas.of(debug(chart).layers.overlay);
      const before = overlay.calls.length;
      hoverAt(chart, 2, 15);
      fakes.frames.flush();
      return overlay.calls.slice(before).filter((call) => call.name === 'setLineDash').length;
    };
    // A heatmap alone outlines the cell and draws no vertical line: the slice draws the cut.
    expect(dashes(along({ panel: true }))).toBe(2);
    // Beside a line series the crosshair draws its vertical line, so the slice adds none.
    const withLine = along({ panel: true });
    expect(
      dashes({
        ...withLine,
        series: [...withLine.series, { id: 'total', y: (row: Minute) => row.t }],
      }),
    ).toBe(1);
    expect(dashes(along({ panel: true }, { cursor: { xLine: true } }))).toBe(1);
    expect(dashes(along({ panel: true }, { cursor: false }))).toBe(0);
  });

  it('pins rows without reading the data again', () => {
    const series = (pins: number[]) => along({ panel: true, pins }).series;
    const { chart } = plotOf(along({ panel: true, pins: [] }));
    const overlay = fakes.canvas.of(debug(chart).layers.overlay);
    const strokes = () => overlay.calls.filter((call) => call.name === 'stroke').length;
    const ingests = debug(chart).ingestCount;
    let drawn = strokes();
    chart.update({ series: series([]) });
    fakes.frames.flush();
    const unpinned = strokes() - drawn;
    drawn = strokes();
    chart.update({ series: series([1, 3]) });
    fakes.frames.flush();
    // Each pin is a mark on the plot (two strokes: its halo and its line) and an outline in the panel.
    expect(strokes() - drawn).toBe(unpinned + 6);
    expect(debug(chart).ingestCount).toBe(ingests);
  });
});

describe('the slice option', () => {
  const sliced = (slice: unknown) => () => mount<Minute>(fakes, along(slice));

  it('takes true for the tooltip and the panel, and false or nothing for neither', () => {
    const width = (slice: unknown) => {
      const chart = mount<Minute>(fakes, along(slice), { width: 700, height: 300 });
      fakes.frames.flush();
      return debug(chart).plot.width;
    };
    expect(width(undefined) - width(true)).toBe(120);
    expect(width(false)).toBe(width(undefined));
    expect(width({})).toBe(width(undefined));
  });

  it('checks its values', () => {
    expect(sliced('panel')).toThrow(/slice must be true, false or \{ tooltip, panel, pins \}/);
    expect(sliced({ tooltip: 1 })).toThrow(/slice\.tooltip must be true or false/);
    expect(sliced({ panel: 'right' })).toThrow(/slice\.panel must be true, false or/);
    expect(sliced({ panel: { size: 10 } })).toThrow(/slice\.panel\.size.*at least 24/);
    expect(sliced({ panel: { mean: 'yes' } })).toThrow(/slice\.panel\.mean must be true or false/);
    expect(sliced({ pins: 3 })).toThrow(/slice\.pins must be an array/);
    expect(sliced({ pins: ['soon'] })).toThrow(/slice\.pins\[0\] must be a finite number/);
    expect(sliced({ pins: [new Date(0), 2] })).not.toThrow();
  });

  it('warns about a key it does not have, and belongs to heatmaps only', () => {
    mount<Minute>(fakes, along({ panel: true, pinned: [1] }));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('slice.pinned'));
    expect(() =>
      mount(fakes, { data: [{ t: 0, v: 1 }], x: 't', series: [{ y: 'v', slice: true }] }),
    ).toThrow(/slice, which need type: 'heatmap'/);
  });
});
