import { useState } from 'react';
import { Chart, createChartGroup } from 'snaplot/react';
import { trainLoss } from '../data/training';

// Two runs on one y range: with yRange, each chart's y axis spans every member's data.
export default function SharedLossRange() {
  const [group] = useState(() => createChartGroup({ yRange: true }));
  return (
    <>
      <Chart
        data={trainLoss}
        x="step"
        series={[
          { id: 'baseline', y: 'baseline', label: 'Baseline' },
        ]}
        group={group}
        height={140}
        ariaLabel="Training loss per step, baseline run"
      />
      <Chart
        data={trainLoss}
        x="step"
        series={[
          {
            id: 'regularised',
            y: 'regularised',
            label: 'Regularised',
          },
        ]}
        group={group}
        height={140}
        ariaLabel="Training loss per step, regularised run"
      />
    </>
  );
}
