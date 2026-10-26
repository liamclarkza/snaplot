/**
 * The React runtimes: this page is built twice, against React 19 from the workspace and against
 * React 18.3 from the isolated `../react18/` fixture (plan D2). It uses `snaplot/react` as an
 * application does: props are the options, a plain `useRef` holds the handle, and the hooks and
 * `<LegendTable>` read that ref.
 */
import * as React from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import type { ChartHandle } from 'snaplot';
import { Chart, LegendTable, useChartState, useCursor } from 'snaplot/react';
import {
  type Attributes,
  counters,
  type Factory,
  type Host,
  type Options,
  type Row,
  record,
  type Setup,
  settle,
  stage,
} from './kit';

const h = React.createElement;
type Ref = React.RefObject<ChartHandle<Row> | null>;

/** HTML attribute names in React's spelling. */
function reactAttributes(attrs: Attributes = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(attrs))
    out[name === 'class' ? 'className' : name === 'tabindex' ? 'tabIndex' : name] = value;
  return out;
}

function Probe({ chart }: { chart: Ref }) {
  counters.renders++;
  useChartState(chart as never, (state) => state.highlight);
  return null;
}

function Readout({ chart }: { chart: Ref }) {
  const cursor = useCursor(chart as never, { fallback: 'latest' });
  return h('output', { id: 'readout' }, cursor?.points.map((p) => p.formattedY).join(',') ?? '');
}

let factory: Factory = () => ({ series: [] });
let setup: Setup = {};
let rerender: (() => void) | undefined;
let chartRef: Ref | undefined;

function App() {
  const [, setTick] = React.useState(0);
  rerender = () => setTick((tick) => tick + 1);
  const ref = React.useRef<ChartHandle<Row> | null>(null);
  chartRef = ref;
  return h(
    React.Fragment,
    null,
    h(Chart<Row>, { ...factory(), ...reactAttributes(setup.attrs), ref } as never),
    setup.selector ? h(Probe, { chart: ref }) : null,
    setup.readout ? h(Readout, { chart: ref }) : null,
    setup.table
      ? h(
          'div',
          { id: 'table' },
          h(LegendTable<Row>, { chart: ref, columns: setup.table } as never),
        )
      : null,
  );
}

let pairFactory: ((index: number) => Options) | undefined;
let setPairShown: ((shown: boolean) => void) | undefined;
let pairRefs: Ref[] = [];
/** React 19.2's `<Activity>`; React 18 has none, so the pair renders conditionally. */
const Activity = (React as unknown as { Activity?: React.ElementType }).Activity;

function Pair() {
  const [shown, setShown] = React.useState(true);
  setPairShown = setShown;
  const a = React.useRef<ChartHandle<Row> | null>(null);
  const b = React.useRef<ChartHandle<Row> | null>(null);
  pairRefs = [a, b];
  const charts = [a, b].map((ref, index) =>
    h(
      'div',
      { key: index, style: { height: 160 } },
      h(Chart<Row>, { ...pairFactory?.(index), ref } as never),
    ),
  );
  if (Activity) return h(Activity, { mode: shown ? 'visible' : 'hidden' }, charts);
  return shown ? h(React.Fragment, null, charts) : null;
}

let root: Root | undefined;
let unrecord: (() => void) | undefined;

const runtime = React.version.startsWith('18') ? 'react18' : 'react19';

const react: Host = {
  runtime,
  version: React.version,
  async mount(next, options = {}) {
    factory = next;
    setup = options;
    if (options.stage !== undefined) stage().style.cssText = options.stage;
    root = createRoot(stage());
    root.render(options.strict ? h(React.StrictMode, null, h(App)) : h(App));
    await settle();
    const handle = chartRef?.current;
    if (handle) unrecord = record(handle);
  },
  async set(next) {
    factory = next;
    rerender?.();
    await settle();
  },
  async rerender() {
    rerender?.();
    await settle();
  },
  async unmount() {
    unrecord?.();
    unrecord = undefined;
    root?.unmount();
    root = undefined;
    chartRef = undefined;
    pairRefs = [];
    await settle();
  },
  handle: () => chartRef?.current ?? null,
  element: () => stage().firstElementChild as HTMLElement | null,
  async pair(next) {
    pairFactory = next;
    root = createRoot(stage());
    root.render(h(Pair));
    await settle();
  },
  async showPair(shown) {
    setPairShown?.(shown);
    await settle();
  },
  pairHandles: () =>
    pairRefs.map((ref) => ref.current).filter((handle): handle is ChartHandle<Row> => !!handle),
  async hydrate(next) {
    factory = next;
    setup = {};
    root = hydrateRoot(stage(), h(App), {
      onRecoverableError: (error) => console.error(`recoverable: ${String(error)}`),
    });
    await settle();
  },
};

window.__host = react;
document.documentElement.dataset.ready = 'true';
