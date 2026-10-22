# snaplot

A canvas chart library for streaming data and interactive dashboards.

[Documentation](https://liamclarkza.github.io/snaplot/#/docs) · [Live demos](https://liamclarkza.github.io/snaplot/#/demos) · [npm](https://www.npmjs.com/package/snaplot)

Render line, area, scatter, bar, histogram and band charts directly from application rows or named `Float64Array` columns. The JavaScript core is framework independent. Native components and state helpers are available through `snaplot/react` (React 19) and `snaplot/solid` (Solid 1.9); neither framework is loaded by the root import.

## Install

```sh
npm install snaplot
```

Install your framework separately when using its integration. The API below describes this working-tree overhaul; no release is published automatically.

## Quick start

```ts
import { createChart } from 'snaplot';

const samples = [
  { time: new Date('2026-01-01T00:00:00Z'), cpu: 32, memory: 58 },
  { time: new Date('2026-01-01T00:01:00Z'), cpu: 37, memory: 61 },
];
const chart = createChart(document.getElementById('chart')!, {
  data: samples,
  x: 'time',
  series: [{ y: 'cpu', label: 'CPU' }, { y: 'memory', label: 'Memory' }],
  axes: { y: { title: 'Utilization (%)', min: 0, max: 100 } },
  referenceLines: [{ axis: 'y', value: 80, label: 'Warning' }],
  ariaLabel: 'CPU and memory utilization',
});

chart.update({ data: [...samples, { time: new Date('2026-01-01T00:02:00Z'), cpu: 40, memory: 60 }] });
// On removal:
chart.destroy();
```

The host needs a nonzero width and height. Fields are type checked, and accessors such as `y: row => row.cpu / 100` work directly. Use an explicit `id` for accessor-based series or multiple series reading the same Y field. `rowId` optionally identifies observations across snapshots; otherwise events identify the original input index within the snapshot.

Numeric X values infer a linear axis, Dates infer time, and strings infer categories. Numeric timestamps require `axes.x.type: 'time'`. Continuous row data is stably sorted on ingestion where ordered rendering needs it, without mutating input rows. Missing, `null`, `undefined` and `NaN` numeric values are gaps. Invalid X values and incompatible fields produce contextual errors.

### React and Solid

Both integrations accept the chart options directly:

```tsx
import { Chart } from 'snaplot/react'; // or 'snaplot/solid'

<Chart
  data={samples}
  x="time"
  series={[{ y: 'cpu', label: 'CPU' }]}
  axes={{ y: { title: 'CPU (%)' } }}
  ariaLabel="CPU utilization"
  style={{ height: '280px' }}
/>
```

React uses ref-as-prop and `useChartState`, `useCursorSnapshot`, `useHighlight`, and `useChartGroup`. Solid uses callback refs and `createChartState`, `createCursorSnapshot`, `createHighlight`, and `createChartGroup`. Both export `SeriesLegend`, `LegendTable`, and native JSX column helpers. In React, use a state-backed callback ref (`const [chart, setChart] = useState<ChartHandle<Row> | null>(null)`, then `<Chart ref={setChart} ... />` and `<SeriesLegend chart={chart} />`) so companions receive the mounted chart. A plain `useRef` does not trigger a parent render when it is assigned. Imports and server rendering are DOM-safe; chart creation happens after mount.

Controlled props are `viewport`, `selectionState`, and `hiddenSeries`, with corresponding `onViewportChange`, `onSelectionChange`, and `onHiddenSeriesChange` callbacks. Their uncontrolled counterparts are `defaultViewport`, `defaultSelection`, and `defaultHiddenSeries`. `selection` configures the selection gesture; `selectionState` is its current range. Controlled interactions propose a change and wait for the owner to supply it.

### Independent datasets

```ts
createChart(element, {
  x: 'step',
  series: [
    { id: 'baseline', data: baselineRun, y: 'loss' },
    { id: 'augmented', data: augmentedRun, y: 'loss' },
  ],
});
```

Each series inherits chart-level `data` and `x` unless overridden. Sources can differ in length and sampling interval. Snaplot does not join or interpolate observations; cursor readouts retain each source's nearest sample and actual X value. Shared source objects share preparation and storage.

### Columns and streaming

```ts
const chart = createChart(element, {
  data: { columns: { time: timestamps, cpu: cpuValues } },
  x: 'time',
  series: [{ y: 'cpu' }],
  axes: { x: { type: 'time' } },
  streaming: { maxPoints: 10_000, followWindow: 60_000 },
});
chart.appendData({ columns: { time: nextTimes, cpu: nextValues } });
chart.resumeFollow();
```

Named columns are equal-length `Float64Array`s. Ordered marks require finite, non-decreasing X; scatter coordinates may be unordered and retain arrival order. Buffers are reused without row conversion or sorting. Streaming batches for ordered marks must preserve order and are never automatically sorted. `appendData(batch, { seriesId: 'baseline' })` targets an independent source. `{ updateLast: true }` corrects the last observation before appending the remaining batch. Retention uses bounded ring storage. Keep high-frequency appends imperative through the chart ref; framework renders are unnecessary for each sample.

### Ranges, categories and formatting

Automatic axes use `roundBounds` to extend to regular tick boundaries according to the scale. Set `roundBounds: false` for tight data bounds or specify `min`/`max` for exact configured bounds. `rangePadding` controls data-range padding; chart `padding` controls layout. `setViewport({ x: { min, max } })` selects an exact numeric viewport without rounding; `resetViewport()` restores configured bounds and `resumeFollow()` resumes live navigation.

Categories retain first-appearance order for the chart lifetime. `axes.x.categories` supplies an authoritative order, including empty slots, and rejects unknown labels. Bars require one observation per category per series. Repeated observations can be scatter points or aggregated by the caller. Category viewports use numeric slot indices.

`axes.y.format` formats ticks, tooltips and cursor values; time callbacks receive epoch milliseconds and category callbacks receive labels. Series `format` overrides metric values in tooltips and legends; tooltip-specific overrides remain available.

### Advanced marks and annotations

Band series use named `y`, `lower`, and `upper` fields. Scatter accepts named `x`, `y`, `colorBy`, `sizeBy`, and `tooltipFields`, including accessors. Histogram series consume `histogram(values)` directly as their `data`; no sentinel counts are required. Histogram binning is always explicit.

`referenceLines` and `referenceRegions` are declarative options. Their `axis` is the actual axis ID, such as `y2`; series bind with `xAxis` and `yAxis`. Custom plugins remain available through `plugins`, with chart lifecycle, drawing and update hooks. Subscribe to typed interaction events through `chart.on(...)`. Custom tooltip renderers receive the same series IDs and source-row context. Exceptions from custom plugin hooks are reported and isolated; invalid data or options fail before committing.

### Updates and chart groups

`chart.update(patch)` merges nested option objects, replaces arrays and datasets, and resets settings explicitly assigned `undefined`. It prepares and validates the next state before committing. Frameworks reconcile complete prop snapshots, including removed props. Unrelated option changes preserve viewport, visibility, selection and stable series identities.

`createChartGroup()` is available in plain JavaScript. Pass its result through each chart's `group` option for automatic membership. Cursor and ID-based highlight synchronization default on. Viewport synchronization (`viewport`), shared Y ranges (`yRange`), and plot-edge alignment (`alignPlots`) are opt-in. Destroying a group disconnects its members without destroying their charts.

Optional framework-free legend companions are `createLegendPlugin` and `createLegendTablePlugin`. Framework components supply native custom cells. Themes, legend appearance and existing renderer styling remain unchanged by this API overhaul.

## Non-goals

Stacking, animations, OHLC/candlestick charts, a scale plugin system, automatic aggregation, and timezone behavior are outside this overhaul. Category axes are supported.

## Performance and development

Layered canvases separate grids, data and interaction overlays. Sorted series use binary-search culling; dense scatter uses cached hit testing. Typed columns stay on the optimized rendering path. The same-machine benchmark gate and independent-source workload live in [bench/](bench/README.md).

The [comparison lab](experiments/chart-lab/README.md) exercises UAV, F1, ML, airport and biological dashboards using Snaplot, Chart.js, Recharts and ECharts. Chart.js is the visual comparison reference; further visual changes require separate direction.

```sh
npm install
npm run dev
npm run dev:lab
npm run typecheck
npm run lint
npm test
npm run build
npm run build:site
npm run build:lab
npm run test:consumers -w packages/snaplot
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for development conventions and release instructions.

## License

MIT
