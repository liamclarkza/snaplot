// @vitest-environment jsdom
// Known M11 defects in the surface, sizing and scheduling (plan §5.7, D26,
// D37, RC10) and in colour parsing (RC7). Public API, fakes and debug() only.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChart } from '../../src/index';
import type { ChartHandle } from '../../src/index';
import { debug, type Fakes, installFakes } from '../fakes';

let fakes: Fakes;
beforeEach(() => {
  fakes = installFakes();
});
afterEach(() => {
  fakes.uninstall();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

type Row = { t: number; v: number };
const rows: Row[] = Array.from({ length: 100 }, (_, t) => ({ t, v: 10 + (t % 7) }));
const options = { data: rows, x: 't' as const, series: [{ y: 'v' as const }] };

describe('[gap-scale-longevity-05][gap-scale-longevity-04][gap-overhaul-delta-07] mount', () => {
  it('[gap-scale-longevity-05] a chart on a fractional box renders once at mount', () => {
    const chart = fakes.mount<Row>(options, { width: 341.5, height: 200 });
    fakes.resizeObserver.deliver();
    fakes.frames.flush();
    expect(debug(chart).renderCount).toEqual({ grid: 1, data: 1, overlay: 1 });
  });

  it('[gap-scale-longevity-04] the overlay backing store is allocated on first pointer entry', () => {
    const chart = fakes.mount<Row>(options);
    const { overlay } = debug(chart).layers;
    expect(overlay.width * overlay.height).toBe(0);
  });

  it('[gap-scale-longevity-04] destroy releases every backing store', () => {
    const chart = fakes.mount<Row>(options);
    const { grid, data, overlay } = debug(chart).layers;
    chart.destroy();
    expect([grid, data, overlay].map((canvas) => canvas.width * canvas.height)).toEqual([0, 0, 0]);
  });

  it('[gap-overhaul-delta-07] the chart container creates its own stacking context', () => {
    const chart = fakes.mount<Row>(options);
    const inner = chart.container.firstElementChild as HTMLElement | null;
    const isolated = [chart.container, inner].some(
      (element) => element?.style.isolation === 'isolate',
    );
    expect(isolated).toBe(true);
  });
});

describe('[backlog-05][research-02][repo-04] sizing and environments', () => {
  it('[backlog-05][research-02] a 0 px host gets a 300 px fallback and exactly one warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const chart = fakes.mount<Row>(options, { width: 600, height: 0 });
    fakes.resizeObserver.deliver();
    fakes.frames.flush();
    expect(debug(chart).layout.height).toBe(300);
    expect(warn.mock.calls.filter((call) => /snaplot:/.test(String(call[0])))).toHaveLength(1);
  });

  it('[backlog-05] an explicit height wins inside a host that has its own height', () => {
    const chart = fakes.mount<Row>({ ...options, height: 280 }, { width: 600, height: 500 });
    fakes.resizeObserver.deliver();
    fakes.frames.flush();
    expect(debug(chart).layout.height).toBe(280);
    chart.update({ height: 400 });
    fakes.resizeObserver.deliver();
    fakes.frames.flush();
    expect(debug(chart).layout.height).toBe(400);
  });

  it('[repo-04] without ResizeObserver the chart renders nothing, warns once and never throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('ResizeObserver', undefined);
    const host = document.createElement('div');
    document.body.append(host);
    let chart: ChartHandle<Row> | undefined;
    expect(() => {
      chart = createChart<Row>(host, options);
    }).not.toThrow();
    expect(warn.mock.calls.filter((call) => /snaplot:/.test(String(call[0])))).toHaveLength(1);
    chart?.destroy();
  });

  it('[repo-04] without a 2D context the chart never throws', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const host = document.createElement('div');
    fakes.layout.setSize(host, 400, 200);
    document.body.append(host);
    expect(() => createChart<Row>(host, options).destroy()).not.toThrow();
  });
});

describe('[gap-scale-longevity-02][gap-scale-longevity-06:visibility][gap-scale-longevity-09] visibility and shared resources', () => {
  it('[gap-scale-longevity-02] an offscreen chart paints no frames while streaming', () => {
    const chart = fakes.mount<Row>(options);
    fakes.frames.flush();
    fakes.intersectionObserver.setIntersecting(chart.container, false);
    const before = { ...debug(chart).renderCount };
    for (let i = 0; i < 20; i++) {
      chart.appendData([{ t: 100 + i, v: 12 }]);
      fakes.frames.flush();
    }
    expect(debug(chart).renderCount).toEqual(before);
  });

  it('[gap-scale-longevity-06:visibility] a resize of ten charts repaints only the two visible ones', () => {
    const charts = Array.from({ length: 10 }, () => fakes.mount<Row>(options));
    fakes.frames.flush();
    charts.slice(2).forEach((chart) => {
      fakes.intersectionObserver.setIntersecting(chart.container, false);
    });
    const before = charts.map((chart) => debug(chart).renderCount.data);
    for (const chart of charts) fakes.resizeObserver.resize(chart.container, 380, 200);
    fakes.frames.flush();
    const repainted = charts.filter((chart, i) => debug(chart).renderCount.data > before[i]);
    expect(repainted).toHaveLength(2);
  });

  it('[gap-scale-longevity-09] ten charts install one MutationObserver and one matchMedia listener', () => {
    const observers = vi.fn();
    const Original = window.MutationObserver;
    vi.stubGlobal(
      'MutationObserver',
      class extends Original {
        constructor(callback: MutationCallback) {
          super(callback);
          observers();
        }
      },
    );
    const queries = vi.spyOn(window, 'matchMedia');
    for (let i = 0; i < 10; i++) fakes.mount<Row>(options);
    expect(observers.mock.calls.length).toBeLessThanOrEqual(1);
    const distinct = new Set(queries.mock.calls.map((call) => call[0]));
    expect(queries.mock.calls.length).toBeLessThanOrEqual(distinct.size);
  });
});

describe('[gap-annotations-extensibility-13:colour-parse] colour strings (RC7)', () => {
  // M7 warns about a colour that is not a string; the one colour parser (M11) also knows
  // when a string is not a colour.
  it('[gap-annotations-extensibility-13:colour-parse] an annotation colour that is not a CSS colour warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fakes.mount<Row>({
      ...options,
      referenceLines: [{ axis: 'y', value: 12, color: 'not-a-colour' }],
    });
    expect(warn.mock.calls.map((call) => String(call[0])).join('\n')).toMatch(
      /referenceLines\[0\]\.color "not-a-colour"/,
    );
  });
});

describe('[render-16] crisp 1 px strokes', () => {
  it('[render-16] 1 px gridlines land on device-pixel centres at DPR 3', () => {
    fakes.uninstall();
    fakes = installFakes({ devicePixelRatio: 3 });
    const chart = fakes.mount<Row>(options, { width: 400.5, height: 200 });
    fakes.frames.flush();
    const grid = debug(chart).layers.grid;
    const record = fakes.canvas.of(grid);
    // Horizontal strokes: a moveTo and the lineTo after it share their y.
    const ys = record.calls
      .map((call, i) => [call, record.calls[i + 1]] as const)
      .filter(
        ([move, line]) =>
          move.name === 'moveTo' && line?.name === 'lineTo' && move.args[1] === line.args[1],
      )
      .map(([move]) => Number(move.args[1]))
      .filter(Number.isFinite);
    expect(ys.length).toBeGreaterThan(0);
    // The context is scaled by the DPR, so a crisp 1 device-px line sits at
    // (k + 0.5) / 3 CSS px.
    for (const y of ys) expect(((y * 3) % 1).toFixed(3)).toBe('0.500');
  });
});
