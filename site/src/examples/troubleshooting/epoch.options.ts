import type { ChartOptions } from 'snaplot';
import { LIFTOFF, telemetry } from '../data/launch';

// `time` holds epoch milliseconds, so the x axis is told it is a time axis. Seconds would need
// multiplying by 1,000 first.
const rows = telemetry.map((frame) => ({
  time: LIFTOFF + frame.t * 1000,
  altitude: frame.altitude,
}));

export default {
  data: rows,
  x: 'time',
  series: [{ y: 'altitude', label: 'Altitude (km)' }],
  axes: { x: { type: 'time' } },
  timeZone: 'UTC',
  ariaLabel: 'Altitude of a simulated launch by clock time, UTC',
} satisfies ChartOptions<(typeof rows)[number]>;
