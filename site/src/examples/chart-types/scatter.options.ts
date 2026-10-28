import type { ChartOptions } from 'snaplot';
import { type LaunchFrame, telemetry } from '../data/launch';

// Every 4 s of a simulated launch: speed against altitude, on a log axis so the first kilometre
// and the last hundred both have room, coloured by the stage that is flying.
const climb = telemetry.filter((frame) => frame.altitude > 0.1);

export default {
  data: climb,
  x: 'altitude',
  series: [
    {
      type: 'scatter',
      y: 'speed',
      label: 'Speed',
      colorBy: { field: 'stage', label: 'Stage' },
      tooltipFields: [
        {
          field: 'accel',
          label: 'Acceleration (g)',
          format: (g) => g.toFixed(2),
        },
      ],
    },
  ],
  axes: {
    x: {
      type: 'log',
      title: 'Altitude (km)',
      format: { maximumFractionDigits: 1 },
    },
    y: { title: 'Speed (km/h)' },
  },
  ariaLabel:
    'Speed against altitude every 4 seconds of a simulated launch, on a log axis, coloured by stage',
} satisfies ChartOptions<LaunchFrame>;
