import type { ChartOptions } from 'snaplot';
import { type DailyCount, dailyCounts } from '../data/aftershocks';

// Drag across the chart to select days; Escape or a click outside the selection clears it.
export default {
  data: dailyCounts,
  x: 'day',
  series: [{ type: 'bar', y: 'events', label: 'Events per day' }],
  axes: { y: { type: 'log' } },
  interaction: { drag: 'select', zoom: 'none' },
  timeZone: 'UTC',
  ariaLabel:
    'Earthquakes per day near Ridgecrest in 2019; drag to select a span of days',
} satisfies ChartOptions<DailyCount>;
