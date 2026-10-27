import type { ChartOptions } from 'snaplot';
import { booster, telemetry } from '../data/launch';

// Two datasets on one chart: each series brings its own `data` and names its own fields.
export default {
  series: [
    {
      id: 'rocket',
      data: telemetry,
      x: 'downrange',
      y: 'altitude',
      label: 'Rocket',
    },
    {
      id: 'booster',
      data: booster,
      x: 'downrange',
      y: 'altitude',
      label: 'First stage after separation',
      dash: [5, 4],
    },
  ],
  axes: {
    x: { title: 'Downrange (km)' },
    y: { title: 'Altitude (km)' },
  },
  ariaLabel:
    'A simulated launch: the rocket’s path to orbit and the first stage’s arc back down',
} satisfies ChartOptions;
