import type { ChartOptions } from 'snaplot';
import { type LaunchFrame, telemetry } from '../data/launch';

// Height every 12 s of a simulated launch, each point sized by the dynamic pressure on the rocket.
const every12s = telemetry.filter((_, i) => i % 3 === 0);

export default {
  data: every12s,
  x: 't',
  series: [
    {
      type: 'scatter',
      y: 'altitude',
      label: 'Altitude',
      sizeBy: {
        field: 'q',
        range: [2, 8],
        label: 'Dynamic pressure',
        format: (kPa) => `${kPa.toFixed(1)} kPa`,
      },
    },
  ],
  axes: {
    x: { title: 'Seconds after liftoff', extent: 'data' },
    y: { title: 'Altitude (km)' },
  },
  ariaLabel:
    'Altitude every 12 seconds of a simulated launch, each point sized by the dynamic pressure on it',
} satisfies ChartOptions<LaunchFrame>;
