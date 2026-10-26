# Architecture

A one-page map of `packages/snaplot/src` after the engine split (M9a moved the code, M9b refactored it
and fixed the contracts the parallel W5 tracks build on). The target layout is plan §3.1
([`docs/overhaul-plan.md`](overhaul-plan.md)); M15b writes the final version of this page.

Line counts are physical, non-test lines (`node scripts/overhaul/metrics.mjs`): 23,057 in 91 files at
M9b. The engine's largest file is `engine/Engine.ts` at 746; the package's largest are the
integrator-owned `public/chart.ts` (1,191), `engine/spec.ts` (1,152) and `public/ingest.ts` (1,073),
which `check-architecture` freezes at their length until they are split.

## Packages and entries

| Package | What it is |
|---|---|
| `packages/snaplot` | the library (the only published package) |
| `bench` | the same-machine performance harness (Playwright + Vite); private workspace |
| `site` | the docs site (Astro + Starlight) and its examples; private workspace |

| Entry (`package.json#exports`) | Source | Runtime exports |
|---|---|---:|
| `snaplot` | `index.ts` | 4 (`createChart`, `createChartGroup`, `createLegendTable`, `histogram`) |
| `snaplot/react` | `react.ts` (`'use client'`) | 6 |
| `snaplot/solid` | `solid.ts` (+ an SSR build `solid.server.js`) | 6 |

## Layers

```
 vanilla / React / Solid callers
          │  ChartOptions (rows or columns, field names or accessors)
          ▼
 public/         the only public contract: types, normalize (options → Spec, the one validation
                 layer), ingest (data → sources), chart.ts (the createChart handle and its diff
                 classifier), state.ts (cold store, hot cursor channel), groups, histogram(),
                 the interim legends (legend.ts, replaced by dom/ in M12b)
 adapters/ react/ solid/   thin adapters over adapters/bind.ts; they import only 'snaplot' (P3)
          │  ChartSpec + ColumnarData[] (engine/spec.ts)
          ▼
 engine/         ChartCore (Engine.ts), the composition root, and one module per concern
 dom/            what the engine puts in the page outside its root: the tooltip, the styles
```

## Engine modules

Every module is a set of functions of the engine, `fn(engine: ChartCore, …)`; `ChartCore` owns the state
and the parts that hold DOM or timers, and keeps one-line delegates for the methods the public layer and
the tests call. The **W5** column is the track that owns the file from M9b's merge (plan §12 M10–M12b);
"—" is integrator or shared.

| Module | Lines | Responsibility | W5 |
|---|---:|---|---|
| `Engine.ts` | 746 | composition root: stores, scales, layout, theme, cursor and viewport state; construction, options lifecycle, the three-layer paint | wiring hunks only |
| `spec.ts` | 1,152 | the resolved Spec and Source types (public field names) | integrator |
| `sources.ts` | 171 | one store per source (ring stores when streaming), replacement and appends | — |
| `events.ts` | 43 | `EngineEvents`: the outward events to the public layer, isolated handlers | — |
| `format.ts` | 310 | **contract**: every tick label, readout and X readout | M10 |
| `ranging.ts` | 669 | the domain policy (§5.1): auto-range per axis, bar X plan, range indexes, `initAxes` | M10 |
| `layout.ts` | 469 | measured gutters, reserved chrome, plot rect, `setPlotInsets`, the layout cache | M10 |
| `axes/ticks.ts`, `render.ts`, `labels.ts` | 119 / 371 / 146 | tick values, grid and tick marks, the **`LabelBox[]`** layout and pooled DOM labels | M10 |
| `annotations.ts` | 245 | reference lines and regions on the plugin context | M10 |
| `scales/` | 767 | linear, log, time, nice numbers, affine fast path | M10 |
| `marks/index.ts` | 384 | **the mark registry** (the only `series.type` lookup), the series pass, legend items | M11 |
| `marks/<type>/draw.ts` | 123–714 | each mark's draw half: traits, extent columns, legend fill, drawing | M11 |
| `marks/<type>/hit.ts` | 11–118 | each mark's hit half: slot rows, click span, hover indicator | M12a |
| `marks/columns.ts`, `bar/geometry.ts`, `scatter/encoding.ts` | 54 / 76 / 473 | leaf helpers both halves share (value columns, slot geometry, scatter encodings and resolvers) | M11 (M12a reads) |
| `theme/resolve.ts`, `theme/color.ts` | 456 / 146 | theme resolution; **`parseColor` → RGBA** | M11 |
| `render/surface.ts` | 246 | canvases, DPR, ResizeObserver, **`reserveChrome`** | M11 |
| `render/scheduler.ts` | 108 | rAF dirty-flag scheduler, `nextFrame`, `watchTheme` | M11 |
| `render/crisp.ts` | 15 | **contract**: snapping for every 1 px stroke | M11 |
| `render/overlay.ts` | 343 | the overlay pass: crosshair, indicators (through the marks), tooltip, brush, box, tap ring | M12a |
| `hit.ts` | 683 | the hit pipeline: HitTester, slot-mark rows, clicks; the `MarkHit` contract | M12a |
| `cursor.ts` | 407 | the hover model and the cursor snapshot (one path) | M12a |
| `viewport.ts`, `selection.ts`, `highlight.ts` | 582 / 202 / 68 | pinned axes, follow, zoom and pan, bounds; the brush; series highlight | M12a |
| `interaction/gestures.ts` | 828 | pointer, touch and wheel → bus actions (state types in `gesture-state.ts`, momentum in `momentum.ts`) | M12a |
| `interaction/keyboard.ts` | 99 | the key → action table | M12a |
| `interaction/actions.ts` | 273 | `ACTIONS`: what each bus action does, registered by `wireEvents` | M12a |
| `interaction/bus.ts`, `modes.ts` | 64 / 49 | the gesture bus; the `mode` presets | M12a |
| `data/` | 1,144 | `ColumnarStore`, `RingColumnarStore`, binary search, range index, M4 | M11 (`m4.ts`) |
| `debug.ts`, `plugins.ts`, `merge.ts`, `defaults.ts`, `errors.ts` | 141 / 150 / 67 / 34 / 86 | D31 counters; plugin host; deep merge; engine defaults; `SnaplotError` | — |
| `dom/tooltip.ts` | 304 | the tooltip element and its default rows | M12a |
| `dom/styles.ts` | 56 | **contract**: `adoptStyles` | M12b |

## The mark registry

`marks/index.ts` holds one `Mark` per `ChartType` (`line`, `area`, `band`, `scatter`, `bar`,
`histogram`); `markOf(series)` returns it (a series without `type` is a line) and `xColumnOf(series)`
the store column of its X. Engine modules ask the registry and its traits, never `series.type`:

- `MarkDraw` (declared in `marks/index.ts`, implemented in `<type>/draw.ts`): `x` (`'continuous'`,
  `'slot'` for bars, `'bin'` for histograms), `zeroBased`, `cloud` (scatter: own X column, padded X,
  in view by X and Y, nearest-point tooltip, box selection), `interaction` (`'decimate'` M4 for lines
  and areas, `'sample'` for scatter), `xColumn(series)`, `extentColumns(series)` (a band's bounds),
  `legendFill(color)` and `draw(pass: SeriesPass)`.
- `MarkHit` (declared in `hit.ts`, implemented in `<type>/hit.ts`): `tooltipRank` (0: the shared
  HitTester; bars 1, histograms 2: the highest visible rank leads the tooltip), `slotPoint`,
  `slotSpan` (a click inside a bar or bin) and `indicator(pass: IndicatorPass)`.

**Import rule.** The mark folders import only *types* from `marks/index.ts` and `hit.ts`; their shared
values come from leaf modules (`marks/columns.ts`, `bar/geometry.ts`, `scatter/encoding.ts`,
`format.ts`). So the registry is built whichever half loads first (`marks/index.test.ts` imports
each one first).

## Input

`GestureManager` (pointer, touch, wheel) and the key table turn input into actions on the gesture bus
(`interaction/bus.ts`: cursor, cursor-leave, pan, zoom, box start/update/end, reset, tap). `ACTIONS`
(`interaction/actions.ts`) maps each action to the engine modules; each emit is one user action for the
public layer (plan D3).

## The W5 contracts (plan §3.2)

Created by M9b over the behaviour of the time, so no pixel changed. From M9b's merge they change only
through an integrator-request commit (plan §12.0); the owning track implements behind the signature.

| Contract | Signature | Today | Owner; callers |
|---|---|---|---|
| `engine/format.ts` | `formatTick(ctx, axis, value, kind?)`, `formatReadout(ctx, series, value, quirks?)`, `formatX(ctx, value, axis = 'x', quirks?)`, `formatBinRange(ctx, min, max, series = 0)`; `axisReadout(ctx, axis, value)`; `ctx: FormatContext` = `{ config, scales }` (the engine) | ticks: the axis `format`, else the scale's (`'slot'` ticks: integers as is, else one decimal); readouts: `tooltip.yFormat` (the series formats), else the axis `format`, else value precision (P9); `FormatQuirks` (`NO_AXIS_FORMAT`, `NO_TOOLTIP_FORMAT`, `NO_FORMAT`) reproduce each call site's current mix | M10 implements §5.2 and ignores the quirks; axes, layout, hit, cursor and the slot marks call it |
| `engine/axes/labels.ts` | `LabelBox { axis, kind: 'tick' \| 'title', text, x, y, anchor }`; a paint's `AxesRenderResult.labels: LabelBox[]` | anchor points in CSS px, in paint order (axis by axis, ticks then title) | M10 extends it (the measured box); the debug hook's `labelBoxes()` returns copies |
| `engine/render/surface.ts` | `CanvasManager.reserveChrome(side: 'top' \| 'bottom', px): boolean`, `reservedChrome(side)`; `ChartCore.reserveChrome(side, px)` relayouts and repaints on a change | nothing reserves yet; `layout.ts` lays the axes and plot out between the strips (`computeLayout`'s `chrome`, the layout cache key) | M12b's legend calls it, M10's layout reads it, M11 owns the surface |
| `engine/render/crisp.ts` | `crisp(value, dpr): number` | `Math.round(value)`, plus 0.5 at DPR 1 | M11 (device-pixel centres at every DPR); grid, tick marks, frame, crosshair, box and brush edges call it |
| `engine/theme/color.ts` | `parseColor(css): RGBA \| null`, `RGBA { r, g, b, a }` (0–255, alpha 0–1); `isDarkColor`, `withAlpha`, `opaqueColorOnBackground` | hex 3/4/6/8, `rgb()`/`rgba()`, a few names; alpha from `#rgba`, `#rrggbbaa`, `rgba()`, `/ a`, `transparent` | M11 makes it the only parser (arch-02) |
| `dom/styles.ts` | `adoptStyles(root: Document \| ShadowRoot, id, css)`, `styleRootOf(node)` | one `<style data-snaplot-styles>` per root, each id's block once, recreated if removed | M12b (adopted stylesheets, `:where()`); the tooltip and the interim legend call it |
| the mark halves | `marks/<type>/draw.ts` (`MarkDraw`), `marks/<type>/hit.ts` (`MarkHit`) | above | M11 and M12a |

## Data flow at a glance

1. `createChart(el, options)`: `normalize` turns the options into a Spec, `ingest` the data into
   sources, and `public/chart.ts` builds `ChartCore`, which mounts three canvases (grid, data, overlay),
   the DOM label layer and the input layer.
2. `update(patch)` and `setOptions(full)` go through the diff classifier (`public/classify.ts`, D16):
   only a data change re-ingests (`ChartCore.replaceSources`); layout and paint changes reach the
   engine's options without reading data. `appendData` goes to the stores (`sources.ts`
   `appendToSource`).
3. Rendering is dirty-flag driven per layer on one rAF per chart (`render/scheduler.ts`). The grid pass
   lays out the axes (`axes/*`), the data pass draws every series through its mark (`marks/index.ts`),
   the overlay pass draws the cursor state (`render/overlay.ts`).
4. Gestures become bus actions and `ACTIONS` applies them. The engine's events (`events.ts`) reach
   the public dispatcher (`public/state.ts`), which delivers them after each commit and notifies the
   cold state at most once per frame; the cursor is the hot channel.

## Hot paths that must stay fast

Viewport culling (`data/`, the series pass), the ring stores' physical segments, layered canvases and
dirty flags, M4 during gestures (`marks/index.ts`), scatter interaction sampling, the density cache
(`marks/scatter/draw.ts`), the lazy range index (`ranging.ts`), the affine fast path, binary-search and
grid hit testing (`hit.ts`), the layout and label caches and the DOM label pool (`layout.ts`,
`axes/labels.ts`), and the readout step cache (`format.ts`). Plan §3.4 lists each with its guard and bench
scenario.

## Rules the checks enforce

`node scripts/check-architecture.mjs`: P2 (formatting only in `engine/format.ts`, colour parsing only in
`engine/theme/color.ts`, frame and observer APIs only in `render/surface.ts` and `render/scheduler.ts`,
`throw` only in `public/` and `engine/errors.ts`, series-type branches only in `marks/index.ts`; warn
mode until M14), P3 (adapters import only `'snaplot'`; error mode) and the size cap (900 lines, error
mode; the three integrator-owned files above frozen at their length).
