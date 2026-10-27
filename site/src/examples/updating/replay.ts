import { createChart } from 'snaplot';
import {
  type GlobalDay,
  summer2024,
} from '../data/global-temperature';

// The summer replayed a day every half second: appendData() adds rows without re-reading the rest.
export default function replaySummer(el: HTMLElement) {
  let next = 7;
  const chart = createChart<GlobalDay>(el, {
    data: summer2024.slice(0, next),
    x: 'date',
    series: [
      { y: 'temp', label: '2024' },
      { y: 'normal', label: '1991–2020 mean' },
    ],
    axes: {
      x: { min: Date.UTC(2024, 5, 1), max: Date.UTC(2024, 7, 31) },
      y: { min: 15.5, max: 17.5, format: { suffix: ' °C' } },
    },
    timeZone: 'UTC',
    ariaLabel:
      'Daily global mean temperature, summer 2024, against the 1991–2020 mean, replayed day by day',
  });
  const timer = setInterval(() => {
    const day = summer2024[next++];
    if (!day || !el.isConnected) return clearInterval(timer);
    chart.appendData([day]);
  }, 500);
  return chart;
}
