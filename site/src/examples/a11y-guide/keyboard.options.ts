import type { ChartOptions } from 'snaplot';
import { type SummerDay, summer2025 } from '../data/central-park';

// Tab to the chart, then use the arrow keys: each step moves the cursor one day and the live
// region reads the day's values.
export default {
  data: summer2025,
  x: 'date',
  series: [
    { y: 'high', label: 'High' },
    { y: 'low', label: 'Low' },
  ],
  axes: { y: { format: { suffix: ' °F' } } },
  ariaLabel: 'Daily high and low in Central Park, summer 2025',
} satisfies ChartOptions<SummerDay>;
