import type { ChartOptions } from 'snaplot';
import { largeQuakes, type Quake } from '../data/aftershocks';

// `time` holds epoch milliseconds, so the x axis is told it is a time axis. Seconds would need
// multiplying by 1,000 first.
export default {
  data: largeQuakes,
  x: 'time',
  series: [{ type: 'scatter', y: 'mag', label: 'Magnitude' }],
  axes: { x: { type: 'time' } },
  timeZone: 'UTC',
  ariaLabel:
    'Magnitude of each M4.5 or larger quake near Ridgecrest in 2019, by time',
} satisfies ChartOptions<Quake>;
