import type { ChartOptions } from 'snaplot';
import { type EpochRow, validation } from '../data/training';

// Tokens override single roles; everything else still follows the page.
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
  theme: {
    categorical: ['#b2182b', '#2166ac'],
    accent: '#2166ac',
    fontFamily: 'Georgia, serif',
    fontSize: 12,
  },
  ariaLabel:
    'Validation accuracy per epoch of two training runs, in custom colours and type',
} satisfies ChartOptions<EpochRow>;
