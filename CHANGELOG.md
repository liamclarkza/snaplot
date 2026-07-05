# Changelog

All notable changes to snaplot are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project adheres
to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Added `series.spanGaps` to bridge NaN gaps in line and area series
  instead of breaking the path.
- Added `AxisConfig.label` axis titles: rendered below bottom axes and
  rotated alongside left/right axes, with gutter space reserved
  automatically.
- Added `appendData(data, { updateLast: true })` so streaming ticks can
  correct an in-progress tail row (live epoch aggregates, forming
  buckets) without a full-window reallocation. `ColumnarStore` and the
  ring store expose the underlying `replaceLast()`.
- Added `highlight.proximity`: auto-highlight the series nearest the
  cursor within a pixel threshold, propagated through highlight sync.
- Added `chart.getTheme()` returning the resolved theme so plugins can
  color against the same palette the canvas uses.
- Added a benchmark workspace (`bench/`) with scripted pan/zoom sweeps,
  gesture scenarios, and a CPU-throttled mobile profile, plus a tracked
  baseline and comparison script for regression checks.
- Added development-mode config validation that runs on construction,
  `setData`, `setOptions`, and `replaceOptions`. It throws a `TypeError`
  naming the offending series and the valid range for out-of-range
  column indices (dataIndex, yDataIndex, xDataIndex, upper/lowerDataIndex,
  colorBy, sizeBy, tooltipFields), a band series missing a bound, or an
  unknown series type, and warns for an unknown axis key, an invalid
  tooltip mode, or a non-positive highlight proximity. Compiled out of
  production bundles.

### Changed
- Added an interaction pass for large scatter series: while the viewport
  is actively changing, series above the
  `performance.interactionSampling` point budget (default 10000) are
  stride-sampled, then repainted at full fidelity as soon as the gesture
  settles. Hit-testing and tooltips always use the full data. Set
  `performance: { interactionSampling: false }` to opt out.
- Viewport changes that clamp to the current range (panning at the data
  edge, zooming out at full extent) no longer repaint or publish sync;
  they are recognized as no-ops.
- Pan and zoom no longer rescan visible data for vertical auto-range on
  every frame: range queries run against block-aggregate indexes built
  once per data change. Scatter series with a custom `xDataIndex` use a
  sorted-permutation index instead of a full-store scan per frame.
- Scatter `colorBy`/`sizeBy` domains now derive from the full column
  rather than the visible viewport, so a point keeps its color and size
  while panning and zooming. Explicit `domain` overrides are unchanged.
- Tick-label measurement moved from hidden-span `offsetWidth` reads to
  canvas `measureText`, removing forced DOM reflows from the render
  path. Axis gutters are quantized to 8px steps so tick-label width
  jitter during a gesture no longer shifts the plot rect every frame.
- Axis tick labels reuse pooled DOM nodes instead of rebuilding every
  span on each grid repaint.
- Data updates now skip the grid layer when auto-range leaves every
  scale unchanged (pinned axes, zoomed streaming), honoring the
  documented layered-repaint contract.
- Scatter points outside the plot area are skipped before `drawImage`,
  which bounds off-viewport cost for arbitrary `xDataIndex` series.
- Gridlines now render as solid 1px hairlines instead of 0.5px dashes:
  the dash pattern slid along each line during a pan and made the grid
  shimmer, and a half-pixel stroke read as a blurry grey. The solid
  hairline is drawn well below the theme's grid opacity so the grid
  still recedes beneath the plot frame.
- The default tooltip tightens its padding, line height, and corner
  radius, caps long series lists at twelve rows with a "+N more" row,
  and ellipsizes labels wider than the tooltip instead of overflowing.
- Reduced motion is honored: with `prefers-reduced-motion: reduce` the
  tap-feedback ring no longer expands (it fades in place) and the
  tooltip appears without an opacity transition.

### Fixed
- The plot frame is now crisp on all four edges at dpr 1: the right and
  bottom strokes were laid at an unrounded, often fractional, plot
  width/height and blurred while the top and left stayed sharp.
- The drag selection box snaps to the pixel grid for a crisp outline and
  uses a mid-blue accent that reads on both light and dark themes.
- The scatter heatmap bitmap cache is now owned per chart series instead
  of one module-level slot: two density charts on a page (or two density
  series in one chart) no longer invalidate each other every frame, and
  repeated repaints at an unchanged viewport reuse the cached bitmap.
- The scatter hit-test grid keeps one cache slot per series, so charts
  with several scatter series no longer rebuild the full grid on every
  pointer move.
- Variable-style scatter (colorBy/sizeBy) no longer allocates a string
  cache key and re-parses the color ramp for every point on every frame.
- Monotone interpolation no longer breaks the curve at ring-buffer
  segment boundaries.
- Scatter stamps are rasterized and blitted at the same quantized
  radius, removing sub-pixel scaling blur on non-integer point radii.
- Axis gutter width is measured with the axis's custom `tickFormat`
  when one is set, instead of the scale's default formatting.
- `m4()` no longer drops the point just left of the viewport: low
  buckets are clamped into bucket 0, so downsampled slices keep
  left-edge line continuity symmetric with the right edge.
- Linear axes no longer render an empty tick set when a low tick count
  meets a narrow zoomed domain; the axis falls back to an even
  subdivision with at least two ticks.
- Linear axis labels now take their decimal precision from the tick
  spacing actually requested, so a high tick count on a small domain no
  longer rounds neighbouring fractional ticks to the same integer.
- Reversed axis domains (`max < min`) produce finite ticks instead of
  `NaN`.
- Time axes render a correct sub-second label for pre-1970 timestamps
  instead of a negative fractional suffix.
- An OS-cancelled touch (palm rejection, notification shade, browser
  gesture take-over) or a lost pointer capture now resets the gesture
  state instead of stranding the pointer, so the next single-finger
  touch is no longer misread as a pinch.
- A mode flip to `readonly` mid-gesture no longer strands the crosshair
  and tooltip: the gesture resets on pointerup and leaving the chart
  dismisses them.
- Axis wheel zoom now anchors on the axis under the pointer rather than
  the gesture-start axis, so scrolling from one gutter into another
  within the same gesture no longer zooms off an off-plot anchor.
- Keyboard pan/zoom shortcuts only `preventDefault` when the chart will
  act, so a focused chart with pan and zoom disabled no longer swallows
  arrow-key page scrolling.
- One throwing event handler no longer aborts delivery to the remaining
  handlers, and handlers added during dispatch run on the next emit
  rather than the current one.
- A `devicePixelRatio` change with no size change (dragging the window
  between monitors of different scale) now re-renders at the new backing
  resolution instead of staying blurry until an unrelated resize.
- Canvas clears cover the full backing store, so no stale edge pixels
  survive on fractional-width containers (ghost trails on streaming
  data).
- Constructing a chart no longer mutates the caller's config object:
  the injected `axes.x`/`axes.y` entries land on the chart's own copy,
  so inspecting the passed config or building two charts from one config
  object no longer leaks shared axis state.
- `setOptions`/`replaceOptions` no longer corrupt `Date`, `Map`, `Set`,
  or non-`Float64Array` typed-array values in config: non-plain objects
  are replaced by reference instead of being spread into a plain object.
- Zoom-synced peers stay synced across data updates: a viewport received
  from a sync peer now survives the next `setData`/`appendData` instead
  of snapping back to the full extent.
- `zoom.bounds: 'data'` tracks appended data on a user-zoomed axis, so
  streaming points beyond the pre-zoom extent are reachable by pan and
  zoom-out without a `resetZoom()` first.
- `zoom.minRange`/`maxRange` are enforced consistently on vertical axes
  and per-axis zoom, and measured in the scale's own span metric so the
  limit lands correctly on log axes.
- `setData`, `appendData`, `setOptions`, and `resize` are no-ops after
  `destroy()`, so a destroyed chart can no longer re-schedule renders or
  rejoin a sync group.
- `stats.renderCount` counts only layers that actually paint; a
  `beforeDraw*` plugin that vetoes a layer no longer inflates the count.
- Cursor indicator ring luminance now classifies 3-digit hex and named
  background colors correctly instead of treating them as light.
- `data:update` listeners written with rest (`(...args)`) or defaulted
  parameters now receive the `ColumnarData` payload their type promises.
- A synced or programmatic `setCursorDataX` no longer snaps against
  column 0 when a visible scatter series uses a non-zero `xDataIndex`,
  matching the local pointer path.
- Plugins installed via `use()` are recorded in `config.plugins`, and
  `replaceOptions` reinstalls plugins only when the plugin set actually
  changes, so plugin lifecycle is consistent across both entry points.
- Area/line fills with a named, `rgb()`, or short-hex stroke color now
  apply their gradient alpha correctly instead of falling back to an
  arbitrary fill from an `rgba(NaN, ...)` color string.
- Tooltip shadow selection classifies 3-digit hex and named background
  colors correctly, and repeated shows with identical content skip the
  `innerHTML` write and layout-forcing size reads.
- A dark non-hex chart background (named/`rgb()` color) now selects the
  dark sequential/diverging/heatmap role palettes instead of the light
  ones.
- A single visible bar (viewport culled to one) keeps its data-spacing
  width instead of ballooning to a fraction of the plot, and a
  non-finite neighbor center no longer collapses bar width to the
  fallback.
- Bars and histograms render on a log Y axis: the baseline anchors at
  the plot bottom instead of the undefined pixel for value 0.
- Left/right axis tick labels outside the plot's vertical extent are
  filtered out, matching the bottom/top axes.
- Built-in legend swatches use the resolved theme palette, so dots match
  the series colors the canvas draws.
- The legend-table plugin updates cells in place on cursor moves (no
  subtree rewrites when the shape is unchanged) and blanks value cells
  when the data clears instead of leaving stale numbers.
- The legend and legend-table plugins restore the host container's
  inline styles on destroy, so removing them no longer leaves it flexed.
- The legend and legend-table plugins keep per-chart state, so one plugin
  object spread across multiple charts no longer cross-wires or leaks
  their DOM.
- Solid `<LegendTable>`: `fallback="hide"` hides with a string `style`
  prop and beats a user `display`; a series with no snapshot row still
  shows its name; and `series-only` blanks every value-reading column,
  not just the one keyed `value`. Columns are recognized as Solid only
  via an explicit `kind: 'solid'`.
- Solid `<Chart>` applies the user `style` prop over the default
  `width`/`height` consistently for both string and object styles.
- `createChartGroup().apply()` no longer clobbers a caller-set `syncKey`,
  and zoom sync is opt-in (`bind({ zoom: true })` / `apply(config,
  { zoom: true })`) rather than forced on every grouped chart.

## [0.9.0] - 2026-05-03

### Added
- Added touch interaction knobs for one-finger drag behavior and touch
  selection gestures.
- Added opt-in axis-gutter pan and zoom controls via `pan.axis` and
  `zoom.axis`.
- Added `zoom.pinchMode` so touch pinch can either preserve a uniform 2D
  zoom or opt into direction-based axis locking.

### Changed
- Touch interactions now default to cursor-first behavior: one-finger drag
  moves the cursor/tooltip, while double-tap-drag handles touch selection.
- Charts that opt into one-finger touch panning now disable touch selection
  by default to avoid accidental box-zoom during ordinary pan gestures.
- Touch pinch now applies a uniform 2D zoom by default when X and Y zoom are
  enabled, matching map/image-style mobile zoom behavior.
- Touch cursor updates are coalesced to animation frames to reduce mobile
  scatter tooltip and overlay work during drag.
- Interaction mode presets now respect explicit `zoom` and `pan` fields
  instead of overwriting them.

### Fixed
- Axis gutters no longer capture drag, scroll, or touch input by default.
- Touch pan, cursor, pinch, and selection gestures now use explicit gesture
  states so ordinary panning cannot leak into box selection.
- The scatter demo accepts plot-area touchpad pinch and cmd-scroll zoom again.
- Plot-area double-tap suppresses native page zoom and resets chart zoom.
- Streaming demos can be configured as cursor-only so touch exploration does
  not freeze the live scrolling window.
- Touch tooltips now position higher above the finger instead of underneath it.

## [0.8.0] - 2026-05-01

### Breaking
- The root `snaplot` export is now framework-free. SolidJS components and
  primitives should be imported from `snaplot/solid`; core APIs remain
  available from `snaplot` and `snaplot/core`.

### Added
- Added explicit `snaplot/core` and `snaplot/solid` package subpath exports,
  with Solid marked as an optional peer dependency for core-only consumers.
- Added `ChartCore.replaceOptions()` for declarative integrations that need
  omitted config keys removed instead of deep-merged.
- Added `options:update` events so plugins and Solid helpers can react to
  runtime option changes.
- Added stable-key highlight APIs for cross-chart workflows with mismatched
  series order or subsets.
- Added focused regression coverage for downsampling, histogram utilities,
  log scales, bar geometry, runtime option replacement, plugin registration,
  and sync behavior.

### Changed
- Solid bindings now update existing chart instances with full replacement
  semantics instead of recreating charts or retaining stale config.
- Bar rendering and hit testing now share geometry helpers, improving
  irregularly spaced categories and grouped bars.
- Vertical auto-range and layout work now reuse internal caches to reduce
  repeated scans and layout computation during interaction-heavy dashboards.
- Documentation and demos now use the split core/Solid imports, clearer live
  editor behavior, and improved navigation/accessibility polish.

### Fixed
- Histogram and bar y-axis auto-range now includes the zero baseline before
  padding is calculated, preserving top/bottom breathing room after x zoom.
- Runtime sync keys now rebind correctly when cursor, highlight, or zoom sync
  options are changed or cleared.
- Duplicate runtime plugin registration is ignored instead of installing the
  same plugin id more than once.
- Removed stale axes and zoom state when declarative config replacement drops
  an axis.
- Tightened finite-value handling across data stores, downsampling, line
  rendering, scatter rendering, scales, and histogram generation.

## [0.7.0] - 2026-04-30

### Added
- Scatter series can now use arbitrary `xDataIndex` / `yDataIndex`
  coordinate columns, categorical or continuous `colorBy` encodings,
  `sizeBy` radius encodings, custom point shapes, explicit density
  rendering, and extra `tooltipFields` in nearest-point tooltips.
- Box selections on scatter plots can return selected point metadata via
  `SelectionResult.points`, making lasso-like dashboard workflows possible
  without reimplementing hit testing outside snaplot.
- Streaming charts can opt into fixed-window retention with
  `config.streaming.maxLen`, backed by a ring-buffer store for low-allocation
  append workloads.
- Chart diagnostics now expose lightweight render and data-update counters
  through `ChartStats`, with optional per-layer timing behind `debug.stats`.
- Added role-aware theme palettes plus `studioTheme`, `tokyoTheme`, and a
  docs-site theme editor for previewing chart tokens.

### Changed
- Scatter hit testing now supports arbitrary X columns and dense point clouds
  through a cached screen-space lookup grid.
- Cross-chart highlight sync can use stable series keys via
  `highlight.getKey`, so charts with different series order or subsets can
  share hover state correctly.
- Auto-range no longer applies axis nicening by default; set
  `axis.nice: true` when rounded presentation bounds are preferred.
- Line, bar, histogram, scatter, Solid, and plugin code paths now have broader
  unit coverage around append, missing values, rendering, sync, and lifecycle
  behavior.

### Fixed
- Data updates now preserve explicit user zoom until reset, avoiding
  unexpected auto-range snaps during streaming or replacement updates.
- Theme changes now propagate through chart internals more consistently,
  including tooltip rendering and palette-driven density heatmaps.

## [0.6.0] - 2026-04-24

### Fixed
- **Axis tick density at deep zoom.** `LinearScale` no longer collapses to
  one or two ticks when the zoomed domain straddles a single integer
  (e.g. `[49.7, 50.3]` used to render only `50`). The integer fast-path in
  `niceTicks` now requires at least three integer ticks before firing;
  narrower ranges subdivide via the nice-step path so the axis always
  keeps enough reference lines to read.
- **Time axis at sub-second zoom.** `TimeScale` gained 10ms / 50ms / 100ms /
  250ms / 500ms intervals plus a linear-subdivision fallback, so zooming
  past one second no longer leaves the X axis with a single tick. Tick
  formatting also renders `HH:MM:SS.mmm` when the domain is under one
  second so adjacent ticks are visibly distinct.
- **Consistent decimal count on linear axes.** `LinearScale.tickFormat`
  now derives its precision from the actual nice step and applies the
  same decimal count to every value in the axis. Integer-valued ticks no
  longer short-circuit to `6` while their neighbours render as `6.20` /
  `6.40` — they render as `6.00`, keeping the column aligned.

### Changed
- **Tabular numerals by default.** Axis tick labels and the default
  tooltip now ship with `font-variant-numeric: tabular-nums` so digits
  stay in fixed-width columns instead of jiggling as values update
  during zoom, pan, or live data. The docs site applies the same rule
  at `body` level so all numeric readouts, demos, and legend tables
  inherit it automatically.

## [0.5.0] - 2026-04-18

### Breaking
- `ZoomConfig.wheelFactor` renamed to `ZoomConfig.wheelStep`, with new
  semantics: it is now the zoom fraction per max wheel / pinch tick
  rather than a scale factor. Default changes from `1.1` (10 % per
  tick) to `0.1` (same 10 % per tick, stated directly). `0` disables
  wheel zoom. Negative values are clamped to 0. Migration:
  `wheelFactor: 1.1` → `wheelStep: 0.1`, `wheelFactor: 2` → `wheelStep: 1`.

### Added
- Biome 2.4 for lint + format (`npm run lint`, `npm run check`).
- Vitest for unit tests (`npm test`), initial suites for
  `data/binarySearch`, `scales/niceNumbers`, `config/merge`.
- Lefthook pre-commit + pre-push hooks.
- `.github/workflows/quality.yml` running lint + typecheck + tests + builds on PRs.
- `CONTRIBUTING.md` documenting dev workflow and release process.

### Fixed
- **Security**: `TooltipManager.defaultRender` now HTML-escapes series labels,
  formatted values and colour strings. A series named `<img src=x onerror=…>`
  no longer executes.
- **Stability**: one throwing event listener no longer stops the render loop
  or other subscribers on the same event (`ChartCore.emitEvent` is now wrapped
  in try/catch with console logging).
- **Performance**: histogram tooltip bin lookup uses `upperBound` instead of
  a linear scan, O(log n) vs O(n). Meaningful for charts with many bins.

### Changed
- Dropped unused `chartRef` and two `as any` casts in `legendPlugin`.
- Dropped an `as any` cast in `legendTablePlugin` (setOptions accepts
  `DeepPartial` already).
- Legend plugin click handler now re-reads `chart.getOptions()` each
  invocation so stale closures can't reference outdated series indices.

## [0.4.1]

See git history before this entry for commits prior to the changelog being
introduced: `git log v0.4.1`.
