import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Chart,
  type ChartHandle,
  type CursorSnapshot,
  type HeatmapSlice,
  type ScaleRange,
  sliceBins,
} from 'snaplot/react';
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
  const heatmap = useRef<ChartHandle<LatencyMinute>>(null);
  const [slice, setSlice] = useState<Slice | null>(null);
  const [bin, setBin] = useState<ScaleRange>();
  const read = (cursor?: CursorSnapshot<LatencyMinute>) => {
    const next =
      heatmap.current?.getSlice('latency', { fallback: 'latest' }) ??
      null;
    // The same row again keeps the state, and so the histogram.
    setSlice((shown) =>
      shown?.rowIndex === next?.rowIndex ? shown : next,
    );
    // The cell under the pointer spans its latency bin on Y.
    const under = cursor?.points[0]?.yRange;
    setBin((shown) => (shown?.min === under?.min ? shown : under));
  };
  // The newest minute, until the cursor arrives.
  useEffect(() => {
    setSlice(
      heatmap.current?.getSlice('latency', { fallback: 'latest' }) ??
        null,
    );
  }, []);
  const bins = useMemo(() => slice && sliceBins(slice), [slice]);
  const regions = useMemo(
    () =>
      bin
        ? [{ axis: 'x', from: bin.min, to: bin.max, opacity: 0.2 }]
        : [],
    [bin],
  );
  const minute =
    slice &&
    clock.formatRange(slice.position, slice.position + 60_000);

  return (
    <>
      <Chart
        ref={heatmap}
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
      {bins && (
        <Chart
          series={[
            {
              type: 'histogram',
              id: 'slice',
              label: `Requests, ${minute}`,
              data: bins,
            },
          ]}
          referenceRegions={regions}
          axes={{
            x: {
              title: `Latency, ${minute}`,
              format: { suffix: ' ms' },
            },
            y: { title: 'Requests', max: 150 },
          }}
          interaction="readonly"
          height={140}
          ariaLabel={`Latency distribution, ${minute}`}
        />
      )}
    </>
  );
}
