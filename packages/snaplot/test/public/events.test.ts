// @vitest-environment jsdom
// One dispatcher (plan §3.2, P14, D3): seven events, each mirrored 1:1 by its on<Key>Change
// option; listeners are isolated and iterate a snapshot; events raised inside a call are
// delivered after it commits; the cold state carries a revision and notifies subscribers at most
// once per frame; the cursor is a separate hot channel.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChartGroup } from '../../src/index';
import { type Fakes, installFakes } from '../fakes';
import { type FinalHandle, hoverAt, mount, wheelZoom } from './contract';

let fakes: Fakes;
beforeEach(() => {
  fakes = installFakes();
});
afterEach(() => {
  fakes.uninstall();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

type Row = { t: number; v: number; w: number };
const rows: Row[] = Array.from({ length: 101 }, (_, t) => ({ t, v: 20 + (t % 9), w: 5 + (t % 4) }));
const base = {
  data: rows,
  x: 't',
  series: [
    { y: 'v', label: 'V' },
    { y: 'w', label: 'W' },
  ],
};

/** Swallow the asynchronous rethrow P14 asks for, so the run stays clean. */
function captureRethrows(): Array<() => void> {
  const queued: Array<() => void> = [];
  vi.stubGlobal('queueMicrotask', (callback: () => void) => queued.push(callback));
  return queued;
}

/** A group whose setHighlight() drives `chart`'s highlight the way a peer would. */
function linked(chart: FinalHandle<Row>) {
  const group = createChartGroup();
  chart.update({ group });
  return group;
}

describe('[research-14] seven events, one name per concept', () => {
  it('[research-14] each on<Key>Change option is called 1:1 with its event', () => {
    const callbacks = {
      onViewportChange: vi.fn(),
      onHighlightChange: vi.fn(),
      onFollowingChange: vi.fn(),
      onCursorChange: vi.fn(),
    };
    const chart = mount<Row>(fakes, { ...base, ...callbacks });
    const events = {
      viewport: vi.fn(),
      highlight: vi.fn(),
      following: vi.fn(),
      cursor: vi.fn(),
    };
    chart.on('viewport:change', events.viewport);
    chart.on('highlight:change', events.highlight);
    chart.on('following:change', events.following);
    chart.on('cursor:change', events.cursor);
    wheelZoom(chart, 50, 24);
    linked(chart).setHighlight('w');
    chart.setCursor(40);
    chart.resetViewport();
    expect(callbacks.onViewportChange.mock.calls).toEqual(events.viewport.mock.calls);
    expect(callbacks.onHighlightChange.mock.calls).toEqual([['w']]);
    expect(events.highlight.mock.calls).toEqual([['w']]);
    expect(callbacks.onFollowingChange.mock.calls).toEqual([[false], [true]]);
    expect(events.following.mock.calls).toEqual([[false], [true]]);
    expect(callbacks.onCursorChange.mock.calls.length).toBe(events.cursor.mock.calls.length);
    expect(events.viewport.mock.calls.map(([v]) => Object.keys(v))).toEqual([['x'], []]);
  });

  it.fails('[research-14] the 0.12 event names are gone', () => {
    const chart = mount<Row>(fakes, base);
    for (const name of [
      'state:change',
      'select',
      'data:update',
      'options:update',
      'theme:update',
      'resize',
      'follow:change',
      'visibility:change',
    ])
      expect(() => chart.on(name as never, () => {})).toThrow(/not an event/);
  });
});

describe('[gap-overhaul-delta-03] isolated listeners over a snapshot (P14)', () => {
  it.fails('[gap-overhaul-delta-03] a throwing on() listener does not stop later listeners, and is rethrown asynchronously', () => {
    const queued = captureRethrows();
    const chart = mount<Row>(fakes, base);
    const group = linked(chart);
    const seen: Array<string | null> = [];
    chart.on('highlight:change', () => {
      throw new Error('first listener fails');
    });
    chart.on('highlight:change', (id) => seen.push(id));
    group.setHighlight('v');
    group.setHighlight(null);
    expect(seen).toEqual(['v', null]);
    expect(queued).toHaveLength(2);
    expect(() => queued[0]()).toThrow('first listener fails');
  });

  it.fails('[gap-overhaul-delta-03] a throwing subscriber does not stop later subscribers', () => {
    captureRethrows();
    const chart = mount<Row>(fakes, base);
    let later = 0;
    chart.subscribe(() => {
      throw new Error('first subscriber fails');
    });
    chart.subscribe(() => {
      later++;
    });
    chart.update({ highlight: 'v' });
    fakes.frames.flush();
    expect(later).toBe(1);
  });

  it.fails('[gap-overhaul-delta-03] a listener added during dispatch runs from the next emit', () => {
    const chart = mount<Row>(fakes, base);
    const group = linked(chart);
    const late = vi.fn();
    chart.on('highlight:change', () => {
      chart.on('highlight:change', late);
    });
    group.setHighlight('v');
    expect(late).not.toHaveBeenCalled();
    group.setHighlight('w');
    expect(late).toHaveBeenCalledWith('w');
  });

  it.fails('[gap-overhaul-delta-03] an unsubscribe during dispatch still lets that dispatch finish', () => {
    const chart = mount<Row>(fakes, base);
    const group = linked(chart);
    const second = vi.fn();
    let off = () => {};
    chart.on('highlight:change', () => off());
    off = chart.on('highlight:change', second);
    group.setHighlight('v');
    group.setHighlight('w');
    expect(second.mock.calls).toEqual([['v']]);
  });
});

describe('[backlog-02][dataapi-21] events are queued until the call commits', () => {
  it.fails('[backlog-02] a selection cleared by new data is delivered after the update, with the new state', () => {
    const chart = mount<Row>(fakes, {
      ...base,
      interaction: { drag: 'select' },
      selection: { x: [40, 60] },
    });
    const seen: unknown[] = [];
    chart.on('selection:change', (selection) =>
      seen.push([selection, chart.getState().selection, chart.scale('x')?.min]),
    );
    chart.update({ data: Array.from({ length: 10 }, (_, i) => ({ t: 500 + i, v: 1, w: 1 })) });
    expect(seen).toEqual([[null, null, 500]]);
  });

  it('[dataapi-21] one call emits at most one event per kind, carrying the complete value', () => {
    const chart = mount<Row>(fakes, {
      ...base,
      axes: { y: { min: 0, max: 40 } },
      interaction: { zoom: 'xy' },
    });
    const viewports: object[] = [];
    chart.on('viewport:change', (viewport) => viewports.push(viewport));
    wheelZoom(chart, 50, 20);
    expect(viewports).toHaveLength(1);
    expect(Object.keys(viewports[0]).sort()).toEqual(['x', 'y']);
  });

  it('[dataapi-21] getState() is a frozen snapshot that stays put until the next commit', () => {
    const chart = mount<Row>(fakes, base);
    const state = chart.getState();
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.hiddenSeries)).toBe(true);
    expect(chart.getState()).toBe(state);
    chart.update({ hiddenSeries: ['w'] });
    expect(chart.getState()).not.toBe(state);
    expect(state.hiddenSeries).toEqual([]);
  });

  it('[dataapi-21] destroy() removes only the attributes the chart added to its container', () => {
    const host = document.createElement('div');
    host.setAttribute('data-keep', 'yes');
    fakes.layout.setSize(host, 400, 200);
    document.body.append(host);
    const before = [...host.attributes].map((a) => `${a.name}=${a.value}`).sort();
    const chart = mount<Row>(fakes, { ...base, ariaLabel: 'Load' });
    chart.destroy();
    expect([...host.attributes].map((a) => `${a.name}=${a.value}`).sort()).toEqual(before);
  });
});

describe('[arch-07][frameworks-01] cold state, revision and the cursor channel', () => {
  it.fails('[arch-07] cursor moves do not notify state subscribers', () => {
    const chart = mount<Row>(fakes, base);
    let notified = 0;
    chart.subscribe(() => {
      notified++;
    });
    for (let x = 10; x < 30; x++) {
      chart.setCursor(x);
      hoverAt(chart, x, 22);
      fakes.frames.flush();
    }
    expect(notified).toBe(0);
    expect('cursor' in chart.getState()).toBe(false);
  });

  it('[arch-07] the cursor channel delivers one snapshot per move to on("cursor:change")', () => {
    const chart = mount<Row>(fakes, base);
    const seen: Array<number | string | null> = [];
    chart.on('cursor:change', (cursor) => seen.push(cursor.x));
    chart.setCursor(10);
    chart.setCursor(11);
    chart.setCursor(null);
    expect(seen).toEqual([10, 11, null]);
    expect(chart.getCursor({ fallback: 'latest' }).points.map((p) => p.seriesId)).toEqual([
      'v',
      'w',
    ]);
  });

  it.fails('[frameworks-01] every data, option or state commit bumps the revision', () => {
    const chart = mount<Row>(fakes, base);
    const revisions = [chart.getState().revision];
    const record = () => revisions.push(chart.getState().revision);
    chart.update({ data: rows.map((row, i) => (i === rows.length - 1 ? { ...row, v: 25 } : row)) });
    record();
    chart.appendData([{ t: 101, v: 21, w: 6 }]);
    record();
    chart.update({ axes: { y: { title: 'Load' } } });
    record();
    chart.update({ highlight: 'v' });
    record();
    for (let i = 1; i < revisions.length; i++)
      expect(revisions[i]).toBeGreaterThan(revisions[i - 1]);
  });

  it.fails('[frameworks-01] subscribers are notified once per frame however many commits it holds', () => {
    const chart = mount<Row>(fakes, { ...base, streaming: { maxPoints: 1000 } });
    let notified = 0;
    chart.subscribe(() => {
      notified++;
    });
    for (let i = 0; i < 50; i++) chart.appendData([{ t: 101 + i, v: 21, w: 6 }]);
    expect(notified).toBe(0);
    fakes.frames.flush();
    expect(notified).toBe(1);
    chart.appendData([{ t: 151, v: 21, w: 6 }]);
    fakes.frames.flush();
    expect(notified).toBe(2);
  });

  it.fails('[frameworks-01] getState().series lists every series with its colour and visibility', () => {
    const chart = mount<Row>(fakes, { ...base, hiddenSeries: ['w'] });
    expect(
      chart.getState().series.map(({ id, label, type, visible }) => ({ id, label, type, visible })),
    ).toEqual([
      { id: 'v', label: 'V', type: 'line', visible: true },
      { id: 'w', label: 'W', type: 'line', visible: false },
    ]);
    expect(chart.getState().series[0].color).toMatch(/^#|^rgb/);
  });
});
