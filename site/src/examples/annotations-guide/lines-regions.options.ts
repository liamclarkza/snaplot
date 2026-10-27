import type { ChartOptions } from 'snaplot';
import { events, type LaunchFrame, telemetry } from '../data/launch';

// Max-Q and MECO as vertical lines, the first stage's burn as a region and the Kármán line at
// 100 km as a horizontal line. Lines on the value axis are in its automatic range.
const at = (id: string) =>
  events.find((event) => event.id === id)?.t ?? 0;

export default {
  data: telemetry,
  x: 't',
  series: [{ y: 'altitude', label: 'Altitude' }],
  axes: {
    x: { title: 'Seconds after liftoff' },
    y: { title: 'Altitude (km)' },
  },
  referenceLines: [
    { axis: 'x', value: at('maxq'), label: 'Max-Q' },
    { axis: 'x', value: at('meco'), label: 'MECO' },
    { axis: 'y', value: 100, label: 'Kármán line' },
  ],
  referenceRegions: [
    { axis: 'x', from: 0, to: at('meco'), label: 'First stage' },
  ],
  ariaLabel:
    'Altitude of a simulated launch, with Max-Q, MECO, the first stage’s burn and the Kármán line marked',
} satisfies ChartOptions<LaunchFrame>;
