import { describe, expect, it, vi } from 'vitest';
import { renderArea, renderBand } from './LineRenderer';
import type { Layout, Scale, SeriesConfig } from '../types';

const f = (xs: number[]) => Float64Array.from(xs);

function createScale(): Scale {
  return {
    type: 'linear',
    key: 'x',
    min: 0,
    max: 10,
    dataToPixel: (value: number) => value,
    pixelToData: (pixel: number) => pixel,
    ticks: () => [],
    tickFormat: (value: number) => String(value),
    nice: () => {},
    setPixelRange: () => {},
  };
}

function createLayout(): Layout {
  return {
    width: 100,
    height: 100,
    plot: { left: 0, top: 0, width: 100, height: 100 },
    axes: {},
    dpr: 1,
  };
}

function createContext(): CanvasRenderingContext2D {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    clip: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    setLineDash: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineJoin: 'miter',
    lineCap: 'butt',
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D;
}

describe('filled line renderers', () => {
  it('fills area charts as separate segments around NaN gaps', () => {
    const ctx = createContext();
    const scale = createScale();
    const layout = createLayout();
    const series: SeriesConfig = { label: 'area', dataIndex: 1, type: 'area' };

    renderArea(
      ctx,
      f([0, 1, 2]),
      f([10, NaN, 20]),
      0,
      2,
      scale,
      scale,
      layout,
      series,
      '#4e79a7',
    );

    expect(ctx.fill).toHaveBeenCalledTimes(2);
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });

  it('fills band charts as separate segments around NaN bound gaps', () => {
    const ctx = createContext();
    const scale = createScale();
    const layout = createLayout();
    const series: SeriesConfig = { label: 'band', dataIndex: 1, type: 'band' };

    renderBand(
      ctx,
      f([0, 1, 2]),
      f([15, 16, 17]),
      f([20, NaN, 30]),
      f([10, NaN, 20]),
      0,
      2,
      scale,
      scale,
      layout,
      series,
      '#4e79a7',
    );

    expect(ctx.fill).toHaveBeenCalledTimes(2);
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });
});
