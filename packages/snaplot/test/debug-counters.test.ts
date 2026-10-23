// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChart } from '../src/index';
import type { ChartHandle, ChartOptions } from '../src/index';

// Read the untyped D31 debug symbol off a public handle.
function debug(chart: ChartHandle<Row>) {
  return (chart as unknown as Record<symbol, any>)[Symbol.for('snaplot.debug')];
}

type Row = { x: number; y: number };
const frames: FrameRequestCallback[] = [];
const live: ChartHandle<Row>[] = [];

function flushFrames(): void {
  while (frames.length) frames.shift()!(performance.now());
}

beforeEach(() => {
  const context = new Proxy(
    { measureText: (text: string) => ({ width: text.length * 7 }) },
    { get: (target, key) => Reflect.get(target, key) ?? (() => {}) },
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => {
  for (const chart of live.splice(0)) chart.destroy();
  frames.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

function make(options: Partial<ChartOptions<Row>> = {}): ChartHandle<Row> {
  const element = document.createElement('div');
  document.body.append(element);
  const chart = createChart<Row>(element, {
    width: 400,
    height: 200,
    autoResize: false,
    data: Array.from({ length: 10 }, (_, x) => ({ x, y: x * 2 })),
    x: 'x',
    series: [{ y: 'y' }],
    ...options,
  });
  live.push(chart);
  return chart;
}

describe('debug counters (plan D31)', () => {
  it('counts the initial ingest and each data replacement, not appends', () => {
    const chart = make();
    expect(debug(chart).ingestCount).toBe(1);
    chart.update({ data: [{ x: 0, y: 1 }] });
    expect(debug(chart).ingestCount).toBe(2);
    chart.appendData([{ x: 1, y: 2 }]);
    expect(debug(chart).ingestCount).toBe(2);
  });

  it('counts per-layer paints and exposes the canvas layers', () => {
    const chart = make();
    const before = debug(chart);
    expect(before.renderCount).toEqual({ grid: 1, data: 1, overlay: 1 });
    expect(Object.values(before.layers).every((layer) => layer instanceof HTMLCanvasElement)).toBe(
      true,
    );
    expect(chart.container.contains(before.layers.data)).toBe(true);
    chart.redraw();
    flushFrames();
    expect(debug(chart).renderCount).toEqual({ grid: 2, data: 2, overlay: 2 });
    // A snapshot is a point-in-time read.
    expect(before.renderCount.data).toBe(1);
  });

  it('counts in-view and drawn points of the last data pass', () => {
    const chart = make();
    expect(debug(chart).inViewPoints).toBe(10);
    expect(debug(chart).drawnPoints).toBe(10);
    chart.setViewport({ x: { min: 2, max: 5 } });
    flushFrames();
    // x = 2, 3, 4, 5 are in view; the neighbours drawn for continuity are not.
    expect(debug(chart).inViewPoints).toBe(4);
    expect(debug(chart).drawnPoints).toBe(4);
  });

  it('counts ring materializations, which a data plugin triggers on every append', () => {
    const plain = make({ streaming: { maxPoints: 5 } });
    for (let x = 10; x < 20; x++) plain.appendData([{ x, y: x }]);
    expect(debug(plain).materializeCount).toBe(0);

    const withPlugin = make({
      streaming: { maxPoints: 5 },
      plugins: [{ id: 'listener', onDataUpdate() {} }],
    });
    const before = debug(withPlugin).materializeCount;
    for (let x = 10; x < 20; x++) withPlugin.appendData([{ x, y: x }]);
    expect(debug(withPlugin).materializeCount).toBe(before + 10);
  });

  it('lists the axis labels of the last grid paint', () => {
    const chart = make({ axes: { y: { title: 'Load' } } });
    const boxes = debug(chart).labelBoxes();
    expect(
      boxes.some((box: { axis: string; kind: string }) => box.axis === 'y' && box.kind === 'tick'),
    ).toBe(true);
    expect(boxes).toContainEqual(
      expect.objectContaining({ axis: 'y', kind: 'title', text: 'Load' }),
    );
  });
});
