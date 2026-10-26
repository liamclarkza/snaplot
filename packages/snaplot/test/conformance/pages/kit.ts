/**
 * What every conformance runtime page shares (plan §7.5): the data, the stage, the event
 * recorder and the DOM probes the scenarios read. Each page sets `window.__host` to its runtime's
 * implementation of `Host`; the specs drive it through `page.evaluate`.
 *
 * The pages import the built library by name (`snaplot`, `snaplot/react`, `snaplot/solid`), as
 * an application does. React 18's page is built from the isolated fixture in `../react18/`, whose
 * `snaplot` is the packed tarball (plan D2).
 */
import type { ChartEvents, ChartGroup, ChartHandle, ChartOptions } from 'snaplot';
import { createChart, createChartGroup } from 'snaplot';

export type Row = { t: number; cpu: number; mem: number };
export type Options = ChartOptions<Row>;
/** Options for one render: called on every render, so inline literals get new identities. */
export type Factory = () => Options;

/** The host attributes a scenario passes, in HTML spelling; each runtime maps them. */
export type Attributes = Record<string, string>;

/** Companion components a scenario mounts beside the chart. */
export interface Setup {
  /** Attributes of the chart's host element. */
  attrs?: Attributes;
  /** A component reading `highlight` through the state hook; it counts its renders in `renders`. */
  selector?: boolean;
  /** A component showing the cursor with `fallback: 'latest'` in `#readout`. */
  readout?: boolean;
  /** A legend table with these columns in `#table`. */
  table?: readonly ('swatch' | 'name' | 'value')[];
  /** React: mount inside `<StrictMode>`. */
  strict?: boolean;
  /** Inline CSS of the stage the chart is mounted in. */
  stage?: string;
}

/** One runtime, as the specs drive it. */
export interface Host {
  readonly runtime: 'vanilla' | 'react18' | 'react19' | 'solid';
  /** The framework version (`React.version`), or `''`. */
  readonly version: string;
  /** Mount one chart (and its companions) in `#stage`. */
  mount(factory: Factory, setup?: Setup): Promise<void>;
  /** Render again with new options. */
  set(factory: Factory): Promise<void>;
  /** An unrelated parent re-render: the same factory, called again. */
  rerender(): Promise<void>;
  /** Unmount everything `mount` or `pair` made. */
  unmount(): Promise<void>;
  /** The chart's handle, from the component's ref. */
  handle(): ChartHandle<Row> | null;
  /** The chart's host element. */
  element(): HTMLElement | null;
  /** Mount two charts sharing `group` in `#stage`, inside `<Activity>` on React 19. */
  pair(factory: (index: number) => Options): Promise<void>;
  /** Hide or show the pair: `<Activity>`, a conditional render, or destroy and create. */
  showPair(visible: boolean): Promise<void>;
  /** The pair's handles, while shown. */
  pairHandles(): ChartHandle<Row>[];
  /** Server markup (`#stage` already holds it), then hydrate it with `factory`. */
  hydrate(factory: Factory): Promise<void>;
}

declare global {
  interface Window {
    __host: Host;
    __kit: typeof kit;
    /** A scenario's own state: factories read it, so a change and a re-render apply it. */
    __s: Record<string, any>;
  }
}

/** `n` rows of a CPU ramp and a memory wave, the same in every runtime. */
export function rows(n: number, cpu: (t: number) => number = (t) => t): Row[] {
  return Array.from({ length: n }, (_, t) => ({ t, cpu: cpu(t), mem: 50 + ((t * 7) % 11) }));
}

/** The stage the chart mounts in. */
export function stage(): HTMLElement {
  const element = document.getElementById('stage');
  if (!element) throw new Error('conformance: no #stage');
  return element;
}

/** Wait `count` animation frames and a task, so scheduled renders and paints have landed. */
export function settle(count = 2): Promise<void> {
  return new Promise((resolve) => {
    const step = (left: number) =>
      left <= 0 ? setTimeout(resolve, 0) : requestAnimationFrame(() => step(left - 1));
    step(count);
  });
}

/** Every recorded event (`cursor:change` is not recorded; scenarios read the cursor directly). */
export const events: { name: string; value: unknown }[] = [];
const EVENTS: (keyof ChartEvents<Row>)[] = [
  'viewport:change',
  'selection:change',
  'hiddenSeries:change',
  'highlight:change',
  'following:change',
  'point:click',
];

/** Record the events of `chart` into `events`; returns the unsubscribe. */
export function record(chart: ChartHandle<Row>): () => void {
  const offs = EVENTS.map((name) =>
    chart.on(name, (value: unknown) =>
      events.push({ name, value: JSON.parse(JSON.stringify(value ?? null)) }),
    ),
  );
  return () => {
    for (const off of offs) off();
  };
}

/** Renders of the state-hook probe (`Setup.selector`). */
export const counters = { renders: 0 };

let sharedGroup: ChartGroup | undefined;
/** The page's group: the scenarios' charts and the vanilla peer join it. */
export function group(): ChartGroup {
  sharedGroup ??= createChartGroup();
  return sharedGroup;
}

let peerChart: ChartHandle<Row> | undefined;
/** A vanilla chart in `#peer`, in `group()`, with values on another scale. */
export function peer(): ChartHandle<Row> {
  if (peerChart) return peerChart;
  const element = document.getElementById('peer');
  if (!element) throw new Error('conformance: no #peer');
  element.style.cssText = 'width:640px;height:240px';
  peerChart = createChart<Row>(element, {
    data: rows(40, (t) => 1000 + t * 50),
    x: 't',
    series: [{ y: 'cpu', label: 'Peer' }],
    group: group(),
  });
  return peerChart;
}

/** Destroy the peer. */
export function dropPeer(): void {
  peerChart?.destroy();
  peerChart = undefined;
}

// ─── Probes ──────────────────────────────────────────────────────────

const DEBUG = Symbol.for('snaplot.debug');

/** The chart's untyped debug counters (plan D31). */
export function debug(chart: ChartHandle<Row>): Record<string, any> {
  return (chart as unknown as Record<symbol, Record<string, any>>)[DEBUG];
}

/** The client position of a data point on the chart's linear axes. */
export function clientPoint(chart: ChartHandle<Row>, x: number, y: number) {
  const origin = (
    chart.container.querySelector('[role="application"]') ?? chart.container
  ).getBoundingClientRect();
  const xs = chart.scale('x');
  const ys = chart.scale('y');
  if (!xs || !ys) throw new Error('conformance: no x or y axis');
  return { x: origin.left + xs.toPixel(x), y: origin.top + ys.toPixel(y) };
}

/** The plot rectangle in client coordinates. */
export function plotRect(chart: ChartHandle<Row>) {
  const origin = (
    chart.container.querySelector('[role="application"]') ?? chart.container
  ).getBoundingClientRect();
  const plot = debug(chart).plot as { left: number; top: number; width: number; height: number };
  return {
    left: origin.left + plot.left,
    top: origin.top + plot.top,
    width: plot.width,
    height: plot.height,
  };
}

/** The text of every visible fixed-position element: the tooltip, wherever it is portalled. */
export function tooltip(): string {
  for (const animation of document.getAnimations()) animation.finish();
  const out: string[] = [];
  for (const element of document.querySelectorAll<HTMLElement>('body *')) {
    const style = getComputedStyle(element);
    if (style.position !== 'fixed') continue;
    if (Number(style.opacity) < 0.5 || style.visibility === 'hidden' || style.display === 'none')
      continue;
    const text = (element.innerText ?? '').trim();
    if (text) out.push(text);
  }
  return out.join('\n');
}

/** `html` with generated ids (and the attributes that point at them) normalised. */
export function normaliseIds(html: string): string {
  return html.replace(
    /\b(id|for|aria-controls|aria-describedby|aria-labelledby|aria-owns)="[^"]*"/g,
    '$1="#"',
  );
}

/** The built-in legend's DOM: every element of the chart host outside its canvas stack. */
export function legendHTML(chart: ChartHandle<Row>): string {
  const roots = [...chart.container.children].filter(
    (child) => !child.matches('[role="application"]'),
  );
  return normaliseIds(roots.map((root) => root.outerHTML).join('\n'));
}

/** The legend table's DOM in `#table`. */
export function tableHTML(): string {
  const table = document.querySelector('#table table');
  return table ? normaliseIds(table.outerHTML) : '';
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * What the chart drew: a SHA-256 of each canvas layer's `toDataURL()`, and the label layer's
 * text with its rectangle relative to the canvases, in DOM order.
 */
export async function pixels(chart: ChartHandle<Row>) {
  const surface = chart.container.querySelector('[role="application"]');
  if (!surface) throw new Error('conformance: no chart surface');
  const origin = surface.getBoundingClientRect();
  const layers = await Promise.all(
    [...surface.querySelectorAll('canvas')].map((canvas) => sha256(canvas.toDataURL())),
  );
  const labels: string[] = [];
  for (const element of surface.querySelectorAll<HTMLElement>('*')) {
    const own = [...element.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join('')
      .trim();
    if (!own) continue;
    const box = element.getBoundingClientRect();
    const r = (value: number) => Math.round(value);
    labels.push(
      `${own} @ ${r(box.left - origin.left)},${r(box.top - origin.top)} ${r(box.width)}x${r(box.height)}`,
    );
  }
  return { layers, labels };
}

/** Attributes of an element as a sorted `name=value` list. */
export function attributes(element: Element | null): string[] {
  return element ? [...element.attributes].map((a) => `${a.name}=${a.value}`).sort() : [];
}

export const kit = {
  rows,
  stage,
  settle,
  events,
  record,
  counters,
  group,
  peer,
  dropPeer,
  debug,
  clientPoint,
  plotRect,
  tooltip,
  legendHTML,
  tableHTML,
  pixels,
  attributes,
  normaliseIds,
};
window.__kit = kit;
