import {
  type ChartOptions,
  createChart,
  type HeatmapSlice,
  type ScaleRange,
  sliceBins,
} from 'snaplot';
import {
  LATENCY_BINS,
  type LatencyMinute,
  latencyMinutes,
} from '../data/simulated';

// The minute under the heatmap's cursor (the newest while the cursor is away), drawn by a second
// chart as an ordinary histogram: getSlice() reads the row, sliceBins() makes it histogram bins.
// The X title names the minute, and a shaded span marks the latency bin under the pointer.
const clock = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
});

const detailOptions = (
  slice: HeatmapSlice<LatencyMinute>,
  bin?: ScaleRange,
): ChartOptions => {
  const minute = clock.formatRange(
    slice.position,
    slice.position + 60_000,
  );
  return {
    series: [
      {
        type: 'histogram',
        id: 'slice',
        label: `Requests, ${minute}`,
        data: sliceBins(slice),
      },
    ],
    referenceRegions: bin
      ? [{ axis: 'x', from: bin.min, to: bin.max, opacity: 0.2 }]
      : [],
    axes: {
      x: {
        title: `Latency, ${minute}`,
        format: { suffix: ' ms' },
      },
      y: { title: 'Requests', max: 150 },
    },
    interaction: 'readonly',
    height: 140,
    ariaLabel: `Latency distribution, ${minute}`,
  };
};

export default function latencySlice(el: HTMLElement) {
  const top = document.createElement('div');
  const bottom = document.createElement('div');
  el.append(top, bottom);

  const heatmap = createChart<LatencyMinute>(top, {
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
      },
    ],
    axes: { y: { title: 'Latency', format: { suffix: ' ms' } } },
    timeZone: 'UTC',
    // The line marks the minute the histogram shows; the histogram stands in for the tooltip.
    cursor: { xLine: true },
    tooltip: false,
    height: 140,
    ariaLabel: 'Request latency by minute over three hours',
  });

  const slice = () =>
    heatmap.getSlice('latency', { fallback: 'latest' });
  const first = slice();
  if (!first) return heatmap;
  const detail = createChart(bottom, detailOptions(first));
  let shown = `${first.rowIndex}`;
  heatmap.on('cursor:change', (cursor) => {
    const next = slice();
    // The cell under the pointer spans its latency bin on Y.
    const bin = cursor.points[0]?.yRange;
    const key = `${next?.rowIndex} ${bin?.min}`;
    if (!next || key === shown) return;
    shown = key;
    detail.setOptions(detailOptions(next, bin));
  });
  return heatmap;
}
