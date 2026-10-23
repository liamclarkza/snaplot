/**
 * Browser harness page for the `test:browser` specs (plan M3b scope 1).
 *
 * Specs build charts inside `page.evaluate(() => harness.mount(...))` through
 * the public API only. Every helper that reads chart geometry lives here, in
 * one place, so the API renames of M7 and M8 (`getLayout`/`getAxis` →
 * `scale()`) touch this file and not every spec.
 */
import { createChart, createChartGroup, histogram } from '../../src/index';
import type { ChartHandle, ChartOptions } from '../../src/index';

type AnyChart = ChartHandle<any>;

export interface MountSpec {
  /** Host element id (default `chart-<n>`). */
  id?: string;
  width?: number;
  height?: number;
  /** Extra inline CSS for the host. */
  style?: string;
  /** Where to append the host (default `document.body`, or `#<parentId>`). */
  parentId?: string;
}

const charts = new Map<string, AnyChart>();

function mount<Row = Record<string, any>>(
  options: ChartOptions<Row>,
  spec: MountSpec = {},
): ChartHandle<Row> {
  const host = document.createElement('div');
  host.id = spec.id ?? `chart-${charts.size}`;
  host.style.cssText = `width:${spec.width ?? 640}px;height:${spec.height ?? 320}px;${spec.style ?? ''}`;
  const parent = spec.parentId ? document.getElementById(spec.parentId) : document.body;
  if (!parent) throw new Error(`harness.mount(): no parent #${spec.parentId}`);
  parent.append(host);
  const chart = createChart<Row>(host, options);
  charts.set(host.id, chart as AnyChart);
  return chart;
}

function chart(id = 'chart-0'): AnyChart {
  const found = charts.get(id);
  if (!found) throw new Error(`harness.chart(): no chart #${id}`);
  return found;
}

/** The plot rectangle in client (viewport) coordinates. */
function plotRect(id = 'chart-0') {
  const handle = chart(id);
  const host = handle.container.getBoundingClientRect();
  const { plot } = handle.getLayout();
  return {
    left: host.left + plot.left,
    top: host.top + plot.top,
    width: plot.width,
    height: plot.height,
    right: host.left + plot.left + plot.width,
    bottom: host.top + plot.top + plot.height,
  };
}

/** Client coordinates of a data point on linear axes. */
function toClient(id: string, x: number, y: number, axes: { x?: string; y?: string } = {}) {
  const handle = chart(id);
  const rect = plotRect(id);
  const xAxis = handle.getAxis(axes.x ?? 'x');
  const yAxis = handle.getAxis(axes.y ?? 'y');
  if (!xAxis || !yAxis) throw new Error('harness.toClient(): unknown axis');
  return {
    x: rect.left + ((x - xAxis.min) / (xAxis.max - xAxis.min)) * rect.width,
    y: rect.top + (1 - (y - yAxis.min) / (yAxis.max - yAxis.min)) * rect.height,
  };
}

/** Current axis domain, `{ min, max }`. */
function domain(id: string, axis: string) {
  const range = chart(id).getAxis(axis);
  return range ? { min: range.min, max: range.max } : null;
}

/**
 * Every visible tooltip-like element: fixed or absolutely positioned, opaque,
 * with text, outside the chart's own label layer. Robust to the M12a portal.
 */
function tooltips(): string[] {
  // Jump running opacity transitions to their end state.
  for (const animation of document.getAnimations()) animation.finish();
  const out: string[] = [];
  for (const element of document.querySelectorAll<HTMLElement>('body *')) {
    const style = getComputedStyle(element);
    if (style.position !== 'fixed') continue;
    if (Number(style.opacity) < 0.5 || style.visibility === 'hidden' || style.display === 'none')
      continue;
    const text = (element.innerText ?? element.textContent ?? '').trim();
    if (text) out.push(text);
  }
  return out;
}

/** The text of the visible tooltip, or `null` when none is shown. */
function tooltip(): string | null {
  const shown = tooltips();
  return shown.length ? shown.join('\n') : null;
}

const DEBUG = Symbol.for('snaplot.debug');

/** Point-in-time debug counters (plan D31), without the canvas references. */
function counters(id = 'chart-0') {
  const snapshot = (chart(id) as unknown as Record<symbol, any>)[DEBUG];
  if (!snapshot) throw new Error('harness.counters(): no debug symbol');
  return {
    ingestCount: snapshot.ingestCount as number,
    renderCount: { ...snapshot.renderCount } as { grid: number; data: number; overlay: number },
    drawnPoints: snapshot.drawnPoints as number,
    inViewPoints: snapshot.inViewPoints as number,
    materializeCount: snapshot.materializeCount as number,
  };
}

/** The canvases inside a chart host, in paint order. */
function canvases(id = 'chart-0'): HTMLCanvasElement[] {
  return [...chart(id).container.querySelectorAll('canvas')];
}

/**
 * Composite RGBA of every chart canvas at a client point (the canvases are
 * stacked, so the topmost opaque sample wins; alpha is combined over).
 */
function pixel(id: string, clientX: number, clientY: number): [number, number, number, number] {
  let out: [number, number, number, number] = [0, 0, 0, 0];
  for (const canvas of canvases(id)) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    const px = Math.floor(((clientX - rect.left) / rect.width) * canvas.width);
    const py = Math.floor(((clientY - rect.top) / rect.height) * canvas.height);
    if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue;
    const context = canvas.getContext('2d');
    if (!context) continue;
    const [r, g, b, a] = context.getImageData(px, py, 1, 1).data;
    const alpha = a / 255;
    out = [
      Math.round(r * alpha + out[0] * (1 - alpha)),
      Math.round(g * alpha + out[1] * (1 - alpha)),
      Math.round(b * alpha + out[2] * (1 - alpha)),
      Math.round(255 * (alpha + (out[3] / 255) * (1 - alpha))),
    ];
  }
  return out;
}

/** Records events by name; read with `harness.events`. */
const events: Array<{ chart: string; name: string; value: unknown }> = [];
function record(id: string, name: string): void {
  chart(id).on(name as never, (value: unknown) => {
    events.push({ chart: id, name, value: JSON.parse(JSON.stringify(value ?? null)) });
  });
}

function reset(): void {
  for (const handle of charts.values()) handle.destroy();
  charts.clear();
  events.length = 0;
  document.body.replaceChildren();
}

/** Wait two animation frames, so a scheduled paint has landed. */
function frames(count = 2): Promise<void> {
  return new Promise((resolve) => {
    const step = (left: number) =>
      left <= 0 ? resolve() : requestAnimationFrame(() => step(left - 1));
    step(count);
  });
}

export const harness = {
  createChart,
  createChartGroup,
  histogram,
  mount,
  chart,
  plotRect,
  toClient,
  domain,
  tooltip,
  tooltips,
  counters,
  canvases,
  pixel,
  record,
  events,
  reset,
  frames,
};

declare global {
  interface Window {
    harness: typeof harness;
  }
}

window.harness = harness;
document.documentElement.dataset.ready = 'true';
