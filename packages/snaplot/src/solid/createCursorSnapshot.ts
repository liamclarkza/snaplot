import { createMemo, type Accessor } from 'solid-js';
import type { ChartHandle } from '../api/types';
import type { CursorSnapshotOptions } from '../types';
import { createChartState } from './createChartState';
export function createCursorSnapshot<Row>(
  chart: Accessor<ChartHandle<Row> | null | undefined>,
  options?: Accessor<CursorSnapshotOptions>,
) {
  const state = createChartState(chart);
  return createMemo(() => {
    state();
    return chart()?.getCursorSnapshot(options?.());
  });
}
