import { createChart } from 'snaplot';
import { type Latency, searchLatency } from '../data/latency-feed';

// Rows arrive thirty times a second. The chart follows the last twelve minutes; a zoom or pan
// stops following, and the button goes back to live.
export default function liveLatency(el: HTMLElement) {
  const back = document.createElement('button');
  back.type = 'button';
  back.textContent = 'Back to live';
  back.hidden = true;
  const plot = document.createElement('div');
  el.append(back, plot);

  const chart = createChart<Latency>(plot, {
    data: [],
    x: 'time',
    series: [
      { y: 'p50', label: 'p50' },
      { y: 'p99', label: 'p99' },
    ],
    axes: { x: { type: 'time' }, y: { format: { suffix: ' ms' } } },
    streaming: { maxPoints: 900, followWindow: 12 * 60_000 },
    timeZone: 'UTC',
    height: 240,
    ariaLabel: 'Latency of /search, p50 and p99, streaming',
    onFollowingChange: (following) => {
      back.hidden = following;
    },
  });
  back.addEventListener('click', () => chart.resumeFollow());
  searchLatency(chart, (rows) => chart.appendData(rows));
  return chart;
}
