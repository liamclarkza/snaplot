import type { ChartOptions } from 'snaplot';
import {
  type GlobalDay,
  summer2024,
} from '../data/global-temperature';

// Each date's 1991–2020 range as a band around its mean, with 2024 over it.
export default {
  data: summer2024,
  x: 'date',
  series: [
    {
      type: 'band',
      y: 'normal',
      id: 'range',
      lower: 'low',
      upper: 'high',
      label: '1991–2020 range',
      color: '#8a8e9c',
    },
    { y: 'temp', label: '2024' },
  ],
  axes: { y: { format: { suffix: ' °C' } } },
  ariaLabel:
    'Daily global mean temperature in summer 2024 against the range of the same dates in 1991–2020',
} satisfies ChartOptions<GlobalDay>;
