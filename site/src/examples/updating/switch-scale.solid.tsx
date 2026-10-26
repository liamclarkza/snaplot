import { createSignal } from 'solid-js';
import { Chart } from 'snaplot/solid';
import { trainLoss } from '../data/training';

// A checkbox that switches the y axis: the prop's effect applies only what changed.
export default function LossScale() {
  const [log, setLog] = createSignal(false);
  return (
    <>
      <label>
        <input
          type="checkbox"
          checked={log()}
          onChange={(e) => setLog(e.currentTarget.checked)}
        />{' '}
        Log scale
      </label>
      <Chart
        data={trainLoss}
        x="step"
        series={[
          { y: 'baseline', label: 'Baseline' },
          { y: 'regularised', label: 'Regularised' },
        ]}
        axes={{
          x: { title: 'Training step' },
          y: {
            title: 'Training loss',
            type: log() ? 'log' : 'linear',
          },
        }}
        height={240}
        ariaLabel="Training loss per step, baseline and regularised runs"
      />
    </>
  );
}
