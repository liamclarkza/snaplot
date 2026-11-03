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
      x: {
        type: 'time',
        format: { timeStyle: 'medium', hourCycle: 'h23' },
      },
      y: { type: 'log', min: 20, format: { suffix: ' ms' } },
    },
    streaming: { maxPoints: 900, followWindow: 12 * 60_000 },
    timeZone: 'UTC',
    height: 340,
    ariaLabel: 'Latency of /search, p50 and p99, streaming',
  });
  searchLatency(chart, (rows) => chart.appendData(rows));
  return chart;
}
