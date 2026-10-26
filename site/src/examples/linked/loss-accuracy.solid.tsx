import { Chart, createChartGroup } from 'snaplot/solid';
import { validation } from '../data/training';

// Two charts in one group share the cursor, the highlighted series, the x range and plot edges.
export default function LossAndAccuracy() {
  const group = createChartGroup();
  return (
    <>
      <Chart
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
        axes={{ y: { title: 'Loss' } }}
        legend={false}
        group={group}
        height={140}
        ariaLabel="Validation loss per epoch, baseline and regularised runs"
      />
      <Chart
        data={validation}
        x="epoch"
        series={[
          {
            id: 'baseline',
            y: 'baselineAccuracy',
            label: 'Baseline',
          },
          {
            id: 'regularised',
            y: 'regularisedAccuracy',
            label: 'Regularised',
          },
        ]}
        axes={{
          x: { title: 'Epoch' },
          y: { title: 'Accuracy', format: { style: 'percent' } },
        }}
        legend={false}
        group={group}
        height={140}
        ariaLabel="Validation accuracy per epoch, baseline and regularised runs"
      />
    </>
  );
}
