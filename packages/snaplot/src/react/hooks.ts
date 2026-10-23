import { useCallback, useEffect, useMemo, useSyncExternalStore, useRef } from 'react';
import { createChartGroup } from '../api/createChart';
import type { ChartHandle, ChartGroupOptions } from '../public/types';
import type { CursorSnapshotOptions } from '../types';
const emptySubscribe = () => () => {};
const emptySnapshot = () => undefined;
/** The chart's state; re-renders on every state change. */
export function useChartState<Row>(chart: ChartHandle<Row> | null | undefined) {
  const subscribe = useCallback(
    (listener: () => void) => (chart ? chart.subscribe(listener) : emptySubscribe()),
    [chart],
  );
  const snapshot = useCallback(() => chart?.getState(), [chart]);
  return useSyncExternalStore(subscribe, snapshot, emptySnapshot);
}
/** The values under the cursor, or at a fallback position. */
export function useCursorSnapshot<Row>(
  chart: ChartHandle<Row> | null | undefined,
  options?: CursorSnapshotOptions,
) {
  const state = useChartState(chart);
  const fallback = options?.fallback;
  return useMemo(() => state && chart?.getCursorSnapshot({ fallback }), [chart, state, fallback]);
}
/** The highlighted series id and a setter. */
export function useHighlight<Row>(chart: ChartHandle<Row> | null | undefined) {
  const state = useChartState(chart);
  const set = useCallback((id: string | null) => chart?.setHighlight(id), [chart]);
  return [state?.highlightedSeries ?? null, set] as const;
}
/** Options are fixed for this group's lifetime. Create a new owner to change them. */
export function useChartGroup(options?: ChartGroupOptions) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: group configuration is fixed for the owner's lifetime
  const group = useMemo(() => createChartGroup(options), []);
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    return () => {
      queueMicrotask(() => {
        if (generation.current === current) group.destroy();
      });
    };
  }, [group]);
  return group;
}
