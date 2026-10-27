import type { ChartOptions } from 'snaplot';
import { largeQuakes, type Quake } from '../data/aftershocks';

// Every series is a scatter, so zoom works on both axes and one finger pans on a phone.
export default {
  data: largeQuakes,
  x: 'depth',
  series: [{ type: 'scatter', y: 'mag', label: 'Quakes' }],
  axes: { x: { title: 'Depth (km)' }, y: { title: 'Magnitude' } },
  ariaLabel:
    'Magnitude against depth for M4.5 or larger quakes near Ridgecrest in 2019',
} satisfies ChartOptions<Quake>;
