import {
  createChart,
  createLegendTable,
  type LegendTableColumn,
} from 'snaplot';
import { type EpochRow, validation } from '../data/training';

// Validation loss of two runs, with a table of each run's value at the cursor and its best so far.
const field = {
  baseline: 'baselineLoss',
  regularised: 'regularisedLoss',
} as const;
const lowestSoFar: LegendTableColumn<EpochRow> = {
  header: 'Lowest so far',
  align: 'right',
  value: (point, series) => {
    const key = field[series.id as keyof typeof field];
    if (!point || !key) return '';
    const seen = validation
      .slice(0, point.rowIndex + 1)
      .map((row) => row[key]);
    return Math.min(...seen).toFixed(3);
  },
};

export default function validationLoss(el: HTMLElement) {
  const plot = document.createElement('div');
  const table = document.createElement('div');
  el.append(plot, table);
  const chart = createChart<EpochRow>(plot, {
    data: validation,
    x: 'epoch',
    series: [
      { id: 'baseline', y: 'baselineLoss', label: 'Baseline' },
      {
        id: 'regularised',
        y: 'regularisedLoss',
        label: 'Regularised',
      },
    ],
    axes: {
      x: { title: 'Epoch' },
      y: { format: { maximumFractionDigits: 3 } },
    },
    legend: false,
    height: 160,
    ariaLabel:
      'Validation loss per epoch, baseline and regularised runs',
  });
  // The table returns a handle too: destroy it before the chart when you remove both.
  createLegendTable(table, {
    chart,
    columns: ['swatch', 'name', 'value', lowestSoFar],
    fallback: 'latest',
  });
  return chart;
}
