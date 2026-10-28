import type { ChartOptions } from 'snaplot';
import { type HourReading, juneWeek } from '../data/household';

// A meter reading covers the hour after its time, so the line steps after each point.
const day = juneWeek.slice(0, 24);

export default {
  data: day,
  x: 'time',
  series: [
    {
      y: 'import',
      label: 'Grid import',
      interpolation: 'step-after',
    },
    { y: 'pv', label: 'Solar', interpolation: 'step-after' },
  ],
  axes: { y: { title: 'kWh per hour' } },
  timeZone: 'UTC',
  ariaLabel:
    'Hourly grid import and solar output of a household on 12 June 2017, as steps',
} satisfies ChartOptions<HourReading>;
