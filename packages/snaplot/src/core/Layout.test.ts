import { describe, expect, it } from 'vitest';
import { EDGE_MARGIN } from '../constants';
import type { ChartConfig, Scale } from '../types';
import { computeLayout } from './Layout';

// Without a DOM, Layout measures text at 7px per character; these tests
// lean on that fallback so widths are deterministic.
const CHAR_W = 7;
const FONT_SIZE = 12;
const TITLE_STRIP = EDGE_MARGIN + FONT_SIZE + 4;

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
    // Gutter = tick mark (4) + gap (8) + label + at least EDGE_MARGIN.
    expect(layout.plot.left).toBeGreaterThanOrEqual(maxLabelWidth + 12 + EDGE_MARGIN);
  });

  it('reserves a full title strip when a vertical axis has a label', () => {
    const base = layoutFor({ series: [], axes: { x: {}, y: {} }, padding: { left: 8 } } as ChartConfig, scales);
    const titled = layoutFor(
      { series: [], axes: { x: {}, y: { label: 'Validation loss' } }, padding: { left: 8 } } as ChartConfig,
      scales,
    );
    expect(titled.plot.left - base.plot.left).toBe(TITLE_STRIP);
  });

  it('reserves a full title strip below a labelled bottom axis', () => {
    const base = layoutFor({ series: [], axes: { x: {}, y: {} } } as ChartConfig, scales);
    const titled = layoutFor(
      { series: [], axes: { x: { label: 'Learning rate' }, y: {} } } as ChartConfig,
      scales,
    );
    expect(base.plot.height - titled.plot.height).toBe(TITLE_STRIP);
  });
});
