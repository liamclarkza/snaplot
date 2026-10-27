import type { ChartOptions, ChartPoint } from 'snaplot';
import { type EpochRow, validation } from '../data/training';

// A tooltip of your own: one line per run, from text nodes, so labels are never read as HTML.
function render(points: readonly ChartPoint<EpochRow>[]): Node {
  const box = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = `Epoch ${points[0]?.formattedX ?? ''}`;
  box.append(title);
  for (const point of points) {
    const line = document.createElement('div');
    line.textContent = `${point.label}: ${(Number(point.y) * 100).toFixed(1)}% correct`;
    box.append(line);
  }
  return box;
}

export default {
  data: validation,
  x: 'epoch',
  series: [
    { y: 'baselineAccuracy', label: 'Baseline' },
    { y: 'regularisedAccuracy', label: 'Regularised' },
  ],
  axes: {
    x: { title: 'Epoch' },
    y: { title: 'Validation accuracy' },
  },
  tooltip: { render },
  legend: { position: 'bottom' },
  ariaLabel:
    'Validation accuracy per epoch of a baseline and a regularised training run',
} satisfies ChartOptions<EpochRow>;
