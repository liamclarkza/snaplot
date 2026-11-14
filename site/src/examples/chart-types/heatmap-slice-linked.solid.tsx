import { createMemo, createSignal, Show } from 'solid-js';
import {
  Chart,
  type ChartHandle,
  type CursorSnapshot,
  type HeatmapSlice,
  type ScaleRange,
  sliceBins,
} from 'snaplot/solid';
import {
  LATENCY_BINS,
  type LatencyMinute,
  latencyMinutes,
} from '../data/simulated';

type Slice = HeatmapSlice<LatencyMinute>;

const clock = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
});

// The minute under the heatmap's cursor (the newest while the cursor is away), drawn by a second
// chart as an ordinary histogram: getSlice() reads the row, sliceBins() makes it histogram bins.
// The X title names the minute, and a shaded span marks the latency bin under the pointer.
export default function LatencySlice() {
  let heatmap: ChartHandle<LatencyMinute> | undefined;
  // The same row or bin again keeps the signal, and so the histogram.
  const [slice, setSlice] = createSignal<Slice | null>(null, {
    equals: (a, b) => a?.rowIndex === b?.rowIndex,
  });
  const [bin, setBin] = createSignal<ScaleRange | undefined>(
    undefined,
    {
      equals: (a, b) => a?.min === b?.min,
    },
  );
  const read = (cursor?: CursorSnapshot<LatencyMinute>) => {
    setSlice(
      heatmap?.getSlice('latency', { fallback: 'latest' }) ?? null,
    );
    // The cell under the pointer spans its latency bin on Y.
    setBin(cursor?.points[0]?.yRange);
  };
  const bins = createMemo(() => {
    const shown = slice();
    return shown && sliceBins(shown);
  });
  const minute = () => {
    const shown = slice();
    return (
      shown &&
      clock.formatRange(shown.position, shown.position + 60_000)
    );
  };
  const regions = createMemo(() => {
    const under = bin();
    return under
      ? [{ axis: 'x', from: under.min, to: under.max, opacity: 0.2 }]
      : [];
  });

  return (
    <>
      <Chart
        ref={(chart) => {
          heatmap = chart;
          read();
        }}
        data={latencyMinutes}
        x="minute"
        series={[
          {
            type: 'heatmap',
            id: 'latency',
            label: 'Requests',
            values: 'counts',
            bins: LATENCY_BINS,
            colorScale: { title: 'Requests' },
          },
        ]}
        axes={{ y: { title: 'Latency', format: { suffix: ' ms' } } }}
        timeZone="UTC"
        // The line marks the minute the histogram shows; the histogram stands in for the tooltip.
        cursor={{ xLine: true }}
        tooltip={false}
        onCursorChange={read}
        height={140}
        ariaLabel="Request latency by minute over three hours"
      />
      <Show when={bins()}>
        {(data) => (
          <Chart
            series={[
              {
                type: 'histogram',
                id: 'slice',
                label: `Requests, ${minute()}`,
                data: data(),
              },
            ]}
            referenceRegions={regions()}
            axes={{
              x: {
                title: `Latency, ${minute()}`,
                format: { suffix: ' ms' },
              },
              y: { title: 'Requests', max: 150 },
            }}
            interaction="readonly"
            height={140}
            ariaLabel={`Latency distribution, ${minute()}`}
          />
        )}
      </Show>
    </>
  );
}
