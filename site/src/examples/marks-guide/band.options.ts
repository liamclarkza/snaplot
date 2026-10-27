import type { ChartOptions } from 'snaplot';
import { type SummerDay, summer2025 } from '../data/central-park';

// The 1991–2020 normal range of daily highs as a band, with 2025's highs over it.
export default {
  data: summer2025,
  x: 'date',
  series: [
    {
      type: 'band',
      y: (day) => (day.normalLow + day.normalHigh) / 2,
      id: 'normal',
      lower: 'normalLow',
      upper: 'normalHigh',
      label: 'Normal range',
      color: '#8a8e9c',
    },
    { y: 'high', label: 'High, 2025' },
  ],
  axes: { y: { format: { suffix: ' °F' } } },
  ariaLabel:
    'Daily highs in Central Park in summer 2025 against the 1991–2020 normal range',
} satisfies ChartOptions<SummerDay>;
