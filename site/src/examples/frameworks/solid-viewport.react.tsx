import { useState } from 'react';
import { Chart, type Viewport } from 'snaplot/react';
import { summer2024 } from '../data/global-temperature';

// Buttons that zoom to a month. The viewport is state: a zoom on the chart updates it too.
const months: [string, Viewport][] = [
  ['Summer', {}],
  ['June', { x: [Date.UTC(2024, 5, 1), Date.UTC(2024, 5, 30)] }],
  ['July', { x: [Date.UTC(2024, 6, 1), Date.UTC(2024, 6, 31)] }],
  ['August', { x: [Date.UTC(2024, 7, 1), Date.UTC(2024, 7, 31)] }],
];

export default function MonthZoom() {
  const [viewport, setViewport] = useState<Viewport>({});
  return (
    <>
      <div role="group" aria-label="Show">
        {months.map(([label, range]) => (
          <button
            key={label}
            type="button"
            onClick={() => setViewport(range)}
          >
            {label}
          </button>
        ))}
      </div>
      <Chart
        data={summer2024}
        x="date"
        series={[
          { y: 'temp', label: '2024' },
          { y: 'normal', label: '1991–2020 mean' },
        ]}
        axes={{ y: { format: { suffix: ' °C' } } }}
        timeZone="UTC"
        viewport={viewport}
        onViewportChange={setViewport}
        height={230}
        ariaLabel="Daily global mean temperature, summer 2024, against the 1991–2020 mean"
      />
    </>
  );
}
