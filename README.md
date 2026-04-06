# snaplot

High-performance canvas chart library for SolidJS.

**[Documentation](https://liamclarkza.github.io/snaplot/#/docs)**

## Features

- **5 chart types** — line, area, scatter, bar, histogram
- **Canvas performance** — 100K+ points at interactive frame rates, 60fps streaming
- **Zero dependencies** — under 25KB gzipped, just snaplot + solid-js
- **Interactive** — drag-to-zoom, pinch, proximity tooltips, cross-chart cursor sync
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
    scales: { x: { type: 'time' }, y: { type: 'linear' } },
    series: [{ label: 'CPU %', dataIndex: 1, type: 'line' }],
  }}
  data={data}
/>
```

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
