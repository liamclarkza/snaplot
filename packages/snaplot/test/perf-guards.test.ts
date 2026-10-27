// @vitest-environment jsdom
// Call-count guards for the perf-critical paths (plan §3.4, P7). Each guard
// is a test titled `[perf:<guard>]`. A guard today's code fails is an
// `it.fails`, owned by the milestone §3.4 names, which flips it; the owners
// are recorded in scripts/overhaul/trace-ids.json (`perfGuards`). Guards that
// need a counter the debug symbol does not have yet read it as an optional
// field: the owning milestone adds the counter (D31) when it lands the path.
//
// The plugin materialisation guard of §3.4 is `[arch-01]` in
// test/debug-counters.test.ts (M8); the legend variant is below (M12b).
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import * as snaplot from '../src/index';
import { createChartGroup } from '../src/index';
import { ColumnarStore } from '../src/engine/data/ColumnarStore';
import type { ChartHandle } from '../src/index';
import { clientPoint, debug, type Fakes, installFakes, pointerTarget, wheelGesture } from './fakes';

let fakes: Fakes;
beforeEach(() => {
  fakes = installFakes();
});
afterEach(() => {
  fakes.uninstall();
  vi.restoreAllMocks();
});

/** Counters the D31 debug symbol gains with the milestones that need them. */
type FutureCounters = {
  hitVisits?: number;
  densityRebins?: number;
  rangeScanPoints?: number;
  xValidations?: number;
};
const future = (chart: ChartHandle<any>) => debug(chart) as unknown as FutureCounters;

function columns(n: number, y: (i: number) => number, x: (i: number) => number = (i) => i) {
  return {
    columns: {
      x: Float64Array.from({ length: n }, (_, i) => x(i)),
      y: Float64Array.from({ length: n }, (_, i) => y(i)),
    },
  };
}

function calls(chart: ChartHandle<any>, layer: 'grid' | 'data' | 'overlay', names: string[]) {
  return fakes.canvas
    .of(debug(chart).layers[layer])
    .calls.filter((call) => names.includes(call.name)).length;
}

describe('data and culling', () => {
  it('[perf:x-extent-ends] an option update reads a sorted X from its ends and Y from its cache, not row by row', () => {
    const n = 200_000;
    const chart = fakes.mount({ data: columns(n, (i) => i % 50), x: 'x', series: [{ y: 'y' }] });
    fakes.frames.flush();
    const reads = vi.spyOn(ColumnarStore.prototype, 'valueAt');
    const scanned = future(chart).rangeScanPoints ?? 0;
    chart.update({ axes: { y: { title: 'Load' } } });
    fakes.frames.flush();
    expect(reads.mock.calls.filter(([column]) => column === 0).length).toBeLessThan(100);
    // Nor the Y column: its whole-column extent holds until the data changes.
    expect((future(chart).rangeScanPoints ?? 0) - scanned).toBeLessThan(100);
    const x = chart.scale('x');
    expect(x?.min).toBe(0);
    expect(x?.max).toBeGreaterThanOrEqual(n - 1);
  });

  it('[perf:visible-range] render visits only the visible index range ±1', () => {
    const chart = fakes.mount({
      data: columns(10_000, (i) => i % 50),
      x: 'x',
      series: [{ y: 'y' }],
    });
    fakes.frames.flush();
    chart.update({ viewport: { x: [1000, 1100] } });
    // Let the gesture window expire so the at-rest path draws.
    fakes.frames.flush();
    const record = fakes.canvas.of(debug(chart).layers.data);
    const before = record.calls.length;
    chart.redraw();
    fakes.frames.flush();
    const vertices = record.calls
      .slice(before)
      .filter((call) => call.name === 'lineTo' || call.name === 'moveTo').length;
    // At least the 101 visible points (a repaint that draws nothing fails),
    // at most those ±1 plus a path restart per gap.
    expect(vertices).toBeGreaterThanOrEqual(101);
    expect(vertices).toBeLessThanOrEqual(101 + 2 + 4);
  });

  it('[perf:columns-zero-copy][arch-05] columns ingest allocates no per-row JS arrays', () => {
    const n = 50_000;
    const from = vi.spyOn(Array, 'from');
    fakes.mount({ data: columns(n, (i) => i % 7), x: 'x', series: [{ y: 'y' }] });
    const large = from.mock.results.filter(
      (result) => Array.isArray(result.value) && (result.value as unknown[]).length >= n,
    );
    expect(large).toHaveLength(0);
  });

  it('[perf:x-validated-once][arch-05] X is validated once per source per update', () => {
    const chart = fakes.mount({ data: columns(1000, (i) => i), x: 'x', series: [{ y: 'y' }] });
    chart.update({ data: columns(1000, (i) => i * 2) });
    expect(future(chart).xValidations).toBe(2);
  });

  it('[perf:pan-no-scan] a pan frame does not scan the full column for the Y range', () => {
    const n = 200_000;
    const chart = fakes.mount({
      data: columns(n, (i) => Math.sin(i / 300)),
      x: 'x',
      series: [{ y: 'y' }],
    });
    fakes.frames.flush();
    chart.update({ viewport: { x: [1000, 3000] } });
    fakes.frames.flush();
    expect(future(chart).rangeScanPoints ?? Number.POSITIVE_INFINITY).toBeLessThan(n / 10);
  });
});

describe('layers and update classes', () => {
  it('[perf:overlay-only] a cursor move dirties the overlay only', () => {
    const chart = fakes.mount({ data: columns(500, (i) => i % 9), x: 'x', series: [{ y: 'y' }] });
    fakes.frames.flush();
    const before = { ...debug(chart).renderCount };
    for (let x = 10; x < 30; x++) {
      chart.setCursor(x);
      fakes.frames.flush();
    }
    const after = debug(chart).renderCount;
    expect(after.grid).toBe(before.grid);
    expect(after.data).toBe(before.data);
    expect(after.overlay).toBeGreaterThan(before.overlay);
  });

  it('[perf:paint-no-ingest] a paint-class update never ingests', () => {
    const chart = fakes.mount({ data: columns(500, (i) => i % 9), x: 'x', series: [{ y: 'y' }] });
    const before = debug(chart).ingestCount;
    chart.update({ theme: { palette: ['#ff0000'] } } as never);
    chart.update({ series: [{ y: 'y', lineWidth: 3 }] });
    expect(debug(chart).ingestCount).toBe(before);
  });

  it('[perf:reingest-avoidance] title, theme, format identity, callbacks and plugins by id cause 0 ingests', () => {
    const chart = fakes.mount({
      data: columns(500, (i) => i % 9),
      x: 'x',
      series: [{ y: 'y' }],
      plugins: [{ id: 'p' }],
    });
    const before = debug(chart).ingestCount;
    chart.update({ axes: { y: { title: 'Load' } } });
    chart.update({ ariaLabel: 'Load over time' });
    chart.update({ axes: { y: { format: (v) => `${v}` } } });
    chart.update({ onPointClick: () => {} });
    chart.update({ plugins: [{ id: 'p' }] });
    expect(debug(chart).ingestCount).toBe(before);
  });

  it('[perf:state-coalesce] 50 appends in one frame notify a subscriber once', () => {
    const chart = fakes.mount({
      data: columns(100, (i) => i % 9),
      x: 'x',
      series: [{ y: 'y' }],
      streaming: { maxPoints: 1000 },
    });
    let notified = 0;
    chart.subscribe(() => {
      notified++;
    });
    for (let i = 0; i < 50; i++)
      chart.appendData(
        columns(
          1,
          () => 3,
          () => 100 + i,
        ),
      );
    fakes.frames.flush();
    expect(notified).toBeLessThanOrEqual(1);
  });

  it('[perf:materialize-legend] 100 appends with the legend and a legend table materialize the ring 0 times', () => {
    const chart = fakes.mount({
      data: [{ x: 0, a: 1, b: 2 }],
      x: 'x',
      series: [{ y: 'a' }, { y: 'b' }],
      streaming: { maxPoints: 5 },
      legend: true,
    } as never);
    const createLegendTable = (snaplot as unknown as Record<string, unknown>).createLegendTable as
      | ((element: HTMLElement, options: object) => unknown)
      | undefined;
    const host = document.createElement('div');
    document.body.append(host);
    createLegendTable?.(host, { chart });
    expect(chart.container.querySelectorAll('button[aria-pressed]').length).toBe(2);
    expect(host.childElementCount).toBeGreaterThan(0);
    const before = debug(chart).materializeCount;
    for (let x = 1; x <= 100; x++) chart.appendData([{ x, a: x, b: x }]);
    fakes.frames.flush();
    expect(debug(chart).materializeCount - before).toBe(0);
  });
});

describe('marks', () => {
  it('[perf:line-at-rest][gap-perf-gate-10][backlog-28:at-rest] a line draws at most 4 points per device column at rest', () => {
    const chart = fakes.mount(
      { data: columns(200_000, (i) => Math.sin(i / 50)), x: 'x', series: [{ y: 'y' }] },
      { width: 400, height: 200 },
    );
    fakes.frames.flush();
    const { plot } = debug(chart);
    expect(calls(chart, 'data', ['lineTo', 'moveTo'])).toBeLessThanOrEqual(
      4 * Math.ceil(plot.width) + 8,
    );
  });

  /**
   * Points drawn during a gesture over min(in view, budget), with the bench's budget of
   * max(400, 1.5 × plot width) (plan §3.4; bench FidelitySampler). The gesture zooms to 1 % of
   * X: an unsorted source is sampled over its whole length (with the 10,000-point mouse budget
   * until M11), which leaves a twentieth of that budget in a view this narrow.
   */
  function fidelity(sorted: boolean): number {
    const n = 200_000;
    const chart = fakes.mount(
      {
        data: columns(n, (i) => (i * 7919) % 1000, sorted ? (i) => i : (i) => (i * 104_729) % n),
        x: 'x',
        series: [{ type: 'scatter', y: 'y' }],
      },
      { width: 400, height: 200 },
    );
    fakes.frames.flush();
    // The view is set, then a small wheel zoom puts a gesture in flight, so the pass samples.
    chart.update({ viewport: { x: [0, n / 100] } });
    fakes.frames.flush();
    wheelGesture(chart);
    fakes.frames.flush();
    const { drawnPoints, inViewPoints } = debug(chart);
    const budget = Math.max(400, 1.5 * debug(chart).plot.width);
    return drawnPoints / Math.min(inViewPoints, budget);
  }

  it('[perf:scatter-fidelity][gap-perf-gate-01:storage][arch-06:ingest] a sorted 200k scatter keeps fidelity ≥ 0.8 during a gesture', () => {
    expect(fidelity(true)).toBeGreaterThanOrEqual(0.8);
  });

  it('[perf:scatter-fidelity][gap-perf-gate-01:sampling] an unsorted 200k scatter keeps fidelity ≥ 0.8 during a gesture', () => {
    expect(fidelity(false)).toBeGreaterThanOrEqual(0.8);
  });

  it('[perf:density-cache] a pan inside the cached density bucket rebins nothing', () => {
    // The canvas recorder has no createImageData; give density rendering one.
    const getContext = HTMLCanvasElement.prototype.getContext;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      this: HTMLCanvasElement,
      ...args: Parameters<typeof getContext>
    ) {
      const context = getContext.apply(this, args) as CanvasRenderingContext2D | null;
      if (context) {
        (context as { createImageData: unknown }).createImageData = (w: number, h: number) => ({
          width: w,
          height: h,
          data: new Uint8ClampedArray(Math.max(0, w * h * 4)),
        });
      }
      return context;
    } as typeof getContext);
    const n = 50_000;
    const chart = fakes.mount({
      data: columns(
        n,
        (i) => (i * 7919) % 1000,
        (i) => (i * 104_729) % 1000,
      ),
      x: 'x',
      series: [{ type: 'scatter', y: 'y', renderMode: 'density' }],
    });
    fakes.frames.flush();
    // A pan moves both axes of a cloud by the same span (zoom: 'xy', its default).
    chart.update({ viewport: { x: [100, 900], y: [100, 900] } });
    fakes.frames.flush();
    const before = future(chart).densityRebins;
    chart.update({ viewport: { x: [101, 901], y: [99, 899] } });
    fakes.frames.flush();
    expect(before).toBeDefined();
    expect(future(chart).densityRebins).toBe(before);
  });
});

describe('hit testing', () => {
  it('[perf:hover-visits][gap-perf-gate-01:hover][arch-06:cursor] a hover on a sorted 200k scatter visits ≤ 64 points', () => {
    const n = 200_000;
    const chart = fakes.mount({
      data: columns(n, (i) => (i * 7919) % 1000),
      x: 'x',
      series: [{ type: 'scatter', y: 'y' }],
    });
    fakes.frames.flush();
    const point = clientPoint(chart, n / 2, 500);
    pointerTarget(chart).dispatchEvent(
      new PointerEvent('pointermove', {
        ...point,
        bubbles: true,
        pointerId: 1,
        pointerType: 'mouse',
      }),
    );
    fakes.frames.flush();
    expect(future(chart).hitVisits ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(64);
  });
});

describe('labels and layout', () => {
  it('[perf:labels-measured-once] unchanged labels are not re-measured', () => {
    const chart = fakes.mount({ data: columns(500, (i) => i % 9), x: 'x', series: [{ y: 'y' }] });
    fakes.frames.flush();
    const measured = () =>
      fakes.canvas.all
        .flatMap((record) => record.calls)
        .filter((call) => call.name === 'measureText').length;
    const before = measured();
    chart.redraw();
    fakes.frames.flush();
    expect(measured() - before).toBe(0);
  });

  it('[perf:label-nodes-reused] label nodes are reused across repaints (node identity)', () => {
    const chart = fakes.mount({ data: columns(500, (i) => i % 9), x: 'x', series: [{ y: 'y' }] });
    fakes.frames.flush();
    const nodes = () =>
      [...chart.container.querySelectorAll('div, span')].filter(
        (element) => element.childElementCount === 0 && /^\d+$/.test(element.textContent ?? ''),
      );
    const before = nodes();
    chart.redraw();
    fakes.frames.flush();
    const after = nodes();
    expect(before.length).toBeGreaterThan(0);
    // Every label is still there, and every one is a node from before.
    expect(after.length).toBe(before.length);
    expect(after.every((node) => before.includes(node))).toBe(true);
  });

  it('[perf:no-layout-read][gap-scale-longevity-08] the render path reads no layout', () => {
    const chart = fakes.mount({
      data: columns(500, (i) => i % 9),
      x: 'x',
      series: [{ y: 'y' }],
      streaming: { maxPoints: 1000 },
    });
    fakes.frames.flush();
    const proto = Element.prototype;
    const width = Object.getOwnPropertyDescriptor(proto, 'clientWidth');
    const rect = Object.getOwnPropertyDescriptor(proto, 'getBoundingClientRect');
    let reads = 0;
    Object.defineProperty(proto, 'clientWidth', {
      configurable: true,
      get(this: Element) {
        reads++;
        return width?.get?.call(this);
      },
    });
    Object.defineProperty(proto, 'getBoundingClientRect', {
      configurable: true,
      value(this: Element) {
        reads++;
        return rect?.value.call(this);
      },
    });
    try {
      for (let i = 0; i < 5; i++) {
        chart.appendData(
          columns(
            1,
            () => 3,
            () => 500 + i,
          ),
        );
        fakes.frames.flush();
      }
    } finally {
      if (width) Object.defineProperty(proto, 'clientWidth', width);
      if (rect) Object.defineProperty(proto, 'getBoundingClientRect', rect);
    }
    expect(reads).toBe(0);
  });

  it('[perf:intl-reuse][gap-perf-gate-09] formatting 1,000 time labels constructs ≤ 4 date formatters', () => {
    const start = Date.UTC(2026, 0, 1);
    const chart = fakes.mount(
      {
        data: columns(
          20_000,
          (i) => i % 9,
          (i) => start + i * 60_000,
        ),
        x: 'x',
        series: [{ y: 'y' }],
        axes: { x: { type: 'time' } },
      },
      { width: 800, height: 200 },
    );
    fakes.frames.flush();
    // Each toLocale*String call builds a formatter internally, so count those
    // with the Intl constructor (a pass-through proxy: a spy's instances cannot format).
    const Original = Intl.DateTimeFormat;
    let built = 0;
    Intl.DateTimeFormat = new Proxy(Original, {
      construct(target, args) {
        built++;
        return Reflect.construct(target, args);
      },
      apply(target, self, args) {
        built++;
        return Reflect.apply(target, self, args);
      },
    });
    onTestFinished(() => {
      Intl.DateTimeFormat = Original;
    });
    const locale = [
      vi.spyOn(Date.prototype, 'toLocaleTimeString'),
      vi.spyOn(Date.prototype, 'toLocaleDateString'),
      vi.spyOn(Date.prototype, 'toLocaleString'),
    ];
    let labels = 0;
    for (let frame = 0; frame < 100; frame++) {
      const min = start + frame * 600_000;
      chart.update({ viewport: { x: [min, min + 6 * 3_600_000] } });
      fakes.frames.flush();
      labels += debug(chart)
        .labelBoxes()
        .filter((box) => box.axis === 'x').length;
    }
    const constructions = built + locale.reduce((sum, spy) => sum + spy.mock.calls.length, 0);
    expect(labels).toBeGreaterThanOrEqual(400);
    expect(constructions).toBeLessThanOrEqual(4);
  });
});

describe('groups, visibility and theme', () => {
  it('[perf:group-append] an alignPlots append runs no options pass on the peers', () => {
    const group = createChartGroup({ alignPlots: true });
    const [a, b] = [0, 1].map(() =>
      fakes.mount({ data: columns(500, (i) => i % 9), x: 'x', series: [{ y: 'y' }], group }),
    );
    fakes.frames.flush();
    const grid = debug(b).renderCount.grid;
    for (let i = 0; i < 5; i++)
      a.appendData(
        columns(
          1,
          () => 3,
          () => 500 + i,
        ),
      );
    fakes.frames.flush();
    expect(debug(b).renderCount.grid).toBe(grid);
  });

  it('[perf:group-offscreen][gap-scale-longevity-07] a 20-member group with 18 offscreen paints 2 overlays per move', () => {
    const group = createChartGroup({ cursor: true });
    const members = Array.from({ length: 20 }, () =>
      fakes.mount({ data: columns(200, (i) => i % 9), x: 'x', series: [{ y: 'y' }], group }),
    );
    fakes.frames.flush();
    for (const member of members.slice(2))
      fakes.intersectionObserver.setIntersecting(member.container, false);
    const overlays = () =>
      members.reduce((sum, member) => sum + debug(member).renderCount.overlay, 0);
    const before = overlays();
    for (let x = 10; x < 20; x++) {
      group.setCursor(x);
      fakes.frames.flush();
    }
    expect(overlays() - before).toBeLessThanOrEqual(2 * 10);
  });

  it('[perf:offscreen] an offscreen chart paints 0 frames', () => {
    const chart = fakes.mount({
      data: columns(200, (i) => i % 9),
      x: 'x',
      series: [{ y: 'y' }],
      streaming: { maxPoints: 1000 },
    });
    fakes.frames.flush();
    fakes.intersectionObserver.setIntersecting(chart.container, false);
    const before = debug(chart).renderCount.data;
    for (let i = 0; i < 10; i++) {
      chart.appendData(
        columns(
          1,
          () => 3,
          () => 200 + i,
        ),
      );
      fakes.frames.flush();
    }
    expect(debug(chart).renderCount.data).toBe(before);
  });

  it('[perf:theme-coalesce] 100 body class mutations in one frame resolve the theme at most once per chart', async () => {
    const charts = [0, 1, 2].map(() =>
      fakes.mount({ data: columns(200, (i) => i % 9), x: 'x', series: [{ y: 'y' }] }),
    );
    fakes.frames.flush();
    // The refresh may be queued on a timer (today) or a frame (M11's shared
    // observer); let both run, twice, so either order lands.
    const settleTheme = async () => {
      for (let round = 0; round < 2; round++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        fakes.frames.flush();
      }
    };
    const style = vi.spyOn(window, 'getComputedStyle');
    const reads = () =>
      charts.map(
        (chart) =>
          style.mock.calls.filter(
            ([element]) => chart.container.contains(element as Node) || element === chart.container,
          ).length,
      );
    // Calibrate: the computed-style reads of one resolution, per chart.
    document.body.classList.toggle('dark');
    await settleTheme();
    const one = reads();
    for (const count of one) expect(count, 'one mutation re-resolves the theme').toBeGreaterThan(0);
    style.mockClear();

    for (let i = 0; i < 100; i++) document.body.classList.toggle('dark');
    await settleTheme();
    // At least one resolution (the theme still follows the page) and at most one.
    expect(reads()).toEqual(one);
  });
});
