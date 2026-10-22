# Snaplot API friction audit

> Historical comparison findings from before the API overhaul. Current authoring and framework contracts are documented in [ROW_API.md](ROW_API.md), [REACT_READINESS.md](REACT_READINESS.md) and the [root README](../../README.md). These observations are retained as evaluation evidence, not current API instructions.

This is a source-informed audit of the public Snaplot API before the row-helper implementation. It is not a report from a no-documentation user test. “Verified” below means the behavior follows from the types, wrappers, or implementation cited at the end of each item. The examples under Common intents record the original friction; implementation progress is tracked here separately.

## First API improvement implemented

`chartFromRows(rows, { x: 'time', series: [{ y: 'cpu' }] })` now returns the existing
`{ data, config }` contract. Named fields and typed accessors remove caller-owned
column ordering, typed-array construction and numeric series indices. Numeric and
Date X values are supported, with Date time-axis inference and missing Y gaps.
The five Snaplot scenario demos use it while retaining their existing styling and
stable configuration during replay. See [ROW_API.md](ROW_API.md) for the contract
and remaining work. The proposals later in this audit remain proposals, including
categorical encoding and reference-line shorthand.

The useful mental model today is deliberately low-level: one chart receives columnar `Float64Array` data plus a config whose series point at columns by number. That design supports sorted-X binary search and viewport culling, but it makes common object-row and categorical workflows do data preparation outside Snaplot.

## Common intents

### 1. Plot a few object rows as a line chart

An intuitive first attempt is a row-oriented component API:

```tsx
<Chart
  data={rows}
  x="time"
  series={[{ key: "cpu", label: "CPU" }]}
/>
```

The working API requires a columnar tuple, a `Float64Array` for every column, and a numeric `dataIndex` for each series:

```tsx
const data: ColumnarData = [
  Float64Array.from(rows, row => row.time),
  Float64Array.from(rows, row => row.cpu ?? Number.NaN),
];

const config: ChartConfig = {
  series: [{ label: 'CPU', dataIndex: 1 }],
};

<Chart config={config} data={data} />
```

That means the caller has to choose column order, copy values into typed arrays, encode missing values as `NaN`, and keep the series index aligned with the Y columns. `ColumnarStore.validate()` rejects plain arrays, unequal lengths, non-finite X values, and unsorted X values (`packages/snaplot/src/data/ColumnarStore.ts:33-101`). The shared X / Y column contract and the `dataIndex` requirement are public (`packages/snaplot/src/types.ts:9-14`, `178-188`).

Classification: the typed, sorted columnar shape is an intentional performance constraint. The missing row/accessor adapter is a real additive DX gap.

### 2. Add several series, including scatter or a different X column

A user will usually think in stable field names:

```tsx
series: [
  { key: 'loss', type: 'line' },
  { key: 'samples', type: 'scatter', xKey: 'batch', yKey: 'loss' },
]
```

The current config uses `dataIndex` for line/area/band/bar/histogram, and `xDataIndex` plus `yDataIndex` for scatter. Scatter may still use `dataIndex` as a fallback for Y:

```ts
const config: ChartConfig = {
  series: [
    { label: 'Loss', type: 'line', dataIndex: 1 },
    { label: 'Samples', type: 'scatter', xDataIndex: 2, yDataIndex: 3 },
  ],
};
```

The two-name mapping is verified in `SeriesConfig` (`packages/snaplot/src/types.ts:183-188`, `289-297`) and the scatter fallback is used by the renderer (`packages/snaplot/src/renderers/ScatterRenderer.ts:430-445`). A common source of confusion is that `dataIndex` means “Y column” for most marks but is an alias for scatter Y; there is no stable string `id` on `SeriesConfig`. Legend and highlight APIs expose `seriesIndex` (`packages/snaplot/src/types.ts:768-780`, `790-804`).

Classification: mixed mark types and independent scatter X/Y columns already work. The overloaded index names and index-only series identity are verified ergonomics gaps. The distinction exists for a real reason—shared-X marks need one column while scatter can be genuinely two-dimensional—but the caller should not have to reason about that distinction during ordinary field mapping.

### 3. Make a chart look good without guessing padding or tick settings

The minimal current config is already viable:

```ts
const config: ChartConfig = {
  series: [{ label: 'CPU', dataIndex: 1 }],
};
```

Snaplot creates missing `x` and `y` axes as linear axes (`packages/snaplot/src/core/Chart.ts:1318-1355`), auto-resizes by default, and supplies default padding of top 24, right 24, bottom 44, and left 56 (`packages/snaplot/src/config/defaults.ts:6-35`, `packages/snaplot/src/constants.ts:580-588`). Auto-range adds 5% vertical breathing room by default and bar charts include a zero baseline (`packages/snaplot/src/core/Chart.ts:1566-1597`). Tick density defaults to six and labels are thinned to fit (`packages/snaplot/src/constants.ts:613-617`, `packages/snaplot/src/renderers/AxesRenderer.ts:145-170`).

The friction appears when a caller wants axis titles or explicit formatting: there are no top-level `xLabel`, `yLabel`, or `xFormat` fields. The working shape is nested:

```ts
axes: {
  x: { label: 'Time', tickFormat: value => `${value} s` },
  y: { label: 'CPU', tickFormat: value => `${value.toFixed(1)}%` },
}
```

Classification: automatic measurement is an existing capability, but the defaults audit now reproduces title clipping and long-tick collisions. No-padding success with short labels must not be generalized to arbitrary content. The nested axis vocabulary is a real discovery cost, especially because a chart with no `axes` still works but has no titles.

### 4. Format axis ticks and tooltip values once

An intuitive attempt is a single chart-level formatter:

```ts
format: { x: formatTime, y: formatPercent }
```

The current API has two formatting layers. `axes.x.tickFormat` and `axes.y.tickFormat` format axis labels; the tooltip falls back to those axis formatters. `tooltip.xFormat` and `tooltip.yFormat` override the tooltip only, and `tooltip.yFormat` receives `seriesIndex` for mixed-unit charts (`packages/snaplot/src/types.ts:423-428`, `668-705`).

```ts
const config: ChartConfig = {
  axes: {
    x: { tickFormat: formatTime },
    y: { tickFormat: formatPercent },
  },
  tooltip: {
    // Optional when the tooltip should match the axes.
    // xFormat: formatTime,
    // yFormat: (value, seriesIndex) => formatMetric(value, seriesIndex),
  },
};
```

The fallback is real: `Chart.formatAxisValue()` reads `axes[axisKey].tickFormat` before the scale formatter (`packages/snaplot/src/core/Chart.ts:3528-3532`), and tooltip formatting is only installed when tooltip overrides are present (`packages/snaplot/src/core/Chart.ts:3102-3107`). Histogram intervals add a third concern: `tooltip.rangeFormat(min, max, seriesIndex)` can replace the two-edge formatting (`packages/snaplot/src/core/Chart.ts:3534-3553`).

Classification: this is an existing, capable API with avoidable duplication. The actual gap is a discoverable shared formatter shorthand that preserves axis and tooltip override power.

### 5. Add a target, baseline, or threshold line

An intuitive attempt is a top-level annotation:

```ts
reference: { y: 75, label: 'Target' }
```

The working API is a plugin object:

```ts
import { createReferenceLinesPlugin } from 'snaplot';

const target = createReferenceLinesPlugin({
  lines: [{ axis: 'y', value: 75, label: 'Target', dash: [6, 3] }],
});

const config: ChartConfig = { series, plugins: [target] };
```

The plugin is public and supports horizontal or vertical lines, labels, colors, dashes, widths, and alternate axis keys (`packages/snaplot/src/plugins/builtins/referenceLinesPlugin.ts:3-26`, `48-68`). Dynamic changes require retaining the plugin handle and calling `target.setLines(...)`; changing `config.plugins` through `setOptions()` takes the plugin lifecycle path and reinstalls the set (`packages/snaplot/src/core/Chart.ts:538-570`).

Classification: multiple annotation types and plugin extensibility are intentional existing capabilities. Requiring plugin construction for the common one-line threshold is a real additive ergonomics gap. A declarative `referenceLines` field could compile to the same plugin without removing the plugin API.

### 6. Replace data, append a stream, or update a forming bucket

The expected declarative shape is often simply changing `data` and letting the wrapper reconcile it. The Solid wrapper does support that: it watches the `data` prop and calls `chart.setData()`, and watches `config` and calls `replaceOptions()` (`packages/snaplot/src/solid/Chart.tsx:6-16`, `29-50`). The lower-level primitive takes accessors and does the same (`packages/snaplot/src/solid/createChart.ts:17-62`).

At the instance level, `setData()` replaces all columns; `appendData()` requires the same column shape, sorted newer X values, and has an `updateLast` option for a forming bucket (`packages/snaplot/src/types.ts:1209-1220`, `1222-1244`; `packages/snaplot/src/core/Chart.ts:365-401`). Streaming configuration is a separate `streaming.maxLen` / `streaming.follow` concern (`packages/snaplot/src/types.ts:964-982`).

Configuration updates have a second distinction: `setOptions()` deep-merges objects but replaces arrays such as `series`, while `replaceOptions()` resolves from defaults and drops omitted keys (`packages/snaplot/src/types.ts:1054-1065`, `1235-1244`; `packages/snaplot/src/core/Chart.ts:538-607`). A caller updating one series therefore needs to rebuild the full series array.

```ts
chart.appendData(nextBatch);                    // newer rows
chart.appendData(currentBucket, { updateLast: true });
chart.scrollToLatest();                          // resume a paused follow view
```

Two details are easy to miss: an empty append is a silent no-op (`packages/snaplot/src/core/Chart.ts:389-400`), and `getData()` returns live storage that callers must treat as read-only (`packages/snaplot/src/data/ColumnarStore.ts:134-149`; ring-buffer caveat at `packages/snaplot/src/data/RingColumnarStore.ts:51-64`).

Classification: the streaming primitives and follow behavior are existing capabilities. The shape-preserving append rule and live read-only view are intentional hot-path constraints; a small row-stream helper and a clearer “immutable snapshot” name or opt-in copy would reduce mistakes.

### 7. Coordinate a dashboard of charts

An intuitive attempt is to pass a group to each chart:

```tsx
<Chart config={{ ...config, group }} data={data} />
```

The current API has two distinct steps. `createChartGroup().bind()` returns sync keys to spread into config; `apply()` is safer when the chart already has `cursor`, `highlight`, or `zoom` settings. `link(chart)` is a separate instance-level operation for shared Y domains and aligned gutters (`packages/snaplot/src/solid/createChartGroup.ts:56-103`).

```ts
const group = createChartGroup({
  defaults: { tooltip: { mode: 'index' } },
});

const chartConfig = group.apply({ ...config, series });
// <Chart config={chartConfig} data={data} />
```

`bind()` alone can shadow caller-owned nested `cursor` / `highlight` settings because its returned objects are spread at the top level; the implementation documents this and recommends `apply()` (`packages/snaplot/src/solid/createChartGroup.ts:75-93`). Zoom synchronization is opt-in to `bind({ zoom: true })`, while cursor and highlight synchronization are always included in the binding (`packages/snaplot/src/solid/createChartGroup.ts:38-53`, `194-222`).

For charts with different series order or subsets, stable highlight identity is another explicit concept: add `highlight.getKey`, commonly derived from `series.meta` (`packages/snaplot/src/types.ts:865-900`).

Classification: separate sync channels, opt-in zoom, and explicit linking are intentional controls for dashboard behavior. The group handle is discoverable only after learning three APIs (`bind`, `apply`, `link`); a single `group.connect(chart)` helper or a wrapper-level group prop would be an additive simplification.

### 8. Use strings for categorical bars or histogram labels

An intuitive attempt is to pass string X values:

```ts
rows = [{ day: 'Mon', count: 12 }, { day: 'Tue', count: 18 }];
```

The current data contract accepts only `Float64Array` columns, and X must be finite and sorted (`packages/snaplot/src/types.ts:9-14`; `packages/snaplot/src/data/ColumnarStore.ts:55-101`). The working categorical pattern encodes positions and formats them back to labels:

```ts
const days = ['Mon', 'Tue', 'Wed'];
const data: ColumnarData = [
  Float64Array.from(days, (_, index) => index),
  Float64Array.from([12, 18, 15]),
];
const config: ChartConfig = {
  axes: { x: { tickFormat: value => days[value] ?? '' } },
  series: [{ label: 'Count', type: 'bar', dataIndex: 1 }],
};
```

Bars do have category-aware geometry and automatically derive X ticks from the numeric positions; the X formatter is honored (`packages/snaplot/src/core/Chart.ts:3441-3477`). This is a numeric-position convention rather than a first-class category model. Histogram X values are precomputed bin edges, and `rangeFormat` is the intended tooltip interval hook (`packages/snaplot/src/core/Chart.ts:3464-3469`, `3534-3553`).

Classification: numeric columnar storage and sorted X are intentional. String categories and label management are a verified missing convenience, while bar spacing, tick thinning, and histogram ranges already exist.

## Additive simpler API proposal

Keep `ChartCore`, `ColumnarData`, plugin hooks, and the existing `ChartConfig` as the low-level path. Add a pure, optional row adapter that owns field lookup, column order, null encoding, and category labels, then add small declarative aliases for the repeated nested cases. The adapter should return the existing `{ data, config }` pair so it can be used by Solid, another framework, or a custom renderer without changing the core storage model.

Proposed shape (illustrative, not currently implemented):

```ts
const view = chartFromRows(rows, {
  x: { field: 'time', label: 'Time', format: formatTime },
  series: [
    { key: 'cpu', label: 'CPU', type: 'line', format: formatPercent },
    { key: 'requests', label: 'Requests', type: 'bar' },
  ],
  y: { label: 'Value' },
  referenceLines: [{ axis: 'y', value: 75, label: 'Target' }],
});

<Chart config={view.config} data={view.data} />
```

The row adapter would produce the same typed columns and `dataIndex` values as the manual example, convert `null` to `NaN`, reject or report missing fields with field names, and preserve a stable `key` in `series.meta` for legend/highlight consumers. `format` would become the shared axis/tooltip formatter, while explicit `axes.*.tickFormat` and `tooltip.*Format` would continue to win when supplied.

For categories, make the X descriptor explicit rather than asking callers to invent integer positions:

```ts
const view = chartFromRows(rows, {
  x: { field: 'day', categories: ['Mon', 'Tue', 'Wed'], label: 'Day' },
  series: [{ key: 'count', type: 'bar' }],
});
```

The adapter can encode category positions into column 0 and generate the existing numeric `axes.x.tickFormat`. This preserves the core’s sorted numeric invariant and makes category ordering visible at the call site. A category descriptor should reject unknown labels and duplicate category declarations in development so an accidental misspelling does not become a blank bar.

The top-level aliases can be additive sugar over existing config:

```ts
// Current plugin ceremony
const target = createReferenceLinesPlugin({ lines: [{ axis: 'y', value: 75, label: 'Target' }] });
const config = { series, plugins: [target] };

// Proposed sugar; internally normalized to the same plugin model
const config = { series, referenceLines: [{ axis: 'y', value: 75, label: 'Target' }] };
```

Similarly, `x` / `y` axis descriptors and `formatters: { x, y }` could normalize to `axes.x`, `axes.y`, and tooltip fallback formatters. A `group.connect()` wrapper helper could normalize to the existing `group.apply()` plus lifecycle-safe `link()` call, while leaving `bind()` available for low-level composition.

The proposal is intentionally additive: it keeps typed columnar data for large or preprocessed datasets, keeps plugin extensibility for advanced annotations, and avoids pretending that the core should accept arbitrary row objects in its hot path.

## Prioritized findings

1. Add a pure row-to-column adapter with named series keys and null handling. This removes the largest repeated setup cost and unlocks the category helper.
2. Add first-class category encoding in that adapter, backed by numeric X positions and the existing tick formatter.
3. Preserve the existing axis-to-tooltip formatter fallback; test discoverability before adding aliases. Prefer one coherent field/axis descriptor over multiple competing formatter shorthands.
4. Add declarative `referenceLines` sugar over the existing plugin.
5. Add one group convenience wrapper around `apply()` and teardown-safe `link()`.
6. Keep the columnar/sorted-X contract, typed arrays, explicit scatter X/Y columns, and streaming shape constraints documented as intentional low-level behavior.
