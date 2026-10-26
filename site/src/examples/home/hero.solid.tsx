import type { ChartHandle } from 'snaplot';
import { Chart } from 'snaplot/solid';
import { type Latency, searchLatency } from '../data/latency-feed';

const rows: Latency[] = [];

// /search latency on a simulated service, one row per second.
export default function Hero() {
  let stop: (() => void) | undefined;
  const ready = (c: ChartHandle<Latency> | undefined) => {
    stop?.();
    stop = c && searchLatency(c, (r) => c.appendData(r));
  };
  return (
    <Chart
      ref={ready}
      data={rows}
      x="time"
      series={[
        { y: 'p50', label: 'p50' },
        { y: 'p99', label: 'p99' },
      ]}
      axes={{
        x: { type: 'time' },
        y: { type: 'log', format: { suffix: ' ms' } },
      }}
      streaming={{ maxPoints: 900, followWindow: 4 * 60_000 }}
      timeZone="UTC"
      height={280}
      ariaLabel="Latency of /search, p50 and p99, streaming"
    />
  );
}
