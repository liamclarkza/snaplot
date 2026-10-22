import { onCleanup } from 'solid-js';
import { createChartGroup as createCoreGroup } from '../api/createChart';
import type { ChartGroupOptions } from '../api/types';
export function createChartGroup(options?: ChartGroupOptions) {
  const group = createCoreGroup(options);
  onCleanup(() => group.destroy());
  return group;
}
