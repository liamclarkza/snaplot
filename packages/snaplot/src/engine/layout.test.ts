import { describe, expect, it } from 'vitest';
import { AXIS_LABEL_GAP, AXIS_TICK_LENGTH, EDGE_MARGIN } from '../constants';
import type { ChartSpec, Scale } from './spec';
import { computeLayout, type PlotInsets } from './layout';

// Without a DOM, Layout measures text at 7px per character; these tests
// lean on that fallback so widths are deterministic.
const CHAR_W = 7;
const FONT_SIZE = 12;

function scale(key: string, ticks: number[]): Scale {
  return {
    type: 'linear',
    key,
    min: Math.min(...ticks),
    max: Math.max(...ticks),
    dataToPixel: (v: number) => v,
    pixelToData: (p: number) => p,
    ticks: () => ticks,
    tickFormat: (v: number) => String(v),
    nice: () => {},
    setPixelRange: () => {},
  };
}

function layoutFor(config: ChartSpec, scales: Map<string, Scale>, insets?: PlotInsets) {
  return computeLayout(640, 240, config, scales, 1, 'sans-serif', FONT_SIZE, insets);
}

describe('computeLayout edge margin', () => {
  const scales = new Map<string, Scale>([
    ['x', scale('x', [0, 50, 100])],
    ['y', scale('y', [12000, 14000, 16000])],
  ]);

  it('keeps EDGE_MARGIN between the widest left tick label and the canvas edge', () => {
    const layout = layoutFor(
      // Deliberately undersized insets: the measured gutter must win.
      { series: [], axes: { x: {}, y: {} } } as ChartSpec,
      scales,
      { left: 8 },
    );
    const maxLabelWidth = '16000'.length * CHAR_W;
    expect(layout.plot.left).toBeGreaterThanOrEqual(
      maxLabelWidth + AXIS_TICK_LENGTH + AXIS_LABEL_GAP + EDGE_MARGIN,
    );
  });

  it('reserves a full title strip when a vertical axis has a label', () => {
    const base = layoutFor({ series: [], axes: { x: {}, y: {} } } as ChartSpec, scales, {
      left: 8,
    });
    const titled = layoutFor(
      { series: [], axes: { x: {}, y: { title: 'Validation loss' } } } as ChartSpec,
      scales,
      { left: 8 },
    );
    // A 16.8 px line and the 8 px gap before the labels, up to a whole pixel.
    expect(titled.plot.left).toBe(Math.ceil(base.plot.left + FONT_SIZE * 1.4 + 8));
  });

  it('reserves a full title strip below a labelled bottom axis', () => {
    const base = layoutFor({ series: [], axes: { x: {}, y: {} } } as ChartSpec, scales);
    const titled = layoutFor(
      { series: [], axes: { x: { title: 'Learning rate' }, y: {} } } as ChartSpec,
      scales,
    );
    // Tick 4 + gap 4 + a 16.8 px line + the 8 px edge margin, up to a whole pixel: no floor.
    expect(base.axes.x.area.height).toBe(33);
    expect(titled.axes.x.area.height).toBe(58);
  });

  it('reserves the outer half of horizontal edge labels', () => {
    const edgeScales = new Map<string, Scale>([['x', scale('x', [10, 1000])]]);
    const layout = layoutFor(
      {
        series: [],
        axes: { x: { format: (value: number) => `${value} ms` } },
      } as ChartSpec,
      edgeScales,
      { left: 4, right: 4 },
    );
    expect(layout.plot.left).toBeGreaterThanOrEqual(('10 ms'.length * CHAR_W) / 2 + EDGE_MARGIN);
    expect(layout.width - layout.plot.left - layout.plot.width).toBeGreaterThanOrEqual(
      ('1000 ms'.length * CHAR_W) / 2 + EDGE_MARGIN,
    );
  });

  it('does not mistake horizontal endpoint clearance for a right Y axis', () => {
    const insetCategoryScale = {
      ...scale('x', [0, 1, 2, 3]),
      min: -0.5,
      max: 3.5,
    };
    const categoryScales = new Map<string, Scale>([
      ['x', insetCategoryScale],
      ['y', scale('y', [99.8, 99.9, 100])],
    ]);
    const layout = layoutFor(
      {
        series: [],
        axes: {
          x: {
            ticks: [0, 1, 2, 3],
            format: (value: number) => ['JHB', 'FRA', 'IAD', 'SIN'][value],
          },
          y: { format: (value: number) => `${value.toFixed(1)}%` },
        },
      } as ChartSpec,
      categoryScales,
      { left: 12, right: 12 },
    );

    const rightGutter = layout.width - layout.plot.left - layout.plot.width;
    expect(layout.plot.left).toBeGreaterThan(rightGutter);
    // Half of 'SIN' and the edge margin, up to 8 px: the last label's overhang, not the Y axis.
    expect(rightGutter).toBe(24);
  });
});

describe('computeLayout: one rule for every side', () => {
  // Edge margin + the larger of the side's own axis and the other axis's end labels, rounded up
  // (to a whole pixel, the end labels' overhang to 8 px), raised to the side's minimum. No floors.
  const short = new Map<string, Scale>([
    ['x', scale('x', [0, 5, 10])],
    ['y', scale('y', [0, 1, 2])],
  ]);
  const gutters = (layout: ReturnType<typeof layoutFor>) => ({
    top: layout.plot.top,
    right: layout.width - layout.plot.left - layout.plot.width,
    bottom: layout.height - layout.plot.top - layout.plot.height,
    left: layout.plot.left,
  });

  it('measures every side from what it holds', () => {
    const layout = layoutFor({ series: [], axes: { x: {}, y: {} } } as ChartSpec, short);
    expect(gutters(layout)).toEqual({
      // Half a label's height (0.6 × 12) and the edge margin.
      top: Math.ceil(FONT_SIZE * 0.6 + EDGE_MARGIN),
      // Half of '10' and the edge margin, up to 8 px.
      right: Math.ceil((CHAR_W + EDGE_MARGIN) / 8) * 8,
      // Tick, gap, a 16.8 px line and the edge margin.
      bottom: Math.ceil(AXIS_TICK_LENGTH + AXIS_LABEL_GAP + FONT_SIZE * 1.4 + EDGE_MARGIN),
      // '2', tick, gap and the edge margin, up to a whole pixel.
      left: Math.ceil(CHAR_W + AXIS_TICK_LENGTH + AXIS_LABEL_GAP + EDGE_MARGIN),
    });
  });

  it('keeps the edge margin on a side that holds nothing', () => {
    const layout = layoutFor({ series: [], axes: {} } as ChartSpec, short);
    expect(gutters(layout)).toEqual({
      top: EDGE_MARGIN,
      right: EDGE_MARGIN,
      bottom: EDGE_MARGIN,
      left: EDGE_MARGIN,
    });
  });

  it('gives the same blank before the labels whatever they say', () => {
    const blank = (ticks: number[]) => {
      const scales = new Map<string, Scale>([
        ['x', scale('x', [0, 5, 10])],
        ['y', scale('y', ticks)],
      ]);
      const layout = layoutFor({ series: [], axes: { x: {}, y: {} } } as ChartSpec, scales);
      const label = String(Math.max(...ticks)).length * CHAR_W;
      return layout.plot.left - AXIS_TICK_LENGTH - AXIS_LABEL_GAP - label;
    };
    // The edge margin, plus less than a pixel of rounding.
    for (const ticks of [
      [0, 1, 2],
      [0, 50, 100],
      [0, 5000, 10000],
      [0, 500000, 1000000],
    ]) {
      expect(blank(ticks)).toBeGreaterThanOrEqual(EDGE_MARGIN);
      expect(blank(ticks)).toBeLessThan(EDGE_MARGIN + 1);
    }
  });

  it('starts the y labels of two charts side by side in the same place', () => {
    // One chart's labels read 0.0 to 0.6, the other's 0 to 5: rounding the gutter up to 8 px
    // put 3 px more before the first chart's labels than the second's.
    const charts = [
      { ticks: [0, 0.2, 0.4, 0.6], format: (value: number) => value.toFixed(1) },
      { ticks: [0, 1, 2, 3, 4, 5], format: (value: number) => String(value) },
    ];
    for (const position of ['left', 'right'] as const) {
      const blanks = charts.map(({ ticks, format }) => {
        const scales = new Map<string, Scale>([
          ['x', scale('x', [0, 5, 10])],
          ['y', scale('y', ticks)],
        ]);
        const layout = layoutFor(
          { series: [], axes: { x: {}, y: { format, position } } } as ChartSpec,
          scales,
        );
        const label = Math.max(...ticks.map((tick) => format(tick).length * CHAR_W));
        const axis = AXIS_TICK_LENGTH + AXIS_LABEL_GAP + label;
        // Before the labels on the left; after them, to the edge, on the right.
        return position === 'left'
          ? layout.plot.left - axis
          : layout.width - layout.plot.left - layout.plot.width - axis;
      });
      for (const blank of blanks) {
        expect(blank).toBeGreaterThanOrEqual(EDGE_MARGIN);
        expect(blank).toBeLessThan(EDGE_MARGIN + 1);
      }
    }
  });

  it('raises the gutters holding each kind of axis to its minimum, and no others', () => {
    const measured = gutters(layoutFor({ series: [], axes: { x: {}, y: {} } } as ChartSpec, short));
    const layout = layoutFor(
      { series: [], axes: { x: {}, y: {} }, minGutters: { x: 40, y: 64 } } as ChartSpec,
      short,
    );
    // The y axis is on the left and the x axis below: the top and right hold no axis.
    expect(gutters(layout)).toEqual({ ...measured, left: 64, bottom: 40 });
  });

  it('never narrows a gutter below what it holds', () => {
    const measured = gutters(layoutFor({ series: [], axes: { x: {}, y: {} } } as ChartSpec, short));
    const layout = layoutFor(
      { series: [], axes: { x: {}, y: {} }, minGutters: { x: 1, y: 1 } } as ChartSpec,
      short,
    );
    expect(gutters(layout)).toEqual(measured);
  });

  it('reaches a second y axis, which takes the same width as the first', () => {
    const scales = new Map<string, Scale>([...short, ['y2', scale('y2', [0, 1, 2])]]);
    const layout = layoutFor(
      { series: [], axes: { x: {}, y: {}, y2: {} }, minGutters: { y: 64 } } as ChartSpec,
      scales,
    );
    expect(gutters(layout).left).toBe(64);
    expect(gutters(layout).right).toBe(64);
  });

  it('keeps no minimum on a side that holds no axis', () => {
    const layout = layoutFor(
      { series: [], axes: {}, minGutters: { x: 40, y: 64 } } as ChartSpec,
      short,
    );
    expect(gutters(layout)).toEqual({
      top: EDGE_MARGIN,
      right: EDGE_MARGIN,
      bottom: EDGE_MARGIN,
      left: EDGE_MARGIN,
    });
  });

  it("widens only its own side of a two-axis chart for a group's aligned gutter", () => {
    const scales = new Map<string, Scale>([...short, ['y2', scale('y2', [0, 1, 2])]]);
    const config = { series: [], axes: { x: {}, y: {}, y2: {} } } as ChartSpec;
    const own = gutters(layoutFor(config, scales));
    expect(own.left).toBe(own.right);
    // Another member's wider labels set the group's left; this chart's right stays its own, so
    // its plot ends where the others' do.
    const layout = layoutFor(config, scales, { left: own.left + 40, right: own.right });
    expect(gutters(layout).left).toBe(own.left + 40);
    expect(gutters(layout).right).toBe(own.right);
  });

  it("takes a group's aligned gutter when it is wider than the minimum", () => {
    const layout = layoutFor(
      { series: [], axes: { x: {}, y: {} }, minGutters: { y: 64 } } as ChartSpec,
      short,
      { left: 80 },
    );
    expect(layout.plot.left).toBe(80);
  });
});

describe('reserveChrome (render/surface.ts, the W5 contract the legend calls)', () => {
  const config = {
    series: [],
    axes: { x: { position: 'bottom' }, x2: { position: 'top' }, y: { position: 'left' } },
  } as unknown as ChartSpec;
  const scales = new Map<string, Scale>([
    ['x', scale('x', [0, 50, 100])],
    ['x2', scale('x2', [0, 50, 100])],
    ['y', scale('y', [0, 100])],
  ]);

  it('lays out the axes and the plot between the reserved strips', () => {
    const open = computeLayout(640, 240, config, scales, 1, 'sans-serif', FONT_SIZE);
    const reserved = computeLayout(
      640,
      240,
      config,
      scales,
      1,
      'sans-serif',
      FONT_SIZE,
      {},
      {
        top: 30,
        bottom: 12,
      },
    );
    expect(reserved.plot.top).toBe(open.plot.top + 30);
    expect(reserved.plot.height).toBe(open.plot.height - 42);
    expect(reserved.plot.left).toBe(open.plot.left);
    expect(reserved.plot.width).toBe(open.plot.width);
    expect(reserved.axes.x2?.area.top).toBe(30);
    expect(reserved.axes.x?.area.top).toBe(reserved.plot.top + reserved.plot.height);
    expect(reserved.axes.y?.area.top).toBe(reserved.plot.top);
  });

  it("is today's layout when nothing is reserved", () => {
    expect(
      computeLayout(
        640,
        240,
        config,
        scales,
        1,
        'sans-serif',
        FONT_SIZE,
        {},
        { top: 0, bottom: 0 },
      ),
    ).toEqual(computeLayout(640, 240, config, scales, 1, 'sans-serif', FONT_SIZE));
  });
});

describe('computeLayout slice panel', () => {
  const scales = new Map<string, Scale>([
    ['x', scale('x', [0, 50, 100])],
    ['y', scale('y', [0, 5, 10])],
  ]);
  const config = { series: [], axes: { x: {}, y: {} } } as ChartSpec;
  const layout = (
    slice: { side: 'right' | 'top'; size: number } | null,
    colorScale = 0,
    width = 640,
    height = 240,
  ) =>
    computeLayout(
      width,
      height,
      config,
      scales,
      1,
      'sans-serif',
      FONT_SIZE,
      {},
      undefined,
      undefined,
      colorScale,
      slice,
    );

  it('sits against the plot, with the edge margin beyond it', () => {
    const bare = layout(null);
    const { plot, slice } = layout({ side: 'right', size: 120 });
    expect(slice).toEqual({
      left: plot.left + plot.width,
      top: plot.top,
      width: 120,
      height: plot.height,
    });
    expect(plot.left + plot.width + 120 + EDGE_MARGIN).toBe(640);
    expect(plot.left).toBe(bare.plot.left);
  });

  it('sits between the plot and the colour scale', () => {
    const { plot, slice, colorScale } = layout({ side: 'right', size: 120 }, 64);
    expect(slice?.left).toBe(plot.left + plot.width);
    expect(colorScale?.left).toBe(plot.left + plot.width + 120);
    expect(colorScale!.left + colorScale!.width).toBe(640);
  });

  it("sits above the plot and its top gutter, over the plot's width", () => {
    const bare = layout(null);
    const { plot, slice } = layout({ side: 'top', size: 64 });
    expect(slice).toEqual({ left: plot.left, top: 0, width: plot.width, height: 64 });
    expect(plot.top).toBe(bare.plot.top + 64);
    expect(plot.height).toBe(bare.plot.height - 64);
  });

  it('yields when the plot would be left under one and a half times its size', () => {
    const narrow = layout({ side: 'right', size: 120 }, 0, 330);
    expect(narrow.slice).toBeUndefined();
    expect(narrow.plot).toEqual(layout(null, 0, 330).plot);
    expect(layout({ side: 'right', size: 120 }, 0, 400).slice).toBeDefined();
    expect(layout({ side: 'top', size: 64 }, 0, 640, 150).slice).toBeUndefined();
    // A colour scale keeps its room when the panel yields.
    expect(layout({ side: 'right', size: 120 }, 64, 330).colorScale).toEqual(
      layout(null, 64, 330).colorScale,
    );
  });
});
