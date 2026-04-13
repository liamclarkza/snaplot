# snaplot

High-performance canvas chart library for SolidJS.

**[Documentation](https://liamclarkza.github.io/snaplot/#/docs)**

## Features

- **5 chart types** — line, area, scatter, bar, histogram
- **Canvas performance** — 100K+ points at interactive frame rates, 60fps streaming
- **Zero dependencies** — under 30KB gzipped, just snaplot + solid-js
- **Interactive** — drag-to-zoom, pinch, proximity tooltips, bounded pan/zoom, double-click reset
- **Legend table** — cursor-synced table (ML-dashboard style) as a DOM plugin and a SolidJS component, with typed per-series `meta` and custom column helpers
- **Cross-chart sync** — shared cursor *and* series highlight across multiple charts in one line (`createChartGroup().apply(config)`)
- **Headless cursor snapshot** — `getCursorSnapshot()` / `createCursorSnapshot()` expose the data under the cursor (including the nearest series in pixel space) for custom UIs
- **Density heatmaps** — Viridis colormap for 200K+ point scatter plots
- **Interaction modes** — timeseries (drag=zoom), analytical (XY zoom), readonly (tooltip only)
- **Touch support** — one-finger pan, pinch-zoom, long-press box-zoom, tap tooltips
- **Downsampling utilities** — LTTB and M4 as opt-in tools (library never touches your data)

## Install

```bash
npm install snaplot
```

## Quick Start

```tsx
import { Chart } from 'snaplot';
import type { ColumnarData } from 'snaplot';

const data: ColumnarData = [
  new Float64Array(timestamps),  // X values (sorted)
  new Float64Array(values),      // Y series
];

<Chart
  config={{
    axes: { x: { type: 'time' }, y: { type: 'linear' } },
    series: [{ label: 'CPU %', dataIndex: 1, type: 'line' }],
  }}
  data={data}
/>
```

## Cursor-synced legend table

```tsx
import { Chart, LegendTable } from 'snaplot';
import 'snaplot/legend-table.css';

const [chart, setChart] = createSignal<ChartInstance>();

<Chart config={config} data={data} onReady={setChart} />
<LegendTable chart={chart} />
```

For cross-chart dashboards, wrap the configs with a group handle — cursor and series highlight propagate across every chart automatically:

```tsx
import { createChartGroup } from 'snaplot';

const group = createChartGroup();

<Chart config={group.apply(configA)} data={a} onReady={setChartA} />
<Chart config={group.apply(configB)} data={b} onReady={setChartB} />
<LegendTable chart={chartA} />

// External sidepanel hover → highlight everywhere:
<button
  onMouseEnter={() => group.highlight(2)}
  onMouseLeave={() => group.highlight(null)}
>Run #2</button>
```

See the [Legend Table](https://liamclarkza.github.io/snaplot/#/docs#legend-table), [Cross-chart Sync](https://liamclarkza.github.io/snaplot/#/docs#cross-chart-sync), and [Cursor Snapshot](https://liamclarkza.github.io/snaplot/#/docs#cursor-snapshot) docs for the full feature set.

## Development

```bash
npm install          # install all workspaces
npm run build        # build the library
npm run dev          # run the docs site dev server
npm run build:site   # build the static docs site
npm run preview      # build everything + preview the site
```

## License

MIT
