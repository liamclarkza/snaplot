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
    expect(titled.plot.left).toBeGreaterThan(base.plot.left);
    expect(titled.plot.left % 8).toBe(0);
  });

  it('reserves a full title strip below a labelled bottom axis', () => {
    const base = layoutFor({ series: [], axes: { x: {}, y: {} } } as ChartSpec, scales);
    const titled = layoutFor(
      { series: [], axes: { x: { title: 'Learning rate' }, y: {} } } as ChartSpec,
      scales,
    );
    expect(base.axes.x.area.height).toBe(44);
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
    expect(rightGutter).toBe(12);
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
