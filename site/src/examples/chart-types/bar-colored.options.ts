import type { ChartOptions } from 'snaplot';
import { type YearAnomaly, years } from '../data/global-temperature';

// A colour per bar from its value: blue below the 1991–2020 mean, red above it.
export default {
  data: years,
  x: 'year',
  series: [
    {
      type: 'bar',
      y: 'anomaly',
      label: 'Anomaly',
      color: (value) => (value < 0 ? '#2166ac' : '#b2182b'),
      format: {
        signDisplay: 'exceptZero',
        maximumFractionDigits: 2,
        suffix: ' °C',
      },
    },
  ],
  axes: {
    x: { format: { useGrouping: false } },
    y: { format: { signDisplay: 'exceptZero', suffix: ' °C' } },
  },
  ariaLabel:
    'Global mean temperature of each year since 1940 against 1991–2020, as bars',
} satisfies ChartOptions<YearAnomaly>;
