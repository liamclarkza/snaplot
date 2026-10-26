// @vitest-environment jsdom
// Known M13 defects in the React and Solid bindings (plan §7, RC13), with the
// real core underneath (the jsdom fakes stand in for canvas and observers).
// The final adapter API is used: `useChartState(chart, selector)`, a plain
// handle for Solid companions. M8 deletes the old hooks; M13 flips these.
import { Activity, act, type ComponentProps, createElement as h, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { createComponent, render } from 'solid-js/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChartGroup } from '../../src/index';
import type { ChartHandle } from '../../src/index';
import { Chart } from '../../src/react/Chart';
import * as hooks from '../../src/react/hooks';
import { LegendTable } from '../../src/solid/LegendTable';
import { debug, type Fakes, installFakes } from '../fakes';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

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

type Row = { t: number; cpu: number };
const rows: Row[] = Array.from({ length: 40 }, (_, t) => ({ t, cpu: 40 + (t % 7) }));

/** A sized host for a React root. */
function reactHost(): HTMLElement {
  const host = document.createElement('div');
  fakes.layout.setSize(host, 400, 200);
  document.body.append(host);
  return host;
}

type Group = ReturnType<typeof createChartGroup>;

/**
 * A group made inside the component, as the audit's repro does. Today's
 * `useChartGroup` destroys it in the effect cleanup that `<Activity>` runs on
 * hide. M8 deletes the hook; this then falls back to the final pattern of
 * plan §4.2, `useState(() => createChartGroup())[0]`, so the marker below
 * passes unexpectedly and M8 flips it in the commit that deletes the hook.
 */
const useComponentGroup: () => Group =
  (hooks as { useChartGroup?: () => Group }).useChartGroup ??
  (() => useState(() => createChartGroup())[0]);

/** The final hook takes a selector; today's ignores it. */
const useChartState = hooks.useChartState as unknown as <T>(
  chart: ChartHandle<Row> | null | undefined,
  selector: (state: any) => T,
) => T;

describe('[frameworks-03][arch-04] React', () => {
  it('[frameworks-03] a highlight selector re-renders once over 20 cursor moves', async () => {
    let renders = 0;
    let handle: ChartHandle<Row> | null = null;
    function Probe({ chart }: { chart: ChartHandle<Row> | null }) {
      renders++;
      useChartState(chart, (state) => state?.highlight ?? state?.highlight ?? null);
      return null;
    }
    function App() {
      const [chart, setChart] = useState<ChartHandle<Row> | null>(null);
      return h(
        'div',
        null,
        h(Chart<Row>, {
          data: rows,
          x: 't',
          series: [{ y: 'cpu' }],
          ref: (ready: ChartHandle<Row> | null) => {
            if (!ready) return;
            handle = ready;
            setChart(ready);
          },
        }),
        h(Probe, { chart }),
      );
    }
    root = createRoot(reactHost());
    await act(async () => root?.render(h(App)));
    const start = renders;
    // One task per move, as pointer events arrive.
    for (let x = 5; x < 25; x++) await act(async () => handle?.setCursor(x));
    expect(handle).not.toBeNull();
    expect(renders - start).toBeLessThanOrEqual(1);
  });

  it('[arch-04][frameworks-02] a parent re-render with inline callbacks does not re-ingest', async () => {
    let handle: ChartHandle<Row> | null = null;
    let bump: () => void = () => {};
    function App() {
      const [count, setCount] = useState(0);
      bump = () => setCount((value) => value + 1);
      return h(Chart<Row>, {
        data: rows,
        x: 't',
        series: [{ y: 'cpu', label: `CPU ${count > -1 ? '' : count}`.trim() }],
        axes: { y: { format: (v: number | string) => `${v}%` } },
        onPointClick: () => {},
        ref: (ready: ChartHandle<Row> | null) => {
          if (ready) handle = ready;
        },
      });
    }
    root = createRoot(reactHost());
    await act(async () => root?.render(h(App)));
    const before = handle ? debug(handle).ingestCount : -1;
    for (let i = 0; i < 5; i++) await act(async () => bump());
    expect(handle ? debug(handle).ingestCount : -2).toBe(before);
  });

  it('[frameworks-20] the React host is named by an automatic summary, not "Chart"', () => {
    // The host renders its role and name itself, so server markup is a named figure (plan D20).
    // That the core then leaves them alone is M12a's rule ([interact-23], conformance #1).
    const html = renderToString(
      h(Chart<Row>, { data: rows, x: 't', series: [{ y: 'cpu', label: 'CPU' }] }),
    );
    expect(html).toContain('role="figure"');
    expect(html).toContain('aria-label="Line chart, 1 series: CPU"');
  });

  it('[frameworks-07] two charts grouped inside a component survive an <Activity> hide and show', async () => {
    let setMode: (mode: 'visible' | 'hidden') => void = () => {};
    const errors: unknown[] = [];
    function Grouped() {
      const group = useComponentGroup();
      return h(
        'div',
        null,
        h(Chart<Row>, { data: rows, x: 't', series: [{ y: 'cpu' }], group }),
        h(Chart<Row>, { data: rows, x: 't', series: [{ y: 'cpu' }], group }),
      );
    }
    function App() {
      const [mode, set] = useState<'visible' | 'hidden'>('visible');
      setMode = set;
      // createElement passes children separately; ActivityProps types them as required.
      return h(Activity, { mode } as ComponentProps<typeof Activity>, h(Grouped));
    }
    root = createRoot(reactHost(), { onUncaughtError: (error) => errors.push(error) });
    await act(async () => root?.render(h(App)));
    await act(async () => setMode('hidden'));
    await act(async () => setMode('visible'));
    expect(errors.map(String)).toEqual([]);
  });

  // Control: a module-scope group (the other final pattern) already survives.
  // It carries no id, so it cannot lock frameworks-07 while the marker above
  // is open.
  it('two charts sharing a module-scope group survive an <Activity> hide and show', async () => {
    const group = createChartGroup();
    let setMode: (mode: 'visible' | 'hidden') => void = () => {};
    const errors: unknown[] = [];
    function Grouped() {
      const [mode, set] = useState<'visible' | 'hidden'>('visible');
      setMode = set;
      const a = useRef<ChartHandle<Row>>(null);
      return h(
        Activity,
        // createElement passes children separately; ActivityProps types them as required.
        { mode } as ComponentProps<typeof Activity>,
        h(
          'div',
          null,
          h(Chart<Row>, { ref: a, data: rows, x: 't', series: [{ y: 'cpu' }], group }),
          h(Chart<Row>, { data: rows, x: 't', series: [{ y: 'cpu' }], group }),
        ),
      );
    }
    root = createRoot(reactHost(), { onUncaughtError: (error) => errors.push(error) });
    await act(async () => root?.render(h(Grouped)));
    await act(async () => setMode('hidden'));
    await act(async () => setMode('visible'));
    expect(errors).toEqual([]);
  });
});

describe('[frameworks-09] Solid', () => {
  it('[frameworks-09] LegendTable accepts a plain chart handle, not only an accessor', () => {
    const chart = fakes.mount<Row>({ data: rows, x: 't', series: [{ y: 'cpu', label: 'CPU' }] });
    const host = document.createElement('div');
    document.body.append(host);
    let dispose: (() => void) | undefined;
    expect(() => {
      dispose = render(() => createComponent(LegendTable<Row>, { chart: chart as never }), host);
    }).not.toThrow();
    expect(host.textContent).toContain('CPU');
    dispose?.();
  });
});
