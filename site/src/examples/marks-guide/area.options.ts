import type { ChartOptions } from 'snaplot';
import { type HourReading, juneWeek } from '../data/household';

// One June week of hourly solar output: an area fills to zero, a dashed line reads beside it.
export default {
  data: juneWeek,
  x: 'time',
  series: [
    {
      type: 'area',
      y: 'pv',
      label: 'Solar',
      interpolation: 'monotone',
    },
    { y: 'import', label: 'Grid import', dash: [4, 3] },
  ],
  axes: { y: { title: 'kWh per hour' } },
  timeZone: 'UTC',
  ariaLabel:
    'Hourly solar output and grid import of a household, one week in June 2017',
} satisfies ChartOptions<HourReading>;
