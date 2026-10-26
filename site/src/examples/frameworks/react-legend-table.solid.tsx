import { createSignal } from 'solid-js';
import {
  Chart,
  type ChartHandle,
  LegendTable,
  type LegendTableColumn,
} from 'snaplot/solid';
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

export default function ValidationLoss() {
  const [chart, setChart] = createSignal<ChartHandle<EpochRow>>();
  return (
    <>
      <Chart
        ref={setChart}
        data={validation}
        x="epoch"
        series={[
          { id: 'baseline', y: 'baselineLoss', label: 'Baseline' },
          {
            id: 'regularised',
            y: 'regularisedLoss',
            label: 'Regularised',
          },
        ]}
        axes={{
          x: { title: 'Epoch' },
          y: { format: { maximumFractionDigits: 3 } },
        }}
        legend={false}
        height={180}
        ariaLabel="Validation loss per epoch, baseline and regularised runs"
      />
      <LegendTable
        chart={chart}
        columns={['swatch', 'name', 'value', lowestSoFar]}
        fallback="latest"
      />
    </>
  );
}
