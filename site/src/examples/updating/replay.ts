import { createChart } from 'snaplot';
import { type SummerDay, summer2025 } from '../data/central-park';

// The summer replayed a day every half second: appendData() adds rows without re-reading the rest.
export default function replaySummer(el: HTMLElement) {
  let next = 7;
  const chart = createChart<SummerDay>(el, {
    data: summer2025.slice(0, next),
    x: 'date',
    series: [
      { y: 'high', label: 'High' },
      { y: 'low', label: 'Low' },
    ],
    axes: {
      x: { min: Date.UTC(2025, 5, 1), max: Date.UTC(2025, 7, 31) },
      y: { min: 40, max: 100, format: { suffix: ' °F' } },
    },
    timeZone: 'UTC',
    ariaLabel:
      'Daily high and low in Central Park, summer 2025, replayed day by day',
  });
  const timer = setInterval(() => {
    const day = summer2025[next++];
    if (!day || !el.isConnected) return clearInterval(timer);
    chart.appendData([day]);
  }, 500);
  return chart;
}
