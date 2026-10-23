import { createEffect, createSignal, onCleanup, type Accessor } from 'solid-js';
import type { ChartHandle, ChartState } from '../public/types';
/** The chart's state as a signal. */
export function createChartState<Row>(
  chart: Accessor<ChartHandle<Row> | undefined | null>,
): Accessor<ChartState<Row> | undefined> {
  const [state, setState] = createSignal<ChartState<Row>>();
  createEffect(() => {
    const current = chart();
    setState(current?.getState());
    if (current) onCleanup(current.subscribe(() => setState(current.getState())));
  });
  return state;
}
