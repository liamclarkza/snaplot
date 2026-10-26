import { createChart } from 'snaplot';
import { type Latency, searchLatency } from '../data/latency-feed';

// /search latency on a simulated service, one row per second.
export default function hero(el: HTMLElement) {
  const chart = createChart<Latency>(el, {
    data: [],
    x: 'time',
    series: [
      { y: 'p50', label: 'p50' },
      { y: 'p99', label: 'p99' },
    ],
    axes: {
      x: { type: 'time' },
      y: { type: 'log', format: { suffix: ' ms' } },
    },
    streaming: { maxPoints: 900, followWindow: 4 * 60_000 },
    timeZone: 'UTC',
    height: 280,
    ariaLabel: 'Latency of /search, p50 and p99, streaming',
  });
  searchLatency(el, (rows) => chart.appendData(rows));
  return chart;
}
