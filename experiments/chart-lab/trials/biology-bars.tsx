import { useState } from 'react';
import { Chart, SeriesLegend, type ChartHandle } from 'snaplot/react';

interface BiologyRow {
  species: string;
  control: number;
  treated: number;
}

const observations: BiologyRow[] = [
  { species: 'Arabidopsis', control: 18, treated: 27 },
  { species: 'Drosophila', control: 24, treated: 31 },
  { species: 'Danio', control: 15, treated: 22 },
];

export function BiologyBars() {
  const [chart, setChart] = useState<ChartHandle<BiologyRow> | null>(null);
  const [hiddenSeries, setHiddenSeries] = useState<readonly string[]>([]);

  return (
    <section aria-label="Biology treatment comparison">
      <Chart
        ref={setChart}
        data={observations}
        x="species"
        axes={{ x: { type: 'category', categories: observations.map(row => row.species) } }}
        series={[
          { id: 'control', label: 'Control', type: 'bar', y: 'control' },
          { id: 'treated', label: 'Treated', type: 'bar', y: 'treated' },
        ]}
        hiddenSeries={hiddenSeries}
        onHiddenSeriesChange={setHiddenSeries}
        ariaLabel="Control and treated biology measurements by species"
        style={{ height: '280px' }}
      />
      <SeriesLegend chart={chart} />
      <button type="button" onClick={() => chart?.resetViewport()}>Reset viewport</button>
    </section>
  );
}
