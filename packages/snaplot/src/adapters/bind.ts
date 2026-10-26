/**
 * The framework-neutral half of the React and Solid adapters (plan §7.1). It knows which props are
 * chart options and which belong to the host element, what the host renders besides them (its
 * role, its accessible name and its height), the chart's lifecycle, and a registry that tells a
 * hook when a ref object gets its chart. It uses the public API only, as any adapter can.
 */
import { type ChartHandle, type ChartOptions, createChart } from 'snaplot';

/**
 * Every top-level option. A prop with one of these names is a chart option; any other prop goes
 * to the host element. `bind.typecheck.ts` fails to compile when `ChartOptions` gains a key this
 * list lacks.
 */
export const OPTION_KEYS = [
  'data',
  'x',
  'rowId',
  'series',
  'axes',
  'streaming',
  'referenceLines',
  'referenceRegions',
  'plugins',
  'group',
  'ariaLabel',
  'height',
  'interaction',
  'cursor',
  'highlight',
  'tooltip',
  'theme',
  'legend',
  'locale',
  'timeZone',
  'viewport',
  'selection',
  'hiddenSeries',
  'onPointClick',
  'onSelectionChange',
  'onViewportChange',
  'onHiddenSeriesChange',
  'onHighlightChange',
  'onFollowingChange',
  'onCursorChange',
] as const satisfies readonly (keyof ChartOptions)[];

const OPTIONS: ReadonlySet<string> = new Set(OPTION_KEYS);
/** Props that are neither options nor host attributes: the component handles them itself. */
const OWN = new Set(['ref', 'children', 'style']);

/** Split component props into the chart's options and the host element's attributes. */
export function splitProps<Row>(props: object): {
  options: ChartOptions<Row>;
  attributes: Record<string, unknown>;
} {
  const options: Record<string, unknown> = {};
  const attributes: Record<string, unknown> = {};
  for (const key of Object.keys(props)) {
    const value = (props as Record<string, unknown>)[key];
    if (OPTIONS.has(key)) options[key] = value;
    else if (!OWN.has(key)) attributes[key] = value;
  }
  return { options: options as unknown as ChartOptions<Row>, attributes };
}

const MARKS: Record<string, string> = {
  line: 'Line chart',
  area: 'Area chart',
  band: 'Band chart',
  bar: 'Bar chart',
  scatter: 'Scatter chart',
  histogram: 'Histogram',
};

/**
 * The chart's accessible name (plan D20): `ariaLabel`, else a summary of the series, such as
 * "Line chart, 2 series: CPU, Memory".
 */
export function accessibleName(options: Pick<ChartOptions<any>, 'ariaLabel' | 'series'>): string {
  if (options.ariaLabel) return options.ariaLabel;
  const series = (options.series ?? []) as unknown as readonly Record<string, unknown>[];
  const marks = new Set(series.map((item) => (item.type as string | undefined) ?? 'line'));
  const kind = marks.size === 1 ? (MARKS[[...marks][0]] ?? 'Chart') : 'Chart';
  const names = series.map((item) =>
    String(item.label ?? (typeof item.y === 'string' ? item.y : (item.id ?? ''))),
  );
  return `${kind}, ${series.length} series${names.length ? `: ${names.join(', ')}` : ''}`;
}

/**
 * What a component renders on its host besides the caller's attributes (plan D20): the figure
 * role and its name, so the server markup is already a named figure. Host attributes the caller
 * passes (`role`, `aria-label`) take precedence.
 */
export function hostDefaults(options: Pick<ChartOptions<any>, 'ariaLabel' | 'series'>): {
  role: string;
  'aria-label': string;
} {
  return { role: 'figure', 'aria-label': accessibleName(options) };
}

/** The CSS height of an explicit `height` option (plan D26), or undefined without one. */
export function cssHeight(height: ChartOptions['height']): string | undefined {
  return typeof height === 'number' ? `${height}px` : height;
}

/** A mounted chart: what the components drive. */
export interface Binding<Row> {
  /** The chart's public handle. */
  readonly chart: ChartHandle<Row>;
  /** Apply the options of a render. The core diffs them (plan D16); the binding never does. */
  update(options: ChartOptions<Row>): void;
  /** Destroy the chart. Its group stays: a component never owns one (frameworks-07). */
  destroy(): void;
}

/** Create a chart in `host` with `options`. */
export function bindChart<Row>(host: HTMLElement, options: ChartOptions<Row>): Binding<Row> {
  const chart = createChart<Row>(host, options);
  let applied = options;
  return {
    chart,
    update(next) {
      // The options object the chart was created with needs no second pass.
      if (next !== applied) chart.setOptions((applied = next));
    },
    destroy: () => chart.destroy(),
  };
}

/** Call `listener` on what changes a cursor readout: cursor moves and data, option and state commits. */
export function watchCursor(chart: ChartHandle<any>, listener: () => void): () => void {
  const offs = [chart.on('cursor:change', listener), chart.subscribe(listener)];
  return () => {
    for (const off of offs) off();
  };
}

// ─── Refs ────────────────────────────────────────────────────────────

/** A ref object, such as React's `useRef`: whatever holds the chart in `current`. */
export interface RefObjectLike<T> {
  readonly current: T | null;
}

/** A chart, a ref object holding one, or nothing yet. */
export type ChartSource<Row> =
  | ChartHandle<Row>
  | RefObjectLike<ChartHandle<Row>>
  | null
  | undefined;

/** A ref a component is given: a ref object or a callback. */
export type RefTarget<T> =
  | RefObjectLike<T>
  | ((value: T | null) => void | (() => void))
  | null
  | undefined;

const watchers = new WeakMap<object, Set<() => void>>();

const isRefObject = <T>(value: unknown): value is RefObjectLike<T> =>
  typeof value === 'object' && value !== null && 'current' in value;

/** The chart `source` holds now. */
export function resolveChart<Row>(source: ChartSource<Row>): ChartHandle<Row> | null {
  return isRefObject<ChartHandle<Row>>(source) ? source.current : (source ?? null);
}

/** Call `listener` whenever a component sets or clears the ref object `source`. */
export function watchRef(source: unknown, listener: () => void): () => void {
  if (!isRefObject(source)) return () => {};
  let set = watchers.get(source);
  if (!set) watchers.set(source, (set = new Set()));
  set.add(listener);
  return () => set.delete(listener);
}

function notify(ref: object): void {
  for (const listener of [...(watchers.get(ref) ?? [])]) listener();
}

/**
 * Give a React `ref` the chart: a callback is called with it, a ref object holds it and its
 * watchers are told. The returned function takes it back: a callback's cleanup runs (React 19),
 * or it is called with `null`; a ref object is emptied, if it still holds this chart.
 */
export function attachRef<T>(ref: RefTarget<T>, value: T): () => void {
  if (typeof ref === 'function') {
    const cleanup = ref(value);
    return typeof cleanup === 'function' ? cleanup : () => void ref(null);
  }
  if (!ref) return () => {};
  const holder = ref as { current: T | null };
  holder.current = value;
  notify(ref);
  return () => {
    if (holder.current !== value) return;
    holder.current = null;
    notify(ref);
  };
}
