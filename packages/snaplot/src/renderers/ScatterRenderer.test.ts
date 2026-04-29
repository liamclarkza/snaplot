import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderScatter } from './ScatterRenderer';
import type { Layout, Scale, SeriesConfig } from '../types';

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

describe('renderScatter cache keys', () => {
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
    const series: SeriesConfig = {
      label: 'heat',
      dataIndex: 1,
      type: 'scatter',
      heatmap: true,
    };

    renderScatter(ctx, xData, yDataA, 0, 3, xScale, yScale, layout, series, '#4e79a7');
    renderScatter(ctx, xData, yDataB, 0, 3, xScale, yScale, layout, series, '#4e79a7');
    renderScatter(ctx, xData, yDataB, 0, 3, xScale, yScale, layout, series, '#4e79a7');

    // First render bins yDataA, second bins yDataB, third reuses yDataB cache.
    expect(createImageDataCalls).toBe(2);
    expect(ctx.drawImage).toHaveBeenCalledTimes(3);
  });

  it('includes opacity in the stamped-point cache key', () => {
    const ctx = createContext();
    const xData = Float64Array.from([1]);
    const yData = Float64Array.from([1]);
    const xScale = createScale(0, 2, 0, 20);
    const yScale = createScale(0, 2, 0, 20);
    const layout = createLayout();
    const baseSeries: SeriesConfig = {
      label: 'points',
      dataIndex: 1,
      type: 'scatter',
      pointRadius: 3,
    };

    renderScatter(ctx, xData, yData, 0, 0, xScale, yScale, layout, {
      ...baseSeries,
      opacity: 0.2,
    }, '#4e79a7');
    const firstStamp = vi.mocked(ctx.drawImage).mock.calls[0][0];

    renderScatter(ctx, xData, yData, 0, 0, xScale, yScale, layout, {
      ...baseSeries,
      opacity: 0.8,
    }, '#4e79a7');
    const secondStamp = vi.mocked(ctx.drawImage).mock.calls[1][0];

    expect(secondStamp).not.toBe(firstStamp);
  });
});
