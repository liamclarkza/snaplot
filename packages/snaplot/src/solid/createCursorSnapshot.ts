import { createMemo, type Accessor } from 'solid-js';
import type { ChartHandle } from '../public/types';
import type { CursorSnapshotOptions } from '../engine/spec';
import { createChartState } from './createChartState';
/** The values under the cursor, or at a fallback position, as a signal. */
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
