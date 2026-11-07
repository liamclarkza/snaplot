import { createChart } from 'snaplot';
import {
  BAND,
  type Sweep,
  spectrumFeed,
} from '../data/spectrum-feed';

// A waterfall of a simulated spectrum analyser: one row of 100 bins per sweep, ten a second,
// newest at the top, thirty seconds kept.
export default function waterfall(el: HTMLElement) {
  const chart = createChart<Sweep>(el, {
    data: [],
    series: [
      {
        type: 'heatmap',
        id: 'power',
        label: 'Power',
        y: 'time',
        values: 'power',
        bins: BAND,
        domain: [-100, -55],
        format: { maximumFractionDigits: 1, suffix: ' dBm' },
        colorScale: { title: 'dBm' },
      },
    ],
    axes: {
      x: {
        title: 'Frequency',
        format: { maximumFractionDigits: 1, suffix: ' MHz' },
      },
      y: {
        title: 'Time',
        type: 'time',
        format: { minute: '2-digit', second: '2-digit' },
      },
    },
    streaming: { maxPoints: 300 },
    height: 280,
    ariaLabel:
      'Waterfall of a simulated band from 400 to 410 MHz, streaming',
  });
  spectrumFeed(chart, (rows) => chart.appendData(rows));
  return chart;
}
