// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RingColumnarStore } from '../src/engine/data/RingColumnarStore';
import type { ChartHandle, ChartOptions } from '../src/index';
import { debug, type Fakes, installFakes } from './fakes';

type Row = { x: number; y: number };
const f = (values: number[]) => Float64Array.from(values);

let fakes: Fakes;
beforeEach(() => {
  fakes = installFakes();
});
afterEach(() => fakes.uninstall());

function make(options: Partial<ChartOptions<Row>> = {}): ChartHandle<Row> {
  return fakes.mount<Row>({
    data: Array.from({ length: 10 }, (_, x) => ({ x, y: x * 2 })),
    x: 'x',
    series: [{ y: 'y' }],
    ...options,
  });
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
    fakes.frames.flush();
    expect(debug(chart).renderCount).toEqual({ grid: 2, data: 2, overlay: 2 });
    // A snapshot is a point-in-time read.
    expect(before.renderCount.data).toBe(1);
  });

  it('keeps the data layer when an option update leaves the marks as they were', () => {
    const chart = make();
    const data = () => debug(chart).renderCount.data;
    const before = data();
    chart.update({ tooltip: { mode: 'nearest' }, cursor: false, locale: 'de-DE' });
    fakes.frames.flush();
    expect(data()).toBe(before);
    expect(debug(chart).renderCount.grid).toBe(2);
    // A style change, a theme change and a new range repaint it.
    chart.update({ series: [{ y: 'y', color: '#d33' }] });
    fakes.frames.flush();
    expect(data()).toBe(before + 1);
    chart.update({ axes: { y: { max: 100 } } });
    fakes.frames.flush();
    expect(data()).toBe(before + 2);
    chart.update({ referenceLines: [{ axis: 'y', value: 400 }] });
    fakes.frames.flush();
    expect(data()).toBe(before + 3);
  });

  it('counts in-view and drawn points of the last data pass', () => {
    const chart = make();
    expect(debug(chart).inViewPoints).toBe(10);
    expect(debug(chart).drawnPoints).toBe(10);
    chart.update({ viewport: { x: [2, 5] } });
    fakes.frames.flush();
    // x = 2, 3, 4, 5 are in view; the neighbours drawn for continuity are not.
    expect(debug(chart).inViewPoints).toBe(4);
    expect(debug(chart).drawnPoints).toBe(4);
  });

  it('counts ring materializations: cache misses only', () => {
    const sink = { materializeCount: 0 };
    const ring = new RingColumnarStore([f([0, 1, 2]), f([0, 2, 4])], 3, sink);
    ring.append([f([3]), f([6])]);
    ring.getData();
    ring.getData();
    expect(sink.materializeCount).toBe(1);
    ring.append([f([4]), f([8])]);
    ring.getData();
    expect(sink.materializeCount).toBe(2);
  });

  it('streaming appends without plugins materialize nothing', () => {
    const plain = make({ streaming: { maxPoints: 5 } });
    for (let x = 10; x < 110; x++) plain.appendData([{ x, y: x }]);
    expect(debug(plain).materializeCount).toBe(0);
  });

  // Plan §3.4 guard, owned by M8: today every append copies the ring for
  // the plugin host, whose payload is then ignored.
  it('[arch-01] 100 appends with a data plugin materialize the ring 0 times', () => {
    const withPlugin = make({
      streaming: { maxPoints: 5 },
      plugins: [{ id: 'listener', drawAbove() {} }],
    });
    const before = debug(withPlugin).materializeCount;
    for (let x = 10; x < 110; x++) withPlugin.appendData([{ x, y: x }]);
    expect(debug(withPlugin).materializeCount - before).toBe(0);
  });

  it('lists the axis labels of the last grid paint', () => {
    const chart = make({ axes: { y: { title: 'Load' } } });
    const boxes = debug(chart).labelBoxes();
    expect(boxes.some((box) => box.axis === 'y' && box.kind === 'tick')).toBe(true);
    expect(boxes).toContainEqual(
      expect.objectContaining({ axis: 'y', kind: 'title', text: 'Load' }),
    );
  });
});
