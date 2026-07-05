import { describe, expect, it, vi } from 'vitest';
import { renderHistogram } from './HistogramRenderer';
import type { Layout, Scale, SeriesConfig } from '../types';

const f = (xs: number[]) => Float64Array.from(xs);

function linearScale(key: string): Scale {
  return {
    type: 'linear',
    key,
    min: 0,
    max: 100,
    dataToPixel: (value: number) => value,
    pixelToData: (pixel: number) => pixel,
    ticks: () => [],
    tickFormat: (value: number) => String(value),
    nice: () => {},
    setPixelRange: () => {},
  };
}

function layout(): Layout {
  return {
    width: 100,
    height: 100,
    plot: { left: 0, top: 0, width: 100, height: 100 },
    axes: {},
    dpr: 1,
  };
}

describe('renderHistogram baseline', () => {
  it('anchors bins to the scale minimum on a log Y axis', () => {
    const fillRect = vi.fn();
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      clip: vi.fn(),
      fillRect,
      strokeRect: vi.fn(),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D;

    const scaleX = linearScale('x');
    const scaleY: Scale = {
      ...linearScale('y'),
      type: 'log',
      min: 1,
      max: 100,
      dataToPixel: (value: number) => (value > 0 ? 100 - value : Number.NaN),
    };
    const series: SeriesConfig = { label: 'hist', dataIndex: 1, type: 'histogram' };

    // 3 edges → 2 bins (last count is padding).
    renderHistogram(ctx, f([0, 1, 2]), f([10, 20, 0]), 0, 2, scaleX, scaleY, layout(), series, '#4e79a7');

    expect(fillRect).toHaveBeenCalledTimes(2);
  });
});
