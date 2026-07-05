import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChartCore } from './Chart';
import type { EventBus } from './EventBus';
import type { ChartInstance, ColumnarData, Plugin, SeriesConfig } from '../types';

const f = (xs: number[]) => Float64Array.from(xs);

function createMockContext(): CanvasRenderingContext2D {
  return {
    scale: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    roundRect: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    setLineDash: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    drawImage: vi.fn(),
    putImageData: vi.fn(),
    createImageData: vi.fn((w: number, h: number) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(w * h * 4),
      colorSpace: 'srgb',
    })),
    measureText: vi.fn((text: string) => ({ width: text.length * 7 })),
    fillText: vi.fn(),
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineJoin: 'miter',
    lineCap: 'butt',
    globalAlpha: 1,
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
  } as unknown as CanvasRenderingContext2D;
}

class MockElement {
  readonly tagName: string;
  readonly children: MockElement[] = [];
  style: Record<string, string | number> & { cssText?: string } = {};
  parentElement: MockElement | null = null;
  tabIndex = 0;
  className = '';
  textContent = '';
  innerHTML = '';
  dataset: Record<string, string> = {};
  clientWidth = 600;
  clientHeight = 400;
  width = 0;
  height = 0;
  type = '';

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  get firstElementChild(): MockElement | null {
    return this.children[0] ?? null;
  }

  get offsetWidth(): number {
    return Math.max(1, this.textContent.length * 7);
  }

  get offsetHeight(): number {
    return 14;
  }

  appendChild<T extends MockElement>(child: T): T {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  insertBefore<T extends MockElement>(child: T, before: MockElement | null): T {
    child.parentElement = this;
    const idx = before ? this.children.indexOf(before) : -1;
    if (idx >= 0) this.children.splice(idx, 0, child);
    else this.children.push(child);
    return child;
  }

  remove(): void {
    if (!this.parentElement) return;
    const idx = this.parentElement.children.indexOf(this);
    if (idx >= 0) this.parentElement.children.splice(idx, 1);
    this.parentElement = null;
  }

  setAttribute(): void {}
  removeAttribute(): void {}
  addEventListener(): void {}
  removeEventListener(): void {}
  setPointerCapture(): void {}
  releasePointerCapture(): void {}

  getBoundingClientRect(): DOMRect {
    return {
      left: 0,
      top: 0,
      right: this.clientWidth,
      bottom: this.clientHeight,
      width: this.clientWidth,
      height: this.clientHeight,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;
  }
}

class MockCanvas extends MockElement {
  private readonly ctx = createMockContext();

  constructor() {
    super('canvas');
  }

  getContext(): CanvasRenderingContext2D {
    return this.ctx;
  }
}

class MockDocument {
  readonly body = new MockElement('body');

  createElement(tagName: string): MockElement {
    return tagName === 'canvas' ? new MockCanvas() : new MockElement(tagName);
  }
}

class MockResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

function chartEventBus(chart: ChartCore): EventBus {
  return (chart as unknown as { eventBus: EventBus }).eventBus;
}

function interactionLayer(chart: ChartCore): MockElement {
  return (chart as unknown as { canvasManager: { interactionLayer: MockElement } }).canvasManager.interactionLayer;
}

function plotPoint(chart: ChartCore, xFraction = 0.5): { x: number; y: number } {
  const { plot } = chart.getLayout();
  return {
    x: plot.left + plot.width * xFraction,
    y: plot.top + plot.height / 2,
  };
}

describe('ChartCore appendData', () => {
  beforeEach(() => {
    vi.stubGlobal('document', new MockDocument());
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('emits data:update and plugin data hooks with the resulting dataset', () => {
    const seenEvents: number[] = [];
    const seenPluginLengths: number[] = [];
    const plugin: Plugin = {
      id: 'test:data-hook',
      onSetData(_chart: ChartInstance, data: ColumnarData) {
        seenPluginLengths.push(data[0].length);
      },
    };

    const parent = document.createElement('div');
    const chart = new ChartCore(
      parent,
      { series: [{ label: 'value', dataIndex: 1 }], plugins: [plugin] },
      [f([1, 2]), f([10, 20])],
    );

    chart.on('data:update', (data) => {
      seenEvents.push(data[0].length);
    });

    chart.appendData([f([3]), f([30])]);
    chart.appendData([f([]), f([])]);

    expect(seenEvents).toEqual([3]);
    expect(seenPluginLengths).toEqual([3]);
    expect(chart.getStats()).toMatchObject({
      dataVersion: 1,
      setDataCount: 0,
      appendDataCount: 1,
    });

    chart.destroy();
  });

  it('tracks setData and render counters in chart stats', () => {
    const chart = new ChartCore(
      document.createElement('div'),
      {
        debug: { stats: true },
        series: [{ label: 'value', dataIndex: 1 }],
      },
      [f([1, 2]), f([10, 20])],
    );

    const initialStats = chart.getStats();
    expect(initialStats.renderCount.grid).toBe(1);
    expect(initialStats.renderCount.data).toBe(1);
    expect(initialStats.renderCount.overlay).toBe(1);

    chart.setData([f([1, 2, 3]), f([10, 20, 30])]);
    expect(chart.getStats()).toMatchObject({
      dataVersion: 1,
      setDataCount: 1,
      appendDataCount: 0,
    });

    chart.destroy();
  });

  it('uses config.streaming.maxLen as the append retention policy', () => {
    const seenEvents: number[] = [];
    const chart = new ChartCore(
      document.createElement('div'),
      {
        streaming: { maxLen: 3 },
        series: [{ label: 'value', dataIndex: 1 }],
      },
      [f([1, 2]), f([10, 20])],
    );

    chart.on('data:update', (data) => {
      seenEvents.push(data[0].length);
    });

    chart.appendData([f([3, 4]), f([30, 40])]);

    expect(seenEvents).toEqual([3]);
    expect(Array.from(chart.getData()[0])).toEqual([2, 3, 4]);
    expect(Array.from(chart.getData()[1])).toEqual([20, 30, 40]);

    chart.destroy();
  });
});

describe('ChartCore runtime options', () => {
  beforeEach(() => {
    vi.stubGlobal('document', new MockDocument());
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('replaces series arrays instead of retaining stale entries', () => {
    const chart = new ChartCore(
      document.createElement('div'),
      {
        series: [
          { label: 'loss', dataIndex: 1 },
          { label: 'accuracy', dataIndex: 2 },
        ],
      },
      [f([1, 2]), f([10, 20]), f([0.5, 0.6])],
    );

    chart.setOptions({ series: [{ label: 'loss only', dataIndex: 1 }] });

    expect(chart.getOptions().series).toEqual([{ label: 'loss only', dataIndex: 1 }]);
    chart.destroy();
  });

  it('replaceOptions drops config keys omitted from the next declarative config', () => {
    const chart = new ChartCore(
      document.createElement('div'),
      {
        axes: { y2: { position: 'right', type: 'linear' } },
        cursor: { syncKey: 'old-group' },
        series: [{ label: 'loss', dataIndex: 1, yAxisKey: 'y2' }],
      },
      [f([1, 2]), f([10, 20])],
    );

    chart.replaceOptions({ series: [{ label: 'loss', dataIndex: 1 }] });

    expect(chart.getOptions().axes?.y2).toBeUndefined();
    expect(chart.getAxis('y2')).toBeUndefined();
    expect(chart.getOptions().cursor?.syncKey).toBeUndefined();
    chart.destroy();
  });

  it('emits options:update after runtime config changes', () => {
    const chart = new ChartCore(
      document.createElement('div'),
      { series: [{ label: 'value', dataIndex: 1 }] },
      [f([1, 2]), f([10, 20])],
    );
    const seen: number[] = [];
    chart.on('options:update', (config) => seen.push(config.series.length));

    chart.setOptions({ series: [{ label: 'a', dataIndex: 1 }, { label: 'b', dataIndex: 1 }] });
    chart.replaceOptions({ series: [{ label: 'a', dataIndex: 1 }] });

    expect(seen).toEqual([2, 1]);
    chart.destroy();
  });

  it('returns false when registering a duplicate plugin id at runtime', () => {
    const plugin: Plugin = { id: 'runtime-plugin', install: vi.fn() };
    const chart = new ChartCore(
      document.createElement('div'),
      { series: [{ label: 'value', dataIndex: 1 }] },
      [f([1, 2]), f([10, 20])],
    );

    expect(chart.use(plugin)).toBe(true);
    expect(chart.use({ id: 'runtime-plugin', install: vi.fn() })).toBe(false);
    expect(plugin.install).toHaveBeenCalledTimes(1);

    chart.destroy();
  });

  it('limits the input layer to the plot area by default', () => {
    const chart = new ChartCore(
      document.createElement('div'),
      {
        axes: { x: { type: 'linear' }, y: { type: 'linear' } },
        zoom: { enabled: true, x: true },
        pan: { enabled: true, x: true },
        series: [{ label: 'value', dataIndex: 1 }],
      },
      [f([0, 1]), f([10, 20])],
    );

    const { plot } = chart.getLayout();
    const layer = interactionLayer(chart);

    expect(layer.style.left).toBe(`${plot.left}px`);
    expect(layer.style.top).toBe(`${plot.top}px`);
    expect(layer.style.width).toBe(`${plot.width}px`);
    expect(layer.style.height).toBe(`${plot.height}px`);

    chart.destroy();
  });

  it('expands the input layer over axes only when axis controls are enabled', () => {
    const chart = new ChartCore(
      document.createElement('div'),
      {
        axes: { x: { type: 'linear' }, y: { type: 'linear' } },
        zoom: { enabled: true, x: true },
        pan: { enabled: true, x: true },
        series: [{ label: 'value', dataIndex: 1 }],
      },
      [f([0, 1]), f([10, 20])],
    );

    chart.setOptions({ zoom: { axis: true } });

    const layout = chart.getLayout();
    const layer = interactionLayer(chart);
    expect(layer.style.left).toBe('0px');
    expect(layer.style.top).toBe('0px');
    expect(layer.style.width).toBe(`${layout.width}px`);
    expect(layer.style.height).toBe(`${layout.height}px`);

    chart.destroy();
  });

  it('lets explicit zoom and pan fields override interaction mode presets', () => {
    const chart = new ChartCore(
      document.createElement('div'),
      {
        interaction: 'analytical',
        zoom: { enabled: false },
        pan: { y: false },
        series: [{ label: 'value', dataIndex: 1 }],
      },
      [f([1, 2]), f([10, 20])],
    );

    expect(chart.getOptions().zoom).toMatchObject({ enabled: false, x: true, y: true });
    expect(chart.getOptions().pan).toMatchObject({ enabled: true, x: true, y: false });
    chart.destroy();
  });

  it('rebinds cursor sync groups when sync keys are added, changed, or cleared', () => {
    const data: ColumnarData = [f([0, 50, 100]), f([0, 1, 0])];
    const chartA = new ChartCore(
      document.createElement('div'),
      { series: [{ label: 'value', dataIndex: 1 }] },
      data,
    );
    const chartB = new ChartCore(
      document.createElement('div'),
      { cursor: { syncKey: 'group-a' }, series: [{ label: 'value', dataIndex: 1 }] },
      data,
    );
    const chartC = new ChartCore(
      document.createElement('div'),
      { cursor: { syncKey: 'group-b' }, series: [{ label: 'value', dataIndex: 1 }] },
      data,
    );

    chartA.setOptions({ cursor: { syncKey: 'group-a' } });
    chartEventBus(chartA).emit('action:cursor', { ...plotPoint(chartA, 0.5), pointerType: 'mouse' });
    expect(chartB.getCursorSnapshot({ fallback: 'hide' }).source).toBe('cursor');
    expect(chartC.getCursorSnapshot({ fallback: 'hide' }).source).toBe('none');

    chartA.setOptions({ cursor: { syncKey: 'group-b' } });
    chartEventBus(chartA).emit('action:cursor', { ...plotPoint(chartA, 0.8), pointerType: 'mouse' });
    expect(chartB.getCursorSnapshot({ fallback: 'hide' }).dataX).toBe(50);
    expect(chartC.getCursorSnapshot({ fallback: 'hide' }).dataX).toBe(100);

    chartA.setOptions({ cursor: { syncKey: null } });
    chartEventBus(chartA).emit('action:cursor', { ...plotPoint(chartA, 0.2), pointerType: 'mouse' });
    expect(chartC.getCursorSnapshot({ fallback: 'hide' }).dataX).toBe(100);

    chartA.destroy();
    chartB.destroy();
    chartC.destroy();
  });
});

describe('ChartCore cursor sync', () => {
  beforeEach(() => {
    vi.stubGlobal('document', new MockDocument());
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('clears synced peers when the local cursor moves outside the plot area', () => {
    const syncKey = 'cursor-clear-test';
    const data: ColumnarData = [f([0, 50, 100]), f([0, 1, 0])];
    const chartA = new ChartCore(
      document.createElement('div'),
      { cursor: { syncKey }, series: [{ label: 'value', dataIndex: 1 }] },
      data,
    );
    const chartB = new ChartCore(
      document.createElement('div'),
      { cursor: { syncKey }, series: [{ label: 'value', dataIndex: 1 }] },
      data,
    );

    const inside = plotPoint(chartA, 0.5);
    chartEventBus(chartA).emit('action:cursor', { ...inside, pointerType: 'mouse' });
    expect(chartB.getCursorSnapshot({ fallback: 'hide' }).source).toBe('cursor');

    const { plot } = chartA.getLayout();
    chartEventBus(chartA).emit('action:cursor', {
      x: inside.x,
      y: plot.top + plot.height + 8,
      pointerType: 'mouse',
    });

    expect(chartB.getCursorSnapshot({ fallback: 'hide' }).source).toBe('none');

    chartA.destroy();
    chartB.destroy();
  });

  it('emits cursor events from synced peers so reactive snapshots refresh', () => {
    const syncKey = 'cursor-peer-event-test';
    const data: ColumnarData = [f([0, 50, 100]), f([0, 1, 0])];
    const chartA = new ChartCore(
      document.createElement('div'),
      { cursor: { syncKey }, series: [{ label: 'value', dataIndex: 1 }] },
      data,
    );
    const chartB = new ChartCore(
      document.createElement('div'),
      { cursor: { syncKey }, series: [{ label: 'value', dataIndex: 1 }] },
      data,
    );
    const moves: Array<[number | null, number | null, string]> = [];
    chartA.on('cursor:move', (dataX, dataIdx, origin) => {
      moves.push([dataX, dataIdx, origin]);
    });

    chartEventBus(chartB).emit('action:cursor', {
      ...plotPoint(chartB, 0.5),
      pointerType: 'mouse',
    });

    expect(moves.at(-1)).toEqual([50, 1, 'sync']);
    expect(chartA.getCursorSnapshot({ fallback: 'hide' })).toMatchObject({
      dataX: 50,
      dataIndex: 1,
      source: 'cursor',
    });

    chartEventBus(chartB).emit('action:cursor-leave', undefined);

    expect(moves.at(-1)).toEqual([null, null, 'sync']);
    expect(chartA.getCursorSnapshot({ fallback: 'hide' }).source).toBe('none');

    chartA.destroy();
    chartB.destroy();
  });

  it('keeps synced peer cursor anchored at box-selection start', () => {
    const syncKey = 'cursor-selection-anchor-test';
    const data: ColumnarData = [f([0, 50, 100]), f([0, 1, 0])];
    const chartA = new ChartCore(
      document.createElement('div'),
      { cursor: { syncKey }, series: [{ label: 'value', dataIndex: 1 }] },
      data,
    );
    const chartB = new ChartCore(
      document.createElement('div'),
      { cursor: { syncKey }, series: [{ label: 'value', dataIndex: 1 }] },
      data,
    );

    const start = plotPoint(chartA, 0.5);
    const update = plotPoint(chartA, 0.8);
    chartEventBus(chartA).emit('action:box-start', start);
    chartEventBus(chartA).emit('action:box-update', update);

    const snapshot = chartB.getCursorSnapshot({ fallback: 'hide' });
    expect(snapshot.source).toBe('cursor');
    expect(snapshot.dataX).toBe(50);

    chartA.destroy();
    chartB.destroy();
  });
});

describe('ChartCore histogram cursor', () => {
  beforeEach(() => {
    vi.stubGlobal('document', new MockDocument());
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('snaps taps inside a histogram bar to the bin centre', () => {
    const chart = new ChartCore(
      document.createElement('div'),
      {
        axes: { x: { type: 'linear', nice: false }, y: { type: 'linear' } },
        series: [{ label: 'count', dataIndex: 1, type: 'histogram' }],
      },
      [f([0, 1, 2, 3]), f([10, 20, 30, 0])],
    );
    const xScale = chart.getAxis('x')!;
    const { plot } = chart.getLayout();
    const moves: Array<[number | null, number | null]> = [];
    chart.on('cursor:move', (dataX, dataIdx) => {
      moves.push([dataX, dataIdx]);
    });

    chartEventBus(chart).emit('action:tap', {
      x: xScale.dataToPixel(1.2),
      y: plot.top + plot.height / 2,
      pointerType: 'mouse',
    });

    expect(moves.at(-1)).toEqual([1.5, 1]);
    expect(chart.getCursorSnapshot({ fallback: 'hide' })).toMatchObject({
      dataIndex: 1,
      dataX: 1.5,
      formattedX: '1.0 \u2013 2.0',
      source: 'cursor',
    });
    expect(chart.getCursorSnapshot({ fallback: 'hide' }).points[0]).toMatchObject({
      dataIndex: 1,
      value: 20,
    });

    chart.destroy();
  });

  it('maps the exact final histogram edge to the final bin centre', () => {
    const chart = new ChartCore(
      document.createElement('div'),
      {
        axes: { x: { type: 'linear', nice: false }, y: { type: 'linear' } },
        series: [{ label: 'count', dataIndex: 1, type: 'histogram' }],
      },
      [f([0, 1, 2, 3]), f([10, 20, 30, 0])],
    );
    const xScale = chart.getAxis('x')!;
    const { plot } = chart.getLayout();

    chartEventBus(chart).emit('action:tap', {
      x: xScale.dataToPixel(3),
      y: plot.top + plot.height / 2,
      pointerType: 'mouse',
    });

    expect(chart.getCursorSnapshot({ fallback: 'hide' })).toMatchObject({
      dataIndex: 2,
      dataX: 2.5,
      formattedX: '2.0 \u2013 3.0',
    });

    chart.destroy();
  });

  it('keeps baseline padding when x zoom shows only positive histogram bins', () => {
    const chart = new ChartCore(
      document.createElement('div'),
      {
        axes: { x: { type: 'linear', nice: false }, y: { type: 'linear' } },
        series: [{ label: 'count', dataIndex: 1, type: 'histogram' }],
      },
      [f([0, 1, 2, 3, 4]), f([0, 100, 120, 80, 0])],
    );

    chart.setAxis('x', { min: 1.2, max: 2.8 });

    const yScale = chart.getAxis('y')!;
    expect(yScale.min).toBeLessThan(0);
    expect(yScale.max).toBeGreaterThan(120);

    chart.destroy();
  });
});

describe('ChartCore scatter selection', () => {
  beforeEach(() => {
    vi.stubGlobal('document', new MockDocument());
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns selected scatter points using xDataIndex and y ranges', () => {
    const selections: Array<{ points?: Array<{ dataIndex: number; x: number; y: number }> }> = [];
    const chart = new ChartCore(
      document.createElement('div'),
      {
        axes: { x: { type: 'linear', nice: false }, y: { type: 'linear', nice: false } },
        zoom: { enabled: false, x: true, y: true },
        selection: { onSelect: (selection) => selections.push(selection) },
        series: [{
          label: 'runs',
          type: 'scatter',
          xDataIndex: 1,
          yDataIndex: 2,
          colorBy: { dataIndex: 3, type: 'category', palette: ['#111111', '#eeeeee'] },
        }],
      },
      [
        f([0, 1, 2, 3]),
        f([0.1, 0.4, 0.7, 0.9]),
        f([0.2, 0.5, 0.8, 0.3]),
        f([0, 1, 1, 0]),
      ],
    );
    const xScale = chart.getAxis('x')!;
    const yScale = chart.getAxis('y')!;

    chartEventBus(chart).emit('action:box-end', {
      x1: xScale.dataToPixel(0.3),
      y1: yScale.dataToPixel(0.9),
      x2: xScale.dataToPixel(0.8),
      y2: yScale.dataToPixel(0.4),
    });

    expect(selections).toHaveLength(1);
    expect(selections[0].points?.map((point) => [point.dataIndex, point.x, point.y])).toEqual([
      [1, 0.4, 0.5],
      [2, 0.7, 0.8],
    ]);

    chart.destroy();
  });

  it('hit-tests scatter with xDataIndex at the pointer instead of snapped column 0', () => {
    const moves: Array<[number | null, number | null]> = [];
    const chart = new ChartCore(
      document.createElement('div'),
      {
        axes: { x: { type: 'linear', padding: 0 }, y: { type: 'linear', padding: 0 } },
        cursor: { show: true, snap: true },
        tooltip: { show: true, mode: 'nearest' },
        series: [{
          label: 'cohorts',
          type: 'scatter',
          xDataIndex: 1,
          yDataIndex: 2,
          colorBy: { dataIndex: 3, type: 'category', palette: ['#111111', '#eeeeee'] },
        }],
      },
      [
        f([0, 1, 2, 3]),
        f([-20, 2, 25, -15]),
        f([10, 17, -5, 12]),
        f([0, 1, 0, 0]),
      ],
    );
    chart.on('cursor:move', (dataX, dataIdx) => {
      moves.push([dataX, dataIdx]);
    });
    const xScale = chart.getAxis('x')!;
    const yScale = chart.getAxis('y')!;

    chartEventBus(chart).emit('action:cursor', {
      x: xScale.dataToPixel(-16),
      y: yScale.dataToPixel(12),
      pointerType: 'mouse',
    });

    expect(moves.at(-1)).toEqual([-15, 3]);

    chart.destroy();
  });

  it('coalesces touch cursor updates onto the next animation frame', () => {
    let raf: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => {
      raf = cb;
      return 7;
    }));
    const moves: Array<[number | null, number | null]> = [];
    const chart = new ChartCore(
      document.createElement('div'),
      {
        axes: { x: { type: 'linear', padding: 0 }, y: { type: 'linear', padding: 0 } },
        tooltip: { show: true, mode: 'nearest' },
        series: [{ label: 'points', type: 'scatter', xDataIndex: 1, yDataIndex: 2 }],
      },
      [
        f([0, 1, 2]),
        f([0, 10, 20]),
        f([0, 10, 20]),
      ],
    );
    chart.on('cursor:move', (dataX, dataIdx) => {
      moves.push([dataX, dataIdx]);
    });

    const xScale = chart.getAxis('x')!;
    const yScale = chart.getAxis('y')!;
    chartEventBus(chart).emit('action:cursor', {
      x: xScale.dataToPixel(10),
      y: yScale.dataToPixel(10),
      pointerType: 'touch',
    });
    chartEventBus(chart).emit('action:cursor', {
      x: xScale.dataToPixel(20),
      y: yScale.dataToPixel(20),
      pointerType: 'touch',
    });

    expect(moves).toEqual([]);
    expect(raf).toBeDefined();
    raf?.(0);
    expect(moves.at(-1)).toEqual([20, 2]);

    chart.destroy();
  });
});

describe('ChartCore log interactions', () => {
  beforeEach(() => {
    vi.stubGlobal('document', new MockDocument());
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps linear auto-range exact unless nice is explicitly enabled', () => {
    const exactChart = new ChartCore(
      document.createElement('div'),
      {
        axes: { x: { type: 'linear' }, y: { type: 'linear' } },
        series: [{ label: 'value', type: 'line', dataIndex: 1 }],
      },
      [
        f([3, 50, 97]),
        f([0.2, 0.3, 0.4]),
      ],
    );

    expect(exactChart.getAxis('x')?.min).toBe(3);
    expect(exactChart.getAxis('x')?.max).toBe(97);
    exactChart.destroy();

    const niceChart = new ChartCore(
      document.createElement('div'),
      {
        axes: { x: { type: 'linear', nice: true }, y: { type: 'linear' } },
        series: [{ label: 'value', type: 'line', dataIndex: 1 }],
      },
      [
        f([3, 50, 97]),
        f([0.2, 0.3, 0.4]),
      ],
    );

    expect(niceChart.getAxis('x')?.min).toBe(0);
    expect(niceChart.getAxis('x')?.max).toBe(100);
    niceChart.destroy();
  });

  it('pads horizontal log axes symmetrically in log space by default', () => {
    const chart = new ChartCore(
      document.createElement('div'),
      {
        axes: { x: { type: 'log', padding: 0.1 }, y: { type: 'linear' } },
        series: [{ label: 'loss', type: 'line', dataIndex: 1 }],
      },
      [
        f([1e-4, 1e-3, 1e-2]),
        f([0.2, 0.3, 0.4]),
      ],
    );
    const xScale = chart.getAxis('x')!;
    const leftPad = Math.log10(1e-4) - Math.log10(xScale.min);
    const rightPad = Math.log10(xScale.max) - Math.log10(1e-2);

    expect(leftPad).toBeCloseTo(0.2, 10);
    expect(rightPad).toBeCloseTo(leftPad, 10);

    chart.destroy();
  });

  it('pads vertical log axes symmetrically and ignores non-positive values', () => {
    const chart = new ChartCore(
      document.createElement('div'),
      {
        axes: { x: { type: 'linear' }, y: { type: 'log', padding: 0.1 } },
        series: [{ label: 'loss', type: 'line', dataIndex: 1 }],
      },
      [
        f([0, 1, 2, 3]),
        f([0, 1e-2, 1, 1e2]),
      ],
    );
    const yScale = chart.getAxis('y')!;
    const bottomPad = Math.log10(1e-2) - Math.log10(yScale.min);
    const topPad = Math.log10(yScale.max) - Math.log10(1e2);

    expect(bottomPad).toBeCloseTo(0.4, 10);
    expect(topPad).toBeCloseTo(bottomPad, 10);

    chart.destroy();
  });

  it('zooms log axes in log space around the pointer anchor', () => {
    const chart = new ChartCore(
      document.createElement('div'),
      {
        axes: { x: { type: 'log', min: 1e-5, max: 1e-1 }, y: { type: 'linear' } },
        zoom: { enabled: true, x: true, bounds: 'unbounded' },
        series: [{ label: 'points', type: 'scatter', xDataIndex: 1, yDataIndex: 2 }],
      },
      [
        f([0, 1, 2]),
        f([1e-5, 1e-3, 1e-1]),
        f([0.2, 0.3, 0.4]),
      ],
    );
    const xScale = chart.getAxis('x')!;

    chartEventBus(chart).emit('action:zoom', {
      factor: 0.5,
      anchorX: xScale.dataToPixel(1e-3),
      anchorY: chart.getLayout().plot.top + chart.getLayout().plot.height / 2,
      axis: 'x',
    });

    expect(xScale.min).toBeCloseTo(1e-4, 10);
    expect(xScale.max).toBeCloseTo(1e-2, 10);

    chart.destroy();
  });

  it('keeps log pan clamped without shrinking the viewport at the lower bound', () => {
    const chart = new ChartCore(
      document.createElement('div'),
      {
        axes: {
          x: { type: 'log', padding: 0 },
          y: { type: 'linear', padding: 0 },
        },
        zoom: {
          enabled: true,
          x: true,
          y: true,
          bounds: { x: 'data', y: 'unbounded' },
        },
        pan: { enabled: true, x: true, y: true },
        series: [{ label: 'points', type: 'scatter', xDataIndex: 1, yDataIndex: 2 }],
      },
      [
        f([0, 1, 2]),
        f([1e-5, 1e-3, 1e-1]),
        f([0.2, 0.3, 0.4]),
      ],
    );
    const xScale = chart.getAxis('x')!;
    const initial = { min: xScale.min, max: xScale.max };

    chartEventBus(chart).emit('action:pan', { dx: 40, dy: 0 });

    expect(xScale.min).toBeCloseTo(initial.min, 12);
    expect(xScale.max).toBeCloseTo(initial.max, 12);

    chart.destroy();
  });

  it('keeps xy zoom uniform when one axis reaches its bounds', () => {
    const chart = new ChartCore(
      document.createElement('div'),
      {
        axes: { x: { type: 'linear' }, y: { type: 'linear' } },
        zoom: {
          enabled: true,
          x: true,
          y: true,
          bounds: {
            x: { min: 0, max: 100 },
            y: { min: 0, max: 10 },
          },
        },
        series: [{ label: 'points', dataIndex: 1 }],
      },
      [f([0, 100]), f([0, 10])],
    );

    chart.setAxis('x', { min: 25, max: 75 });
    chart.setAxis('y', { min: 2, max: 8 });

    const { plot } = chart.getLayout();
    chartEventBus(chart).emit('action:zoom', {
      factor: 2,
      anchorX: plot.left + plot.width / 2,
      anchorY: plot.top + plot.height / 2,
      axis: 'xy',
    });

    const xScale = chart.getAxis('x')!;
    const yScale = chart.getAxis('y')!;
    expect(yScale.max - yScale.min).toBeCloseTo(10, 10);
    expect(xScale.max - xScale.min).toBeCloseTo(50 * (10 / 6), 10);

    chart.destroy();
  });

  it('ignores axis-origin zoom events unless axis zooming is enabled', () => {
    const chart = new ChartCore(
      document.createElement('div'),
      {
        axes: { x: { type: 'linear' }, y: { type: 'linear' } },
        zoom: { enabled: true, x: true, bounds: 'unbounded' },
        series: [{ label: 'value', dataIndex: 1 }],
      },
      [f([0, 100]), f([0, 10])],
    );
    const xScale = chart.getAxis('x')!;
    const { plot } = chart.getLayout();
    const initial = { min: xScale.min, max: xScale.max };

    chartEventBus(chart).emit('action:zoom', {
      factor: 0.5,
      anchorX: plot.left + plot.width / 2,
      anchorY: plot.top + plot.height + 8,
      axis: 'x',
    });

    expect(xScale.min).toBe(initial.min);
    expect(xScale.max).toBe(initial.max);

    chart.setOptions({ zoom: { axis: true } });
    chartEventBus(chart).emit('action:zoom', {
      factor: 0.5,
      anchorX: plot.left + plot.width / 2,
      anchorY: plot.top + plot.height + 8,
      axis: 'x',
    });

    expect(xScale.max - xScale.min).toBeLessThan(initial.max - initial.min);
    chart.destroy();
  });
});

describe('ChartCore highlight sync', () => {
  beforeEach(() => {
    vi.stubGlobal('document', new MockDocument());
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps numeric series-index sync as the default', () => {
    const syncKey = 'numeric-highlight-test';
    const data: ColumnarData = [f([1, 2]), f([10, 20]), f([100, 200])];
    const chartA = new ChartCore(
      document.createElement('div'),
      {
        highlight: { syncKey },
        series: [
          { label: 'a', dataIndex: 1 },
          { label: 'b', dataIndex: 2 },
        ],
      },
      data,
    );
    const chartB = new ChartCore(
      document.createElement('div'),
      {
        highlight: { syncKey },
        series: [
          { label: 'first', dataIndex: 1 },
          { label: 'second', dataIndex: 2 },
        ],
      },
      data,
    );

    chartA.setHighlight(1);
    expect(chartB.getHighlight()).toBe(1);

    chartA.destroy();
    chartB.destroy();
  });

  it('maps synced highlights by stable identity when getKey is configured', () => {
    type RunMeta = { runId: string };
    const syncKey = 'identity-highlight-test';
    const getRunId = (series: SeriesConfig) => (series.meta as RunMeta | undefined)?.runId;
    const data: ColumnarData = [f([1, 2]), f([10, 20]), f([100, 200])];

    const chartA = new ChartCore(
      document.createElement('div'),
      {
        highlight: { syncKey, getKey: getRunId },
        series: [
          { label: 'run-a', dataIndex: 1, meta: { runId: 'a' } },
          { label: 'run-b', dataIndex: 2, meta: { runId: 'b' } },
        ],
      },
      data,
    );
    const chartB = new ChartCore(
      document.createElement('div'),
      {
        highlight: { syncKey, getKey: getRunId },
        series: [
          { label: 'run-b', dataIndex: 1, meta: { runId: 'b' } },
          { label: 'run-a', dataIndex: 2, meta: { runId: 'a' } },
        ],
      },
      data,
    );
    const chartC = new ChartCore(
      document.createElement('div'),
      {
        highlight: { syncKey, getKey: getRunId },
        series: [
          { label: 'run-a-only', dataIndex: 1, meta: { runId: 'a' } },
        ],
      },
      [f([1, 2]), f([10, 20])],
    );

    chartA.setHighlight(0);
    expect(chartB.getHighlight()).toBe(1);
    expect(chartC.getHighlight()).toBe(0);

    chartB.setHighlight(0);
    expect(chartA.getHighlight()).toBe(1);
    expect(chartC.getHighlight()).toBe(null);

    chartA.destroy();
    chartB.destroy();
    chartC.destroy();
  });

  it('exposes stable-key highlight setters for mismatched series order', () => {
    type RunMeta = { runId: string };
    const syncKey = 'identity-highlight-api-test';
    const getRunId = (series: SeriesConfig) => (series.meta as RunMeta | undefined)?.runId;
    const data: ColumnarData = [f([1, 2]), f([10, 20]), f([100, 200])];
    const chartA = new ChartCore(
      document.createElement('div'),
      {
        highlight: { syncKey, getKey: getRunId },
        series: [
          { label: 'run-a', dataIndex: 1, meta: { runId: 'a' } },
          { label: 'run-b', dataIndex: 2, meta: { runId: 'b' } },
        ],
      },
      data,
    );
    const chartB = new ChartCore(
      document.createElement('div'),
      {
        highlight: { syncKey, getKey: getRunId },
        series: [
          { label: 'run-b', dataIndex: 1, meta: { runId: 'b' } },
          { label: 'run-a', dataIndex: 2, meta: { runId: 'a' } },
        ],
      },
      data,
    );

    chartA.setHighlightKey('b');

    expect(chartA.getHighlight()).toBe(1);
    expect(chartA.getHighlightKey()).toBe('b');
    expect(chartB.getHighlight()).toBe(0);
    expect(chartB.getHighlightKey()).toBe('b');

    chartA.setHighlightKey('missing');
    expect(chartA.getHighlight()).toBe(null);
    expect(chartB.getHighlight()).toBe(null);

    chartA.destroy();
    chartB.destroy();
  });
});

describe('ChartCore lifecycle + config integrity', () => {
  beforeEach(() => {
    vi.stubGlobal('document', new MockDocument());
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not mutate the caller config object when constructing a chart', () => {
    const config = { series: [{ label: 'value', dataIndex: 1 }] };
    const chart = new ChartCore(
      document.createElement('div'),
      config,
      [f([1, 2]), f([10, 20])],
    );

    // initAxes writes x/y into config.axes; that must land on the chart's own
    // copy, not the object the caller passed in.
    expect(config).not.toHaveProperty('axes');
    chart.destroy();
  });

  it('two charts built from one config object do not share axis state', () => {
    const config = { series: [{ label: 'value', dataIndex: 1 }] };
    const data: ColumnarData = [f([1, 2]), f([10, 20])];
    const a = new ChartCore(document.createElement('div'), config, data);
    const b = new ChartCore(document.createElement('div'), config, data);

    expect(config).not.toHaveProperty('axes');
    expect(a.getOptions().axes).not.toBe(b.getOptions().axes);
    a.destroy();
    b.destroy();
  });

  it('keeps a zoom-synced peer in sync across appendData', () => {
    const syncKey = 'zoom-append-sync';
    const data: ColumnarData = [f([0, 25, 50, 75, 100]), f([1, 2, 3, 2, 1])];
    const chartA = new ChartCore(
      document.createElement('div'),
      { zoom: { syncKey, x: true, enabled: true }, series: [{ label: 'v', dataIndex: 1 }] },
      [f([0, 25, 50, 75, 100]), f([1, 2, 3, 2, 1])],
    );
    const chartB = new ChartCore(
      document.createElement('div'),
      { zoom: { syncKey, x: true, enabled: true }, series: [{ label: 'v', dataIndex: 1 }] },
      data,
    );

    // Zoom chart A in around the middle. Publishes to B via SyncGroup.
    const anchor = plotPoint(chartA, 0.5);
    chartEventBus(chartA).emit('action:zoom', { factor: 0.5, anchorX: anchor.x, anchorY: anchor.y, axis: 'x' });

    const zoomedMax = chartA.getAxis('x')!.max;
    const zoomedMin = chartA.getAxis('x')!.min;
    expect(zoomedMax).toBeLessThan(100);
    expect(chartB.getAxis('x')!.max).toBe(zoomedMax);
    expect(chartB.getAxis('x')!.min).toBe(zoomedMin);

    // Streaming data into B beyond the old extent must not snap its synced
    // viewport back to the full range.
    chartB.appendData([f([200]), f([0])]);
    expect(chartB.getAxis('x')!.max).toBe(zoomedMax);
    expect(chartB.getAxis('x')!.min).toBe(zoomedMin);

    chartA.destroy();
    chartB.destroy();
  });

  it('ignores mutating public calls after destroy()', () => {
    const chart = new ChartCore(
      document.createElement('div'),
      { series: [{ label: 'v', dataIndex: 1 }] },
      [f([1, 2]), f([10, 20])],
    );

    chart.destroy();
    chart.appendData([f([3]), f([30])]);
    chart.setData([f([1, 2, 3, 4]), f([1, 2, 3, 4])]);

    expect(chart.getStats()).toMatchObject({
      dataVersion: 0,
      setDataCount: 0,
      appendDataCount: 0,
    });
  });

  it('does not count a data-layer paint that a plugin vetoes', () => {
    const chart = new ChartCore(
      document.createElement('div'),
      {
        debug: { stats: true },
        plugins: [{ id: 'veto-data', beforeDrawData: () => false }],
        series: [{ label: 'v', dataIndex: 1 }],
      },
      [f([1, 2]), f([10, 20])],
    );

    const stats = chart.getStats();
    expect(stats.renderCount.grid).toBe(1);
    expect(stats.renderCount.data).toBe(0);
    expect(stats.renderCount.overlay).toBe(1);
    chart.destroy();
  });

  it('delivers the data payload to a variadic (...args) listener', () => {
    const chart = new ChartCore(
      document.createElement('div'),
      { series: [{ label: 'v', dataIndex: 1 }] },
      [f([1, 2]), f([10, 20])],
    );

    let received: unknown[] = [];
    chart.on('data:update', (...args) => {
      received = args;
    });

    chart.appendData([f([3]), f([30])]);

    expect(received).toHaveLength(1);
    const payload = received[0] as ColumnarData;
    expect(Array.from(payload[0])).toEqual([1, 2, 3]);
    chart.destroy();
  });

  it('does not snap a synced cursor to column 0 for an off-axis scatter', () => {
    const chart = new ChartCore(
      document.createElement('div'),
      { series: [{ label: 'pts', type: 'scatter', dataIndex: 2, xDataIndex: 1 }] },
      [f([0, 1, 2]), f([0, 10, 20]), f([5, 6, 7])],
    );

    chart.setCursorDataX(1.5, 'sync');

    const idx = (chart as unknown as { cursorDataIdx: number | null }).cursorDataIdx;
    expect(idx).toBeNull();
    chart.destroy();
  });

  it('adds use()-installed plugins to config.plugins', () => {
    const chart = new ChartCore(
      document.createElement('div'),
      { series: [{ label: 'v', dataIndex: 1 }] },
      [f([1, 2]), f([10, 20])],
    );

    chart.use({ id: 'runtime-added', install: vi.fn() });

    expect(chart.getOptions().plugins?.some((p) => p.id === 'runtime-added')).toBe(true);
    chart.destroy();
  });

  it('does not reinstall unchanged plugins on replaceOptions', () => {
    const install = vi.fn();
    const destroy = vi.fn();
    const plugin: Plugin = { id: 'stable', install, destroy };
    const chart = new ChartCore(
      document.createElement('div'),
      { plugins: [plugin], series: [{ label: 'v', dataIndex: 1 }] },
      [f([1, 2]), f([10, 20])],
    );

    expect(install).toHaveBeenCalledTimes(1);

    // Fresh config object + fresh array literal, same plugin instance: the
    // plugin set is unchanged, so no destroy/reinstall churn.
    chart.replaceOptions({ plugins: [plugin], series: [{ label: 'v', dataIndex: 1 }] });

    expect(install).toHaveBeenCalledTimes(1);
    expect(destroy).not.toHaveBeenCalled();
    chart.destroy();
  });
});

describe('ChartCore live-follow viewport', () => {
  beforeEach(() => {
    vi.stubGlobal('document', new MockDocument());
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());

  const streamConfig = {
    axes: { x: { type: 'linear' as const }, y: { type: 'linear' as const } },
    series: [{ label: 'v', dataIndex: 1 }] as SeriesConfig[],
    streaming: { follow: 10 },
  };

  it('starts following and pins the X window to the trailing follow width', () => {
    const chart = new ChartCore(
      document.createElement('div'),
      streamConfig,
      [f([0, 1, 2]), f([5, 6, 7])],
    );
    expect(chart.isFollowing()).toBe(true);
    // window 10, lastX 2, dataMin 0 -> [0, 2] (clamped to data start)
    expect(chart.getAxis('x')?.min).toBe(0);
    expect(chart.getAxis('x')?.max).toBe(2);

    // Append past the window: X should scroll to [lastX - 10, lastX].
    chart.appendData([f([12, 15]), f([8, 9])]);
    expect(chart.getAxis('x')?.min).toBe(5);
    expect(chart.getAxis('x')?.max).toBe(15);
    chart.destroy();
  });

  const zoomIn = (chart: ChartCore) => {
    const anchor = plotPoint(chart, 0.5);
    chartEventBus(chart).emit('action:zoom', {
      factor: 0.5,
      anchorX: anchor.x,
      anchorY: anchor.y,
      axis: 'x',
    });
  };

  it('pauses following on a horizontal zoom and stops scrolling with data', () => {
    const changes: boolean[] = [];
    const chart = new ChartCore(
      document.createElement('div'),
      streamConfig,
      [f([0, 5, 10]), f([1, 2, 3])],
    );
    chart.on('follow:change', (f2) => changes.push(f2));

    zoomIn(chart);
    expect(chart.isFollowing()).toBe(false);
    expect(changes).toEqual([false]);

    const pausedMin = chart.getAxis('x')?.min;
    const pausedMax = chart.getAxis('x')?.max;
    // Streaming continues but the paused viewport must not move.
    chart.appendData([f([20]), f([4])]);
    expect(chart.getAxis('x')?.min).toBe(pausedMin);
    expect(chart.getAxis('x')?.max).toBe(pausedMax);
    chart.destroy();
  });

  it('scrollToLatest resumes following and snaps to the newest window', () => {
    const changes: boolean[] = [];
    const chart = new ChartCore(
      document.createElement('div'),
      streamConfig,
      [f([0, 5, 10]), f([1, 2, 3])],
    );
    chart.on('follow:change', (f2) => changes.push(f2));

    zoomIn(chart);
    chart.appendData([f([20]), f([4])]);
    expect(chart.isFollowing()).toBe(false);

    chart.scrollToLatest();
    expect(chart.isFollowing()).toBe(true);
    expect(changes).toEqual([false, true]);
    // lastX 20, window 10 -> [10, 20].
    expect(chart.getAxis('x')?.min).toBe(10);
    expect(chart.getAxis('x')?.max).toBe(20);
    chart.destroy();
  });

  it('decimates a large line only while a gesture is active, full fidelity at rest', () => {
    const n = 5000;
    const xs = new Float64Array(n);
    const ys = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      xs[i] = i;
      ys[i] = Math.sin(i / 20);
    }
    const chart = new ChartCore(
      document.createElement('div'),
      {
        axes: { x: { type: 'linear' as const }, y: { type: 'linear' as const } },
        series: [{ label: 'v', dataIndex: 1, type: 'line' }] as SeriesConfig[],
      },
      [xs, ys],
    );

    const seg = { xData: xs, yData: ys, startIdx: 0, endIdx: n - 1 };
    const internal = chart as unknown as {
      viewportActiveUntil: number;
      decimateLineSegments: (s: typeof seg[]) => typeof seg[];
      layout: { plot: { width: number } };
    };

    // At rest: no decimation, the exact segments pass through.
    internal.viewportActiveUntil = 0;
    expect(internal.decimateLineSegments([seg])).toEqual([seg]);

    // During a gesture: decimated to at most 4 points per pixel column.
    internal.viewportActiveUntil = performance.now() + 10_000;
    const decimated = internal.decimateLineSegments([seg]);
    const total = decimated.reduce((acc, s) => acc + (s.endIdx - s.startIdx + 1), 0);
    const budget = Math.max(1, Math.round(internal.layout.plot.width)) * 4;
    expect(total).toBeLessThanOrEqual(budget);
    expect(total).toBeGreaterThan(1);
    expect(total).toBeLessThan(n);
    chart.destroy();
  });

  it('without a follow window, isFollowing tracks full-extent auto-range', () => {
    const chart = new ChartCore(
      document.createElement('div'),
      {
        axes: { x: { type: 'linear' as const }, y: { type: 'linear' as const } },
        series: [{ label: 'v', dataIndex: 1 }] as SeriesConfig[],
      },
      [f([0, 1, 2]), f([5, 6, 7])],
    );
    expect(chart.isFollowing()).toBe(true);
    zoomIn(chart);
    expect(chart.isFollowing()).toBe(false);
    chart.scrollToLatest();
    expect(chart.isFollowing()).toBe(true);
    // Full extent restored.
    expect(chart.getAxis('x')?.min).toBe(0);
    expect(chart.getAxis('x')?.max).toBe(2);
    chart.destroy();
  });
});
