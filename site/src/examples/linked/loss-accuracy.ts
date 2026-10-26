import { createChart, createChartGroup } from 'snaplot';
import { type EpochRow, validation } from '../data/training';

// Two charts in one group share the cursor, the highlighted series, the x range and plot edges.
export default function lossAndAccuracy(el: HTMLElement) {
  const top = document.createElement('div');
  const bottom = document.createElement('div');
  el.append(top, bottom);
  const group = createChartGroup();

  const loss = createChart<EpochRow>(top, {
    data: validation,
    x: 'epoch',
    series: [
      { id: 'baseline', y: 'baselineLoss', label: 'Baseline' },
      {
        id: 'regularised',
        y: 'regularisedLoss',
        label: 'Regularised',
      },
    ],
    axes: { y: { title: 'Loss' } },
    legend: false,
    group,
    height: 140,
    ariaLabel:
      'Validation loss per epoch, baseline and regularised runs',
  });
  createChart<EpochRow>(bottom, {
    data: validation,
    x: 'epoch',
    series: [
      { id: 'baseline', y: 'baselineAccuracy', label: 'Baseline' },
      {
        id: 'regularised',
        y: 'regularisedAccuracy',
        label: 'Regularised',
      },
    ],
    axes: {
      x: { title: 'Epoch' },
      y: { title: 'Accuracy', format: { style: 'percent' } },
    },
    legend: false,
    group,
    height: 140,
    ariaLabel:
      'Validation accuracy per epoch, baseline and regularised runs',
  });
  return loss;
}
