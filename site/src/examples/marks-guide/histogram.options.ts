import { type ChartOptions, histogram } from 'snaplot';
import { largeQuakes } from '../data/aftershocks';

// How the M4.5+ magnitudes are distributed: histogram() bins them on nice edges.
export default {
  series: [
    {
      type: 'histogram',
      id: 'magnitudes',
      label: 'Quakes',
      data: histogram(largeQuakes.map((quake) => quake.mag)),
    },
  ],
  axes: { x: { title: 'Magnitude' }, y: { title: 'Quakes' } },
  ariaLabel:
    'Histogram of the magnitudes of M4.5 or larger quakes near Ridgecrest in 2019',
} satisfies ChartOptions;
