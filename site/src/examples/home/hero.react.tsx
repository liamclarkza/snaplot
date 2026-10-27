import { useEffect, useRef } from 'react';
import type { ChartHandle } from 'snaplot';
import { Chart } from 'snaplot/react';
import { type Latency, searchLatency } from '../data/latency-feed';

const rows: Latency[] = [];

// /search latency on a simulated service, one row per second.
export default function Hero() {
  const chart = useRef<ChartHandle<Latency>>(null);
  useEffect(() => {
    const c = chart.current;
    if (c) return searchLatency(c, (r) => c.appendData(r));
  }, []);
  return (
    <Chart
      ref={chart}
      data={rows}
      x="time"
      series={[
        { y: 'p50', label: 'p50' },
        { y: 'p99', label: 'p99' },
      ]}
      axes={{
        x: {
          type: 'time',
          format: { timeStyle: 'medium', hourCycle: 'h23' },
        },
        y: { type: 'log', min: 20, format: { suffix: ' ms' } },
      }}
      streaming={{ maxPoints: 900, followWindow: 4 * 60_000 }}
      timeZone="UTC"
      height={340}
      ariaLabel="Latency of /search, p50 and p99, streaming"
    />
  );
}
