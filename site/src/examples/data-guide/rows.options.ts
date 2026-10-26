import type { ChartOptions } from 'snaplot';
import { type SummerDay, summer2025 } from '../data/central-park';

// One object per day; `x` and each `y` name a field of the rows.
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
