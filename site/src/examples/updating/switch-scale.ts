import { createChart } from 'snaplot';
import { type StepRow, trainLoss } from '../data/training';

// A checkbox that switches the y axis: update() changes only the options it names.
export default function lossScale(el: HTMLElement) {
  const label = document.createElement('label');
  const box = document.createElement('input');
  box.type = 'checkbox';
  label.append(box, ' Log scale');
  const plot = document.createElement('div');
  el.append(label, plot);

  const chart = createChart<StepRow>(plot, {
    data: trainLoss,
    x: 'step',
    series: [
      { y: 'baseline', label: 'Baseline' },
      { y: 'regularised', label: 'Regularised' },
    ],
    axes: {
      x: { title: 'Training step' },
      y: { title: 'Training loss' },
    },
    height: 240,
    ariaLabel:
      'Training loss per step, baseline and regularised runs',
  });
  box.addEventListener('change', () => {
    chart.update({
      axes: { y: { type: box.checked ? 'log' : 'linear' } },
    });
  });
  return chart;
}
