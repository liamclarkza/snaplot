import { describe, expect, it } from 'vitest';
import { AXIS_LABEL_GAP, AXIS_TICK_LENGTH, EDGE_MARGIN } from '../constants';
import type { ChartConfig, Scale } from '../types';
import { computeLayout } from './Layout';

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

function layoutFor(config: ChartConfig, scales: Map<string, Scale>) {
  return computeLayout(640, 240, config, scales, 1, 'sans-serif', FONT_SIZE);
}

describe('computeLayout edge margin', () => {
  const scales = new Map<string, Scale>([
    ['x', scale('x', [0, 50, 100])],
    ['y', scale('y', [12000, 14000, 16000])],
  ]);

  it('keeps EDGE_MARGIN between the widest left tick label and the canvas edge', () => {
    const layout = layoutFor(
      // Deliberately undersized padding: the measured gutter must win.
      { series: [], axes: { x: {}, y: {} }, padding: { left: 8 } } as ChartConfig,
      scales,
    );
    const maxLabelWidth = '16000'.length * CHAR_W;
    expect(layout.plot.left).toBeGreaterThanOrEqual(
      maxLabelWidth + AXIS_TICK_LENGTH + AXIS_LABEL_GAP + EDGE_MARGIN,
    );
  });

  it('reserves a full title strip when a vertical axis has a label', () => {
    const base = layoutFor({ series: [], axes: { x: {}, y: {} }, padding: { left: 8 } } as ChartConfig, scales);
    const titled = layoutFor(
      { series: [], axes: { x: {}, y: { label: 'Validation loss' } }, padding: { left: 8 } } as ChartConfig,
      scales,
    );
    expect(titled.plot.left).toBeGreaterThan(base.plot.left);
    expect(titled.plot.left % 8).toBe(0);
  });

  it('reserves a full title strip below a labelled bottom axis', () => {
    const base = layoutFor({ series: [], axes: { x: {}, y: {} } } as ChartConfig, scales);
    const titled = layoutFor(
      { series: [], axes: { x: { label: 'Learning rate' }, y: {} } } as ChartConfig,
      scales,
    );
    expect(base.axes.x.area.height).toBe(44);
    expect(titled.axes.x.area.height).toBe(58);
  });

  it('reserves the outer half of horizontal edge labels', () => {
    const edgeScales = new Map<string, Scale>([
      ['x', scale('x', [10, 1000])],
    ]);
    const layout = layoutFor(
      {
        series: [],
        axes: { x: { tickFormat: value => `${value} ms` } },
        padding: { left: 4, right: 4 },
      } as ChartConfig,
      edgeScales,
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
          x: { ticks: [0, 1, 2, 3], tickFormat: value => ['JHB', 'FRA', 'IAD', 'SIN'][value] },
          y: { tickFormat: value => `${value.toFixed(1)}%` },
        },
        padding: { left: 12, right: 12 },
      } as ChartConfig,
      categoryScales,
    );

    const rightGutter = layout.width - layout.plot.left - layout.plot.width;
    expect(layout.plot.left).toBeGreaterThan(rightGutter);
    expect(rightGutter).toBe(12);
  });
});
