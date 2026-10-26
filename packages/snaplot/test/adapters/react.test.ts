// @vitest-environment jsdom
// The React components and hooks on the real core (plan §12 M8: they compile on setOptions;
// M13 finalises them with the conformance suite).
import { act, createElement as h, createRef, StrictMode, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import manifestText from '../../package.json?raw';
import { debug, type Fakes, installFakes } from '../fakes';
import type { ChartHandle, ChartOptions, ChartState } from '../../src/public/types';
import { Chart } from '../../src/react/Chart';
import { useChartState, useCursor } from '../../src/react/hooks';
import { LegendTable } from '../../src/react/LegendTable';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type Row = { t: number; cpu: number; mem: number };
const rows: Row[] = Array.from({ length: 20 }, (_, t) => ({ t, cpu: 40 + (t % 7), mem: 60 }));

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

describe('[research-07] React 18.3 and 19', () => {
  it('[research-07] the React peer range takes React 18.3 and 19', () => {
    // The React 18 runtime itself runs the conformance suite (test/conformance/react18).
    const manifest = JSON.parse(manifestText) as { peerDependencies: Record<string, string> };
    expect(manifest.peerDependencies.react).toBe('^18.3.0 || ^19.0.0');
  });
});

describe('React Chart', () => {
  it('mounts one chart with the options as props and passes host attributes through', async () => {
    const ref = createRef<ChartHandle<Row>>();
    const element = host();
    root = createRoot(element);
    await act(async () =>
      root?.render(
        h(Chart<Row>, {
          ref,
          data: rows,
          x: 't',
          series: [{ y: 'cpu' }],
          id: 'cpu-chart',
          className: 'chart',
          ...{ 'data-testid': 'cpu' },
        }),
      ),
    );
    const div = element.firstElementChild as HTMLElement;
    expect(ref.current?.container).toBe(div);
    expect(div.id).toBe('cpu-chart');
    expect(div.dataset.testid).toBe('cpu');
    expect(div.className).toBe('chart');
    expect(div.querySelectorAll('canvas').length).toBe(3);
  });

  it('[arch-04][frameworks-02] re-renders with inline options and callbacks cost no ingest', async () => {
    const ref = createRef<ChartHandle<Row>>();
    let bump = () => {};
    function App() {
      const [count, setCount] = useState(0);
      bump = () => setCount((n) => n + 1);
      return h(Chart<Row>, {
        ref,
        data: rows,
        x: 't',
        series: [{ y: 'cpu', label: 'CPU' }],
        axes: { y: { title: `Load ${count > -1 ? '' : count}`.trim() } },
        onPointClick: () => {},
      });
    }
    root = createRoot(host());
    await act(async () => root?.render(h(App)));
    const before = debug(ref.current!).ingestCount;
    for (let i = 0; i < 5; i++) await act(async () => bump());
    expect(debug(ref.current!).ingestCount).toBe(before);
  });

  it('a changed option applies, and a removed one returns to its default', async () => {
    const ref = createRef<ChartHandle<Row>>();
    const options: ChartOptions<Row> = { data: rows, x: 't', series: [{ y: 'cpu' }, { y: 'mem' }] };
    root = createRoot(host());
    await act(async () => root?.render(h(Chart<Row>, { ref, ...options, hiddenSeries: ['mem'] })));
    expect(ref.current?.getState().hiddenSeries).toEqual(['mem']);
    await act(async () => root?.render(h(Chart<Row>, { ref, ...options })));
    expect(ref.current?.getState().hiddenSeries).toEqual([]);
  });

  it('survives StrictMode and renders on the server without a chart', async () => {
    root = createRoot(host());
    await act(async () =>
      root?.render(
        h(StrictMode, null, h(Chart<Row>, { data: rows, x: 't', series: [{ y: 'cpu' }] })),
      ),
    );
    expect(document.querySelectorAll('canvas').length).toBe(3);
    expect(renderToString(h(Chart<Row>, { data: rows, x: 't', series: [{ y: 'cpu' }] }))).toContain(
      'role="figure" aria-label="Line chart, 1 series: cpu"',
    );
  });
});

describe('React hooks and LegendTable', () => {
  it('[frameworks-03] useChartState re-renders only when its slice changes', async () => {
    const ref = createRef<ChartHandle<Row>>();
    let renders = 0;
    let handle: ChartHandle<Row> | null = null;
    function Probe({ chart }: { chart: ChartHandle<Row> | null }) {
      renders++;
      useChartState(chart, (state: ChartState) => state.highlight);
      return null;
    }
    function App() {
      const [chart, setChart] = useState<ChartHandle<Row> | null>(null);
      return h(
        'div',
        null,
        h(Chart<Row>, {
          ref: (value: ChartHandle<Row> | null) => {
            (ref as { current: ChartHandle<Row> | null }).current = value;
            handle = value;
            if (value) setChart(value);
          },
          data: rows,
          x: 't',
          series: [{ y: 'cpu' }],
        }),
        h(Probe, { chart }),
      );
    }
    root = createRoot(host());
    await act(async () => root?.render(h(App)));
    const start = renders;
    for (let x = 2; x < 12; x++) await act(async () => handle?.setCursor(x));
    expect(renders - start).toBe(0);
  });

  it('useCursor reports the cursor and the latest point', async () => {
    let latest: number | undefined;
    let chart: ChartHandle<Row> | null = null;
    function Readout() {
      latest = useCursor(chart, { fallback: 'latest' })?.points[0]?.y;
      return null;
    }
    const ref = (value: ChartHandle<Row> | null) => {
      chart = value;
    };
    root = createRoot(host());
    await act(async () =>
      root?.render(
        h('div', null, h(Chart<Row>, { ref, data: rows, x: 't', series: [{ y: 'cpu' }] })),
      ),
    );
    await act(async () =>
      root?.render(
        h(
          'div',
          null,
          h(Chart<Row>, { ref, data: rows, x: 't', series: [{ y: 'cpu' }] }),
          h(Readout),
        ),
      ),
    );
    expect(latest).toBe(rows[19].cpu);
    await act(async () => chart?.setCursor(3));
    expect(latest).toBe(rows[3].cpu);
  });

  it('LegendTable mounts createLegendTable for the chart it is given', async () => {
    let chart: ChartHandle<Row> | null = null;
    const element = host();
    root = createRoot(element);
    const ref = (value: ChartHandle<Row> | null) => {
      chart = value;
    };
    const chartProps: ChartOptions<Row> & { ref: typeof ref } = {
      ref,
      data: rows,
      x: 't',
      series: [{ y: 'cpu', label: 'CPU' }],
    };
    await act(async () => root?.render(h('div', null, h(Chart<Row>, chartProps))));
    await act(async () =>
      root?.render(
        h(
          'div',
          null,
          h(Chart<Row>, chartProps),
          h(LegendTable<Row>, { chart, columns: ['name', 'value'] }),
        ),
      ),
    );
    const row = element.querySelector('tbody tr');
    expect(row?.textContent).toBe(`CPU${rows[19].cpu}`);
  });
});
