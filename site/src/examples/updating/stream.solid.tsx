import { createSignal, onCleanup } from 'solid-js';
import {
  Chart,
  type ChartHandle,
  createChartState,
} from 'snaplot/solid';
import { type Latency, searchLatency } from '../data/latency-feed';

const start: Latency[] = [];

// Rows arrive thirty times a second. The chart follows the last twelve minutes; a zoom or pan
// stops following, and the button goes back to live.
export default function LiveLatency() {
  const [chart, setChart] = createSignal<ChartHandle<Latency>>();
  const following = createChartState(
    chart,
    (state) => state.following,
  );
  let stop: (() => void) | undefined;
  const ready = (c: ChartHandle<Latency> | undefined) => {
    setChart(c);
    stop?.();
    stop = c && searchLatency(c, (rows) => c.appendData(rows));
  };
  onCleanup(() => stop?.());
  return (
    <>
      <button
        type="button"
        hidden={following() !== false}
        onClick={() => chart()?.resumeFollow()}
      >
        Back to live
      </button>
      <Chart
        ref={ready}
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
