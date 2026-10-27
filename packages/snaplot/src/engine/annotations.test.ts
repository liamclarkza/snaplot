import { describe, expect, it, vi } from 'vitest';
import { lightTheme } from './theme/resolve';
import type { EngineHost } from './spec';
import { createReferenceLinesPlugin, createReferenceRegionsPlugin } from './annotations';

function chart(redraw = vi.fn()): EngineHost {
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
      type: 'linear',
      key: 'x',
      min: 0,
      max: 10,
      dataToPixel: (value: number) => 20 + value * 20,
      pixelToData: (value: number) => (value - 20) / 20,
      ticks: () => [],
      tickFormat: String,
      nice: () => {},
      setPixelRange: () => {},
    }),
    getTheme: () => lightTheme,
    resolveColor: (color: string) => color,
  } as unknown as EngineHost;
}

function context(): CanvasRenderingContext2D {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    fillRect: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    setLineDash: vi.fn(),
    measureText: vi.fn(() => ({ width: 40 })),
    fillText: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

describe('createReferenceRegionsPlugin', () => {
  it('centres a label wider than its region over it, inside the plot', () => {
    const plugin = createReferenceRegionsPlugin({
      regions: [
        { axis: 'x', from: 4, to: 5, label: 'Outage' },
        { axis: 'x', from: 0, to: 0.5, label: 'Start' },
      ],
    });
    const ctx = context();
    plugin.afterDrawData?.(chart(), ctx);
    // 100–120 is narrower than the 40 px label: centred on 110.
    expect(ctx.fillText).toHaveBeenCalledWith('Outage', 90, 22);
    // 20–30 at the plot's left edge: moved in to 3 px from it.
    expect(ctx.fillText).toHaveBeenCalledWith('Start', 23, 22);
  });

  it('draws a clipped data-space interval and its label', () => {
    const plugin = createReferenceRegionsPlugin({
      regions: [{ axis: 'x', from: 2, to: 5, label: 'Peak', fill: '#d00' }],
    });
    const instance = chart();
    const ctx = context();

    plugin.afterDrawGrid?.(instance, ctx);
    plugin.afterDrawData?.(instance, ctx);

    expect(ctx.fillRect).toHaveBeenCalledWith(60, 10, 60, 120);
    // Centred on the first row: (60 + 120) / 2 less half of the 40 px label.
    expect(ctx.fillText).toHaveBeenCalledWith('Peak', 70, 22);
  });

  it('keeps a vertical line label off the region label it would cover', () => {
    const regions = createReferenceRegionsPlugin({
      regions: [{ axis: 'x', from: 2, to: 5, label: 'Peak' }],
    });
    const lines = createReferenceLinesPlugin({
      lines: [{ axis: 'x', value: 2.5, label: 'Start' }],
      avoid: (host, ctx) => regions.labelBoxes(host, ctx),
    });
    const instance = chart();
    const ctx = context();

    regions.afterDrawData?.(instance, ctx);
    lines.afterDrawData?.(instance, ctx);

    expect(ctx.fillText).toHaveBeenCalledWith('Peak', 70, 22);
    // The first row (22) is the region's; the line's label takes the next.
    expect(ctx.fillText).toHaveBeenCalledWith('Start', 75, 36);
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
