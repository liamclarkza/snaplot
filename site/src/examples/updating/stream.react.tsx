import { useEffect, useRef } from 'react';
import {
  Chart,
  type ChartHandle,
  useChartState,
} from 'snaplot/react';
import { type Latency, searchLatency } from '../data/latency-feed';

const start: Latency[] = [];

// Rows arrive thirty times a second. The chart follows the last twelve minutes; a zoom or pan
// stops following, and the button goes back to live.
export default function LiveLatency() {
  const chart = useRef<ChartHandle<Latency>>(null);
  const following = useChartState(chart, (state) => state.following);
  useEffect(() => {
    const c = chart.current;
    if (c) return searchLatency(c, (rows) => c.appendData(rows));
  }, []);
  return (
    <>
      <button
        type="button"
        hidden={following !== false}
        onClick={() => chart.current?.resumeFollow()}
      >
        Back to live
      </button>
      <Chart
        ref={chart}
        data={start}
        x="time"
        series={[
          { y: 'p50', label: 'p50' },
          { y: 'p99', label: 'p99' },
        ]}
        axes={{
          x: { type: 'time' },
          y: { format: { suffix: ' ms' } },
        }}
        streaming={{ maxPoints: 900, followWindow: 12 * 60_000 }}
        timeZone="UTC"
        height={240}
        ariaLabel="Latency of /search, p50 and p99, streaming"
      />
    </>
  );
}
