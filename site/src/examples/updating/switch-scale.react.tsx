import { useState } from 'react';
import { Chart } from 'snaplot/react';
import { trainLoss } from '../data/training';

// A checkbox that switches the y axis: a new prop applies only what changed.
export default function LossScale() {
  const [log, setLog] = useState(false);
  return (
    <>
      <label>
        <input
          type="checkbox"
          checked={log}
          onChange={(e) => setLog(e.target.checked)}
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
          y: { title: 'Training loss', type: log ? 'log' : 'linear' },
        }}
        height={240}
        ariaLabel="Training loss per step, baseline and regularised runs"
      />
    </>
  );
}
