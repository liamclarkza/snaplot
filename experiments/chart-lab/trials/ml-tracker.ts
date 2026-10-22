import { createChart, type ChartHandle } from 'snaplot';

export interface LossPoint {
  step: number;
  loss: number;
}

const baselineRun: LossPoint[] = [
  { step: 0, loss: 1.2 },
  { step: 2, loss: 0.94 },
  { step: 5, loss: 0.71 },
  { step: 9, loss: 0.53 },
];

const augmentedRun: LossPoint[] = [
  { step: 0, loss: 1.18 },
  { step: 1, loss: 0.98 },
  { step: 4, loss: 0.76 },
  { step: 8, loss: 0.49 },
];

export function createMlTracker(element: HTMLElement): ChartHandle<LossPoint> {
  const chart = createChart(element, {
    x: 'step',
    series: [
      { id: 'baseline', label: 'Baseline', data: baselineRun, y: 'loss' },
      { id: 'augmented', label: 'Augmented', data: augmentedRun, y: 'loss' },
    ],
    referenceLines: [{ axis: 'y', value: 0.5, label: 'Release threshold' }],
    ariaLabel: 'Independently sampled training loss runs',
  });

  // Configuration changes use update and preserve the two series identities.
  chart.update({ referenceLines: [{ axis: 'y', value: 0.35, label: 'New threshold' }] });

  // Each stream can arrive at its own cadence and be appended independently.
  chart.appendData([{ step: 12, loss: 0.42 }], { seriesId: 'baseline' });
  chart.appendData([{ step: 11, loss: 0.37 }], { seriesId: 'augmented' });

  return chart;
}
