import type { ChartOptions } from 'snaplot';
import { years } from '../data/global-temperature';

// The ten warmest years, warmest first: string x values make a category axis in row order.
const warmest = [...years]
  .sort((a, b) => b.anomaly - a.anomaly)
  .slice(0, 10)
  .map((y) => ({ year: String(y.year), anomaly: y.anomaly }));

export default {
  data: warmest,
  x: 'year',
  series: [
    {
      type: 'bar',
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
    y: {
      min: 0,
      format: { signDisplay: 'exceptZero', suffix: ' °C' },
    },
  },
  ariaLabel:
    'The ten warmest years since 1940 against 1991–2020, warmest first',
} satisfies ChartOptions<{ year: string; anomaly: number }>;
