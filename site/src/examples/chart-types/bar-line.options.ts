import type { ChartOptions } from 'snaplot';
import { type MonthTotal, monthlyEnergy } from '../data/household';

// Bars and a line on one chart: each series picks its own type.
export default {
  data: monthlyEnergy,
  x: 'month',
  series: [
    { type: 'bar', y: 'pv', label: 'Solar output' },
    { y: 'import', label: 'Grid import', interpolation: 'monotone' },
  ],
  axes: { y: { title: 'kWh' } },
  ariaLabel:
    'Monthly solar output as bars and grid import as a line, a household in Konstanz, 2017',
} satisfies ChartOptions<MonthTotal>;
