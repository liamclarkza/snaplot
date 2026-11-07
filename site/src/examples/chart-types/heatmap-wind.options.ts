import type { ChartOptions } from 'snaplot';
import { type WindDay, windDays } from '../data/simulated';

// Two weeks of hourly wind direction at a simulated coastal station, one column of 24 hours per
// day. Direction is an angle, so a cyclic map: 355° and 5° take neighbouring colours. The vane
// froze for six hours on 11 March; those null hours draw in the empty colour.
const compass = (degrees: number) =>
  ['N', 'E', 'S', 'W', 'N'][Math.round(degrees / 90)];

export default {
  data: windDays,
  x: 'day',
  series: [
    {
      type: 'heatmap',
      id: 'direction',
      label: 'Wind from',
      values: 'direction',
      bins: { start: 0, step: 1, count: 24 },
      colors: 'cyclic',
      domain: [0, 360],
      format: { maximumFractionDigits: 0, suffix: '°' },
      colorScale: {
        title: 'Wind from',
        ticks: [0, 90, 180, 270, 360],
        format: compass,
      },
    },
  ],
  axes: {
    x: { format: { month: 'short', day: 'numeric' } },
    y: {
      title: 'Hour',
      ticks: [0, 6, 12, 18],
      format: (h) => `${h}:00`,
    },
  },
  timeZone: 'UTC',
  ariaLabel:
    'Hourly wind direction over two weeks at a simulated coastal station',
} satisfies ChartOptions<WindDay>;
