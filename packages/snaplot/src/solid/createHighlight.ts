import { createMemo, type Accessor } from 'solid-js';
import type { ChartHandle } from '../api/types';
import { createChartState } from './createChartState';
export function createHighlight<Row>(chart: Accessor<ChartHandle<Row> | undefined | null>) {
  const state = createChartState(chart);
  return [
    createMemo(() => state()?.highlightedSeries ?? null),
    (id: string | null) => chart()?.setHighlight(id),
  ] as const;
}
