import type { ChartOptions } from 'snaplot';
import {
  type GlobalDay,
  summer2024,
} from '../data/global-temperature';

// Summer 2024's global mean against the 1991–2020 mean for each date, dashed.
export default {
  data: summer2024,
  x: 'date',
  series: [
    { y: 'temp', label: '2024' },
    { y: 'normal', label: '1991–2020 mean', dash: [6, 3] },
  ],
  axes: { y: { format: { suffix: ' °C' } } },
  ariaLabel:
    'Daily global mean temperature in summer 2024 against the 1991–2020 mean of each date',
} satisfies ChartOptions<GlobalDay>;
