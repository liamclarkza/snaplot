import { describe, expect, it, vi } from 'vitest';
import { renderBars, renderBarsSegments } from './BarRenderer';
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

function context() {
  const fillRect = vi.fn();
  const ctx = {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    clip: vi.fn(),
    fillRect,
    fillStyle: '',
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D;
  return { ctx, fillRect };
}

const series: SeriesConfig = { label: 'bar', dataIndex: 1, type: 'bar' };

describe('renderBars baseline', () => {
  it('anchors bars to the scale minimum on a log Y axis', () => {
    const { ctx, fillRect } = context();
    const scaleX = linearScale('x');
    const scaleY: Scale = {
      ...linearScale('y'),
      type: 'log',
      min: 1,
      max: 100,
      // dataToPixel(0) is NaN on a log scale; the renderer must not depend on it.
      dataToPixel: (value: number) => (value > 0 ? 100 - value : Number.NaN),
    };

    renderBars(ctx, f([1, 2, 3]), f([10, 20, 30]), 0, 2, scaleX, scaleY, layout(), series, '#4e79a7', 0, 1);

    expect(fillRect).toHaveBeenCalledTimes(3);
  });
});

describe('renderBars width', () => {
  it('keeps a lone visible bar at its data spacing, not a fraction of the plot', () => {
    const { ctx, fillRect } = context();
    const scaleX = linearScale('x');
    const scaleY = linearScale('y');
    const xData = f([0, 10, 20, 30, 40, 50, 60, 70]);
    const yData = f([1, 2, 3, 4, 5, 6, 7, 8]);

    // Viewport culling leaves a single bar (index 5) in range.
    renderBars(ctx, xData, yData, 5, 5, scaleX, scaleY, layout(), series, '#4e79a7', 0, 1);

    expect(fillRect).toHaveBeenCalledTimes(1);
    const width = fillRect.mock.calls[0][2] as number;
    // Data spacing is 10px; the bar sits well under the old plot*0.5 fallback.
    expect(width).toBeGreaterThan(0);
    expect(width).toBeLessThan(10);
  });
});

describe('renderBars per-datum fill', () => {
  it('honors a static series.fill string over the series color', () => {
    const { ctx, fillRect } = context();
    renderBars(
      ctx,
      f([10, 20, 30]),
      f([5, 6, 7]),
      0,
      2,
      linearScale('x'),
      linearScale('y'),
      layout(),
      { ...series, fill: '#ff0000' },
      '#4e79a7',
      0,
      1,
    );
    expect(fillRect).toHaveBeenCalledTimes(3);
    expect(ctx.fillStyle).toBe('#ff0000');
  });

  it('calls a fill callback per bar with value and logical index', () => {
    const { ctx, fillRect } = context();
    const seen: Array<[number, number]> = [];
    const styles: string[] = [];
    // Capture the fillStyle active at each fillRect call.
    (fillRect as ReturnType<typeof vi.fn>).mockImplementation(() => {
      styles.push(ctx.fillStyle as string);
    });

    renderBars(
      ctx,
      f([10, 20, 30]),
      f([5, 6, 7]),
      0,
      2,
      linearScale('x'),
      linearScale('y'),
      layout(),
      {
        ...series,
        fill: (value, index) => {
          seen.push([value, index]);
          return index === 2 ? '#e8590c' : '#4f8fea';
        },
      },
      '#4e79a7',
      0,
      1,
    );

    expect(seen).toEqual([
      [5, 0],
      [6, 1],
      [7, 2],
    ]);
    expect(styles).toEqual(['#4f8fea', '#4f8fea', '#e8590c']);
  });

  it('offsets callback indices to logical positions for wrapped ring segments', () => {
    const { ctx } = context();
    const seen: number[] = [];
    const barSeries: SeriesConfig = {
      ...series,
      fill: (_v, index) => {
        seen.push(index);
        return '#4f8fea';
      },
    };
    // A physical run starting at slot 0 whose logical origin is 4 (ring wrap).
    renderBarsSegments(
      ctx,
      [{ xData: f([10, 20]), yData: f([5, 6]), startIdx: 0, endIdx: 1, logicalStartIdx: 4 }],
      linearScale('x'),
      linearScale('y'),
      layout(),
      barSeries,
      '#4e79a7',
      0,
      1,
    );
    expect(seen).toEqual([4, 5]);
  });
});
