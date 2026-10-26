import { useEffect, useRef } from 'react';
import { Chart, type ChartHandle } from 'snaplot/react';
import { type SummerDay, summer2025 } from '../data/central-park';

const firstWeek = summer2025.slice(0, 7);

// The summer replayed a day every half second: appendData() adds rows without re-reading the rest.
export default function ReplaySummer() {
  const chart = useRef<ChartHandle<SummerDay>>(null);
  useEffect(() => {
    let next = firstWeek.length;
    const timer = setInterval(() => {
      const day = summer2025[next++];
      if (day) chart.current?.appendData([day]);
      else clearInterval(timer);
    }, 500);
    return () => clearInterval(timer);
  }, []);
  return (
    <Chart
      ref={chart}
      data={firstWeek}
      x="date"
      series={[
        { y: 'high', label: 'High' },
        { y: 'low', label: 'Low' },
      ]}
      axes={{
        x: { min: Date.UTC(2025, 5, 1), max: Date.UTC(2025, 7, 31) },
        y: { min: 40, max: 100, format: { suffix: ' °F' } },
      }}
      timeZone="UTC"
      height={280}
      ariaLabel="Daily high and low in Central Park, summer 2025, replayed day by day"
    />
  );
}
