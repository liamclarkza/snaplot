import type { ChartOptions } from 'snaplot';
import { largeQuakes, type Quake } from '../data/aftershocks';

type Aftershock = Quake & { hours: number };

// Every M4.5+ quake after the M6.4 foreshock: magnitude against hours since it, on a log axis so
// the first hour and the second month both have room, coloured by depth band.
const foreshock = largeQuakes.find((quake) => quake.mag === 6.4)!;
const aftershocks: Aftershock[] = largeQuakes
  .filter((quake) => quake.time > foreshock.time)
  .map((quake) => ({
    ...quake,
    hours: (quake.time - foreshock.time) / 3_600_000,
  }));

export default {
  data: aftershocks,
  x: 'hours',
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
  axes: {
    x: {
      type: 'log',
      title: 'Hours after the M6.4',
      format: { maximumFractionDigits: 1 },
    },
    y: { title: 'Magnitude' },
  },
  ariaLabel:
    'Magnitude of each M4.5 or larger quake near Ridgecrest in 2019 against hours after the M6.4, coloured by depth',
} satisfies ChartOptions<Aftershock>;
