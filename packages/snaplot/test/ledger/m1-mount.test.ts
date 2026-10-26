// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChartHandle, ChartOptions, ChartPlugin } from '../../src/index';
import { debug, type Fakes, installFakes } from '../fakes';

// createChart paints synchronously, and since 5106dd4 the first
// ResizeObserver delivery no longer repaints an unchanged box. Whatever
// createChart's own paint leaves out therefore stays missing until something
// else repaints: reference lines, reference regions and plugins given at
// creation must be in that paint. The fakes run no frame unless asked.

type Row = { t: number; v: number };
const rows: Row[] = Array.from({ length: 200 }, (_, t) => ({ t, v: 40 + (t % 7) }));

let fakes: Fakes;
beforeEach(() => {
  fakes = installFakes();
});
afterEach(() => fakes.uninstall());

type Layer = 'grid' | 'data' | 'overlay';

/** Text drawn on one layer so far. */
function texts(chart: ChartHandle<Row>, layer: Layer): string[] {
  return fakes.canvas
    .of(debug(chart).layers[layer])
    .calls.filter((call) => call.name === 'fillText')
    .map((call) => String(call.args[0]));
}

const LAYERS: readonly Layer[] = ['grid', 'data', 'overlay'];

/** Calls recorded on each layer so far. */
function recorded(chart: ChartHandle<Row>): Record<Layer, number> {
  const counts = { grid: 0, data: 0, overlay: 0 };
  for (const layer of LAYERS)
    counts[layer] = fakes.canvas.of(debug(chart).layers[layer]).calls.length;
  return counts;
}

/** Each layer's calls after `since`, from its first clear: the paint, not the canvas setup. */
function paintCalls(chart: ChartHandle<Row>, since: Record<Layer, number>) {
  return LAYERS.map((layer) => {
    const calls = fakes.canvas.of(debug(chart).layers[layer]).calls.slice(since[layer]);
    return { layer, calls: calls.slice(calls.findIndex((call) => call.name === 'clearRect')) };
  });
}

/** A plugin that counts its draw hooks. */
function counter(): { plugin: ChartPlugin<Row>; drawn: Record<Layer, number> } {
  const drawn = { grid: 0, data: 0, overlay: 0 };
  return {
    drawn,
    plugin: {
      id: 'mount-counter',
      drawBelow: () => drawn.grid++,
      drawAbove: () => drawn.data++,
      drawOverlay: () => drawn.overlay++,
    },
  };
}

function options(plugin: ChartPlugin<Row>): ChartOptions<Row> {
  return {
    data: rows,
    x: 't',
    series: [{ y: 'v' }],
    referenceLines: [{ axis: 'y', value: 43, label: 'Deploy A' }],
    referenceRegions: [{ axis: 'x', from: 40, to: 120, label: 'GC pause' }],
    plugins: [plugin],
  };
}

describe('[gap-annotations-extensibility-06:mount] options given at creation are in the mount paint', () => {
  it('[gap-annotations-extensibility-06:mount] createChart paints reference lines, regions and plugins with no further repaint', () => {
    const { plugin, drawn } = counter();
    const chart = fakes.mount(options(plugin));

    // No frame, no ResizeObserver delivery, no redraw(): only createChart's paint.
    expect(debug(chart).renderCount).toEqual({ grid: 1, data: 1, overlay: 1 });
    expect(texts(chart, 'data')).toContain('Deploy A');
    expect(texts(chart, 'data')).toContain('GC pause');
    expect(drawn).toEqual({ grid: 1, data: 1, overlay: 1 });
  });

  it('[gap-annotations-extensibility-06:mount] the mount paint draws what a later full repaint draws', () => {
    const chart = fakes.mount(options(counter().plugin));
    const mount = paintCalls(chart, { grid: 0, data: 0, overlay: 0 });
    const since = recorded(chart);
    chart.redraw();
    fakes.frames.flush();
    expect(paintCalls(chart, since)).toEqual(mount);
  });

  it('[gap-annotations-extensibility-06:mount] the mount paint stays the only paint of the first frame', () => {
    // 5106dd4's guarantee: the first observation of the box the mount painted,
    // and the first frame, paint nothing more.
    const { plugin } = counter();
    const chart = fakes.mount(options(plugin));
    const painted = { ...debug(chart).renderCount };
    expect(painted).toEqual({ grid: 1, data: 1, overlay: 1 });
    fakes.resizeObserver.deliver();
    fakes.frames.flush();
    expect(debug(chart).renderCount).toEqual(painted);
  });
});
