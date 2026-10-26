import { useRef } from 'react';
import { Chart, type ChartHandle, useCursor } from 'snaplot/react';
import { type SummerDay, summer2025 } from '../data/central-park';

// The daily high against its 1991–2020 normal range, with a line of text that follows the cursor.
export default function HighsReadout() {
  const chart = useRef<ChartHandle<SummerDay>>(null);
  const cursor = useCursor(chart);
  const row = cursor?.points[0]?.row;
  return (
    <>
      <Chart
        ref={chart}
        data={summer2025}
        x="date"
        series={[
          {
            type: 'band',
            y: 'high',
            lower: 'normalLow',
            upper: 'normalHigh',
            label: 'High',
          },
        ]}
        axes={{ y: { format: { suffix: ' °F' } } }}
        height={220}
        ariaLabel="Daily high in Central Park, summer 2025, against the normal range"
      />
      <p>
        {row
          ? `${cursor.formattedX}: ${row.high} °F, normal ${row.normalLow}–${row.normalHigh} °F`
          : 'Point at a day to read it.'}
      </p>
    </>
  );
}
