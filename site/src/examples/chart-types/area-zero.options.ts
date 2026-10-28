import type { ChartOptions } from 'snaplot';
import { type YearAnomaly, years } from '../data/global-temperature';

// Each year's anomaly: an area fills to zero, below it and above it.
export default {
  data: years,
  x: 'year',
  series: [
    {
      type: 'area',
      y: 'anomaly',
      label: 'Anomaly',
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
    'Global mean temperature of each year since 1940 against 1991–2020, as an area',
} satisfies ChartOptions<YearAnomaly>;
