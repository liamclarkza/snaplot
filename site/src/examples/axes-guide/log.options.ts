import type { ChartOptions } from 'snaplot';
import { type LaunchFrame, telemetry } from '../data/launch';

// The altitude of a simulated launch: a log axis keeps the first seconds off the pad readable
// next to the climb to 200 km.
export default {
  data: telemetry,
  x: 't',
  series: [{ y: 'altitude', label: 'Altitude' }],
  axes: {
    x: { title: 'Seconds after liftoff' },
    y: { type: 'log', title: 'Altitude (km)' },
  },
  ariaLabel:
    'Altitude of a simulated launch against time, on a log axis',
} satisfies ChartOptions<LaunchFrame>;
