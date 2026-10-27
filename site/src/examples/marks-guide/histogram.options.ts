import { type ChartOptions, histogram } from 'snaplot';
import { anomalies2024 } from '../data/global-temperature';

// How far each day of 2024 was from its 1991–2020 mean: histogram() bins them on nice edges.
export default {
  series: [
    {
      type: 'histogram',
      id: 'anomalies',
      label: 'Days',
      data: histogram(anomalies2024),
    },
  ],
  axes: {
    x: { title: 'Against 1991–2020 (°C)' },
    y: { title: 'Days' },
  },
  ariaLabel:
    'Histogram of how far each day of 2024 was from its 1991–2020 mean, global mean temperature',
} satisfies ChartOptions;
