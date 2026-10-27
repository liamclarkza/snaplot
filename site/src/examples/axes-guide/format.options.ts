import type { ChartOptions } from 'snaplot';
import {
  type GlobalDay,
  summer2024,
} from '../data/global-temperature';

// The global mean temperature in summer 2024: a unit on the value axis, a fixed range, and
// month-and-day dates.
export default {
  data: summer2024,
  x: 'date',
  series: [{ y: 'temp', label: '2024' }],
  axes: {
    x: { format: { month: 'short', day: 'numeric' } },
    y: {
      title: 'Global mean',
      min: 16,
      max: 17.5,
      format: { minimumFractionDigits: 1, suffix: ' °C' },
    },
  },
  ariaLabel: 'Daily global mean temperature, June to August 2024',
} satisfies ChartOptions<GlobalDay>;
