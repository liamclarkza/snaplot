import { useCallback, useEffect, useMemo, useSyncExternalStore, useRef } from 'react';
import { createChartGroup } from '../api/createChart';
import type { ChartHandle, ChartGroupOptions } from '../api/types';
import type { CursorSnapshotOptions } from '../types';
const emptySubscribe = () => () => {};
const emptySnapshot = () => undefined;
export function useChartState<Row>(chart: ChartHandle<Row> | null | undefined) {
  const subscribe = useCallback(
    (listener: () => void) => (chart ? chart.subscribe(listener) : emptySubscribe()),
    [chart],
  );
  const snapshot = useCallback(() => chart?.getState(), [chart]);
  return useSyncExternalStore(subscribe, snapshot, emptySnapshot);
}
export function useCursorSnapshot<Row>(
  chart: ChartHandle<Row> | null | undefined,
  options?: CursorSnapshotOptions,
) {
  const state = useChartState(chart);
  const fallback = options?.fallback;
  return useMemo(() => state && chart?.getCursorSnapshot({ fallback }), [chart, state, fallback]);
}
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
