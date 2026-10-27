import type { ChartOptions } from 'snaplot';
import { type DailyCount, dailyCounts } from '../data/aftershocks';

// The M7.1 main shock as a vertical line, the three weeks after it as a region and 100 a day as a
// horizontal line. A maximum of 10,000 leaves headroom for the labels above the peak.
export default {
  data: dailyCounts,
  x: 'day',
  series: [{ y: 'events', label: 'Events per day' }],
  axes: { y: { type: 'log', title: 'Events per day', max: 10_000 } },
  referenceLines: [
    { axis: 'x', value: '2019-07-06', label: 'M7.1' },
    { axis: 'y', value: 100, label: '100 a day' },
  ],
  referenceRegions: [
    {
      axis: 'x',
      from: '2019-07-06',
      to: '2019-07-27',
      label: 'First three weeks',
    },
  ],
  timeZone: 'UTC',
  ariaLabel:
    'Earthquakes per day near Ridgecrest in 2019, with the M7.1 and the three weeks after it marked',
} satisfies ChartOptions<DailyCount>;
