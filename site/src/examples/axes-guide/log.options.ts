import type { ChartOptions } from 'snaplot';
import { type DailyCount, dailyCounts } from '../data/aftershocks';

// Earthquakes per day around Ridgecrest, 2019: a log axis keeps the quiet weeks readable next to
// the day of the M7.1.
export default {
  data: dailyCounts,
  x: 'day',
  series: [{ type: 'bar', y: 'events', label: 'Events per day' }],
  axes: { y: { type: 'log', title: 'Events per day' } },
  timeZone: 'UTC',
  ariaLabel:
    'Earthquakes per day near Ridgecrest, July to September 2019, on a log axis',
} satisfies ChartOptions<DailyCount>;
