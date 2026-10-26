import { type Accessor, createEffect, createSignal, onCleanup } from 'solid-js';
import type {
  ChartHandle,
  ChartState,
  CursorSnapshot,
  CursorSnapshotOptions,
} from '../public/types';

/** A chart handle, an accessor of one, or nothing yet. */
export type MaybeChart<Row> =
  | ChartHandle<Row>
  | Accessor<ChartHandle<Row> | null | undefined>
  | null
  | undefined;

/** The handle `chart` holds now (read inside a tracking scope, it tracks the accessor). */
export function resolveChart<Row>(chart: MaybeChart<Row>): ChartHandle<Row> | undefined {
  return (typeof chart === 'function' ? chart() : chart) ?? undefined;
}

/**
 * A slice of the chart's state as a signal, updated only when the slice changes (by `isEqual`).
 *
 * @example
 * ```tsx
 * const following = createChartState(chart, (state) => state.following);
 * ```
 */
export function createChartState<T = ChartState>(
  chart: MaybeChart<any>,
  selector: (state: ChartState) => T = (state) => state as unknown as T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): Accessor<T | undefined> {
  const [value, setValue] = createSignal<T | undefined>(undefined, {
    equals: (a, b) => a !== undefined && b !== undefined && isEqual(a, b),
  });
  createEffect(() => {
    const current = resolveChart(chart);
    if (!current) {
      setValue(undefined);
      return;
    }
    const read = () => setValue(() => selector(current.getState()));
    read();
    onCleanup(current.subscribe(read));
  });
  return value;
}

/**
 * The values under the cursor, or at a fallback position, as a signal: updated on cursor moves
 * and data commits only.
 */
export function createCursor<Row>(
  chart: MaybeChart<Row>,
  options?: CursorSnapshotOptions,
): Accessor<CursorSnapshot<Row> | undefined> {
  const [cursor, setCursor] = createSignal<CursorSnapshot<Row> | undefined>(undefined, {
    equals: false,
  });
  createEffect(() => {
    const current = resolveChart(chart);
    if (!current) {
      setCursor(undefined);
      return;
    }
    const read = () => setCursor(current.getCursor(options));
    read();
    const offCursor = current.on('cursor:change', read);
    const offState = current.subscribe(read);
    onCleanup(() => {
      offCursor();
      offState();
    });
  });
  return cursor;
}
