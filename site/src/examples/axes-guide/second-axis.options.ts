import type { ChartOptions } from 'snaplot';
import { type MonthTotal, monthlyEnergy } from '../data/household';

// A household in Konstanz, 2017: solar generation in bars on the left, grid import as a line on a
// second value axis on the right.
export default {
  data: monthlyEnergy,
  x: 'month',
  series: [
    { type: 'bar', y: 'pv', label: 'Solar generation' },
    { y: 'import', label: 'Grid import', yAxis: 'y2' },
  ],
  axes: {
    y: { title: 'Solar (kWh)' },
    y2: { title: 'Import (kWh)' },
  },
  ariaLabel:
    'Monthly solar generation and grid import of a household in Konstanz, 2017',
} satisfies ChartOptions<MonthTotal>;
