// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { ChartHandle } from '../../src/index';
import { debug, type Fakes, installFakes } from '../fakes';

// A canvas whose width or height is assigned loses its bitmap, and the grid
// layer is opaque, so a reallocated canvas shows black until it is painted
// again. The fakes record both, and run no frame unless asked.

type Row = { t: number; y: number };
const data: Row[] = Array.from({ length: 20 }, (_, t) => ({ t, y: Math.sin(t / 3) * 10 }));

let fakes: Fakes;
afterEach(() => fakes.uninstall());

function mount(dpr = 1): ChartHandle<Row> {
  fakes = installFakes({ devicePixelRatio: dpr });
  const chart = fakes.mount<Row>(
    { data, x: 't', series: [{ y: 'y' }] },
    { width: 400, height: 200 },
  );
  return chart;
}

/** Bitmap resets so far on each layer. */
function resets(chart: ChartHandle<Row>): number[] {
  return Object.values(debug(chart).layers).map((layer) => fakes.canvas.of(layer).resets);
}

/** The grid and data layers hold ink drawn since their last clear. */
function expectPainted(chart: ChartHandle<Row>): void {
  const { grid, data: marks } = debug(chart).layers;
  expect(fakes.canvas.of(grid).inkSinceClear).toBeGreaterThan(0);
  expect(fakes.canvas.of(marks).inkSinceClear).toBeGreaterThan(0);
}

describe('[gap-environments-01] print keeps the canvases', () => {
  it.fails('[gap-environments-01] print with unchanged DPR keeps canvases', () => {
    const chart = mount(2);
    fakes.resizeObserver.deliver();
    fakes.frames.flush();
    expectPainted(chart);
    const before = resets(chart);

    // Blink flips the resolution query when it enters print media, with no
    // animation frame before the snapshot.
    fakes.media.beginPrint();
    expect(resets(chart)).toEqual(before);
    expectPainted(chart);

    fakes.media.endPrint();
    expect(resets(chart)).toEqual(before);
    expectPainted(chart);
  });

  it('[gap-environments-01] a real DPR change still resizes the backing store', () => {
    const chart = mount(2);
    fakes.resizeObserver.deliver();
    fakes.frames.flush();
    const { data: marks } = debug(chart).layers;
    expect(marks.width).toBe(800);

    fakes.media.beginPrint();
    fakes.media.endPrint();
    // The watcher stays armed after print-time changes it ignored.
    fakes.media.setDevicePixelRatio(1);
    fakes.frames.flush();
    expect(marks.width).toBe(400);
    expectPainted(chart);
    fakes.media.setDevicePixelRatio(3);
    fakes.frames.flush();
    expect(marks.width).toBe(1200);
  });
});

describe('[gap-scale-longevity-01] resize paints synchronously', () => {
  it.fails('[gap-scale-longevity-01] resize paints synchronously', () => {
    const chart = mount(2);
    fakes.resizeObserver.deliver();
    fakes.frames.flush();

    // ResizeObserver callbacks run after this frame's rAF and before paint.
    fakes.resizeObserver.resize(chart.container, 420, 200);
    expect(debug(chart).layers.data.width).toBe(840);
    expectPainted(chart);

    // Continuous resizing: every delivery leaves painted canvases.
    for (const width of [430, 440, 450]) {
      fakes.resizeObserver.resize(chart.container, width, 210);
      expectPainted(chart);
    }
  });

  it.fails('[gap-scale-longevity-01] a no-op resize does not reallocate', () => {
    const chart = mount(2);
    // The constructor painted at 400 × 200; the initial observation reports
    // the same box.
    expectPainted(chart);
    const before = resets(chart);
    fakes.resizeObserver.deliver();
    expect(resets(chart)).toEqual(before);
    expectPainted(chart);

    fakes.resizeObserver.resize(chart.container, 500, 200);
    const afterResize = resets(chart);
    fakes.resizeObserver.deliver(chart.container, { force: true });
    expect(resets(chart)).toEqual(afterResize);
    chart.resize(500, 200);
    expect(resets(chart)).toEqual(afterResize);
  });
});
