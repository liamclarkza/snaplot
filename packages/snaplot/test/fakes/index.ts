/**
 * Shared jsdom fakes for tests outside src/ (plan M1). They drive charts only
 * through the public API plus `debug(chart)`, so tests built on them survive
 * the engine rewrites.
 *
 *   const fakes = installFakes({ devicePixelRatio: 2 });
 *   const chart = fakes.mount({ data, x: 'x', series: [{ y: 'y' }] });
 *   ...
 *   fakes.uninstall(); // destroys mounted charts, restores every global
 */
import { createChart } from '../../src/index';
import type { ChartHandle, ChartOptions } from '../../src/index';
import { type CanvasFake, installCanvas } from './canvas';
import { debug } from './debug';
import { type FramesFake, installFrames } from './frames';
import { installLayout, type LayoutFake } from './layout';
import { installMedia, type MediaFake } from './media';
import {
  type IntersectionObserverFake,
  installIntersectionObserver,
  installResizeObserver,
  type ResizeObserverFake,
} from './observers';
import { installComputedStyle, type StyleFake } from './style';

export { debug, type DebugLabelBox, type DebugSnapshot } from './debug';
export type { CanvasFake, CanvasRecord } from './canvas';
export type { FramesFake } from './frames';
export type { LayoutFake } from './layout';
export type { MediaFake } from './media';
export type { IntersectionObserverFake, ResizeObserverFake } from './observers';
export type { StyleFake } from './style';

export interface FakeOptions {
  devicePixelRatio?: number;
  prefersDark?: boolean;
  reducedMotion?: boolean;
  /** Custom properties every `getComputedStyle` read reports. */
  cssVariables?: Record<string, string>;
}

export interface MountOptions {
  width?: number;
  height?: number;
}

export interface Fakes {
  canvas: CanvasFake;
  layout: LayoutFake;
  resizeObserver: ResizeObserverFake;
  intersectionObserver: IntersectionObserverFake;
  media: MediaFake;
  style: StyleFake;
  frames: FramesFake;
  /** Create a sized host in `document.body` and a chart in it (default 400 × 200). */
  mount<Row = Record<string, any>>(
    options: ChartOptions<Row>,
    size?: MountOptions,
  ): ChartHandle<Row>;
  /** Destroy mounted charts, empty the body and restore every patched global. */
  uninstall(): void;
}

export function installFakes(options: FakeOptions = {}): Fakes {
  const restorers: Array<() => void> = [];
  const charts: Array<{ destroy(): void }> = [];
  const canvas = installCanvas(restorers);
  const layout = installLayout(restorers);
  const resizeObserver = installResizeObserver(restorers, layout);
  const intersectionObserver = installIntersectionObserver(restorers);
  const media = installMedia(restorers, options);
  const style = installComputedStyle(restorers, options.cssVariables);
  const frames = installFrames(restorers);
  return {
    canvas,
    layout,
    resizeObserver,
    intersectionObserver,
    media,
    style,
    frames,
    mount<Row = Record<string, any>>(chartOptions: ChartOptions<Row>, size: MountOptions = {}) {
      const host = document.createElement('div');
      layout.setSize(host, size.width ?? 400, size.height ?? 200);
      document.body.append(host);
      const chart = createChart<Row>(host, chartOptions);
      charts.push(chart);
      return chart;
    },
    uninstall() {
      for (const chart of charts.splice(0)) chart.destroy();
      document.body.replaceChildren();
      for (const restore of restorers.splice(0).reverse()) restore();
    },
  };
}

/** An axis' kind and current range, from `chart.scale(key)`, without its pixel mapping. */
export function axis(
  chart: ChartHandle<any>,
  key: string,
): { type: string; min: number; max: number } | undefined {
  const scale = chart.scale(key);
  return scale ? { type: scale.type, min: scale.min, max: scale.max } : undefined;
}

/** Client coordinates of a data point (boxes sit at the origin). */
export function clientPoint(
  chart: ChartHandle<never> | ChartHandle<any>,
  x: number,
  y: number,
  axes: { x?: string; y?: string } = {},
): { clientX: number; clientY: number } {
  const xScale = chart.scale(axes.x ?? 'x');
  const yScale = chart.scale(axes.y ?? 'y');
  if (!xScale || !yScale) throw new Error('clientPoint(): unknown axis');
  return { clientX: xScale.toPixel(x), clientY: yScale.toPixel(y) };
}

/** The element that receives pointer input (falls back to the chart root). */
export function pointerTarget(chart: ChartHandle<any>): Element {
  // The engine's root, past the built-in legend that may sit before it.
  const root = chart.container.querySelector('[role="application"]') ?? chart.container;
  const candidates = [...root.querySelectorAll('div')].filter(
    (element) => element.style.pointerEvents === 'auto',
  );
  return candidates.at(-1) ?? root;
}

/**
 * A gesture at the current view: a small Ctrl+wheel zoom at the plot centre. It marks the
 * viewport as moving, so the next paint is the reduced-fidelity gesture pass. Tests that measure
 * the gesture pass set the range with the `viewport` option and then call this, so they measure
 * a real gesture whatever a programmatic viewport draws. Run `fakes.frames.flush()` after it.
 */
export function wheelGesture(chart: ChartHandle<any>, deltaY = -1): void {
  const { plot } = debug(chart);
  pointerTarget(chart).dispatchEvent(
    new WheelEvent('wheel', {
      clientX: plot.left + plot.width / 2,
      clientY: plot.top + plot.height / 2,
      deltaY,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }),
  );
}

/** Move a mouse over a data point. Run `fakes.frames.flush()` to paint the result. */
export function hover(
  chart: ChartHandle<any>,
  x: number,
  y: number,
  axes?: { x?: string; y?: string },
): void {
  const point = clientPoint(chart, x, y, axes);
  pointerTarget(chart).dispatchEvent(
    new PointerEvent('pointermove', {
      ...point,
      bubbles: true,
      pointerId: 1,
      pointerType: 'mouse',
    }),
  );
}

/** Text of every visible fixed-position tooltip in the document. */
export function tooltipText(): string {
  return [...document.body.querySelectorAll<HTMLElement>('div')]
    .filter((element) => element.style.position === 'fixed' && element.style.opacity !== '0')
    .map((element) => element.textContent ?? '')
    .join('\n');
}
