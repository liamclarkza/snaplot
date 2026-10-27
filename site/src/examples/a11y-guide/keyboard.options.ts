import type { ChartOptions } from 'snaplot';
import {
  type GlobalDay,
  summer2024,
} from '../data/global-temperature';

// Tab to the chart, then use the arrow keys: each step moves the cursor one day and the live
// region reads the day's values.
export default {
  data: summer2024,
  x: 'date',
  series: [
    { y: 'temp', label: '2024' },
    { y: 'normal', label: '1991–2020 mean' },
  ],
  axes: { y: { format: { suffix: ' °C' } } },
  ariaLabel:
    'Daily global mean temperature, summer 2024, against the 1991–2020 mean',
} satisfies ChartOptions<GlobalDay>;
