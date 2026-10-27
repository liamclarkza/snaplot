# snaplot

Canvas charts for live data. One options object for vanilla JS, React and Solid.

[Documentation](https://liamclarkza.github.io/snaplot/) · [Examples](https://liamclarkza.github.io/snaplot/examples/) · [Migrating from 0.12](https://liamclarkza.github.io/snaplot/migrate-0-12/) · [npm](https://www.npmjs.com/package/snaplot)

Line, area, band, bar, histogram and scatter charts on canvas, for data that keeps arriving:
metrics, logs, sensor readings and training runs. Pass rows or typed columns, append as data
arrives, and read it with a tooltip, zoom and pan, linked charts and a legend table. No
dependencies; React and Solid are optional peers.

## Install

<!-- sync-readme:install -->
```sh
npm i snaplot@next
```
<!-- /sync-readme:install -->

## Quick start

The chart fills its element, so give the element a height.

<!-- sync-readme:vanilla -->
```ts
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
```
<!-- /sync-readme:vanilla -->

### React 18.3 and 19

<!-- sync-readme:react -->
```tsx
import { Chart } from 'snaplot/react';

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

export default function FirstChart() {
  return (
    <Chart
      data={days}
      x="date"
      series={[
        { y: 'temp', label: '2024' },
        { y: 'normal', label: '1991–2020 mean' },
      ]}
      axes={{ y: { format: { suffix: ' °C' } } }}
      height={280}
      ariaLabel="Daily global mean temperature, first week of June 2024, against the 1991–2020 mean"
    />
  );
}
```
<!-- /sync-readme:react -->

### Solid 1.9

<!-- sync-readme:solid -->
```tsx
import { Chart } from 'snaplot/solid';

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

export default function FirstChart() {
  return (
    <Chart
      data={days}
      x="date"
      series={[
        { y: 'temp', label: '2024' },
        { y: 'normal', label: '1991–2020 mean' },
      ]}
      axes={{ y: { format: { suffix: ' °C' } } }}
      height={280}
      ariaLabel="Daily global mean temperature, first week of June 2024, against the 1991–2020 mean"
    />
  );
}
```
<!-- /sync-readme:solid -->

### Without a bundler

<!-- sync-readme:no-build -->
```html
<div id="chart"></div>
<script type="module">
  import { createChart } from 'https://cdn.jsdelivr.net/npm/snaplot@1.0.0-beta.0/+esm';

  const temps = [16.57, 16.52, 16.48, 16.47, 16.51, 16.49, 16.5, 16.55, 16.61, 16.63, 16.68];
  createChart(document.getElementById('chart'), {
    data: temps.map((temp, i) => ({ day: i + 1, temp })),
    x: 'day',
    series: [{ y: 'temp' }],
    height: 280,
    ariaLabel: 'Daily global mean temperature, June 2024',
  });
</script>
```
<!-- /sync-readme:no-build -->

## Browser support

Chrome and Edge 111 or later, Firefox 115 or later, and Safari and iOS Safari 16.4 or later. The
package is ES modules only, targets ES2022 and ships no polyfills.

## Not yet supported

These are not in 1.0, and the options do not exist:

- stacked marks and horizontal bars;
- animated transitions;
- OHLC and candlestick charts, and x axes that skip gaps in time;
- aggregation of your data beyond `histogram()`;
- a plugin system for new scales.

## Links

- [Your first chart](https://liamclarkza.github.io/snaplot/first-chart/), [React](https://liamclarkza.github.io/snaplot/frameworks/react/) and [Solid](https://liamclarkza.github.io/snaplot/frameworks/solid/)
- [API reference](https://liamclarkza.github.io/snaplot/reference/api/)
- [Changelog](https://github.com/liamclarkza/snaplot/blob/main/CHANGELOG.md) and [contributing](https://github.com/liamclarkza/snaplot/blob/main/CONTRIBUTING.md)

## License

MIT
