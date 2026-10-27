import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Layout, Scale, SeriesSpec } from '../../spec';
import { renderScatterSegments, ScatterSeriesCache } from './draw';
import type { ScatterStyleResolver } from './encoding';

let createImageDataCalls = 0;

function createScale(min: number, max: number, pxMin: number, pxMax: number): Scale {
  return {
    type: 'linear',
    key: 'x',
    min,
    max,
    dataToPixel(value: number) {
      return pxMin + ((value - min) / (max - min)) * (pxMax - pxMin);
    },
    pixelToData(pixel: number) {
      return min + ((pixel - pxMin) / (pxMax - pxMin)) * (max - min);
    },
    ticks: () => [],
    tickFormat: (value: number) => String(value),
    nice: () => {},
    setPixelRange: () => {},
  };
}

function createLayout(): Layout {
  return {
    width: 20,
    height: 20,
    plot: { left: 0, top: 0, width: 20, height: 20 },
    axes: {},
    dpr: 1,
  };
}

function createContext() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    clip: vi.fn(),
    drawImage: vi.fn(),
    scale: vi.fn(),
    arc: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    rect: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    putImageData: vi.fn(),
    createImageData: vi.fn((w: number, h: number) => {
      createImageDataCalls++;
      return {
        width: w,
        height: h,
        data: new Uint8ClampedArray(w * h * 4),
        colorSpace: 'srgb',
      };
    }),
    fillStyle: '',
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D;
}

class MockDocument {
  createElement(): HTMLCanvasElement {
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => createContext(),
    };
    return canvas as unknown as HTMLCanvasElement;
  }
}

describe('renderScatterSegments cache keys', () => {
  beforeEach(() => {
    createImageDataCalls = 0;
    vi.stubGlobal('document', new MockDocument());
    vi.stubGlobal('OffscreenCanvas', undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not reuse a heatmap cache entry for different data arrays', () => {
    const ctx = createContext();
    const xData = Float64Array.from([0, 1, 2, 3]);
    const yDataA = Float64Array.from([1, 2, 3, 2]);
    const yDataB = Float64Array.from([3, 2, 1, 2]);
    const xScale = createScale(0, 3, 0, 20);
    const yScale = createScale(0, 4, 0, 20);
    const layout = createLayout();
    const series: SeriesSpec = {
      label: 'heat',
      yColumn: 1,
      type: 'scatter',
      heatmap: true,
    };
    const cache = new ScatterSeriesCache();
    const palettes = { categorical: [] };

    renderScatterSegments(
      ctx,
      [{ xData, yData: yDataA, startIdx: 0, endIdx: 3 }],
      xScale,
      yScale,
      layout,
      series,
      '#4e79a7',
      1,
      palettes,
      cache,
    );
    renderScatterSegments(
      ctx,
      [{ xData, yData: yDataB, startIdx: 0, endIdx: 3 }],
      xScale,
      yScale,
      layout,
      series,
      '#4e79a7',
      1,
      palettes,
      cache,
    );
    renderScatterSegments(
      ctx,
      [{ xData, yData: yDataB, startIdx: 0, endIdx: 3 }],
      xScale,
      yScale,
      layout,
      series,
      '#4e79a7',
      1,
      palettes,
      cache,
    );

    // First render bins yDataA, second bins yDataB, third reuses yDataB cache.
    expect(createImageDataCalls).toBe(2);
    expect(ctx.drawImage).toHaveBeenCalledTimes(3);
  });

  it('bins a sorted X beyond the viewport, so a pan inside the margin shows its points', () => {
    const ctx = createContext();
    const xData = Float64Array.from({ length: 100 }, (_, i) => i);
    const yData = Float64Array.from({ length: 100 }, (_, i) => i % 4);
    const yScale = createScale(0, 4, 20, 0);
    const series: SeriesSpec = { label: 'heat', yColumn: 1, type: 'scatter', heatmap: true };
    const cache = new ScatterSeriesCache();
    // The points of an X range: what the viewport segments of a sorted store would hold.
    const asked: [number, number][] = [];
    const source = {
      key: 'v1',
      segments: (lo: number, hi: number) => {
        asked.push([lo, hi]);
        return [
          {
            xData,
            yData,
            startIdx: Math.max(0, Math.ceil(lo)),
            endIdx: Math.min(99, Math.floor(hi)),
          },
        ];
      },
    };
    const draw = (min: number, max: number) =>
      renderScatterSegments(
        ctx,
        // Only the points in view, as the series pass hands them over.
        [{ xData, yData, startIdx: min, endIdx: max }],
        createScale(min, max, 0, 20),
        yScale,
        createLayout(),
        series,
        '#4e79a7',
        1,
        { categorical: [] },
        cache,
        undefined,
        1,
        false,
        source,
      );
    draw(20, 40);
    // The bitmap holds half a span of points either side of the 20–40 view.
    expect(asked).toHaveLength(1);
    expect(asked[0][0]).toBeLessThanOrEqual(10);
    expect(asked[0][1]).toBeGreaterThanOrEqual(50);
    draw(25, 45);
    // A pan inside the margin draws a window of the same bitmap.
    expect(asked).toHaveLength(1);
    expect(createImageDataCalls).toBe(1);
  });

  it('keeps separate caches warm when two heatmap series interleave', () => {
    // Regression test for the module-level single-slot cache: two charts
    // (or two density series) alternating repaints used to evict each
    // other every frame, degrading every repaint to a full rebin.
    const ctx = createContext();
    const xData = Float64Array.from([0, 1, 2, 3]);
    const yDataA = Float64Array.from([1, 2, 3, 2]);
    const yDataB = Float64Array.from([3, 2, 1, 2]);
    const xScale = createScale(0, 3, 0, 20);
    const yScale = createScale(0, 4, 0, 20);
    const layout = createLayout();
    const series: SeriesSpec = {
      label: 'heat',
      yColumn: 1,
      type: 'scatter',
      heatmap: true,
    };
    const cacheA = new ScatterSeriesCache();
    const cacheB = new ScatterSeriesCache();
    const palettes = { categorical: [] };

    renderScatterSegments(
      ctx,
      [{ xData, yData: yDataA, startIdx: 0, endIdx: 3 }],
      xScale,
      yScale,
      layout,
      series,
      '#4e79a7',
      1,
      palettes,
      cacheA,
    );
    renderScatterSegments(
      ctx,
      [{ xData, yData: yDataB, startIdx: 0, endIdx: 3 }],
      xScale,
      yScale,
      layout,
      series,
      '#4e79a7',
      1,
      palettes,
      cacheB,
    );
    renderScatterSegments(
      ctx,
      [{ xData, yData: yDataA, startIdx: 0, endIdx: 3 }],
      xScale,
      yScale,
      layout,
      series,
      '#4e79a7',
      1,
      palettes,
      cacheA,
    );
    renderScatterSegments(
      ctx,
      [{ xData, yData: yDataB, startIdx: 0, endIdx: 3 }],
      xScale,
      yScale,
      layout,
      series,
      '#4e79a7',
      1,
      palettes,
      cacheB,
    );

    // One bin pass per series; the interleaved repaints hit their caches.
    expect(createImageDataCalls).toBe(2);
    expect(ctx.drawImage).toHaveBeenCalledTimes(4);
  });

  it('includes opacity in the stamped-point cache key', () => {
    const ctx = createContext();
    const xData = Float64Array.from([1]);
    const yData = Float64Array.from([1]);
    const xScale = createScale(0, 2, 0, 20);
    const yScale = createScale(0, 2, 0, 20);
    const layout = createLayout();
    const baseSeries: SeriesSpec = {
      label: 'points',
      yColumn: 1,
      type: 'scatter',
      pointRadius: 3,
    };

    renderScatterSegments(
      ctx,
      [{ xData, yData, startIdx: 0, endIdx: 0 }],
      xScale,
      yScale,
      layout,
      {
        ...baseSeries,
        opacity: 0.2,
      },
      '#4e79a7',
    );
    const firstStamp = vi.mocked(ctx.drawImage).mock.calls[0][0];

    renderScatterSegments(
      ctx,
      [{ xData, yData, startIdx: 0, endIdx: 0 }],
      xScale,
      yScale,
      layout,
      {
        ...baseSeries,
        opacity: 0.8,
      },
      '#4e79a7',
    );
    const secondStamp = vi.mocked(ctx.drawImage).mock.calls[1][0];

    expect(secondStamp).not.toBe(firstStamp);
  });

  it('batches fixed-radius variable colours during viewport gestures', () => {
    const ctx = createContext();
    const xData = Float64Array.from([1, 2, 3, 4]);
    const yData = Float64Array.from([1, 2, 3, 4]);
    const scale = createScale(0, 5, 0, 20);
    const resolver: ScatterStyleResolver = {
      variableColor: true,
      variableRadius: false,
      maxRadius: 3,
      colorBinAt: (index) => index % 2,
      colorForBin: (bin) => (bin === 0 ? '#f00' : '#00f'),
      colorAt: (index) => (index % 2 === 0 ? '#f00' : '#00f'),
      radiusAt: () => 3,
    };

    renderScatterSegments(
      ctx,
      [{ xData, yData, startIdx: 0, endIdx: 3 }],
      scale,
      scale,
      createLayout(),
      { label: 'variable', type: 'scatter', yColumn: 1, opacity: 0.5 },
      '#f00',
      1,
      { categorical: [] },
      undefined,
      resolver,
      1,
      true,
    );

    expect(ctx.drawImage).not.toHaveBeenCalled();
    expect(ctx.fill).toHaveBeenCalledTimes(2);
    expect(ctx.arc).toHaveBeenCalledTimes(4);
  });

  it('batches a fixed-radius constant colour into one fill during viewport gestures', () => {
    const ctx = createContext();
    const xData = Float64Array.from([1, 2, 3, 4]);
    const yData = Float64Array.from([1, 2, 3, 4]);
    const scale = createScale(0, 5, 0, 20);

    renderScatterSegments(
      ctx,
      [{ xData, yData, startIdx: 0, endIdx: 3 }],
      scale,
      scale,
      createLayout(),
      { label: 'constant', type: 'scatter', yColumn: 1, opacity: 0.5 },
      '#f00',
      1,
      { categorical: [] },
      undefined,
      undefined,
      1,
      true,
    );

    expect(ctx.drawImage).not.toHaveBeenCalled();
    expect(ctx.fill).toHaveBeenCalledTimes(1);
    expect(ctx.arc).toHaveBeenCalledTimes(4);
  });
});
