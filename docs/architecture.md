# Architecture

A one-page map of `packages/snaplot/src`. It describes the code **as it is at `overhaul-baseline`**
(6237289, the start of the 1.0 overhaul). M9b replaces this page with the end-state map once the engine split
lands; the target layout is plan §3.1 ([`docs/overhaul-plan.md`](overhaul-plan.md)).

Line counts are physical, non-test lines from `node scripts/overhaul/metrics.mjs` at the baseline (17,779 in
68 files; the largest file is `core/Chart.ts` at 4,077).

## Packages and entries

| Package | What it is |
|---|---|
| `packages/snaplot` | the library (the only published package) |
| `bench` | the same-machine performance harness (Playwright + Vite); private workspace |

| Entry (`package.json#exports`) | Source | Runtime exports |
|---|---|---:|
| `snaplot` | `index.ts` (`export * from './core'`) | 35 |
| `snaplot/core` | `core.ts` (identical to `snaplot`; removed by D13) | 35 |
| `snaplot/react` | `react.ts` | 12 |
| `snaplot/solid` | `solid.ts` (+ an SSR build `solid.server.js`) | 13 |
| `snaplot/legend-table.css` | `styles/legendTable.css` (removed by D8) | — |

## Layers

```
 vanilla / React / Solid callers
          │  ChartOptions (rows or columns, field names or accessors)
          ▼
 api/            public layer: types, prepare (options → engine config), Controller (the handle),
                 groups, controlled state, plugin bridge, vanilla legends
 react/ solid/   framework components and hooks over the Controller
          │  ChartConfig + ColumnarData[]
          ▼
 core/Chart.ts   ChartCore: the engine (stores, ranging, ticks, viewport, selection, cursor, hit,
                 highlight, theme, layout, render pipeline, events)
   ├─ data/          columnar and ring stores, binary search, range index, M4 / LTTB
   ├─ scales/        linear, log, time, nice numbers, affine fast path
   ├─ renderers/     axes, line/area/band, scatter (+ encoding, density), bar, histogram, overlay
   ├─ interaction/   gestures (pointer, touch, wheel, keyboard), hit tester, DOM tooltip
   ├─ core/          canvases, layout, rAF scheduler, event bus, config validation
   ├─ config/        theme resolution, defaults, deep merge
   └─ plugins/       plugin host; reference lines and regions (plus dead legend/tooltip plugins)
```

## Modules

| Module | Lines | Responsibility | Overhaul fate |
|---|---:|---|---|
| `api/types.ts` | 231 | public types, as `Omit<Engine…>` plus renames | → `public/types.ts` (M7) |
| `api/prepare.ts` | 437 | rows, columns and bins → engine config and stores; categories; encodings; validation | → `public/normalize.ts` + `ingest.ts` (M7) |
| `api/createChart.ts` | 705 | `Controller` (the handle), groups, controlled state, identity tracking, plugin bridge | → `public/chart.ts`, `state.ts`, `group.ts` (M8) |
| `api/options.ts` | 38 | option equality and patching | → the diff classifier (M8) |
| `api/legend.ts` | 386 | vanilla legend and legend-table plugins, column helpers | → `dom/legend.ts`, `dom/legendTable.ts` (M8, M12b) |
| `react/*` | 221 | `<Chart>`, hooks, legends, shared prop handling | → thin adapter over `adapters/bind.ts` (M13) |
| `solid/*` | 193 | `<Chart>`, primitives, legends, columns | → thin adapter (M13) |
| `core/Chart.ts` | 4,077 | `ChartCore`, the engine; everything not listed below | split into `engine/**` (M9a moves, M9b refactors) |
| `types.ts` | 1,456 | engine types, including the removed `ChartInstance` surface | → `engine/spec.ts` (M7–M9b) |
| `constants.ts` | 664 | 14 theme objects, palettes, tuning constants | themes deleted (D9); → `engine/theme/palettes.ts` |
| `core/validateConfig.ts` | 168 | engine-side validation, duplicating `prepare.ts` | deleted (M7) |
| `core/EventBus.ts` | 142 | gesture → engine action bus; unreachable global `SyncGroup` | sync path deleted (M2) |
| `core/Layout.ts`, `CanvasManager.ts`, `RenderScheduler.ts` | 243 / 192 / 55 | layout, layered canvases, rAF dirty-flag scheduler | → `engine/layout.ts`, `engine/render/*` |
| `config/*` | 544 | theme resolution (CSS variables, oklch), defaults, deep merge | → `engine/theme/*` (M11) |
| `data/*` | 1,248 | `ColumnarStore`, `RingColumnarStore`, binary search, `columnRangeIndex`, M4, LTTB | kept (perf-critical) → `engine/data/` |
| `scales/*` | 767 | linear, log, time, nice numbers, affine | kept → `engine/scales/` |
| `interaction/*` | 1,740 | `GestureManager`, `HitTester`, `TooltipManager` | → `engine/interaction/`, `engine/hit.ts`, `dom/tooltip.ts` (M12a) |
| `renderers/*` | 2,815 | axes and every mark type, overlay, scatter encoding | → `engine/axes/*`, `engine/marks/*` (M9b–M11) |
| `plugins/*` | 1,107 | `PluginManager`; reference lines and regions; 802 dead lines of legend, tooltip and crosshair plugins | dead files deleted (M2); host → `engine/plugins.ts` (D21) |
| `utils/*` | 295 | colour helpers, `histogram()`, reduced-motion | colour → `engine/theme/color.ts`; `histogram` → `public/` |
| `styles/legendTable.css` | 238 | legend and legend-table CSS | injected styles (D8) |

## Data flow at a glance

1. `createChart(el, options)` builds a `Controller`. `prepareChart` turns rows or columns into an engine
   `ChartConfig` plus column stores; `ChartCore` mounts three canvases (grid, data, overlay) and DOM labels.
2. `update(patch)` re-runs `prepareChart` and replaces the sources (every option change re-ingests at the
   baseline: arch-03, dataapi-10). `appendData` goes to the ring stores.
3. Rendering is dirty-flag driven per layer on one rAF per chart; pan and zoom cull by binary search and
   decimate with M4 while a gesture is active.
4. Gestures become semantic actions on the event bus; the `Controller` mirrors engine state into
   `getState()`, `subscribe` and `on(event)`.

## Hot paths that must stay fast

Viewport culling, the ring stores' physical segments, layered canvases, M4 during gestures, scatter
interaction sampling, the density cache, the lazy range index, the affine fast path, binary-search hit
testing, the label caches and the DOM label pool. Plan §3.4 lists each with its guard and bench scenario.
