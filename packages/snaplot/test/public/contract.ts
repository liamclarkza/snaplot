/**
 * The 1.0 handle of plan §4.4, for the contract tests that M8's first commit writes before the
 * later commits land it on `ChartHandle`. Once they have, these names are the exported types.
 */
import type {
  ChartHandle,
  ChartOptions,
  ChartPatch,
  ChartPoint,
  CursorSnapshot,
  SelectionChange,
  SeriesType,
  Viewport,
} from '../../src/index';
import type { Fakes } from '../fakes';

/** One series as `getState().series` reports it. */
export interface FinalSeries {
  id: string;
  label: string;
  type: SeriesType;
  color: string;
  fill: string | null;
  visible: boolean;
  dash: readonly number[];
  opacity: number;
}

/** `getState()`: the cold state, without the cursor. */
export interface FinalState {
  readonly revision: number;
  readonly viewport: Viewport;
  readonly selection: {
    readonly x: readonly [number, number];
    readonly y?: readonly [number, number];
  } | null;
  readonly hiddenSeries: readonly string[];
  readonly highlight: string | null;
  readonly following: boolean;
  readonly series: readonly FinalSeries[];
}

/** The seven events. */
export interface FinalEvents<Row> {
  'cursor:change': CursorSnapshot<Row>;
  'viewport:change': Viewport;
  'selection:change': SelectionChange<Row> | null;
  'hiddenSeries:change': readonly string[];
  'highlight:change': string | null;
  'following:change': boolean;
  'point:click': ChartPoint<Row>;
}

/** `chart.scale(key)`. */
export interface FinalScale {
  readonly type: 'linear' | 'log' | 'time' | 'category';
  readonly horizontal: boolean;
  readonly min: number;
  readonly max: number;
  readonly categories?: readonly string[];
  toPixel(value: number | Date | string): number;
  fromPixel(pixel: number): number;
}

/** The plot rectangle a plugin draw hook receives. */
export interface FinalPlot {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The D21 plugin contract. */
export interface FinalPlugin<Row = Record<string, any>> {
  id: string;
  install?(chart: FinalHandle<Row>): void | (() => void);
  drawBelow?(context: CanvasRenderingContext2D, chart: FinalHandle<Row>, plot: FinalPlot): void;
  drawAbove?(context: CanvasRenderingContext2D, chart: FinalHandle<Row>, plot: FinalPlot): void;
  drawOverlay?(context: CanvasRenderingContext2D, chart: FinalHandle<Row>, plot: FinalPlot): void;
}

/** The fourteen members. */
export interface FinalHandle<Row = Record<string, any>> {
  readonly container: HTMLElement;
  update(patch: ChartPatch<Row> | Record<string, unknown>): void;
  setOptions(options: ChartOptions<Row> | Record<string, unknown>): void;
  appendData(data: unknown, options?: { seriesId?: string; updateLast?: boolean }): void;
  getState(): FinalState;
  subscribe(listener: () => void): () => void;
  on<K extends keyof FinalEvents<Row>>(
    event: K,
    listener: (value: FinalEvents<Row>[K]) => void,
  ): () => void;
  getCursor(options?: { fallback?: 'hide' | 'latest' | 'first' }): CursorSnapshot<Row>;
  resetViewport(): void;
  resumeFollow(): void;
  setCursor(x: number | Date | string | null): void;
  scale(key: string): FinalScale | undefined;
  redraw(layer?: 'overlay' | 'data' | 'all'): void;
  destroy(): void;
}

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

/** The handle as the 1.0 contract types it. */
export function final<Row>(chart: ChartHandle<Row> | FinalHandle<Row>): FinalHandle<Row> {
  return chart as unknown as FinalHandle<Row>;
}

/** Mount through the fakes with options typed loosely (final names the old types lack). */
export function mount<Row = Record<string, any>>(
  fakes: Fakes,
  options: Record<string, unknown>,
  size?: { width?: number; height?: number },
): FinalHandle<Row> {
  return final(fakes.mount<Row>(options as unknown as ChartOptions<Row>, size));
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
