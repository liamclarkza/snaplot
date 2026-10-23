import { describe, expect, it, vi } from 'vitest';
import { renderBarsSegments } from './BarRenderer';
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
  const fill = vi.fn();
  const stroke = vi.fn();
  const ctx = {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    closePath: vi.fn(),
    clip: vi.fn(),
    fill,
    stroke,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D;
  return { ctx, fill, stroke };
}

const series: SeriesConfig = { label: 'bar', dataIndex: 1, type: 'bar' };

describe('renderBarsSegments baseline', () => {
  it('anchors bars to the scale minimum on a log Y axis', () => {
    const { ctx, fill } = context();
    const scaleX = linearScale('x');
    const scaleY: Scale = {
      ...linearScale('y'),
      type: 'log',
      min: 1,
      max: 100,
      // dataToPixel(0) is NaN on a log scale; the renderer must not depend on it.
      dataToPixel: (value: number) => (value > 0 ? 100 - value : Number.NaN),
    };

    renderBarsSegments(
      ctx,
      [{ xData: f([1, 2, 3]), yData: f([10, 20, 30]), startIdx: 0, endIdx: 2 }],
      scaleX,
      scaleY,
      layout(),
      series,
      '#4e79a7',
      0,
      1,
    );

    expect(fill).toHaveBeenCalledTimes(3);
  });

  it('uses a translucent default fill and a one-pixel series outline', () => {
    const { ctx, fill, stroke } = context();

    renderBarsSegments(
      ctx,
      [{ xData: f([1]), yData: f([10]), startIdx: 0, endIdx: 0 }],
      linearScale('x'),
      linearScale('y'),
      layout(),
      { ...series, stroke: '#223344' },
      '#4e79a7',
      0,
      1,
    );

    expect(fill).toHaveBeenCalledTimes(1);
    expect(stroke).toHaveBeenCalledTimes(1);
    expect(ctx.globalAlpha).toBe(0.75);
    expect(ctx.strokeStyle).toBe('#223344');
    expect(ctx.lineWidth).toBe(1);
  });

  it('keeps explicit opacity and highlight dimming', () => {
    const { ctx } = context();

    renderBarsSegments(
      ctx,
      [{ xData: f([1]), yData: f([10]), startIdx: 0, endIdx: 0 }],
      linearScale('x'),
      linearScale('y'),
      layout(),
      { ...series, opacity: 0.4 },
      '#4e79a7',
      0,
      1,
      0.5,
    );

    expect(ctx.globalAlpha).toBe(0.2);
  });

  it('rounds only the value edge and leaves the baseline edge square', () => {
    const { ctx } = context();
    const scaleY: Scale = {
      ...linearScale('y'),
      dataToPixel: (value: number) => 100 - value,
    };

    renderBarsSegments(
      ctx,
      [{ xData: f([10, 20]), yData: f([20, -20]), startIdx: 0, endIdx: 1 }],
      linearScale('x'),
      scaleY,
      layout(),
      series,
      '#4e79a7',
      0,
      1,
    );

    const curves = (ctx.quadraticCurveTo as ReturnType<typeof vi.fn>).mock.calls;
    const lineTos = (ctx.lineTo as ReturnType<typeof vi.fn>).mock.calls;
    expect(curves).toHaveLength(4);
    // Positive value edge is at y=80; neither curve touches its y=100 baseline.
    expect(curves[0][1]).toBe(80);
    expect(curves[1][1]).toBe(80);
    // Negative value edge is at y=120; the y=100 baseline is square. The
    // straight segments, rather than the curves, carry the baseline edge.
    expect(curves[2][1]).toBe(120);
    expect(curves[3][1]).toBe(120);
    expect(lineTos.some((call) => call[1] === 100)).toBe(true);
  });
});

/** Horizontal extent of every point on the paths a renderer drew. */
function pathWidth(ctx: CanvasRenderingContext2D): number {
  const calls = (name: 'moveTo' | 'lineTo' | 'quadraticCurveTo') =>
    (ctx[name] as unknown as ReturnType<typeof vi.fn>).mock.calls as number[][];
  const xs = [
    ...calls('moveTo').map((call) => call[0]),
    ...calls('lineTo').map((call) => call[0]),
    ...calls('quadraticCurveTo').flatMap((call) => [call[0], call[2]]),
  ];
  return Math.max(...xs) - Math.min(...xs);
}

describe('renderBarsSegments width', () => {
  // gap-overhaul-delta-06: the probe measured the first moveTo-to-lineTo
  // span, which is 0 for a positive bar on a real (inverted) Y axis and was
  // only positive because the mock Y axis was not inverted.
  it('[gap-overhaul-delta-06] keeps a lone visible bar at its data spacing, not a fraction of the plot', () => {
    const { ctx, fill } = context();
    const scaleX = linearScale('x');
    // A real Y axis is inverted: larger values sit at smaller pixels.
    const scaleY: Scale = { ...linearScale('y'), dataToPixel: (value: number) => 100 - value };
    const xData = f([0, 10, 20, 30, 40, 50, 60, 70]);
    const yData = f([1, 2, 3, 4, 5, 6, 7, 8]);

    // Viewport culling leaves a single bar (index 5) in range.
    renderBarsSegments(
      ctx,
      [{ xData, yData, startIdx: 5, endIdx: 5 }],
      scaleX,
      scaleY,
      layout(),
      series,
      '#4e79a7',
      0,
      1,
    );

    expect(fill).toHaveBeenCalledTimes(1);
    // The whole path's x extent, so the measurement holds for either path direction.
    const width = pathWidth(ctx);
    // Data spacing is 10px; the bar sits well under the old plot*0.5 fallback.
    expect(width).toBeGreaterThan(0);
    expect(width).toBeLessThan(10);
  });
});

describe('renderBarsSegments per-datum fill', () => {
  it('honors a static series.fill string over the series color', () => {
    const { ctx, fill } = context();
    renderBarsSegments(
      ctx,
      [{ xData: f([10, 20, 30]), yData: f([5, 6, 7]), startIdx: 0, endIdx: 2 }],
      linearScale('x'),
      linearScale('y'),
      layout(),
      { ...series, fill: '#ff0000' },
      '#4e79a7',
      0,
      1,
    );
    expect(fill).toHaveBeenCalledTimes(3);
    expect(ctx.fillStyle).toBe('#ff0000');
  });

  it('calls a fill callback per bar with value and logical index', () => {
    const { ctx, fill } = context();
    const seen: Array<[number, number]> = [];
    const styles: string[] = [];
    // Capture the fillStyle active at each fill call.
    (fill as ReturnType<typeof vi.fn>).mockImplementation(() => {
      styles.push(ctx.fillStyle as string);
    });

    renderBarsSegments(
      ctx,
      [{ xData: f([10, 20, 30]), yData: f([5, 6, 7]), startIdx: 0, endIdx: 2 }],
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
