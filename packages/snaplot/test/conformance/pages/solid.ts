/**
 * The Solid runtime: `snaplot/solid` as an application uses it, without a JSX compiler (the
 * calls JSX compiles to). Options are a signal spread into `<Chart>`, the handle arrives through
 * `ref={setChart}`, and the primitives and `<LegendTable>` read that signal.
 */
import {
  type Accessor,
  createComponent,
  createEffect,
  createRoot,
  createSignal,
  type JSX,
  mergeProps,
} from 'solid-js';
import { hydrate, render } from 'solid-js/web';
import type { ChartHandle } from 'snaplot';
import { Chart, createChartState, createCursor, LegendTable } from 'snaplot/solid';
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

/** HTML attribute names in Solid's spelling (it takes `class` and lower-case attributes). */
function solidAttributes(attrs: Attributes = {}): Record<string, string> {
  return { ...attrs };
}

let factory: Factory = () => ({ series: [] });
let setOptions: ((options: Options) => void) | undefined;
let chart: Accessor<ChartHandle<Row> | undefined> = () => undefined;
let dispose: (() => void) | undefined;
let unrecord: (() => void) | undefined;

function companions(setup: Setup, handle: Accessor<ChartHandle<Row> | undefined>): JSX.Element[] {
  const out: JSX.Element[] = [];
  if (setup.selector) {
    const highlight = createChartState(handle, (state) => state.highlight);
    createEffect(() => {
      highlight();
      counters.renders++;
    });
  }
  if (setup.readout) {
    const cursor = createCursor(handle, { fallback: 'latest' });
    const output = document.createElement('output');
    output.id = 'readout';
    createEffect(() => {
      output.textContent =
        cursor()
          ?.points.map((point) => point.formattedY)
          .join(',') ?? '';
    });
    out.push(output);
  }
  if (setup.table) {
    const div = document.createElement('div');
    div.id = 'table';
    div.append(createComponent(LegendTable<Row>, { chart: handle, columns: setup.table }) as Node);
    out.push(div);
  }
  return out;
}

let pairFactory: ((index: number) => Options) | undefined;
let setPairShown: ((shown: boolean) => void) | undefined;
let pairCharts: Accessor<ChartHandle<Row> | undefined>[] = [];

const solid: Host = {
  runtime: 'solid',
  version: '',
  async mount(next, setup = {}) {
    factory = next;
    if (setup.stage !== undefined) stage().style.cssText = setup.stage;
    dispose = render(() => {
      const [options, set] = createSignal<Options>(next());
      setOptions = set;
      const [handle, setHandle] = createSignal<ChartHandle<Row>>();
      chart = handle;
      return [
        createComponent(
          Chart<Row>,
          mergeProps(options, solidAttributes(setup.attrs), { ref: setHandle }) as never,
        ),
        ...companions(setup, handle),
      ];
    }, stage());
    await settle();
    const handle = chart();
    if (handle) unrecord = record(handle);
  },
  async set(next) {
    factory = next;
    setOptions?.(next());
    await settle();
  },
  async rerender() {
    setOptions?.(factory());
    await settle();
  },
  async unmount() {
    unrecord?.();
    unrecord = undefined;
    dispose?.();
    dispose = undefined;
    chart = () => undefined;
    pairCharts = [];
    stage().replaceChildren();
    await settle();
  },
  handle: () => chart() ?? null,
  element: () => stage().firstElementChild as HTMLElement | null,
  async pair(next) {
    pairFactory = next;
    dispose = render(() => {
      const [shown, setShown] = createSignal(true);
      setPairShown = setShown;
      const charts = [0, 1].map(() => createSignal<ChartHandle<Row>>());
      pairCharts = charts.map(([get]) => get);
      const make = () =>
        charts.map(([, set], index) => {
          const div = document.createElement('div');
          div.style.height = '160px';
          div.append(
            createComponent(Chart<Row>, { ...pairFactory?.(index), ref: set } as never) as Node,
          );
          return div;
        });
      // What <Show> compiles to: a child function, re-run (and its charts disposed) on a change.
      return (() => (shown() ? make() : undefined)) as unknown as JSX.Element;
    }, stage());
    await settle();
  },
  async showPair(shown) {
    setPairShown?.(shown);
    await settle();
  },
  pairHandles: () =>
    pairCharts.map((get) => get()).filter((handle): handle is ChartHandle<Row> => !!handle),
  async hydrate(next) {
    factory = next;
    dispose = hydrate(() => {
      const [handle, setHandle] = createSignal<ChartHandle<Row>>();
      chart = handle;
      return createComponent(Chart<Row>, mergeProps(next(), { ref: setHandle }) as never);
    }, stage());
    await settle();
  },
};

/**
 * Scenario #22 (frameworks-09): the primitives and `<LegendTable>` given the chart as a handle, as
 * an accessor and as `undefined`. Each reads after its root has run its effects.
 */
function sources() {
  const handle = chart();
  const out = { following: [] as unknown[], cursor: [] as unknown[], tables: [] as boolean[] };
  const reads = createRoot((dispose) => {
    const made = [handle, () => handle, undefined].map((source) => {
      const div = document.createElement('div');
      div.append(createComponent(LegendTable<Row>, { chart: source }) as Node);
      return {
        following: createChartState(source, (state) => state.following),
        cursor: createCursor(source, { fallback: 'latest' }),
        div,
      };
    });
    return { made, dispose };
  });
  for (const { following, cursor, div } of reads.made) {
    out.following.push(following() ?? null);
    out.cursor.push(cursor()?.points[0]?.formattedY ?? null);
    out.tables.push(!!div.querySelector('table'));
  }
  reads.dispose();
  return out;
}

(window as unknown as { __solid: unknown }).__solid = { sources };
window.__host = solid;
document.documentElement.dataset.ready = 'true';
