/**
 * Helpers for the 1.0 contract tests (plan §4.4). M8's first commit wrote these tests against
 * local copies of the final types; now that `ChartHandle` is the final handle, the names below
 * are aliases of the exported types.
 */
import type { ChartHandle, ChartOptions, ChartPlugin } from '../../src/index';
import type { Fakes } from '../fakes';

/**
 * The exported `ChartHandle`, with `update` and `setOptions` typed loosely so that a test can
 * pass an option the types reject (a wrong value, or a field the rows lack).
 */
export type FinalHandle<Row = Record<string, any>> = Omit<
  ChartHandle<Row>,
  'update' | 'setOptions'
> & {
  update(patch: Record<string, unknown>): void;
  setOptions(options: Record<string, unknown>): void;
};
/** The D21 plugin contract (the exported `ChartPlugin`). */
export type FinalPlugin<Row = Record<string, any>> = ChartPlugin<Row>;

/** The members `ChartHandle` has in 1.0, in plan §4.4's order. */
export const HANDLE_MEMBERS = [
  'container',
  'update',
  'setOptions',
  'appendData',
  'getState',
  'subscribe',
  'on',
  'getCursor',
  'resetViewport',
  'resumeFollow',
  'setCursor',
  'scale',
  'redraw',
  'destroy',
] as const;

/** Mount through the fakes, with options typed loosely so a test can pass a wrong one. */
export function mount<Row = Record<string, any>>(
  fakes: Fakes,
  options: Record<string, unknown>,
  size?: { width?: number; height?: number },
): FinalHandle<Row> {
  return fakes.mount<Row>(
    options as unknown as ChartOptions<Row>,
    size,
  ) as unknown as FinalHandle<Row>;
}

/** Client coordinates of a data point, through `scale()` (boxes sit at the origin). */
export function at(
  chart: FinalHandle<any>,
  x: number,
  y: number,
): { clientX: number; clientY: number } {
  const xs = chart.scale('x');
  const ys = chart.scale('y');
  if (!xs || !ys) throw new Error('at(): the chart has no x or y axis');
  return { clientX: xs.toPixel(x), clientY: ys.toPixel(y) };
}

/** The element that takes pointer input: the transparent layer inside the chart's root. */
export function input(chart: FinalHandle<any>): Element {
  const root = chart.container.querySelector('[role="application"]') ?? chart.container;
  const candidates = [...root.querySelectorAll('div')].filter(
    (element) => element.style.pointerEvents === 'auto',
  );
  return candidates.at(-1) ?? root;
}

/** A Ctrl+wheel zoom at a data point (the browser's pinch-zoom wheel). */
export function wheelZoom(chart: FinalHandle<any>, x: number, y: number, deltaY = -120): void {
  input(chart).dispatchEvent(
    new WheelEvent('wheel', {
      ...at(chart, x, y),
      deltaY,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }),
  );
}

/** A double-click reset at a data point. */
export function doubleClick(chart: FinalHandle<any>, x: number, y: number): void {
  input(chart).dispatchEvent(new MouseEvent('dblclick', { ...at(chart, x, y), bubbles: true }));
}

/** A mouse move over a data point. */
export function hoverAt(chart: FinalHandle<any>, x: number, y: number): void {
  input(chart).dispatchEvent(
    new PointerEvent('pointermove', {
      ...at(chart, x, y),
      bubbles: true,
      pointerId: 1,
      pointerType: 'mouse',
    }),
  );
}

/** The `[min, max]` of a scale, or undefined. */
export function range(chart: FinalHandle<any>, key: string): [number, number] | undefined {
  const scale = chart.scale(key);
  return scale ? [scale.min, scale.max] : undefined;
}
