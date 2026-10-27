import type { ChartOptions } from 'snaplot';
import { type SummerDay, summer2025 } from '../data/central-park';

// Daily highs in Central Park: a unit on the value axis, a fixed range, and month-and-day dates.
export default {
  data: summer2025,
  x: 'date',
  series: [{ y: 'high', label: 'High' }],
  axes: {
    x: { format: { month: 'short', day: 'numeric' } },
    y: {
      title: 'Daily high',
      min: 50,
      max: 100,
      format: { suffix: ' °F' },
    },
  },
  ariaLabel:
    'Daily high temperature in Central Park, June to August 2025',
} satisfies ChartOptions<SummerDay>;
