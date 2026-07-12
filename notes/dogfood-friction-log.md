# Snaplot dogfood friction log

Recorded while building PulseOps, CohortLab, and GridScope against Snaplot 0.11.1. No library changes were made.

## DX-01 — Record data requires repeated column projections

- **Demo/component:** All demos; deterministic data layer
- **Attempt:** Keep believable application records for UI tables and controls while feeding related views into Snaplot.
- **Expected:** A concise, discoverable path from an array of records to chart columns.
- **Actual:** Every chart family needs handwritten `Float64Array` projections. Filtering CohortLab records also requires regenerating several chart-specific column sets while preserving the row identity in column 0.
- **Workaround:** Centralized conversion helpers in `site/src/dogfood/data.ts`.
- **Impact:** Considerable glue code obscures the intent of otherwise simple charts and creates opportunities for column-index mistakes.
- **Cost:** Major initial setup; repeated moderate cost for every new view.
- **Area:** Data API / documentation
- **Suggestion:** Document a canonical record-to-column recipe or provide a small typed projection helper outside core rendering.
- **Severity:** Major
- **Reproducible:** Yes

## DX-02 — Responsive charts require an explicit height contract

- **Demo/component:** Every chart card
- **Attempt:** Place auto-resizing charts inside responsive CSS grids.
- **Expected:** Width and height behavior to be obvious from the Solid component API.
- **Actual:** `<Chart>` fills `width:100%; height:100%`, so every ancestor path must resolve to a non-zero application-owned height. A card without an explicit chart-height class collapses.
- **Workaround:** Added `df-chart-sm`, `df-chart-md`, `df-chart-lg`, and route-specific height classes plus mobile overrides.
- **Impact:** Layout responsibility is easy to miss and height choices are duplicated across CSS breakpoints.
- **Cost:** Moderate and recurring.
- **Area:** Solid integration / documentation
- **Suggestion:** Put the height requirement prominently in the Solid quick start and consider an optional `aspectRatio` or default/min-height prop.
- **Severity:** Moderate
- **Reproducible:** Yes

## VIS-01 — Cross-chart left alignment is opt-in and instance-driven

- **Demo/component:** PulseOps telemetry stack and GridScope synchronized charts
- **Attempt:** Make multiple synchronized charts read as one aligned plotting surface.
- **Expected:** Grouping charts for cursor/zoom sync would also expose a simple declarative alignment option.
- **Actual:** `group.apply()` wires sync configuration, but plot alignment additionally requires capturing every instance through `onReady` and calling `group.link()`. Cleanup must be tracked separately.
- **Workaround:** Added registration functions and retained unlink callbacks. Set `yDomain:false` because the charts use different units.
- **Impact:** It is easy to produce synchronized charts whose plotting areas do not align, even though the interactions imply they belong together.
- **Cost:** Moderate setup and lifecycle bookkeeping.
- **Area:** Solid integration / layout API
- **Suggestion:** Provide a Solid group component/context that applies configuration, links on mount, unlinks on cleanup, and makes gutter/Y-domain choices declarative.
- **Severity:** Major
- **Reproducible:** Yes

## VIS-02 — Dual-axis padding needs manual compensation

- **Demo/component:** PulseOps traffic and errors
- **Attempt:** Align a dual-axis chart with two single-left-axis charts above it.
- **Expected:** Automatic right-axis measurement and group gutter coordination to preserve the shared plot alignment.
- **Actual:** Left-gutter linking handles the shared left edge, but the right axis changes the usable plot width. The application must choose explicit right padding and visually judge the result.
- **Workaround:** Set `padding.right:56` for the dual-axis chart while the others use 18.
- **Impact:** Vertically stacked chart grids can share a left edge but not a right edge without manual tuning.
- **Cost:** Moderate visual iteration.
- **Area:** Core layout
- **Suggestion:** Expose plot-box alignment for both edges or allow a group to coordinate left and right axis gutters independently.
- **Severity:** Major
- **Reproducible:** Yes

## DX-03 — Plugin state is outside Solid config reactivity

- **Demo/component:** GridScope tariff boundaries
- **Attempt:** Move time-of-use reference markers when the selected day changes.
- **Expected:** Updating the reactive chart config/plugin options would update marker values like axes and series.
- **Actual:** A plugin instance closes over its initial options. The date change must call the plugin-specific imperative `setLines()` method from a Solid effect.
- **Workaround:** Retain the reference-lines plugin instance and update it with `setLines()` whenever the generated day changes.
- **Impact:** The application mixes declarative chart config with imperative plugin lifecycle code; forgetting the effect leaves visually stale annotations.
- **Cost:** Moderate discovery cost, low ongoing cost.
- **Area:** Plugin API / Solid integration
- **Suggestion:** Document reactive-plugin patterns or introduce a Solid helper that owns plugin instance updates.
- **Severity:** Moderate
- **Reproducible:** Yes

## DX-04 — Point identity is not part of linked highlighting

- **Demo/component:** CohortLab scatter plot and run table
- **Attempt:** Hover a run in the sidebar and focus that exact scatter point plus its series in other charts.
- **Expected:** The stable highlight-key system to represent either a series or a datum identity.
- **Actual:** Highlight synchronization is series-level. CohortLab's scatter contains one series with thousands of points, so a run row cannot highlight one scatter datum. Stable keys work well for the selected-run line and grouped-bar series.
- **Workaround:** Link only the multi-series progress and comparison charts. Scatter box selection populates the comparison set, but sidebar hover cannot focus the source point.
- **Impact:** Coordinated analytical views feel incomplete for record-oriented scatter workflows.
- **Cost:** Feature gap; no reasonable application-only workaround without drawing a custom overlay or splitting every point into a series.
- **Area:** Interaction API
- **Suggestion:** Add optional datum-key focus/highlight state for scatter series and an imperative `setHighlightedPointKey()` API.
- **Severity:** Major
- **Reproducible:** Yes

## VIS-03 — Reference regions require a custom plugin

- **Demo/component:** GridScope time-of-use pricing
- **Attempt:** Shade peak tariff periods behind the daily charts.
- **Expected:** Built-in reference annotations to support a bounded X region as well as a line.
- **Actual:** `createReferenceLinesPlugin` supports lines only.
- **Workaround:** Render four labelled boundary lines. This communicates transitions but is visually weaker than a lightly shaded period.
- **Impact:** Users must infer the peak span and repeated labels add chart noise.
- **Cost:** Low implementation cost, moderate visual compromise.
- **Area:** Built-in plugins
- **Suggestion:** Add a reference-region plugin or extend the existing plugin with `{ from, to, fill, label }`.
- **Severity:** Moderate
- **Reproducible:** Yes

## DX-05 — Histogram data has a special padded-column convention

- **Demo/component:** All histogram cards
- **Attempt:** Render distributions from raw measurements.
- **Expected:** The histogram helper result to drop directly into chart data in an obvious shape.
- **Actual:** `histogram()` returns named `edges` and `counts`, with counts padded to match the N+1 edge column. This works, but it differs from the usual mathematical representation and the chart still requires assembling `[edges, counts]` manually.
- **Workaround:** Added one helper per domain that returns `ColumnarData`.
- **Impact:** Low once understood; surprising on first use.
- **Cost:** Minor.
- **Area:** Utility API / documentation
- **Suggestion:** Return a `data` tuple in addition to named fields, or feature the exact handoff more prominently.
- **Severity:** Minor
- **Reproducible:** Yes

## VIS-04 — Canvas theme and DOM companion styling are separate

- **Demo/component:** PulseOps legend table and all product shells
- **Attempt:** Make Snaplot canvas charts and the Solid legend table look native to three unrelated products.
- **Expected:** A single chart theme to style the full chart-related UI surface.
- **Actual:** `theme` controls the canvas. The legend table needs a separate CSS import and additional product CSS. Application cards, tooltip surroundings, and controls remain entirely separate tokens.
- **Workaround:** Import `snaplot/legend-table.css`, pin a built-in chart theme per product, and add product-specific legend overrides.
- **Impact:** Visual drift is easy, especially in dark dashboards where borders/backgrounds must match exactly.
- **Cost:** Moderate visual tuning.
- **Area:** Theme system / Solid integration
- **Suggestion:** Document the boundary clearly and expose companion DOM theme tokens/classes that map directly to `ThemeConfig` roles.
- **Severity:** Moderate
- **Reproducible:** Yes

## DX-07 — Source-aliased monorepo cannot use the published CSS export

- **Demo/component:** Site entry point / PulseOps legend table
- **Attempt:** Follow the published-consumer instruction and import `snaplot/legend-table.css`.
- **Expected:** The import to behave the same in the local dogfood site and production package build.
- **Actual:** The production site build succeeded, but Vite development failed because the site aliases `snaplot` to package source and the alias does not expose the package.json CSS export.
- **Workaround:** The monorepo site imports `packages/snaplot/src/styles/legendTable.css` directly, with a comment preserving the published-consumer instruction.
- **Impact:** A build-only gate missed a development-server failure; contributors can encounter a confusing difference from consumer setup.
- **Cost:** Low after browser testing exposed it.
- **Area:** Repository tooling / documentation
- **Suggestion:** Add a Vite alias for the CSS subpath or include a dev-server smoke test in CI.
- **Severity:** Moderate
- **Reproducible:** Yes in the source-aliased site workspace

## VIS-06 — Time axes use viewer-local time implicitly

- **Demo/component:** PulseOps cursor table and GridScope daily timeline
- **Attempt:** Present deterministic epoch timestamps with matching axis, tooltip, and summary labels.
- **Expected:** A shared or configurable timezone contract for every time formatter.
- **Actual:** Snaplot's time scale renders in the viewer's local timezone. Application-provided `tooltip.xFormat` functions initially formatted UTC, producing a two-hour disagreement in Cape Town; GridScope's UTC-midnight dataset also appeared to start at 02:00.
- **Workaround:** Anchor the Cape Town scenario two hours before UTC midnight and let custom formatters use the browser's local timezone, matching Snaplot.
- **Impact:** Server-generated or location-specific dashboards can silently show mixed timezones unless every custom formatter knows Snaplot's implicit choice.
- **Cost:** Moderate visual-debugging cost.
- **Area:** Time scale / documentation
- **Suggestion:** Add a timezone option or export the scale's formatter/context so custom tooltip and legend formatting cannot drift from axis formatting.
- **Severity:** Major for global dashboards
- **Reproducible:** Yes

## DX-06 — Grouped bars still require numeric category coordinates

- **Demo/component:** Regional availability, experiment scorecard, daily energy
- **Attempt:** Plot named categories such as regions and score dimensions.
- **Expected:** A direct category-label input for common dashboard bars.
- **Actual:** Snaplot intentionally has no ordinal scale, so categories become numeric X values plus hand-written `ticks` and `tickFormat` lookup arrays.
- **Workaround:** Encode categories as `0..N-1` and repeat the label mapping in axis config.
- **Impact:** Acceptable as a documented non-goal, but verbose and prone to mismatch when categories are filtered or reordered.
- **Cost:** Minor to moderate and recurring.
- **Area:** Known product boundary / documentation
- **Suggestion:** Keep the core non-goal, but provide a documented helper recipe for numeric category axes.
- **Severity:** Moderate
- **Reproducible:** Yes

## VIS-05 — State overlays are entirely application-owned

- **Demo/component:** PulseOps loading/disconnected/empty and GridScope loading
- **Attempt:** Preserve chart-card geometry while representing non-data states.
- **Expected:** No strong expectation of core rendering, but a recommended wrapper pattern would reduce inconsistent layouts.
- **Actual:** The application must decide whether to keep stale data, pass empty typed arrays, blur canvases, or unmount charts. Each choice affects canvas size, tooltip state, and layout stability.
- **Workaround:** PulseOps keeps the canvas mounted under an overlay for loading/disconnected and passes empty columns for the empty scenario. GridScope substitutes a height-matched loader.
- **Impact:** Similar products can develop inconsistent empty-state behavior around the same chart component.
- **Cost:** Moderate product design work.
- **Area:** Solid recipes / documentation
- **Suggestion:** Add official loading, empty, and stale-data wrapper recipes without putting application state into core.
- **Severity:** Minor
- **Reproducible:** Yes
