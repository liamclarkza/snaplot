# snaplot

A canvas chart library built for streaming data and interactive dashboards.

[Documentation](https://liamclarkza.github.io/snaplot/#/docs) · [Live demos](https://liamclarkza.github.io/snaplot/#/demos) · [npm](https://www.npmjs.com/package/snaplot)

snaplot renders line, area, scatter, bar, histogram, and band charts from columnar Float64Arrays. It handles 200,000+ points at 60 fps through a layered canvas pipeline, binary-search viewport culling, and ring-buffer streaming updates. The library never mutates your input arrays.

Current bindings ship a SolidJS component and reactive primitives. The core (`ChartCore`) is framework-free and can be driven from any runtime.

## Install

```bash
npm install snaplot
```

Requires `solid-js ^1.9.0`.

## Quick start

```tsx
import { Chart } from 'snaplot';
import type { ColumnarData } from 'snaplot';

const data: ColumnarData = [
  new Float64Array(timestamps), // X values, sorted
  new Float64Array(cpu),        // Y series 1
  new Float64Array(memory),     // Y series 2
];

<Chart
  config={{
    axes: { x: { type: 'time' }, y: { type: 'linear' } },
    series: [
      { label: 'CPU',    dataIndex: 1, type: 'line' },
      { label: 'Memory', dataIndex: 2, type: 'area' },
    ],
  }}
  data={data}
/>
```

Column 0 is always X. Columns 1+ are Y series referenced by `dataIndex`. This columnar layout is what makes binary-search viewport culling and low-allocation streaming possible.

Full API reference and runnable examples are in the [documentation](https://liamclarkza.github.io/snaplot/#/docs).

## Features

### Chart types

Line (linear, monotone, stepped interpolation), area with gradient fill, scatter that switches to a density heatmap past 200K points, grouped bar, histogram via the included `histogram()` utility (Freedman-Diaconis, Sturges, Scott), and band (fill between upper and lower series).

### Interactions

Drag-to-zoom, wheel and pinch zoom at the cursor, pan on shift-drag or axis gutters, double-click reset, proximity tooltips in three modes (`index`, `nearest`, `x`), keyboard pan and zoom, and full touch gesture support.

### Streaming

`setData` replaces the current window. `appendData` extends it, and `config.streaming.maxLen` enables fixed-window ring-buffer retention. Both update at 60 fps on realistic dashboard datasets.

### Cursor-synced legend table

A table that shows the value of every visible series at the cursor position. Available as a DOM plugin (`createLegendTablePlugin`) or a SolidJS component (`LegendTable`) with typed column helpers (`nameColumn`, `valueColumn`, `metricColumn`, `swatchColumn`).

### Cross-chart sync

`createChartGroup()` keeps cursor and highlight state in sync across any number of charts. External controls can drive the highlight too, for UIs like sidebars or experiment lists.

### Themes

Built-in themes include `lightTheme`, `darkTheme`, `studioTheme`, `tokyoTheme`, `oceanTheme`, `forestTheme`, `violetTheme`, `fogTheme`, `ivoryTheme`, `mintTheme`, `sunsetTheme`, `midnightTheme`, `marsTheme`, and `refinedDarkTheme`. Themes support role-aware palettes: `palette` remains the fallback series cycle, `categoricalPalette` drives unordered series, and `sequentialPalette`/`heatmapGradient` drive density heatmaps. CSS variable overrides and full custom `ThemeConfig` objects are supported.

### Plugins

Simple lifecycle hooks: `install`, `destroy`, `before`/`after` each canvas layer, `onCursorMove`, `onZoom`, `onClick`, `onSetData`, `onSetOptions`. The built-in legend, legend-table, and reference-line plugins use the same surface, and custom plugins can register at construction or via `chart.use(plugin)`.

### TypeScript

Strict types throughout, generic column helpers, no `any` in the public API.

## Performance notes

- 200K+ point charts render well under one frame on a modern laptop.
- Grid, data, and overlay are separate canvases. A cursor move repaints the overlay only. A data update skips the grid layer.
- Viewport culling is a binary search on the X column, so off-screen points cost nothing.
- snaplot never mutates input arrays. Downsampling helpers (`lttb`, `m4`) are exported as opt-in utilities.
- Legend table updates use `textContent` swaps in the cursor hot path, not `innerHTML` rebuilds.

## Development

```bash
npm install          # installs all workspaces plus git hooks
npm run dev          # docs site dev server with live HMR against the library
npm run build        # library production build
npm run build:site   # docs site production build
npm test             # vitest
npm run check        # biome lint + format check
npm run typecheck    # tsc --noEmit
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow, conventions, and release process.

## License

MIT
