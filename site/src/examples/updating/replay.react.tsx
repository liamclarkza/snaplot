import { useEffect, useRef } from 'react';
import { Chart, type ChartHandle } from 'snaplot/react';
import {
  type GlobalDay,
  summer2024,
} from '../data/global-temperature';

const firstWeek = summer2024.slice(0, 7);

// The summer replayed a day every half second: appendData() adds rows without re-reading the rest.
export default function ReplaySummer() {
  const chart = useRef<ChartHandle<GlobalDay>>(null);
  useEffect(() => {
    let next = firstWeek.length;
    const timer = setInterval(() => {
      const day = summer2024[next++];
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
        { y: 'temp', label: '2024' },
        { y: 'normal', label: '1991–2020 mean' },
      ]}
      axes={{
        x: { min: Date.UTC(2024, 5, 1), max: Date.UTC(2024, 7, 31) },
        y: { min: 15.5, max: 17.5, format: { suffix: ' °C' } },
      }}
      timeZone="UTC"
      height={280}
      ariaLabel="Daily global mean temperature, summer 2024, against the 1991–2020 mean, replayed day by day"
    />
  );
}
