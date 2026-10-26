import type { RefObject } from 'react';
import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import { useEffect, useLayoutEffect } from 'react';
import type { ChartHandle, ChartState, CursorOptions, CursorSnapshot } from 'snaplot';
import { resolveChart, watchCursor, watchRef } from '../adapters/bind';

/** A layout effect in the browser, a plain effect on the server (React 18 warns otherwise). */
export const useIsoLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;

const noop = () => {};
const none = () => undefined;
const nothing = () => null;

/**
 * The chart a hook is given (a handle, or the ref object a `<Chart>` fills), re-rendering when
 * that ref gets or loses its chart.
 */
export function useChart<Row>(
  chart: ChartHandle<Row> | RefObject<ChartHandle<Row> | null> | null | undefined,
): ChartHandle<Row> | null {
  const subscribe = useCallback((notify: () => void) => watchRef(chart, notify), [chart]);
  const read = () => resolveChart(chart);
  return useSyncExternalStore(subscribe, read, nothing);
}

/**
 * A slice of the chart's state, re-rendering only when the slice changes (by `isEqual`).
 *
 * @example
 * ```tsx
 * const following = useChartState(chart, (state) => state.following);
 * ```
 */
export function useChartState<T = ChartState>(
  chart: ChartHandle<any> | RefObject<ChartHandle<any> | null> | null | undefined,
  selector: (state: ChartState) => T = (state) => state as T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T | undefined {
  const handle = useChart(chart);
  // The last state and selector read, and the value kept for them.
  const memo = useRef<{ state?: ChartState; selector?: unknown; value?: T }>({});
  const subscribe = useCallback((on: () => void) => handle?.subscribe(on) ?? noop, [handle]);
  const read = () => {
    if (!handle) return undefined;
    const state = handle.getState();
    const last = memo.current;
    if (state === last.state && selector === last.selector) return last.value;
    const next = selector(state);
    const same = last.state !== undefined && isEqual(last.value as T, next);
    memo.current = { state, selector, value: same ? last.value : next };
    return memo.current.value;
  };
  return useSyncExternalStore(subscribe, read, none);
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
  chart: ChartHandle<Row> | RefObject<ChartHandle<Row> | null> | null | undefined,
  options?: CursorOptions,
): CursorSnapshot<Row> | undefined {
  const handle = useChart(chart);
  const fallback = options?.fallback;
  const store = useMemo(() => {
    let current: CursorSnapshot<Row> | undefined;
    const changed = (notify: () => void) => () => {
      current = undefined;
      notify();
    };
    return {
      subscribe: (notify: () => void) => (handle ? watchCursor(handle, changed(notify)) : noop),
      read: () => (handle ? (current ??= handle.getCursor({ fallback })) : undefined),
    };
  }, [handle, fallback]);
  return useSyncExternalStore(store.subscribe, store.read, none);
}
