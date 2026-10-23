import { onCleanup } from 'solid-js';
import { createChartGroup as createCoreGroup } from '../api/createChart';
import type { ChartGroupOptions } from '../public/types';
/** A chart group owned by the current reactive scope. */
export function createChartGroup(options?: ChartGroupOptions) {
  const group = createCoreGroup(options);
  onCleanup(() => group.destroy());
  return group;
}
