import type { ChartOptions } from 'snaplot';
import { type EpochRow, validation } from '../data/training';

// A function of the row when the value is not a field: here the error rate, 1 − accuracy.
// Define it once, outside a component, so its identity stays the same between renders.
const baselineError = (row: EpochRow) => 1 - row.baselineAccuracy;
const regularisedError = (row: EpochRow) =>
  1 - row.regularisedAccuracy;

export default {
  data: validation,
  x: 'epoch',
  series: [
    { id: 'baseline', y: baselineError, label: 'Baseline' },
    { id: 'regularised', y: regularisedError, label: 'Regularised' },
  ],
  axes: {
    x: { title: 'Epoch' },
    y: {
      title: 'Validation error',
      format: { style: 'percent', maximumFractionDigits: 1 },
    },
  },
  ariaLabel:
    'Validation error rate per epoch, baseline and regularised runs',
} satisfies ChartOptions<EpochRow>;
