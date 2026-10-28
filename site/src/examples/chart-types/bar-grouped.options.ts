import type { ChartOptions } from 'snaplot';
import { type MonthTotal, monthlyEnergy } from '../data/household';

// Two bar series side by side in each month's slot.
export default {
  data: monthlyEnergy,
  x: 'month',
  series: [
    { type: 'bar', y: 'import', label: 'Grid import' },
    { type: 'bar', y: 'export', label: 'Grid export' },
  ],
  axes: { y: { title: 'kWh' } },
  ariaLabel:
    'Monthly grid import and export of a household in Konstanz, 2017',
} satisfies ChartOptions<MonthTotal>;
