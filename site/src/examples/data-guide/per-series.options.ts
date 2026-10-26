import type { ChartOptions } from 'snaplot';
import { dailyCounts, largeQuakes } from '../data/aftershocks';

// Two datasets on one chart: each series brings its own `data` and names its own fields.
const days = dailyCounts.map((d) => ({
  time: Date.parse(`${d.day}T00:00:00Z`),
  events: d.events,
}));

export default {
  series: [
    {
      type: 'bar',
      data: days,
      x: 'time',
      y: 'events',
      label: 'Events per day',
    },
    {
      type: 'scatter',
      data: largeQuakes,
      x: 'time',
      y: 'mag',
      yAxis: 'mag',
      label: 'M4.5 and over',
    },
  ],
  axes: {
    x: { type: 'time' },
    y: { title: 'Events per day' },
    mag: { position: 'right', title: 'Magnitude', min: 4, max: 7 },
  },
  timeZone: 'UTC',
  ariaLabel:
    'Ridgecrest aftershocks, July to September 2019: events per day and M4.5+ quakes',
} satisfies ChartOptions;
