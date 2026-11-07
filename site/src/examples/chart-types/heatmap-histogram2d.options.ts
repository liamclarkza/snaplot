import { type ChartOptions, histogram2d } from 'snaplot';
import { requests } from '../data/simulated';

// 20,000 simulated requests by response size and duration: histogram2d() counts the pairs into a
// grid of 4 KB by 4 ms cells, which a heatmap draws as its data. The domain stops at 250, so the
// busiest cells take the top colour and the band of cache misses, 60 ms up, still shows.
const edges = (to: number) =>
  Array.from({ length: to / 4 + 1 }, (_, i) => i * 4);

export default {
  series: [
    {
      type: 'heatmap',
      id: 'requests',
      label: 'Requests',
      data: histogram2d(requests.size, requests.duration, {
        xThresholds: edges(160),
        yThresholds: edges(140),
      }),
      domain: [0, 250],
      colorScale: { title: 'Requests' },
    },
  ],
  axes: {
    x: { title: 'Response size (KB)' },
    y: { title: 'Duration (ms)' },
  },
  ariaLabel:
    'Counts of 20,000 simulated requests by response size and duration',
} satisfies ChartOptions;
