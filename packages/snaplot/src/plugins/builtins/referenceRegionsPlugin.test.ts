import { describe, expect, it, vi } from 'vitest';
import { lightTheme } from '../../config/theme';
import type { ChartInstance } from '../../types';
import { createReferenceRegionsPlugin } from './referenceRegionsPlugin';

function chart(redraw = vi.fn()): ChartInstance {
  return {
    redraw,
    getLayout: () => ({
      width: 300,
      height: 180,
      dpr: 1,
      plot: { left: 20, top: 10, width: 200, height: 120 },
      axes: {},
    }),
    getAxis: () => ({
      type: 'linear', key: 'x', min: 0, max: 10,
      dataToPixel: (value: number) => 20 + value * 20,
      pixelToData: (value: number) => (value - 20) / 20,
      ticks: () => [], tickFormat: String, nice: () => {}, setPixelRange: () => {},
    }),
    getTheme: () => lightTheme,
  } as unknown as ChartInstance;
}

function context(): CanvasRenderingContext2D {
  return {
    save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(),
    fillRect: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
    setLineDash: vi.fn(), measureText: vi.fn(() => ({ width: 40 })), fillText: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

describe('createReferenceRegionsPlugin', () => {
  it('draws a clipped data-space interval and its label', () => {
    const plugin = createReferenceRegionsPlugin({
      regions: [{ axis: 'x', from: 2, to: 5, label: 'Peak', fill: '#d00' }],
    });
    const instance = chart();
    const ctx = context();

    plugin.afterDrawGrid?.(instance, ctx);
    plugin.afterDrawData?.(instance, ctx);

    expect(ctx.fillRect).toHaveBeenCalledWith(60, 10, 60, 120);
    expect(ctx.fillText).toHaveBeenCalledWith('Peak', 90, 16);
  });

  it('redraws every installed chart when reactive regions change', () => {
    const redrawA = vi.fn();
    const redrawB = vi.fn();
    const a = chart(redrawA);
    const b = chart(redrawB);
    const plugin = createReferenceRegionsPlugin({ regions: [] });
    plugin.install?.(a);
    plugin.install?.(b);

    plugin.setRegions([{ axis: 'y', from: 20, to: 30 }]);
    expect(redrawA).toHaveBeenCalledOnce();
    expect(redrawB).toHaveBeenCalledOnce();
  });
});
