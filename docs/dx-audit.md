# snaplot DX audit

Developer-experience review of the public API ahead of 1.0. Each finding
from the API-wart survey is checked against the current
`revamp/v1-prep` tree and marked:

- **fixed-here** already addressed in this branch (verified in the tree).
- **proposal** a recommended change, deferred so it does not break the
  0.x API; safe to land in 1.0.
- **wontfix** intentional design; the reason is recorded so it does not
  get re-litigated.

Nothing in this document changes runtime behavior. The only code edits in
the accompanying work are JSDoc additions to `types.ts`, a new docs
section, and the bundle-size tooling described below.

## Distribution sizes

Measured from a fresh `npm run build -w packages/snaplot` on this branch.
gzip is over the concatenated transitive closure of each entry (entry file
plus the shared implementation chunk Vite splits out), which is the real
download cost; the bare entry file is misleadingly small because most code
lives in the shared chunk. `npm run size` reproduces these numbers and
gates them against the budgets in `scripts/bundle-report.mjs`.

| entry              | raw       | gzip     | budget (gzip) |
| ------------------ | --------- | -------- | ------------- |
| `index.js`         | 210,150 B | 56,511 B | 62,000 B      |
| `core.js`          | 208,756 B | 56,160 B | 62,000 B      |
| `solid.js`         | 199,555 B | 53,279 B | 59,000 B      |
| `legend-table.css` | 5,267 B   | 1,635 B  | 1,850 B       |

`solid.js` excludes `solid-js`, which is an external peer dependency and
is not bundled. All three JS entries share one implementation chunk
(hashed name, currently `legendTableColumns-*.js`, ~190 KB raw / ~50 KB
gzip); that chunk is the dominant cost, so `core` and `index` differ by
only ~1 KB. Trimming the chunk is the only lever that moves any entry
meaningfully.

Budgets are set ~10% above the current gzip figures. Raising a budget is a
deliberate act and should move the baseline numbers in this table with it.

Observation (not in the original survey): the `dts` step of the build
emits `TS2591: Cannot find name 'process'` for `core/validateConfig.ts:35`.
The guard is intentional (`typeof process === 'undefined'` for un-bundled
browsers) and the JS build still succeeds, but the missing `@types/node`
reference makes the build log noisy. Adding `@types/node` to the package
devDependencies (or a local `declare const process`) would clean it up.
Cross-cutting; outside this audit's edit scope.

## solid-js separation and sideEffects (verification)

Task: confirm `snaplot/core` pulls in no `solid-js` import chain and that
`sideEffects` lists only CSS.

- **core is Solid-free, verified.** In the built graph, `core.js` imports
  only the shared chunk (`./legendTableColumns-*.js`); the shared chunk
  imports nothing external. `grep -c solid-js` is `0` in both `core.js`
  and the shared chunk. Only `solid.js` imports `solid-js` and
  `solid-js/web`. So a consumer of `snaplot` or `snaplot/core` never
  loads Solid.
- **sideEffects is CSS-only, verified.** `package.json` declares
  `sideEffects: ["*.css", "dist/*.css"]`. No JS module is marked as
  side-effectful, so bundlers may tree-shake unused exports. This matches
  the design note that `legend-table.css` is copied to `dist` by a
  `closeBundle` hook and is never part of the module graph, which keeps
  the declaration honest.

## `dataIndex` vs `xDataIndex` / `yDataIndex`

**The wart.** `SeriesConfig` carries three column-index fields with
overlapping meaning:

- `dataIndex` primary Y column, required for line/area/band/bar/histogram.
- `yDataIndex` scatter Y column, "preferred over `dataIndex`".
- `xDataIndex` scatter X column, defaults to column 0.

For a line series you set `dataIndex`. For a scatter series you are told to
prefer `yDataIndex` but `dataIndex` still works as a fallback alias, and X
comes from `xDataIndex` (or column 0). So the same concept ("which column
is this series' value") has two names whose applicability depends on the
series `type`, and one field (`dataIndex`) silently changes role. The
scatter renderer even fabricates a `columnCount` sum so the index-range
check passes (`ScatterRenderer.ts`), which is a symptom of the indices
being loosely validated.

**Why it exists.** Non-scatter series are implicitly `(sharedX, y)` where
X is always column 0, so one index suffices. Scatter is genuinely 2D and
needs an explicit X column for tabular datasets where several scatter views
share row identity but plot different metric pairs. `yDataIndex` was added
to name the Y column symmetrically with `xDataIndex`; `dataIndex` was kept
as an alias so existing scatter configs did not break.

**Recommended 1.0 direction (nothing breaking now).**

1. Keep all three fields. `dataIndex` stays the canonical single-value
   field for series whose X is the shared column 0 (line, area, band, bar,
   histogram). `xDataIndex`/`yDataIndex` stay the explicit pair for scatter.
2. Document the resolution order precisely and pin it in the JSDoc (done in
   `types.ts`): scatter Y is `yDataIndex ?? dataIndex`, scatter X is
   `xDataIndex ?? 0`. This makes the alias behavior a contract instead of an
   accident.
3. For 1.0, consider a lint-time (dev-only) warning when a scatter series
   sets `dataIndex` but not `yDataIndex`, nudging toward the explicit pair,
   rather than removing the alias. Removal is the only breaking option and
   is not worth a major-version migration for a field that is easy to
   support.
4. Fix the `columnCount` fabrication independently (see scatter section):
   validate indices against the real store column count and warn on
   out-of-range, so a misconfigured `yDataIndex` is loud instead of a blank
   plot.

Net: do not unify the fields (that breaks configs for no functional gain);
instead make the two-name reality explicit in types and docs, validate the
indices honestly, and keep the alias.

## Findings by subsystem

### chart-render

- **setAxis undocumented semantics** (no-op on unknown key, no min<max
  check, differs from user zoom): **proposal.** JSDoc on `setAxis` in
  `ChartInstance` now states it updates the domain; a fuller contract
  (validation, no `userZoomedAxes` marking) should be documented and, for
  1.0, `setAxis` should reject non-finite / inverted ranges the way
  `ColumnarStore.validate` rejects bad data. Not changed here to avoid
  altering runtime behavior from a docs pass.
- **getOptions / getAxis return live internal objects:** **proposal.**
  This is a real mutation hazard. 1.0 should either freeze the returned
  config in dev or return a shallow copy of the mutable leaves. Documented
  as read-only intent for now; changing the return shape is a behavior
  change out of scope here.
- **redraw() marks ALL layers only:** **proposal.** A per-layer public
  invalidation (`redraw(layer?)`) would let plugins repaint just the data
  layer. Additive and safe for 1.0.
- **box-selection cancel uses an all-zeros sentinel:** **wontfix (for
  now).** Internal coupling between GestureManager and Chart, not on the
  public surface; a explicit `cancelled` flag is a nice internal cleanup
  but users never see it.
- **deepMerge triple-casts / aliases nested user objects:** **proposal.**
  See config-plugins; `deepMerge`'s exported signature forces the casts.
  Internal-only hazard today.
- **emitEvent is stringly-typed internally:** **wontfix (internal).** `on()`
  is fully typed for users; the untyped internal emit is an internal
  correctness risk, addressable by typing `emitEvent` against
  `ChartEventMap`, but invisible to consumers.
- **stats.lastRenderMs stays 0 unless debug.stats:** **fixed-here.**
  `DebugConfig.stats` JSDoc and `getStats` now state the counters are
  always maintained but per-layer durations only run when `debug.stats`
  is true.

### chart-data

- **`click` event declared but never emitted:** **proposal (1.0 cleanup).**
  Verified: `ChartEventMap.click` and `Plugin.onClick` exist but Chart
  never emits `'click'`. Either wire click emission from the tap/pointer
  path or remove the dead surface for 1.0. Removal is breaking; wiring it
  is additive and preferable.
- **getData / data:update expose mutable internal storage:** **proposal.**
  JSDoc should warn that the returned arrays are live and must not be
  mutated; a defensive-copy `getData()` is the safe 1.0 default with an
  opt-out for the hot path.
- **setData/appendData throw from deep in the store; empty append is a
  silent no-op:** **fixed-here (docs).** `AppendDataOptions` and the
  `ChartInstance` methods are now documented; the throw-on-invalid contract
  should still be surfaced on the method JSDoc for 1.0.
- **setOptions destroys all plugins vs replaceOptions reference-compares:**
  **proposal.** Two plugin-diff semantics in one API is a real
  inconsistency; unify on reference comparison for 1.0.
- **dispatchDataUpdate depends on handler.length:** **wontfix / proposal.**
  Surprising but internal; documenting that `data:update` always receives
  the payload and dropping the arity introspection is a safe internal fix.
- **No destroyed-state guard on public methods:** **proposal.** Add a
  cheap destroyed guard that throws a clear error; additive and worth doing
  for 1.0.
- **role='application' container has no accessible name / keyshortcuts:**
  **proposal (a11y).** Add `aria-label` and `aria-keyshortcuts` on the
  focusable container and document the keyboard map. Real gap; additive.

### pipeline

- **EventBus dual unsubscribe (disposer + off()):** **wontfix.** Both are
  idempotent and the disposer is the documented path; `off()` is a
  convenience. Low harm.
- **SyncGroup.publishHighlight double-casts to receiveHighlightSync:**
  **proposal.** `receiveHighlightSync` should be part of the
  `ChartInstance` (or a narrower `SyncMember`) interface so non-Chart
  members are a compile error, not a runtime throw.
- **inferPosition heuristic places `xspeed` on the bottom:** **wontfix.**
  Name-based inference is a documented convenience; users override with an
  explicit `position`. The redundant `key === 'x'` clause is a trivial
  internal cleanup.
- **RenderScheduler.markDirty(NONE) books a frame; no destroyed guard:**
  **proposal.** Early-return on `NONE` and guard post-destroy; internal,
  additive.
- **CanvasManager.resize does not validate inputs:** **proposal.** Clamp /
  reject non-positive sizes on the public `resize` path, matching
  `enableAutoResize`.
- **CanvasManager mangled comment:** **wontfix (cosmetic).** Fix opportunistically.

### scatter

- **fabricated `columnCount` sum:** **proposal.** Validate `dataIndex` /
  colorBy / sizeBy indices against the real store column count and warn on
  out-of-range. Tied to the `dataIndex` duality direction above.
- **redundant dual stamp caches:** **wontfix / internal.** The single-slot
  cache is legacy; removing it is a safe internal simplification with no
  API impact.
- **renderScatter vs renderScatterSegments 10-positional-param duplication:**
  **proposal (internal).** An options object would harden the call sites;
  purely internal.
- **invalid colorBy/sizeBy dataIndex fails silently:** **proposal.** Emit a
  dev warning distinguishing "encoding disabled" from "encoding
  misconfigured". Real DX gap.
- **getStamp / drawHeatmapSegments unit JSDoc (CSS px vs device px, alpha
  0-1):** **fixed-here (types).** Public encoding types (`ScatterSizeEncoding.range`,
  heatmap gradient `t` semantics) now document units; the internal
  renderer helpers remain undocumented and should get unit JSDoc for 1.0.
- **two `sampleGradient` with different signatures:** **wontfix / internal.**
  One is private to the renderer; rename the private one to avoid the
  import trap.
- **parseHex coerces malformed hex to 0, ignores alpha and named colors:**
  **proposal.** A shared `parseColor` exists in `utils/color.ts`; the
  scatter encoding path should use it instead of its own `parseHex` so
  `'red'` and `#rrggbbaa` work. Documented that `heatmapGradient` stops are
  hex today.

### renderers

- **single-point line/area/band renders nothing:** **proposal.** Document
  the >=2-point requirement (partly noted) and consider a dot fallback for
  a lone point in 1.0.
- **withAlpha hex-only contract on public color params:** **proposal.**
  Route area/band fills through `utils/color.ts withAlpha`, which handles
  non-hex input, and document the accepted formats.
- **renderBars requires caller-supplied barSeriesIndex/totalBarSeries:**
  **wontfix (internal).** These are internal renderer entry points, not
  public API; grouped-bar bookkeeping is derived by Chart.
- **renderHistogram N+1-edges contract only in a file comment:**
  **proposal.** Surface the edges/counts contract in the histogram data
  docs and validate sorted edges in dev.
- **customXTicks applied to all horizontal axes:** **wontfix / internal.**
  Internal render result; per-axis tick override is a possible 1.0 feature
  but not a current API promise.
- **drawSteppedSegments treats typos as step-middle:** **wontfix.**
  `InterpolationMode` is a typed union at the public boundary, so a typo is
  a type error for users; the permissive internal string is unreachable
  from typed configs.
- **crosshair/selection-box hardcoded alpha and colors:** **proposal.**
  The selection box ignores the theme accent and the crosshair alpha is not
  themeable. Add `crosshair` alpha and a selection color token for 1.0.
- **BarRenderPoint exported but unused:** **proposal (cleanup).** Drop the
  dead export in 1.0.

### interaction

- **HitTester.findPoints 10 positional params; dataVersion defaults to 0:**
  **wontfix (internal).** Internal API; the stale-grid risk is a real
  internal footgun best fixed by requiring `dataVersion`, but nothing here
  is public.
- **TooltipConfig.render string is injected as innerHTML (XSS):**
  **proposal.** This is the one finding worth surfacing loudly in docs. The
  custom-tooltip recipe warns that string returns are raw HTML and that
  user-derived text must be escaped or returned as an `HTMLElement` with
  `textContent`. A 1.0 option to force text-only rendering would be safer.
- **GestureManager 8-arg constructor; implicit keyboard target:**
  **wontfix (internal).** Internal wiring; the "canvas must be in a
  focusable container" contract is satisfied by the library's own
  CanvasManager.
- **ZoomConfig.wheelStep < 0 silently clamped to 0:** **fixed-here (docs).**
  `ZoomConfig.wheelStep` JSDoc now documents that 0 disables wheel zoom;
  clamping negatives to 0 is consistent with that. A dev warning on
  negative input is a possible 1.0 nicety.
- **HitTester.setProximity(null) vs constructor number:** **wontfix
  (internal).** Not public surface.
- **box-end sentinel:** duplicate of the chart-render sentinel finding.

### scales-data

- **upperBound naming trap; nearestIndex returns 0 for empty:** **wontfix
  (internal).** Documented and tested; internal binary-search helpers.
- **Scale hides the affine transform, forcing per-point calls:**
  **proposal.** This is the main API-level perf lever. A batch/transform
  accessor on `Scale` (there is now an `affine` module in the tree) would
  let renderers avoid per-point method dispatch. Additive interface method
  for 1.0; performance-sensitive, coordinate with the perf owner.
- **DataStore.append omits maxLen; divergent store contracts:** **proposal
  (internal).** Align the `DataStore` interface with `ColumnarStore.append`.
- **getData snapshot semantics inconsistent between stores:** **proposal.**
  Tie to the chart-data getData copy decision; make both stores return the
  same snapshot guarantee.
- **createScale silently falls back to LinearScale for unknown type:**
  **proposal.** Throw like `ColumnarStore.validate` for an unknown
  `ScaleType`. `ScaleType` is a typed union publicly, so this only bites
  dynamic callers; still worth a loud error for 1.0.
- **LogScale/TimeScale ignore the count param:** **fixed-here (docs).**
  `Scale.ticks(count?)` is documented as a hint; per-scale density
  differences are expected. `TimeScale` documents it; `LogScale` should get
  the same one-line note.
- **lttb/m4 gap-separator output undocumented; lttb copy-through on small
  counts:** **fixed-here (docs).** The downsampling recipe documents the
  synthetic `(x, NaN)` run separators and the pass-through behavior when
  `targetCount < 3` or `>= len`. Method-level JSDoc on `lttb`/`m4` for the
  separator format is still recommended for 1.0.

### config-plugins

- **tooltipPlugin / crosshairPlugin are inert id-only objects:**
  **proposal (1.0 cleanup).** They are confusing no-op public exports;
  behavior is driven by `config.tooltip` / `config.cursor`. Either remove
  them or make them thin config-setting shims for 1.0. Documented as
  config-driven in the docs.
- **legendPlugin read raw user theme, no getTheme():** **fixed-here.**
  Verified: `chart.getTheme()` now exists (`Chart.ts:518`) and
  `legendPlugin` reads `chart.getTheme()` (`legendPlugin.ts:116`). This
  finding is resolved.
- **PluginManager.register returns false silently on duplicate id:**
  **proposal.** `use()` now documents the boolean return; a dev warning on
  duplicate id would close the gap with the setOptions destroy-all path.
- **deepMerge exported with cast-forcing signature:** **proposal.** Either
  stop exporting `deepMerge` (it is an internal helper) or give it a
  signature that does not force `as unknown as` at call sites, plus JSDoc
  on the array-replace semantics.
- **createReferenceLinesPlugin smuggles setLines; setLines does a full
  redraw:** **proposal.** Return type is honest but the full-`ALL` redraw
  for a data-only change ties into the per-layer `redraw` proposal above.
- **ReferenceLine ignores the theme (hardcoded #888 and label font):**
  **proposal.** Verified still present (`referenceLinesPlugin.ts:82,106`).
  Default the color to `theme.textColor` / an axis token and the label font
  to `theme.fontFamily` / `fontSize` via the now-available `getTheme()`.
- **LegendTableOptions.fallback enum not validated:** **proposal.** Validate
  the enum and warn on unknown values.
- **two legend plugins style inconsistently (external CSS vs inline
  cssText):** **wontfix.** Intentional: `legendPlugin` is stylesheet-driven,
  `legendTablePlugin` is inline-first. Documented in the Legend Table docs.

### entry-solid

- **exports: `types` listed after `import`:** **proposal.** Verified in
  `package.json`; TS wants `types` first in each condition block. Works
  today by adjacency but is fragile. Reorder for 1.0 (low risk, but touches
  the published manifest, so out of a docs pass's scope).
- **ESM-only, no require/default condition:** **wontfix (deliberate).**
  snaplot targets modern ESM bundlers and Solid; a CJS build is a
  significant maintenance cost for a shrinking audience. Documented as
  ESM-only.
- **`snaplot` and `snaplot/core` are byte-identical:** **wontfix / docs.**
  `index` re-exports `core` plus the built-in plugins; they are not
  identical (index pulls the plugin exports). The canonical entry is
  `snaplot`; `snaplot/core` exists for consumers who want the framework-free
  surface. Clarified in docs.
- **TMeta erased by `as ChartConfig` casts in createChart:** **wontfix
  (internal).** Assertion-only meta typing is acknowledged; the public
  generic still gives consumers inference at the config boundary.
- **LegendTableSolidColumn.kind optional forces Function.length heuristic:**
  **proposal.** Requiring `kind: 'solid'` (or a factory) removes a crash
  class; mildly breaking for hand-written columns, so 1.0.
- **createHighlight / group broadcasts silently no-op on premature input:**
  **proposal.** Add a dev warning when called before the chart resolves or
  before joining a group.
- **createChartGroup has no zoom read accessor / publish:** **proposal.**
  Add a zoom accessor to complete the zoom-sync story; additive.
- **renderPluginCell stale comment:** **wontfix (cosmetic).**

### site

Site findings are content/polish items and mostly outside the library API.
Tracked here for completeness; the ones the new docs work touches:

- **LiveExample dead code / configToString non-runnable:** **wontfix here.**
  The docs use `LiveEditor` (real editable source); `LiveExample` is unused.
- **Sidebar SidebarUI stale JSDoc:** **proposal.** The comment claims it
  returns a signal pair; it returns JSX only. Trivial doc fix (Sidebar.tsx
  is in scope, but the new-section wiring is the only edit made here).
- Remaining site items (Demo/ChartDemo naming, Button prop passthrough,
  scroll-spy, font-display, footer links) are **proposal**s for the site
  owner; none block the API.

### quality-infra

- **`npm test -- --coverage` trap (provider missing):** **proposal.** Add
  the coverage provider dependency or remove the coverage config so the
  flag does not hard-fail.
- **no format check / no coverage / no bench scripts:** **partially
  fixed-here.** A `bench` script exists in the root `package.json`, and this
  work adds a `size` script for the bundle budget. A `coverage` script and a
  format check remain **proposal**s.
