import type { ChartOptions } from 'snaplot';
import { type LaunchFrame, telemetry } from '../data/launch';

// Altitude and speed of a simulated launch, each on its own Y axis.
export default {
  data: telemetry,
  x: 't',
  series: [
    {
      y: 'altitude',
      label: 'Altitude',
      format: { maximumFractionDigits: 1, suffix: ' km' },
    },
    {
      y: 'speed',
      label: 'Speed',
      yAxis: 'speed',
      format: { maximumFractionDigits: 0, suffix: ' km/h' },
    },
  ],
  axes: {
    x: { title: 'Seconds after liftoff', nice: false },
    y: { min: 0, format: { suffix: ' km' } },
    speed: { min: 0, position: 'right', title: 'km/h' },
  },
  ariaLabel:
    'Altitude and speed of a simulated launch, on two Y axes',
} satisfies ChartOptions<LaunchFrame>;
