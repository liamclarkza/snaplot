import type { ChartOptions } from 'snaplot';
import { type EpochRow, validation } from '../data/training';

// Validation loss of two training runs: the tooltip lists both at the epoch under the pointer,
// anywhere along X.
export default {
  data: validation,
  x: 'epoch',
  series: [
    { y: 'baselineLoss', label: 'Baseline' },
    { y: 'regularisedLoss', label: 'Regularised' },
  ],
  axes: {
    x: { title: 'Epoch' },
    y: { title: 'Validation loss', type: 'log' },
  },
  ariaLabel:
    'Validation loss per epoch of a baseline and a regularised training run',
} satisfies ChartOptions<EpochRow>;
