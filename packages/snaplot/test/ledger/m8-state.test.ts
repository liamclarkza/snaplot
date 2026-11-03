// @vitest-environment jsdom
// M8's state and events locks (plan D3 declarative state options, RC2
// viewport = pinned axes, RC3 one isolated dispatcher, P14), on the 0.13
// handle. Public API, fakes and debug() only.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChartGroup } from '../../src/index';
import type { ChartHandle } from '../../src/index';
import { axis, clientPoint, debug, type Fakes, installFakes, pointerTarget } from '../fakes';

let fakes: Fakes;
beforeEach(() => {
  fakes = installFakes();
});
afterEach(() => {
  fakes.uninstall();
  vi.restoreAllMocks();
});

type Row = { t: number; v: number };
const rows: Row[] = Array.from({ length: 101 }, (_, t) => ({ t, v: 20 + (t % 9) }));

function mountLine(extra: Record<string, unknown> = {}): ChartHandle<Row> {
  return fakes.mount<Row>({ data: rows, x: 't', series: [{ y: 'v', label: 'V' }], ...extra });
}

/** A Ctrl+wheel zoom at a data point (the browser's pinch-zoom wheel). */
function wheelZoom(chart: ChartHandle<Row>, x: number, y: number, deltaY = -120): void {
  const point = clientPoint(chart, x, y);
  pointerTarget(chart).dispatchEvent(
    new WheelEvent('wheel', { ...point, deltaY, ctrlKey: true, bubbles: true, cancelable: true }),
  );
  fakes.frames.flush();
}

describe('[dxtrial-04][frameworks-04][frameworks-05] the viewport names only pinned axes', () => {
  it('[dxtrial-04][frameworks-05] an X zoom reports only the X axis', () => {
    const chart = mountLine();
    const reported: object[] = [];
    chart.on('viewport:change', (viewport) => reported.push(viewport));
    wheelZoom(chart, 50, 24);
    expect(reported.length).toBeGreaterThan(0);
    expect(Object.keys(reported.at(-1) ?? {})).toEqual(['x']);
  });

  it('[frameworks-04] a reset emits {} exactly once', () => {
    const chart = mountLine();
    wheelZoom(chart, 50, 24);
    const reported: object[] = [];
    chart.on('viewport:change', (viewport) => reported.push(viewport));
    chart.resetViewport();
    fakes.frames.flush();
    expect(reported).toEqual([{}]);
  });

  // D3: update() always applies a state key it names, so an empty viewport is a reset.
  it('[frameworks-04] update({ viewport: {} }) resets a zoomed chart', () => {
    const chart = mountLine();
    fakes.frames.flush();
    const full = { ...axis(chart, 'x') };
    wheelZoom(chart, 50, 24);
    expect(axis(chart, 'x')?.max).toBeLessThan(full.max ?? 0);
    chart.update({ viewport: {} } as never);
    fakes.frames.flush();
    expect(axis(chart, 'x')).toMatchObject({ min: full.min, max: full.max });
  });

  it('[dxtrial-04] echoing the reported viewport keeps Y automatic', () => {
    const chart = mountLine();
    // The owner echoes what the chart reports through update({ viewport }) (D3).
    const echo = (viewport: object) => chart.update({ viewport });
    let reported: object | null = null;
    chart.on('viewport:change', (viewport) => {
      reported = viewport;
    });
    wheelZoom(chart, 50, 24);
    // Applied after the gesture, as a framework re-render would.
    if (reported) echo(reported);
    chart.update({ data: rows.map((row) => ({ ...row, v: row.v * 10 })) });
    fakes.frames.flush();
    expect(axis(chart, 'y')?.max ?? 0).toBeGreaterThanOrEqual(280);
  });

  it('[frameworks-05] setOptions with an equal viewport neither repaints nor pins', () => {
    const options = {
      data: rows,
      x: 't',
      series: [{ y: 'v' as const }],
      viewport: { x: [10, 40] as const },
    };
    const chart = fakes.mount<Row>(options as never);
    fakes.frames.flush();
    const before = debug(chart).renderCount.data;
    chart.setOptions({ ...options, viewport: { x: [10, 40] } } as never);
    fakes.frames.flush();
    expect(debug(chart).renderCount.data).toBe(before);
    expect(axis(chart, 'x')).toMatchObject({ min: 10, max: 40 });
  });
});

describe('[dataapi-14][dataapi-16][backlog-02] state survives data changes correctly', () => {
  it('[dataapi-14] replacing data outside a pinned X range unpins that axis', () => {
    const chart = mountLine();
    chart.update({ viewport: { x: [10, 20] } });
    chart.update({ data: Array.from({ length: 101 }, (_, i) => ({ t: 1000 + i, v: 5 })) });
    fakes.frames.flush();
    expect(axis(chart, 'x')).toMatchObject({ min: 1000, max: 1100 });
  });

  it('[dataapi-16] a non-finite selection is rejected', () => {
    const chart = mountLine({ selection: { mode: 'brush' } });
    expect(() => chart.update({ selection: { x: [Number.NaN, 10] } })).toThrow(/selection/i);
    expect(chart.getState().selection).toBeNull();
  });

  it('[backlog-02] a selection cleared by a data change emits selection:change(null)', () => {
    const chart = mountLine({ selection: { mode: 'brush' } });
    chart.update({ selection: { x: [40, 60] } });
    const events: unknown[] = [];
    chart.on('selection:change', (selection) => events.push(selection));
    chart.update({ data: Array.from({ length: 10 }, (_, i) => ({ t: 500 + i, v: 1 })) });
    fakes.frames.flush();
    expect(chart.getState().selection).toBeNull();
    expect(events).toEqual([null]);
  });
});

describe('[gap-overhaul-delta-03] one bad listener never blocks the others', () => {
  /** Swallow the asynchronous rethrow P14 asks for, so the run stays clean. */
  function captureRethrows(): Array<() => void> {
    const queued: Array<() => void> = [];
    vi.stubGlobal('queueMicrotask', (callback: () => void) => queued.push(callback));
    return queued;
  }

  it('[gap-overhaul-delta-03] a throwing on() listener does not stop later listeners', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const queued = captureRethrows();
    const chart = mountLine();
    // A group's highlight is not the chart's own option, so the chart reports it (D3).
    const group = createChartGroup();
    chart.update({ group });
    const seen: Array<string | null> = [];
    chart.on('highlight:change', () => {
      throw new Error('first listener fails');
    });
    chart.on('highlight:change', (id) => seen.push(id));
    group.setHighlight('v');
    group.setHighlight(null);
    vi.unstubAllGlobals();
    expect(seen).toEqual(['v', null]);
    expect(queued.length).toBeGreaterThan(0);
  });

  it('[gap-overhaul-delta-03] a throwing subscriber does not stop later subscribers', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    captureRethrows();
    const chart = mountLine();
    let later = 0;
    chart.subscribe(() => {
      throw new Error('first subscriber fails');
    });
    chart.subscribe(() => {
      later++;
    });
    chart.update({ highlight: 'v' });
    // Subscribers hear about commits once per frame (plan §3.2).
    fakes.frames.flush();
    vi.unstubAllGlobals();
    expect(later).toBeGreaterThan(0);
  });
});

describe('[arch-07][frameworks-01] cold state and the cursor are separate channels', () => {
  it('[arch-07] cursor moves do not notify state subscribers', () => {
    const chart = mountLine();
    let notified = 0;
    chart.subscribe(() => {
      notified++;
    });
    for (let x = 10; x < 30; x++) chart.setCursor(x);
    expect(notified).toBe(0);
  });

  it('[frameworks-01] a data commit that keeps the viewport bumps the state revision', () => {
    const chart = mountLine();
    let notified = 0;
    chart.subscribe(() => {
      notified++;
    });
    const before = (chart.getState() as { revision?: number }).revision;
    // The last value moves inside the current Y range, so no axis changes.
    chart.update({ data: rows.map((row, i) => (i === rows.length - 1 ? { ...row, v: 25 } : row)) });
    fakes.frames.flush();
    expect(notified).toBeGreaterThan(0);
    expect((chart.getState() as { revision?: number }).revision).toBeGreaterThan(before ?? 0);
  });
});
