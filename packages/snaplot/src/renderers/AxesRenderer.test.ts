import { describe, expect, it, vi } from 'vitest';
import { renderAxes } from './AxesRenderer';
import type { ChartConfig, Layout, Scale, ThemeConfig } from '../types';

function context(): CanvasRenderingContext2D {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    clip: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    setLineDash: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    globalAlpha: 1,
    lineWidth: 1,
  } as unknown as CanvasRenderingContext2D;
}

const theme = {
  backgroundColor: '#ffffff',
  gridColor: '#eee',
  gridOpacity: 1,
  axisLineColor: '#ccc',
  borderColor: '#ccc',
  borderOpacity: 1,
  textColor: '#000',
  fontFamily: 'sans-serif',
  fontSize: 12,
} as unknown as ThemeConfig;

function layout(): Layout {
  return {
    width: 120,
    height: 100,
    plot: { left: 20, top: 0, width: 100, height: 100 },
    axes: {},
    dpr: 1,
  };
}

describe('renderAxes vertical label filtering', () => {
  it('drops left-axis tick labels outside the plot vertical extent', () => {
    const yScale: Scale = {
      type: 'linear',
      key: 'y',
      min: 0,
      max: 100,
      // ticks project 1:1 to pixels; -50 and 150 fall well outside the plot.
      dataToPixel: (v: number) => v,
      pixelToData: (p: number) => p,
      ticks: () => [-50, 50, 150],
      tickFormat: (v: number) => String(v),
      nice: () => {},
      setPixelRange: () => {},
    };
    const scales = new Map<string, Scale>([['y', yScale]]);
    const config = { series: [], axes: { y: { position: 'left' } } } as unknown as ChartConfig;

    const result = renderAxes(context(), layout(), scales, theme, config);
    const labels = result.labels.get('y') ?? [];

    expect(labels.map((l) => l.text)).toEqual(['50']);
  });
});
