/**
 * The vanilla runtime: `createChart` and `createLegendTable` on a host element the page makes.
 * Its `set` and `rerender` call `setOptions` with a full snapshot, as an adapter does on every
 * render (plan D16).
 */
import type { ChartHandle, LegendTableHandle } from 'snaplot';
import { createChart, createLegendTable } from 'snaplot';
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

let factory: Factory | undefined;
let chart: ChartHandle<Row> | undefined;
let host: HTMLElement | undefined;
const cleanups: (() => void)[] = [];

function element(attrs: Attributes = {}): HTMLElement {
  const div = document.createElement('div');
  for (const [name, value] of Object.entries(attrs)) div.setAttribute(name, value);
  div.style.cssText = 'width:100%;height:100%';
  return div;
}

/** What the React and Solid companions show, written by the page from the public API. */
function companions(handle: ChartHandle<Row>, setup: Setup): void {
  // The first read, as a component's first render.
  if (setup.selector) counters.renders++;
  if (setup.selector)
    cleanups.push(
      handle.subscribe(() => {
        counters.renders++;
      }),
    );
  if (setup.readout) {
    const output = document.createElement('output');
    output.id = 'readout';
    const paint = () => {
      output.textContent = handle
        .getCursor({ fallback: 'latest' })
        .points.map((point) => point.formattedY)
        .join(',');
    };
    paint();
    cleanups.push(handle.subscribe(paint), handle.on('cursor:change', paint));
    stage().append(output);
  }
  if (setup.table) {
    const div = document.createElement('div');
    div.id = 'table';
    stage().append(div);
    const table: LegendTableHandle<Row> = createLegendTable(div, {
      chart: handle,
      columns: setup.table,
    });
    cleanups.push(() => table.destroy());
  }
}

let pairCharts: ChartHandle<Row>[] = [];
let pairFactory: ((index: number) => Options) | undefined;

const vanilla: Host = {
  runtime: 'vanilla',
  version: '',
  async mount(next, setup = {}) {
    factory = next;
    if (setup.stage !== undefined) stage().style.cssText = setup.stage;
    host = element(setup.attrs);
    stage().append(host);
    chart = createChart<Row>(host, next());
    cleanups.push(record(chart));
    companions(chart, setup);
    await settle();
  },
  async set(next) {
    factory = next;
    chart?.setOptions(next());
    await settle();
  },
  async rerender() {
    if (factory) chart?.setOptions(factory());
    await settle();
  },
  async unmount() {
    for (const cleanup of cleanups.splice(0)) cleanup();
    chart?.destroy();
    chart = undefined;
    for (const handle of pairCharts) handle.destroy();
    pairCharts = [];
    stage().replaceChildren();
    host = undefined;
    await settle();
  },
  handle: () => chart ?? null,
  element: () => host ?? null,
  async pair(next) {
    pairFactory = next;
    await vanilla.showPair(true);
  },
  async showPair(visible) {
    for (const handle of pairCharts) handle.destroy();
    pairCharts = [];
    stage().replaceChildren();
    if (visible && pairFactory) {
      for (const index of [0, 1]) {
        const div = element();
        div.style.height = '50%';
        stage().append(div);
        pairCharts.push(createChart<Row>(div, pairFactory(index)));
      }
    }
    await settle();
  },
  pairHandles: () => pairCharts,
  async hydrate(next) {
    factory = next;
    // Server markup for vanilla is a plain host element: the chart mounts into it.
    host = stage().firstElementChild as HTMLElement;
    chart = createChart<Row>(host, next());
    await settle();
  },
};

window.__host = vanilla;
document.documentElement.dataset.ready = 'true';
