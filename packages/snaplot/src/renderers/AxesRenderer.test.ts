import { describe, expect, it, vi } from 'vitest';
import { axisTickValues, renderAxes, thinTicks } from './AxesRenderer';
import type { ChartConfig, Layout, Scale, ThemeConfig } from '../types';

function linearScale(min: number, max: number, generated: number[]): Scale {
  return {
    type: 'linear',
    key: 'y',
    min,
    max,
    dataToPixel: (v: number) => v,
    pixelToData: (p: number) => p,
    ticks: vi.fn(() => generated),
    tickFormat: (v: number) => String(v),
    nice: () => {},
    setPixelRange: () => {},
  };
}

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

describe('axisTickValues', () => {
  it('passes tickCount through to the scale as the density hint', () => {
    const scale = linearScale(0, 100, [0, 50, 100]);
    axisTickValues(scale, { tickCount: 3 });
    expect(scale.ticks).toHaveBeenCalledWith(3);
  });

  it('uses explicit ticks, clamped to the visible domain', () => {
    const scale = linearScale(10, 90, [0, 50, 100]);
    const values = axisTickValues(scale, { ticks: [0, 10, 50, 90, 100, Number.NaN] });
    expect(values).toEqual([10, 50, 90]);
    expect(scale.ticks).not.toHaveBeenCalled();
  });
});

describe('thinTicks', () => {
  it('keeps short lists intact and thins long lists evenly from the first entry', () => {
    expect(thinTicks([1, 2, 3], 6)).toEqual([1, 2, 3]);
    expect(thinTicks([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 5)).toEqual([0, 2, 4, 6, 8]);
    // 365 daily categories capped to 12 labels: strides of 31.
    const year = Array.from({ length: 365 }, (_, i) => i);
    const thinned = thinTicks(year, 12);
    expect(thinned.length).toBeLessThanOrEqual(12);
    expect(thinned[0]).toBe(0);
  });

  it('never returns fewer than two entries for a multi-entry list', () => {
    expect(thinTicks([1, 2, 3, 4], 0).length).toBeGreaterThanOrEqual(2);
  });
});

describe('per-axis grid config', () => {
  const gridConfig = (grid: unknown) =>
    ({ series: [], axes: { y: { position: 'left', grid } } }) as unknown as ChartConfig;

  it('grid: false suppresses this axis gridlines but keeps its labels', () => {
    const scale = linearScale(0, 100, [25, 50, 75]);
    const scales = new Map<string, Scale>([['y', scale]]);
    const ctx = context();

    const result = renderAxes(ctx, layout(), scales, theme, gridConfig(false));

    // No gridline path segments were emitted (the only moveTo calls for a
    // left axis come from its horizontal gridlines).
    expect(ctx.moveTo).not.toHaveBeenCalled();
    expect((result.labels.get('y') ?? []).length).toBe(3);
  });

  it('applies dash, color, and opacity from the grid object', () => {
    const scale = linearScale(0, 100, [50]);
    const scales = new Map<string, Scale>([['y', scale]]);
    const ctx = context();

    renderAxes(ctx, layout(), scales, theme, gridConfig({ dash: [4, 4], color: '#123456', opacity: 0.4 }));

    expect(ctx.setLineDash).toHaveBeenCalledWith([4, 4]);
    // Dash pattern is reset after the grid stroke so the frame stays solid.
    expect(ctx.setLineDash).toHaveBeenLastCalledWith([]);
    expect(ctx.strokeStyle).toBe(theme.borderColor); // frame drew last
    expect(ctx.moveTo).toHaveBeenCalled();
  });
});

describe('axis title placement', () => {
  it('keeps title glyphs EDGE_MARGIN clear of the canvas edge on all sides', () => {
    const yScale = linearScale(0, 100, [50]);
    const xScale = { ...linearScale(0, 100, [50]), key: 'x' };
    const scales = new Map<string, Scale>([
      ['x', xScale],
      ['y', yScale],
    ]);
    const config = {
      series: [],
      axes: {
        x: { position: 'bottom', label: 'Learning rate' },
        y: { position: 'left', label: 'Validation loss' },
      },
    } as unknown as ChartConfig;
    const fullLayout: Layout = {
      width: 200,
      height: 140,
      plot: { left: 44, top: 10, width: 140, height: 90 },
      axes: {
        x: { position: 'bottom', area: { left: 44, top: 100, width: 140, height: 40 } },
        y: { position: 'left', area: { left: 0, top: 10, width: 44, height: 90 } },
      },
      dpr: 1,
    };
    const ctx = context();
    (ctx as unknown as { measureText: (t: string) => TextMetrics }).measureText = (t: string) =>
      ({ width: t.length * 7 }) as TextMetrics;

    const result = renderAxes(ctx, fullLayout, scales, theme, config);

    const yTitle = (result.labels.get('y') ?? []).find((l) => l.kind === 'title');
    const xTitle = (result.labels.get('x') ?? []).find((l) => l.kind === 'title');
    const fontSize = 12;
    // Rotated left title: glyph left edge = x - fontSize / 2.
    expect(yTitle).toBeDefined();
    expect((yTitle?.x ?? 0) - fontSize / 2).toBeGreaterThanOrEqual(8);
    // Bottom title: glyph bottom edge = y + fontSize / 2, inside the canvas.
    expect(xTitle).toBeDefined();
    expect(fullLayout.height - ((xTitle?.y ?? 0) + fontSize / 2)).toBeGreaterThanOrEqual(8);
  });
});
