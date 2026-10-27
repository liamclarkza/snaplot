import type { ChartOptions } from 'snaplot';
import { type YearAnomaly, years } from '../data/global-temperature';

// Drag across the chart to select years; Escape or a click outside the selection clears it.
export default {
  data: years,
  x: 'year',
  series: [
    {
      type: 'bar',
      y: 'anomaly',
      label: 'Against 1991–2020',
      format: { maximumFractionDigits: 2, suffix: ' °C' },
    },
  ],
  axes: {
    x: { format: (year) => String(year) },
    y: { format: { maximumFractionDigits: 1, suffix: ' °C' } },
  },
  interaction: { drag: 'select', zoom: 'none' },
  ariaLabel:
    'Each year’s global mean temperature against 1991–2020, from 1940; drag to select a span of years',
} satisfies ChartOptions<YearAnomaly>;
