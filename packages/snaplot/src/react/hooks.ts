import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import type {
  ChartHandle,
  ChartState,
  CursorSnapshot,
  CursorSnapshotOptions,
} from '../public/types';

const noop = () => {};
const none = () => undefined;
const identity = <T>(value: T) => value;

/**
 * A slice of the chart's state, re-rendering only when the slice changes (by `isEqual`).
 *
 * @example
 * ```tsx
 * const following = useChartState(chart, (state) => state.following);
 * ```
 */
export function useChartState<T = ChartState>(
  chart: ChartHandle<any> | null | undefined,
  selector: (state: ChartState) => T = identity as (state: ChartState) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T | undefined {
  const cache = useRef<{ chart?: ChartHandle<any>; state?: ChartState; value?: T }>({});
  const subscribe = useCallback(
    (notify: () => void) => (chart ? chart.subscribe(notify) : noop),
    [chart],
  );
  const snapshot = useCallback(() => {
    if (!chart) return undefined;
    const state = chart.getState();
    const last = cache.current;
    if (last.chart === chart && last.state === state) return last.value;
    const value = selector(state);
    const same =
      last.chart === chart && last.state !== undefined && isEqual(last.value as T, value);
    cache.current = { chart, state, value: same ? last.value : value };
    return cache.current.value;
  }, [chart, selector, isEqual]);
  return useSyncExternalStore(subscribe, snapshot, none);
}

/**
 * The values under the cursor, or at a fallback position; re-renders on cursor moves and data
 * commits only.
 *
 * @example
 * ```tsx
 * const cursor = useCursor(chart, { fallback: 'latest' });
 * ```
 */
export function useCursor<Row>(
  chart: ChartHandle<Row> | null | undefined,
  options?: CursorSnapshotOptions,
): CursorSnapshot<Row> | undefined {
  const fallback = options?.fallback;
  const store = useMemo(() => {
    let current: CursorSnapshot<Row> | undefined;
    return {
      subscribe(notify: () => void) {
        if (!chart) return noop;
        const changed = () => {
          current = undefined;
          notify();
        };
        const offCursor = chart.on('cursor:change', changed);
        const offState = chart.subscribe(changed);
        return () => {
          offCursor();
          offState();
        };
      },
      snapshot: () => (chart ? (current ??= chart.getCursor({ fallback })) : undefined),
    };
  }, [chart, fallback]);
  return useSyncExternalStore(store.subscribe, store.snapshot, none);
}
