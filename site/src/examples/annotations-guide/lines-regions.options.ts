import type { ChartOptions } from 'snaplot';
import { type DailyCount, dailyCounts } from '../data/aftershocks';

// The two main shocks as vertical lines, and the first week after the M7.1 as a region.
export default {
  data: dailyCounts,
  x: 'day',
  series: [{ y: 'events', label: 'Events per day' }],
  axes: { y: { type: 'log', title: 'Events per day' } },
  referenceLines: [
    { axis: 'x', value: '2019-07-04', label: 'M6.4' },
    { axis: 'x', value: '2019-07-06', label: 'M7.1' },
    { axis: 'y', value: 100, label: '100 a day' },
  ],
  referenceRegions: [
    {
      axis: 'x',
      from: '2019-07-06',
      to: '2019-07-13',
      label: 'First week',
    },
  ],
  timeZone: 'UTC',
  ariaLabel:
    'Earthquakes per day near Ridgecrest in 2019, with the M6.4 and M7.1 marked',
} satisfies ChartOptions<DailyCount>;
