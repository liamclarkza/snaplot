import { createSignal } from 'solid-js';
import { Chart, type ChartHandle, createCursor } from 'snaplot/solid';
import {
  type GlobalDay,
  summer2024,
} from '../data/global-temperature';

// 2024 against each date's 1991–2020 range, with a line of text that follows the cursor.
export default function SummerReadout() {
  const [chart, setChart] = createSignal<ChartHandle<GlobalDay>>();
  const cursor = createCursor(chart);
  const row = () => cursor()?.points[0]?.row;
  return (
    <>
      <Chart
        ref={setChart}
        data={summer2024}
        x="date"
        series={[
          {
            type: 'band',
            y: 'temp',
            lower: 'low',
            upper: 'high',
            label: '2024',
          },
        ]}
        axes={{ y: { format: { suffix: ' °C' } } }}
        height={220}
        ariaLabel="Daily global mean temperature in summer 2024 against its 1991–2020 range"
      />
      <p>
        {row()
          ? `${cursor()?.formattedX}: ${row()?.temp} °C, 1991–2020 ${row()?.low}–${row()?.high} °C`
          : 'Point at a day to read it.'}
      </p>
    </>
  );
}
