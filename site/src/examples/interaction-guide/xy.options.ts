import type { ChartOptions } from 'snaplot';
import { type LaunchFrame, telemetry } from '../data/launch';

// Every series is a scatter, so zoom works on both axes and one finger pans on a phone.
export default {
  data: telemetry,
  x: 'downrange',
  series: [{ type: 'scatter', y: 'altitude', label: 'Rocket' }],
  axes: {
    x: { title: 'Downrange (km)' },
    y: { title: 'Altitude (km)' },
  },
  ariaLabel:
    'The path of a simulated launch: altitude against distance downrange, every 4 seconds',
} satisfies ChartOptions<LaunchFrame>;
