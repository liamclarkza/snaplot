import type { ChartOptions } from 'snaplot';
import { largeQuakes, type Quake } from '../data/aftershocks';

// Every M4.5+ quake of the sequence: magnitude over time, coloured by depth band.
export default {
  data: largeQuakes,
  x: 'time',
  series: [
    {
      type: 'scatter',
      y: 'mag',
      label: 'Magnitude',
      colorBy: { field: 'depthBand', label: 'Depth' },
      tooltipFields: [
        {
          field: 'depth',
          label: 'Depth (km)',
          format: (km) => km.toFixed(1),
        },
      ],
    },
  ],
  axes: { x: { type: 'time' }, y: { title: 'Magnitude' } },
  timeZone: 'UTC',
  ariaLabel:
    'Magnitude of each M4.5 or larger quake near Ridgecrest in 2019, coloured by depth',
} satisfies ChartOptions<Quake>;
