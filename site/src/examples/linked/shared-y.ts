import { createChart, createChartGroup } from 'snaplot';
import { type StepRow, trainLoss } from '../data/training';

// Two runs on one y range: with yRange, each chart's y axis spans every member's data.
export default function sharedLossRange(el: HTMLElement) {
  const top = document.createElement('div');
  const bottom = document.createElement('div');
  el.append(top, bottom);
  const group = createChartGroup({ yRange: true });

  const baseline = createChart<StepRow>(top, {
    data: trainLoss,
    x: 'step',
    series: [{ id: 'baseline', y: 'baseline', label: 'Baseline' }],
    axes: { y: { title: 'Baseline' } },
    group,
    height: 140,
    ariaLabel: 'Training loss per step, baseline run',
  });
  createChart<StepRow>(bottom, {
    data: trainLoss,
    x: 'step',
    series: [
      { id: 'regularised', y: 'regularised', label: 'Regularised' },
    ],
    axes: { y: { title: 'Regularised' } },
    group,
    height: 140,
    ariaLabel: 'Training loss per step, regularised run',
  });
  return baseline;
}
