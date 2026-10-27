# Architecture

A one-page map of `packages/snaplot/src`. The design decisions behind it are in
[ADR 0002](decisions/0002-overhaul.md) and the plan ([`overhaul-plan.md`](overhaul-plan.md));
`node scripts/overhaul/metrics.mjs` measures the tree, and `node scripts/check-architecture.mjs` enforces the rules at
the end of this page.

## Packages and entries

| Package | What it is |
|---|---|
| `packages/snaplot` | the library (the only published package) |
| `bench` | the same-machine performance harness (Playwright + Vite); private workspace |
| `site` | the docs site (Astro + Starlight) and its examples; private workspace |

| Entry (`package.json#exports`) | Source | Runtime exports |
|---|---|---|
| `snaplot` | `index.ts` | `createChart`, `createChartGroup`, `createLegendTable`, `histogram` |
| `snaplot/react` | `react.ts` (`'use client'`) | `Chart`, `LegendTable`, `useChartState`, `useCursor`, `createChartGroup`, `histogram` |
| `snaplot/solid` | `solid.ts` (+ an SSR build) | `Chart`, `LegendTable`, `createChartState`, `createCursor`, `createChartGroup`, `histogram` |

## Layers

```
 vanilla / React / Solid callers
          │  ChartOptions (rows or columns, field names or accessors)
          ▼
 public/         the public contract: types.ts and handle-types.ts (written by hand), normalize
                 (options → normalized options: the one validation layer), ingest (data → sources),
                 describe (options → the engine spec), classify (what an update changes), chart.ts
                 (the handle) with points, axes, append and churn, state.ts (the dispatcher),
                 group.ts, legend.ts (the built-in legend and createLegendTable), histogram()
 adapters/ react/ solid/   thin components over adapters/bind.ts; they import only 'snaplot'
          │  ChartSpec + ColumnarData[] (engine/spec.ts, engine/spec-interaction.ts)
          ▼
 engine/         ChartCore (Engine.ts), the composition root, and one module per concern
 dom/            what the engine puts in the page outside its root: the tooltip and the styles
```

## Engine modules

Every module is a set of functions of the engine, `fn(engine: ChartCore, …)`; `ChartCore` owns the state
and the parts that hold DOM or timers.

| Module | Responsibility |
|---|---|
| `spec.ts`, `spec-interaction.ts` | the resolved spec and source types; the interaction and readout types |
| `format.ts` | every tick label, readout and X readout; the cached `Intl` formatters |
| `ranging.ts` | the domain policy: auto-range per axis, the bar X plan, range indexes |
| `layout.ts` | measured gutters (`measureLabel`), reserved chrome, the plot rect, the layout cache |
| `axes/ticks.ts`, `render.ts`, `labels.ts` | tick values and the measured fit pass, grid and tick marks, the `LabelBox[]` layout and pooled DOM labels |
| `annotations.ts` | reference lines and regions, on the plugin contract |
| `scales/` | linear, log and time scales, nice numbers, the affine fast path |
| `marks/index.ts` | the mark registry (the only `series.type` lookup), the series pass and its gesture sampling, legend items |
| `marks/<type>/draw.ts`, `hit.ts` | each mark's draw half and hit half |
| `theme/resolve.ts`, `theme/color.ts` | theme resolution from the page; `parseColor` (any paintable CSS colour) |
| `render/surface.ts` | canvases at whole device pixels, DPR, ResizeObserver, `reserveChrome`, the focusable root, the live region |
| `render/scheduler.ts` | the per-chart frame scheduler, `nextFrame`, the shared theme, visibility, print and reduced-motion watchers |
| `render/crisp.ts` | device-pixel snapping for every 1 px stroke |
| `render/overlay.ts` | the overlay pass: crosshair, indicators, brush, box, tap ring |
| `hit.ts` | the hit pipeline: index rows, nearest points through a grid of the visible points, slot rows, clicks |
| `cursor.ts` | the hover model (recomputed under a still pointer), the keyboard cursor, the cursor snapshot |
| `viewport.ts`, `selection.ts`, `highlight.ts` | pinned axes, follow, zoom and pan with the one minimum span, bounds; the brush and its points; series highlight |
| `interaction/gestures.ts`, `keyboard.ts`, `actions.ts`, `bus.ts`, `momentum.ts` | pointer, touch and wheel input; the key table; what each bus action does; touch momentum |
| `data/` | `ColumnarStore`, `RingColumnarStore`, binary search, the range index, M4 |
| `debug.ts`, `plugins.ts`, `merge.ts`, `defaults.ts`, `errors.ts`, `events.ts`, `sources.ts` | debug counters; the plugin host; deep merge; defaults; `fail` and `warnOnce`; engine events; source stores |
| `dom/tooltip.ts`, `dom/styles.ts` | the tooltip element (portalled into dialogs and fullscreen); `adoptStyles` |

## The mark registry

`marks/index.ts` holds one `Mark` per series type (`line`, `area`, `band`, `scatter`, `bar`, `histogram`);
`markOf(series)` returns it (a series without `type` is a line) and `xColumnOf(series)` the store column
of its X. Engine modules ask the registry and its traits, never `series.type`:

- `MarkDraw` (`<type>/draw.ts`): `x` (`'continuous'`, `'slot'` for bars, `'bin'` for histograms),
  `zeroBased`, `cloud` (scatter: own X column, nearest-point tooltip, box selection), `interaction`
  (`'decimate'` M4 for lines and areas, `'sample'` for scatter), `xColumn`, `extentColumns`, `legendFill`
  and `draw`.
- `MarkHit` (`<type>/hit.ts`): `tooltipRank` (0: the shared hit tester; bars 1, histograms 2: the
  highest visible rank leads the tooltip and the other marks join it), `slotPoint`, `slotSpan` and
  `indicator`.

The mark folders import only *types* from `marks/index.ts` and `hit.ts`; their shared values come from
leaf modules (`marks/columns.ts`, `bar/geometry.ts`, `scatter/encoding.ts`, `format.ts`).

## Data flow at a glance

1. `createChart(el, options)`: `normalize` checks the options, `ingest` reads the data into sources,
   `describe` writes the engine spec, and `public/chart.ts` builds `ChartCore`, which mounts three
   canvases (grid, data, overlay), the DOM label layer, the input layer and the live region.
2. `update(patch)` and `setOptions(full)` go through `public/classify.ts`: only a data change reads the
   data again; layout and paint changes reach the engine's options without it. `appendData` goes to the
   stores (`public/append.ts`, then `sources.ts`).
3. Rendering is dirty-flag driven per layer on one frame per chart (`render/scheduler.ts`), and waits
   while the chart is offscreen. The grid pass lays out the axes, the data pass draws every series
   through its mark, the overlay pass draws the cursor state.
4. Input becomes bus actions and `ACTIONS` applies them. Engine events reach the public dispatcher
   (`public/state.ts`), which delivers them after each commit and notifies `subscribe` at most once per
   frame; the cursor is the hot channel.

## Hot paths that must stay fast

Viewport culling and the ring stores' physical segments; layered canvases and dirty flags; M4 per
device column (one closure-free pass); scatter sampling by in-view share; the density cache; the lazy
range index; the affine fast path; binary-search and grid hit testing over the visible range; the
layout and label caches and the DOM label pool; the cached `Intl` formatters. `test/perf-guards.test.ts`
guards each, and `npm run bench:ab` measures them (ADR 0002 §6).

## Rules the checks enforce

`node scripts/check-architecture.mjs`, all in error mode:

- **P2, one implementation per concept:** formatting only in `engine/format.ts`; colour parsing only in
  `engine/theme/color.ts`; frames and observers only in `render/surface.ts` and `render/scheduler.ts`;
  `throw` only through `fail()` (`engine/errors.ts`) or in `public/`; series-type branches only in
  `engine/marks/index.ts` and the public option schema (`normalize`, `ingest`, `describe`, `append`).
- **P3:** the adapters import only `'snaplot'`, their own modules and `adapters/bind.ts`.
- **Size:** no source file over 900 lines.
