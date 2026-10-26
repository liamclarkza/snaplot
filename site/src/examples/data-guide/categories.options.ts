import type { ChartOptions } from 'snaplot';
import { type MonthTotal, monthlyEnergy } from '../data/household';

// String x values that are not dates make a category axis, in the order of the rows.
export default {
  data: monthlyEnergy,
  x: 'month',
  series: [
    { type: 'bar', y: 'pv', label: 'Solar generation' },
    { type: 'bar', y: 'import', label: 'Grid import' },
  ],
  axes: {
    y: { format: { suffix: ' kWh', maximumFractionDigits: 0 } },
  },
  ariaLabel:
    'Monthly solar generation and grid import of a household in Konstanz, 2017',
} satisfies ChartOptions<MonthTotal>;
