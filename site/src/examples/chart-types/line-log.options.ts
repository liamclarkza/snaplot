import type { ChartOptions } from 'snaplot';
import { type StepRow, trainLoss } from '../data/training';

// Training loss falls over two decades: a log axis gives the last of it as much room as the first.
export default {
  data: trainLoss,
  x: 'step',
  series: [
    { y: 'baseline', label: 'Run A' },
    { y: 'regularised', label: 'Run B' },
  ],
  axes: {
    x: { title: 'Training step' },
    y: { type: 'log', title: 'Cross-entropy' },
  },
  ariaLabel:
    'Training loss of two runs of a digit classifier by step, on a log axis',
} satisfies ChartOptions<StepRow>;
