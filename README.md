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
```
<!-- /sync-readme:vanilla -->

### React 18.3 and 19

<!-- sync-readme:react -->
```tsx
import { Chart } from 'snaplot/react';

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

export default function FirstChart() {
  return (
    <Chart
      data={days}
      x="date"
      series={[
        { y: 'high', label: 'High' },
        { y: 'low', label: 'Low' },
      ]}
      axes={{ y: { format: { suffix: ' °F' } } }}
      height={280}
      ariaLabel="Daily high and low in Central Park, first week of June 2025"
    />
  );
}
```
<!-- /sync-readme:react -->

### Solid 1.9

<!-- sync-readme:solid -->
```tsx
import { Chart } from 'snaplot/solid';

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

export default function FirstChart() {
  return (
    <Chart
      data={days}
      x="date"
      series={[
        { y: 'high', label: 'High' },
        { y: 'low', label: 'Low' },
      ]}
      axes={{ y: { format: { suffix: ' °F' } } }}
      height={280}
      ariaLabel="Daily high and low in Central Park, first week of June 2025"
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

  const highs = [66, 71, 79, 83, 87, 84, 76, 76, 64, 73, 81, 87, 78, 68, 64];
  createChart(document.getElementById('chart'), {
    data: highs.map((high, i) => ({ day: i + 1, high })),
    x: 'day',
    series: [{ y: 'high' }],
    height: 280,
    ariaLabel: 'Daily high temperature in Central Park, June 2025',
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
