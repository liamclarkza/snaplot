import { useRef } from 'react';
import { Chart, type ChartHandle, useCursor } from 'snaplot/react';
import {
  type GlobalDay,
  summer2024,
} from '../data/global-temperature';

// 2024 against each date's 1991–2020 range, with a line of text that follows the cursor.
export default function SummerReadout() {
  const chart = useRef<ChartHandle<GlobalDay>>(null);
  const cursor = useCursor(chart);
  const row = cursor?.points[0]?.row;
  return (
    <>
      <Chart
        ref={chart}
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
        {row
          ? `${cursor.formattedX}: ${row.temp} °C, 1991–2020 ${row.low}–${row.high} °C`
          : 'Point at a day to read it.'}
      </p>
    </>
  );
}
