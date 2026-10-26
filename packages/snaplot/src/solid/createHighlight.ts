import { createMemo, type Accessor } from 'solid-js';
import type { ChartHandle } from '../public/types';
import { createChartState } from './createChartState';
/** The highlighted series id as a signal, and a setter. */
export function createHighlight<Row>(chart: Accessor<ChartHandle<Row> | undefined | null>) {
  const state = createChartState(chart);
  return [
    createMemo(() => state()?.highlight ?? null),
    (id: string | null) => chart()?.setHighlight(id),
  ] as const;
}
