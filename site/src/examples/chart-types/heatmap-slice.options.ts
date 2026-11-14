import type { ChartOptions } from 'snaplot';
import {
  LATENCY_BINS,
  type LatencyMinute,
  latencyMinutes,
} from '../data/simulated';

// Three hours of simulated request latency, one histogram a minute. The slice is the minute under
// the cursor as a distribution: in the tooltip, and in the panel beside the plot over the mean of
// the minutes in view. Two minutes are pinned: before the incident and at its worst.
export default {
  data: latencyMinutes,
  x: 'minute',
  series: [
    {
      type: 'heatmap',
      id: 'latency',
      label: 'Requests',
      values: 'counts',
      bins: LATENCY_BINS,
      colorScale: { title: 'Requests' },
      slice: {
        tooltip: true,
        panel: true,
        pins: [
          new Date('2026-11-13T09:40:00Z'),
          new Date('2026-11-13T10:32:00Z'),
        ],
      },
    },
  ],
  axes: {
    y: { title: 'Latency', format: { suffix: ' ms' } },
  },
  timeZone: 'UTC',
  ariaLabel:
    'Request latency by minute over three hours, with the distribution under the cursor',
} satisfies ChartOptions<LatencyMinute>;
