import { createChart } from 'snaplot';

// Source: Copernicus C3S / ECMWF, ERA5 via Climate Pulse (CC BY 4.0). The daily global mean
// temperature, first week of June 2024, and the 1991–2020 mean of each date, °C.
const days = [
  { date: '2024-06-01', temp: 16.57, normal: 15.7 },
  { date: '2024-06-02', temp: 16.52, normal: 15.72 },
  { date: '2024-06-03', temp: 16.48, normal: 15.75 },
  { date: '2024-06-04', temp: 16.47, normal: 15.77 },
  { date: '2024-06-05', temp: 16.51, normal: 15.8 },
  { date: '2024-06-06', temp: 16.49, normal: 15.82 },
  { date: '2024-06-07', temp: 16.5, normal: 15.84 },
];

// The chart fills its element, so give the element a height:
// <div id="chart" style="height: 280px"></div>
export default function firstChart(element: HTMLElement) {
  return createChart(element, {
    data: days,
    x: 'date',
    series: [
      { y: 'temp', label: '2024' },
      { y: 'normal', label: '1991–2020 mean' },
    ],
    axes: { y: { format: { suffix: ' °C' } } },
    ariaLabel:
      'Daily global mean temperature, first week of June 2024, against the 1991–2020 mean',
  });
}
