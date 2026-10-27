import type { ChartOptions } from 'snaplot';
import {
  type GlobalDay,
  summer2024,
} from '../data/global-temperature';

// One object per day; `x` and each `y` name a field of the rows.
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
