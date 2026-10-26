// @vitest-environment jsdom
// Render counts of the React hooks with selectors (plan §7.2, §12 M13): a plain `useRef` works
// with the hooks and <LegendTable> through the ref registry (frameworks-14, research-05), a
// selector re-renders only when its slice changes (frameworks-03), and cursor moves re-render only
// the component that reads the cursor.
import { act, createElement as h, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ChartHandle, ChartState } from 'snaplot';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Fakes, installFakes } from '../fakes';
import { Chart } from '../../src/react/Chart';
import { useChartState, useCursor } from '../../src/react/hooks';
import { LegendTable } from '../../src/react/LegendTable';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type Row = { t: number; cpu: number; mem: number };
const rows: Row[] = Array.from({ length: 20 }, (_, t) => ({ t, cpu: 40 + t, mem: 60 }));
const series = [
  { y: 'cpu', label: 'CPU' },
  { y: 'mem', label: 'Memory' },
] as const;

let fakes: Fakes;
let root: Root | undefined;
beforeEach(() => {
  fakes = installFakes();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  fakes.uninstall();
  vi.restoreAllMocks();
});

function host(): HTMLElement {
  const element = document.createElement('div');
  fakes.layout.setSize(element, 400, 200);
  document.body.append(element);
  return element;
}

// The hooks take the ref object itself; the M8 signatures take a handle, hence the casts.
type AnyRef = Parameters<typeof useChartState>[0];

/** A chart with a plain useRef, and probes that count their renders. */
function mountWithProbes(probes: { state?: (state: ChartState) => unknown; cursor?: boolean }) {
  const counts = { state: 0, cursor: 0 };
  const seen: { state?: unknown; cursor?: number } = {};
  let handle: { current: ChartHandle<Row> | null } = { current: null };
  function StateProbe({ chart }: { chart: AnyRef }) {
    counts.state++;
    seen.state = useChartState(chart, probes.state);
    return null;
  }
  function CursorProbe({ chart }: { chart: AnyRef }) {
    counts.cursor++;
    seen.cursor = useCursor(chart as never, { fallback: 'latest' })?.points[0]?.y;
    return null;
  }
  function App() {
    const ref = useRef<ChartHandle<Row>>(null);
    handle = ref;
    return h(
      'div',
      null,
      h(Chart<Row>, { ref, data: rows, x: 't', series }),
      probes.state ? h(StateProbe, { chart: ref as unknown as AnyRef }) : null,
      probes.cursor ? h(CursorProbe, { chart: ref as unknown as AnyRef }) : null,
    );
  }
  return { App, counts, seen, chart: () => handle.current };
}

describe('[frameworks-14][research-05] the hooks read a plain useRef', () => {
  it.fails('[frameworks-14] useChartState re-renders once when the chart mounts, then only on its slice', async () => {
    const probe = mountWithProbes({ state: (state) => state.hiddenSeries.length });
    root = createRoot(host());
    await act(async () => root?.render(h(probe.App)));
    // The first render has no chart yet; the registry re-renders once it mounts.
    expect(probe.seen.state).toBe(0);
    expect(probe.counts.state).toBe(2);
    await act(async () => probe.chart()?.update({ axes: { y: { title: 'Load' } } }));
    expect(probe.counts.state).toBe(2);
    await act(async () => probe.chart()?.update({ hiddenSeries: ['mem'] }));
    expect(probe.seen.state).toBe(1);
    expect(probe.counts.state).toBe(3);
  });

  it.fails('[frameworks-03][frameworks-14] 20 cursor moves re-render the cursor reader only', async () => {
    const probe = mountWithProbes({ state: (state) => state.highlight, cursor: true });
    root = createRoot(host());
    await act(async () => root?.render(h(probe.App)));
    const before = { ...probe.counts };
    for (let x = 0; x < 20; x++) await act(async () => probe.chart()?.setCursor(x));
    expect(probe.counts.state).toBe(before.state);
    expect(probe.counts.cursor - before.cursor).toBe(20);
    expect(probe.seen.cursor).toBe(rows[19].cpu);
  });

  it.fails('[frameworks-14] useCursor reads the latest point after a data change, through the ref', async () => {
    const probe = mountWithProbes({ cursor: true });
    root = createRoot(host());
    await act(async () => root?.render(h(probe.App)));
    expect(probe.seen.cursor).toBe(rows[19].cpu);
    await act(async () =>
      probe.chart()?.update({ data: rows.map((row) => ({ ...row, cpu: row.cpu + 100 })) }),
    );
    expect(probe.seen.cursor).toBe(rows[19].cpu + 100);
  });

  it.fails('[frameworks-14] the hooks return undefined again once the chart unmounts', async () => {
    let seen: unknown = 'unset';
    function Probe({ chart }: { chart: AnyRef }) {
      seen = useChartState(chart, (state) => state.following);
      return null;
    }
    function App({ shown }: { shown: boolean }) {
      const ref = useRef<ChartHandle<Row>>(null);
      return h(
        'div',
        null,
        shown ? h(Chart<Row>, { ref, data: rows, x: 't', series }) : null,
        h(Probe, { chart: ref as unknown as AnyRef }),
      );
    }
    root = createRoot(host());
    await act(async () => root?.render(h(App, { shown: true })));
    expect(seen).toBe(true);
    await act(async () => root?.render(h(App, { shown: false })));
    expect(seen).toBeUndefined();
  });

  it.fails('[frameworks-14] LegendTable reads a plain useRef', async () => {
    function App() {
      const ref = useRef<ChartHandle<Row>>(null);
      return h(
        'div',
        null,
        h(Chart<Row>, { ref, data: rows, x: 't', series }),
        h(LegendTable<Row>, { chart: ref as never, columns: ['name', 'value'] }),
      );
    }
    const element = host();
    root = createRoot(element);
    await act(async () => root?.render(h(App)));
    expect(element.querySelector('tbody tr')?.textContent).toBe(`CPU${rows[19].cpu}`);
  });
});
