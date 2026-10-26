import { createChart } from 'snaplot';

// Source: NOAA NCEI GHCN-Daily, Central Park, New York (USW00094728), June 2025, °F.
const days = [
  { date: '2025-06-01', high: 66, low: 50 },
  { date: '2025-06-02', high: 71, low: 53 },
  { date: '2025-06-03', high: 79, low: 56 },
  { date: '2025-06-04', high: 83, low: 62 },
  { date: '2025-06-05', high: 87, low: 70 },
  { date: '2025-06-06', high: 84, low: 71 },
  { date: '2025-06-07', high: 76, low: 66 },
];

// The chart fills its element, so give the element a height:
// <div id="chart" style="height: 280px"></div>
export default function firstChart(element: HTMLElement) {
  return createChart(element, {
    data: days,
    x: 'date',
    series: [
      { y: 'high', label: 'High' },
      { y: 'low', label: 'Low' },
    ],
    axes: { y: { format: { suffix: ' °F' } } },
    ariaLabel:
      'Daily high and low in Central Park, first week of June 2025',
  });
}
