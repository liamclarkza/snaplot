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
});
