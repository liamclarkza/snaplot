import { useState } from 'react';
import { Chart, type Viewport } from 'snaplot/react';
import { summer2025 } from '../data/central-park';

// Buttons that zoom to a month. The viewport is state: a zoom on the chart updates it too.
const months: [string, Viewport][] = [
  ['Summer', {}],
  ['June', { x: [Date.UTC(2025, 5, 1), Date.UTC(2025, 5, 30)] }],
  ['July', { x: [Date.UTC(2025, 6, 1), Date.UTC(2025, 6, 31)] }],
  ['August', { x: [Date.UTC(2025, 7, 1), Date.UTC(2025, 7, 31)] }],
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
        data={summer2025}
        x="date"
        series={[
          { y: 'high', label: 'High' },
          { y: 'low', label: 'Low' },
        ]}
        axes={{ y: { format: { suffix: ' °F' } } }}
        timeZone="UTC"
        viewport={viewport}
        onViewportChange={setViewport}
        height={230}
        ariaLabel="Daily high and low in Central Park, summer 2025"
      />
    </>
  );
}
