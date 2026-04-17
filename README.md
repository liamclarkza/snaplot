# snaplot

High-performance canvas chart library for [SolidJS](https://www.solidjs.com/). Line, area, scatter, bar, and histogram charts with sub-frame rendering at 100K+ points, cursor-synced legend tables, cross-chart interaction sync, and zero runtime dependencies beyond solid-js.

Under 30KB gzipped.

**[Live Documentation & Demos](https://liamclarkza.github.io/snaplot/#/docs)**

---

## Install

```bash
npm install snaplot
```

Peer dependency: `solid-js ^1.9.0`.

## Quick start

```tsx
import { Chart } from 'snaplot';
import type { ColumnarData } from 'snaplot';

const data: ColumnarData = [
  new Float64Array(timestamps),  // X values (must be sorted)
  new Float64Array(values),      // Y series 1
];

<Chart
  config={{
    axes: { x: { type: 'time' }, y: { type: 'linear' } },
    series: [{ label: 'CPU %', dataIndex: 1, type: 'line' }],
  }}
  data={data}
/>
```

All data is columnar typed arrays — index 0 is always X, indices 1+ are Y series. This unlocks O(log n) binary-search viewport culling, cache-friendly sequential access, and zero GC pressure during 60fps streaming updates.

## Features

### Chart types

| Type | Description |
|------|-------------|
| **Line** | Linear, monotone cubic (Fritsch-Carlson), and stepped interpolation. NaN gaps handled automatically. |
| **Area** | Gradient fill between line and baseline, with configurable top/bottom colors. |
| **Scatter** | Stamp-based rendering up to 200K points; automatic Viridis density heatmap beyond that. |
| **Bar** | Grouped side-by-side bars with configurable width ratio, outer/inner padding. |
| **Histogram** | Pre-binned via the included `histogram()` utility (Freedman-Diaconis, Sturges, Scott, or fixed bin count). |

### Interactions

- **Drag-to-zoom** — box selection on X (timeseries) or XY (analytical). Selection is clamped to the plot area.
- **Wheel / pinch zoom** — at the cursor position. Configurable `wheelFactor`.
- **Pan** — shift+drag or drag on an axis gutter. One-finger drag on touch.
- **Bounded navigation** — `zoom.bounds` (default: `true`) prevents pan/zoom past the data extent. Configurable per-axis or with custom `{ min, max }` walls.
- **Double-click / double-tap** — reset zoom to full data extent.
- **Proximity tooltips** — DOM-based (no canvas clipping), three modes: `index`, `nearest`, `x`. Custom renderer via `tooltip.render`.
- **Touch support** — one-finger pan, two-finger pinch, long-press box-zoom, tap tooltips.

### Axis range control

Three knobs combine for any behaviour:

```ts
axes: {
  x: { nice: false, padding: 0 },      // exact data extent, no trailing gap
  y: { nice: true,  padding: 0.1 },    // 10% pad each side + nice tick boundaries
  y2: { min: 0, max: 100 },            // pinned bounds (reset-zoom restores these)
}
```

### Cursor-synced legend table

A table below (or above) the chart showing the value of every visible series at the current cursor position — the standard ML experiment dashboard pattern. Available as a DOM plugin and a SolidJS component.

```tsx
import { Chart, LegendTable } from 'snaplot';
import 'snaplot/legend-table.css';

const [chart, setChart] = createSignal<ChartInstance>();

<Chart config={config} data={data} onReady={setChart} />
<LegendTable chart={chart} />
```

Zero config produces a sensible default (name + value columns, series-only fallback when the cursor leaves so the layout doesn't jump). Customize with typed column helpers:

```tsx
import { nameColumn, valueColumn, metricColumn, swatchColumn, column } from 'snaplot';

type RunMeta = { runId: string; metricKey: string };

<LegendTable<RunMeta>
  chart={chart}
  columns={[
    swatchColumn(),
    nameColumn({ swatch: false }),
    metricColumn(p => p.meta.metricKey),
    valueColumn({ format: v => v.toFixed(6) }),
  ]}
/>
```

A render-prop escape hatch lets you keep the cursor/highlight wiring but render your own layout:

```tsx
<LegendTable chart={chart}>
  {(snapshot, highlight, setHighlight) => (
    <MyCustomTable data={snapshot()} highlight={highlight()} onRowHover={setHighlight} />
  )}
</LegendTable>
```

### Cross-chart sync

`createChartGroup()` coordinates cursor position and series highlighting across any number of charts:

```tsx
import { createChartGroup } from 'snaplot';

const group = createChartGroup();

<Chart config={group.apply(configA)} data={a} />
<Chart config={group.apply(configB)} data={b} />

// External controls (e.g. a sidepanel):
<button
  onMouseEnter={() => group.highlight(2)}
  onMouseLeave={() => group.highlight(null)}
>Run #2</button>
```

When a series is highlighted, non-highlighted series dim (configurable via `highlight.dimOpacity`), and the highlighted series draws on top. The equality guard in `setHighlight` breaks cross-chart sync loops, so this is safe at any group size.

### Series highlight

```ts
chart.setHighlight(seriesIndex);  // dim everything else
chart.setHighlight(null);         // clear

// Reactive (SolidJS):
const [highlight, setHighlight] = createHighlight(chart);
```

Highlight state syncs across charts via `highlight.syncKey` (or automatically via `createChartGroup`). Redraws only the data canvas layer — grid and overlay are untouched.

### Cursor snapshot (headless)

The data behind the legend table is exposed as a first-class API:

```ts
import { createCursorSnapshot } from 'snaplot';

const snapshot = createCursorSnapshot(chart, { fallback: 'latest' });
// Accessor<CursorSnapshot>:
//   source, dataIndex, dataX, formattedX, activeSeriesIndex,
//   points: [{ seriesIndex, label, color, value, formattedValue, meta }]
```

`activeSeriesIndex` is the series whose Y value is visually closest to the cursor — pair with `setHighlight` to focus the line under the cursor.

The zero-alloc `getCursorSnapshotInto(buffer)` variant reuses a caller-owned buffer so the cursor hot path stays allocation-free at 60fps with 100+ series.

### Scales

- **Linear** — Heckbert's nice numbers with D3's integer-arithmetic trick for clean ticks.
- **Logarithmic** — powers of 10 with sub-ticks at 2x and 5x.
- **Time** — automatic intervals from seconds to years with hierarchical date labels.

### Themes

Five built-in themes (`lightTheme`, `darkTheme`, `oceanTheme`, `midnightTheme`, `refinedDarkTheme`) plus full custom `ThemeConfig` objects. The legend table uses CSS custom properties (`.snaplot-legend-table-root`, `[data-highlighted]`, `[data-dimmed]`) so apps can restyle without specificity battles.

### Performance

Built on the same architectural principles as [uPlot](https://github.com/leeoniya/uPlot): columnar typed arrays, layered canvas (grid / data / overlay), binary-search viewport culling, and zero internal data processing.

- **Rendering**: 100K+ in-viewport points at interactive frame rates.
- **Streaming**: 60fps `appendData` with ring-buffer eviction.
- **Legend table**: text-content swaps only on cursor move (no innerHTML rebuilds); per-cell SolidJS signals for fine-grained reactivity.
- **Highlight**: redraws only the DATA canvas; overlay and grid untouched.
- **Downsampling**: LTTB and M4 shipped as opt-in utilities — the library never touches your data.

### Plugin system

Plugins are plain objects with lifecycle hooks — `install`, `destroy`, `before/afterDraw{Grid,Data,Overlay}`, `onCursorMove`, `onZoom`, `onClick`, `onSetData`. Both per-chart and runtime registration are supported.

```ts
chart.use(myPlugin);
// or in config:
config.plugins = [createLegendTablePlugin({ fallback: 'series-only' })];
```

## API at a glance

| Category | Exports |
|----------|---------|
| **Components** | `Chart`, `LegendTable` |
| **Primitives** | `createChart`, `createCursorSnapshot`, `createHighlight`, `createChartGroup` |
| **Plugins** | `createLegendPlugin`, `createLegendTablePlugin` |
| **Column helpers** | `nameColumn`, `valueColumn`, `swatchColumn`, `metricColumn`, `column` |
| **Data utilities** | `lttb`, `m4`, `histogram`, `ColumnarStore` |
| **Scales** | `createScale`, `LinearScale`, `LogScale`, `TimeScale`, `niceTicks` |
| **Themes** | `lightTheme`, `darkTheme`, `oceanTheme`, `midnightTheme`, `refinedDarkTheme`, `resolveTheme` |
| **Core** | `ChartCore` (imperative, framework-free) |

Full type exports and API reference in the [documentation](https://liamclarkza.github.io/snaplot/#/docs#api-types).

## Development

```bash
npm install          # install all workspaces
npm run build        # build the library
npm run dev          # run the docs site dev server
npm run build:site   # build the static docs site
npm run preview      # build everything + preview the site
npm run typecheck    # type-check the library
```

## License

MIT
