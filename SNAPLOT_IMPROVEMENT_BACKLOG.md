# Snaplot improvement backlog

Living backlog derived from building and visually critiquing the three SolidJS dogfood applications. This document records candidate improvements before implementation so that repeated findings across PulseOps, CohortLab, and GridScope can be combined into coherent library changes rather than fixed piecemeal.

The detailed implementation friction remains in `notes/dogfood-friction-log.md`. This document focuses on actionable product and API improvements.

## Working principles

- A normal application should look integrated without manually matching hidden chart geometry or internal colours.
- Ambiguous configuration should fail clearly or guide the developer toward the correct result.
- Defaults should produce semantically readable output, not merely technically correct output.
- Pointer interactions must not weaken keyboard accessibility.
- Performance-sensitive changes need an explicit cost model rather than an accidental regression.
- Demo-level fixes and library-level fixes should be tracked separately.

## Status key

- **Candidate** — supported by evidence, solution still open.
- **Validated** — desired behavior and API direction agreed.
- **Planned** — scoped for implementation.
- **Complete** — implemented and verified in the dogfood applications.

## 0.12 implementation tranche

Implemented and browser-verified for 0.12:

- PUL-01, PUL-02, PUL-03, PUL-04, PUL-07, PUL-09, and PUL-10.
- COH-02, COH-03, and COH-04; COH-01's linked-series focus and visible
  sidebar state are fixed, while point-level scatter identity remains future
  work.
- GRI-01, GRI-02, GRI-03, GRI-06 (for reference regions), and GRI-11.

Deliberately deferred rather than hidden behind a misleading shortcut:

- COH-09 needs a point-cloud renderer that preserves individual scatter
  semantics; density mode is not an acceptable substitute. The 0.12 mobile
  cursor regression was fixed separately by removing forced tooltip layout
  from every touch frame, but that does not replace the renderer work.
- GRI-04 needs one timezone contract shared by scales, tooltips, cursors, and
  annotations rather than another isolated date formatter.
- PUL-05 and GRI-05 need a coherent two-edge/declarative group lifecycle
  design. The current instance-level `group.link()` remains supported.

## PulseOps findings

### PUL-01 — Embedded or inherited plot background

- **Status:** Candidate
- **Priority:** High
- **Owner:** Snaplot core/theme system
- **Evidence:** PulseOps, CohortLab, and GridScope all show a slightly different plot background from the surrounding `df-card`, creating a visible rectangular seam even when the application intends the chart to share the card surface.
- **Current behavior:** `ThemeConfig.backgroundColor` is painted onto the grid canvas. `CanvasManager` creates that canvas with `{ alpha: false }` for faster opaque rendering, so a literal transparent colour cannot currently reveal the parent surface.
- **Desired behavior:** Charts should visually inherit their container surface by default, or make that behavior a trivial opt-in.
- **Candidate directions:**
  1. Support a true transparent canvas, accepting and measuring the compositing cost.
  2. Add `backgroundColor: 'inherit'`, resolving the parent's computed background to a solid canvas colour while retaining the opaque fast path.
  3. Expose a dedicated `surface` or `background.mode` option rather than overloading a colour value.
- **Open questions:** Should inheritance become the global default, only the Solid component default, or an opt-in? How does it behave over gradients, images, and translucent parents?
- **Acceptance evidence:** A chart placed in dark, light, and custom-coloured cards has no visible plot rectangle without copying a colour into the chart theme; performance benchmarks remain within the agreed threshold.

### PUL-02 — Collision-aware axis corners

- **Status:** Candidate
- **Priority:** High
- **Owner:** Snaplot axis layout
- **Evidence:** Tick text from perpendicular or secondary axes can sit too close together at plot corners. On CohortLab's desktop scatter plot, the measured `75%` and `10 ms` label rectangles overlap by roughly 10px horizontally and 4px vertically. The final `1000 ms` label is clamped to only 2px from the container edge. At GridScope's 390px mobile width, `00:00` overlaps the bottom Y tick by roughly 9.7px horizontally and 4px vertically in all three linked time charts (`0 kW`, `0%`, and `R0`).
- **Current behavior:** Each axis lays out its ticks independently. Endpoint labels can therefore compete with labels from the adjacent axis.
- **Desired behavior:** Default axis layout should preserve a readable minimum gap at all four corners.
- **Candidate directions:**
  - Measure endpoint label boxes and suppress or shift the lower-priority tick when boxes intersect.
  - Reserve configurable corner clearance when calculating scale pixel ranges.
  - Prefer interior ticks over endpoint ticks on constrained plots.
  - Replace the hard-coded 2px endpoint clamp with a theme/layout safe-area token.
  - Add an `axis.collision` policy only if automatic behavior cannot be made reliable.
- **Important constraint:** Synchronized charts should make the same thinning decision where possible so their time ticks remain visually aligned.
- **Acceptance evidence:** Left/right and top/bottom axis combinations retain a defined minimum label gap at desktop and mobile widths without clipping or unstable tick changes during resize.

### PUL-03 — Pointer gestures must not trigger keyboard focus styling

- **Status:** Candidate
- **Priority:** High
- **Owner:** Snaplot interaction/accessibility
- **Evidence:** Holding Shift and pressing or dragging on charts in both PulseOps and CohortLab can produce the blue `:focus-visible` border normally intended for keyboard tab focus.
- **Current behavior:** The internal canvas container has `tabIndex=0` so arrow-key pan, `+`/`-` zoom, and `0` reset remain accessible. Mouse `pointerdown` is not prevented, and holding Shift can cause the browser to classify the resulting focus as keyboard-visible.
- **Desired behavior:** Shift-drag pans without a focus halo; tabbing to the chart still produces a clear focus indicator and enables all keyboard commands.
- **Candidate direction:** Prevent the default pointer-focus transfer for mouse/pen chart gestures after validating the interaction target. Do not remove `tabIndex`, disable `:focus-visible`, or globally hide outlines.
- **Acceptance evidence:** Mouse drag and Shift-drag never show the keyboard ring in major browsers; Tab focus always does; keyboard navigation tests continue to pass.

### PUL-04 — Semantic histogram tooltip defaults

- **Status:** Candidate
- **Priority:** High
- **Owner:** Snaplot tooltip/histogram API
- **Evidence:** The default histogram tooltip reads like `x 100 – 120  y 10`. The generic coordinate language and raw range presentation are not natural for a bin and count.
- **Current behavior:** Histogram hit testing correctly produces a range, but the one-point tooltip uses the generic scatter-style `x`/`y` template. Bin ranges are formatted with fixed `toFixed(1)` precision. `tooltip.xFormat` receives only the midpoint, so it cannot format both bin boundaries without replacing the entire tooltip renderer.
- **Desired default:** A semantic two-row presentation such as `Range 100–120` and `Count 10`, using the series/axis vocabulary where available.
- **Candidate API improvements:**
  - Add `xMin`/`xMax` or a `range` field to histogram `TooltipPoint` values.
  - Add `tooltip.rangeFormat(min, max, seriesIndex)` or a histogram-specific formatter.
  - Infer boundary precision from bin width or reuse a range-aware axis formatter rather than forcing one decimal place.
  - Allow axis labels or explicit field labels to replace generic `Range` and `Count` text.
- **Acceptance evidence:** Integer, fractional, negative, time-like, and very small/large bins have concise non-ambiguous defaults; custom formatting does not require a full HTML renderer.

### PUL-05 — Full plot-box alignment across chart groups

- **Status:** Candidate
- **Priority:** High
- **Owner:** Snaplot chart groups/layout
- **Evidence:** PulseOps aligns the left edges of its synchronized charts, but the dual-axis Traffic & errors plot ends roughly 20px earlier because its right axis consumes additional space. The mismatch becomes more prominent on mobile.
- **Current behavior:** `group.link(..., { gutters: true })` coordinates the widest left gutter only.
- **Desired behavior:** A group can align both plot edges while independently accommodating left and right axes.
- **Candidate direction:** Coordinate left and right gutter requirements across linked instances, or expose `plotBox: 'align'` with per-side controls.
- **Acceptance evidence:** Single-axis and dual-axis charts in one group share identical plot rectangles without hand-tuned padding; resizing and changing tick labels preserve alignment.

### PUL-06 — Safer reference lines on secondary axes

- **Status:** Candidate
- **Priority:** High
- **Owner:** Snaplot plugins/config validation
- **Evidence:** PulseOps configured `budget 2%` as `axis: 'y'` without `axisKey: 'y2'`. The line therefore renders near zero on the requests axis instead of at 2% on the percentage axis, while still looking superficially valid.
- **Current behavior:** `axis` describes orientation and also supplies the default axis key. In multi-axis charts, this dual meaning is easy to misunderstand.
- **Desired behavior:** Binding a reference annotation to the intended scale should be explicit, discoverable, and validated.
- **Candidate directions:**
  - Replace or supplement `axis`/`axisKey` with one unambiguous `scale: 'y2'` field and derive orientation from the scale position.
  - Warn when a chart has multiple compatible axes and a reference line relies on the default key.
  - Validate that the configured value is plausibly within the selected axis domain, while allowing an explicit off-domain override.
- **Acceptance evidence:** The PulseOps error-budget mistake produces either the correct line through a clearer API or an actionable development warning.

### PUL-07 — Compact external/header legend

- **Status:** Candidate
- **Priority:** High
- **Owner:** Snaplot Solid integration/plugins
- **Evidence:** Resource pressure and Traffic & errors have multiple coloured series but no persistent colour key. GridScope's Daily energy comparison likewise has two unlabeled colours. Tooltips reveal the mapping only after interaction. The built-in legend consumes space inside the chart container and is not naturally placed in a card header.
- **Desired behavior:** Render a compact, theme-aware legend in an application-owned header or toolbar while retaining Snaplot visibility/highlight behavior.
- **Candidate directions:**
  - Solid `<Legend chart={chart} compact />` component with headless/render-prop support.
  - A `createLegendItems(chart)` reactive primitive that returns resolved labels, colours, visibility, and highlight state.
  - Optional toggle/highlight callbacks so custom header chips do not reimplement chart state synchronization.
- **Acceptance evidence:** PulseOps can place two- or three-item legends in card headers with no manual palette duplication, and keyboard/touch visibility toggles remain accessible.

### PUL-08 — Formatted tick-label collision and duplication

- **Status:** Candidate
- **Priority:** Medium
- **Owner:** Snaplot axes
- **Evidence:** Regional availability produces adjacent ticks that both format as `100.0%` or `99.9%`, making the axis appear broken even though the underlying values differ.
- **Current behavior:** Tick generation operates on numeric values without checking whether a custom formatter collapses distinct ticks into identical visible strings.
- **Desired behavior:** Adjacent visible tick labels should remain distinguishable or be thinned automatically.
- **Candidate directions:**
  - Deduplicate consecutive identical formatted labels while retaining their gridlines.
  - Ask the scale for a lower tick count and reformat before falling back to suppression.
  - Optionally warn in development when a formatter collapses most tick labels.
- **Acceptance evidence:** Narrow domains and rounded formatters never paint repeated adjacent labels; explicit ticks can opt out when repetition is intentional.

### PUL-09 — Unified chart and DOM companion theming

- **Status:** Candidate
- **Priority:** Medium
- **Owner:** Snaplot theme system/Solid integration
- **Evidence:** The canvas uses `ThemeConfig`, while the legend table uses separate global CSS variables. In PulseOps its 11px step and header text resolve to `rgba(127,127,127,0.7)` over the dark card and appear substantially fainter than other secondary UI.
- **Desired behavior:** Applying a Snaplot theme should give tooltips, legends, legend tables, and focus treatments coherent accessible defaults.
- **Candidate directions:**
  - Publish DOM companion variables derived from the resolved chart theme on the chart host.
  - Let Solid companion components accept the chart's resolved theme automatically.
  - Define minimum contrast targets for normal, muted, disabled, and dimmed roles.
- **Acceptance evidence:** Built-in dark/light themes produce visually matched canvas and DOM components without product-specific overrides and meet agreed contrast targets.

### PUL-10 — Consistent formatting and units across axes, tooltips, and legends

- **Status:** Candidate
- **Priority:** Medium
- **Owner:** Snaplot formatting API/Solid integration
- **Evidence:** The PulseOps cursor table shows latency values such as `120` without `ms`, while the axis and tooltip use units. Developers currently configure related formatters in several places.
- **Desired behavior:** A value formatter declared for an axis or metric should be reusable by axes, tooltips, cursor snapshots, and legend tables unless explicitly overridden.
- **Candidate directions:**
  - Introduce named metric/axis formatters resolved consistently across companion components.
  - Make the default legend value column prefer `CursorSeriesPoint.formattedValue` everywhere.
  - Expose one formatter utility from the resolved scale/config for application-owned UI.
- **Acceptance evidence:** PulseOps declares latency formatting once and every default presentation reads consistently as `120 ms`.

### PUL-11 — Responsive chart-context ordering

- **Status:** Candidate
- **Priority:** Medium
- **Owner:** PulseOps application/recipe documentation
- **Evidence:** Below 1100px, the entire side rail moves after all three primary charts. Cursor details is therefore several screens away from Request latency, the chart it describes.
- **Desired behavior:** Contextual UI remains adjacent to its source chart at every breakpoint.
- **Candidate direction:** Place related chart and companion UI in the same semantic component or use named CSS grid areas that reorder the cursor table immediately after latency on narrower layouts.
- **Library implication:** Documentation should recommend co-locating chart companions rather than treating an independently ordered sidebar as universally responsive.
- **Acceptance evidence:** Cursor details remains adjacent to Request latency at desktop, tablet, and mobile widths.

### PUL-12 — Touch interaction discoverability

- **Status:** Candidate
- **Priority:** Medium
- **Owner:** Snaplot interaction UX and application recipes
- **Evidence:** PulseOps hides card metadata below 520px, including its drag/pan guidance. The charts retain cursor, pinch, zoom, and pan behavior, but there is no visible indication that the plot is interactive.
- **Candidate directions:**
  - Optional one-time touch interaction hint supplied by Snaplot.
  - An accessible compact interaction-help affordance for application headers.
  - A documented mobile chart-toolbar recipe.
- **Acceptance evidence:** A first-time mobile user can discover cursor and navigation gestures without permanently occupying scarce plot space.

### PUL-13 — Consistent loading, empty, disconnected, and stale states

- **Status:** Candidate
- **Priority:** Medium
- **Owner:** Application recipes/Solid integration
- **Evidence:** In the Empty scenario, the three primary PulseOps charts show empty messages while KPIs, the histogram, regional availability, and cursor table remain populated without a “last known” treatment. GridScope's Loading scenario substitutes only the main energy-flow chart while metrics, battery, tariff, and historical insights remain current-looking.
- **Desired behavior:** Dependent views communicate whether their values are live, stale, independent, or unavailable.
- **Candidate directions:**
  - Publish a recommended Solid chart-state wrapper rather than adding application state to chart core.
  - Support stale/dim overlays that preserve layout and optionally suppress interaction.
  - Prefer one page-level state explanation over repeating identical empty messages in every panel.
- **Acceptance evidence:** Every PulseOps scenario has an unambiguous visual state and preserved layout, with no current-looking stale values.

### PUL-14 — Product-aware focus styling

- **Status:** Candidate
- **Priority:** Low
- **Owner:** PulseOps application/theme recipe
- **Evidence:** Keyboard focus around the mint stream button uses the site's global blue accent rather than the product accent.
- **Desired behavior:** Focus remains prominent but follows the active product's design tokens.
- **Candidate direction:** Map the global focus-ring token inside each dogfood product shell, or standardize a `--focus-ring` role independent of brand accent.
- **Acceptance evidence:** All keyboard focus indicators are consistent with the product palette and maintain sufficient contrast.

### PUL-15 — Avoid redundant chart annotation text

- **Status:** Candidate
- **Priority:** Low
- **Owner:** PulseOps application
- **Evidence:** `SLO 180 ms` appears in both the Request latency card header and on the reference line. The header version disappears on mobile while the line version remains.
- **Desired behavior:** Important annotations survive every breakpoint without unnecessary desktop duplication.
- **Candidate direction:** Keep the in-plot label and use the card metadata for different context, or conditionally suppress one presentation where both are visible.
- **Acceptance evidence:** The SLO is always discoverable and appears once in the normal reading path.

### PUL-16 — Static legend for comparison bars

- **Status:** Candidate
- **Priority:** Low
- **Owner:** PulseOps application / compact legend primitive
- **Evidence:** Regional availability uses two bar colours for Current and Previous but does not identify them without hovering.
- **Desired behavior:** The comparison is readable in a static screenshot and without pointer interaction.
- **Candidate direction:** Use the proposed compact header legend with concise Current/Previous labels.
- **Acceptance evidence:** Both bar groups are immediately identifiable at desktop and mobile widths.

## PulseOps demo corrections independent of library design

These should not wait for broader Snaplot work once implementation begins:

1. Bind the error-budget reference line to `y2`.
2. Format regional availability ticks with sufficient precision.
3. Add series keys to Resource pressure, Traffic & errors, and Regional availability.
4. Add units to cursor-table values.
5. Reorder cursor details next to Request latency below the desktop breakpoint.
6. Mark retained metrics and secondary views as stale/last-known in non-live scenarios.
7. Map focus-ring styling to the PulseOps theme.

## CohortLab findings

### COH-01 — Reliable, observable linked-run focus

- **Status:** Candidate
- **Priority:** High
- **Owner:** Snaplot chart groups/highlight API and CohortLab application
- **Evidence:** Hovering a run under “Hover a run to focus every linked chart” produces no useful visible response for the user. The main scatter is intentionally not linked because highlight identity is series-level, the training chart is below the fold, and the scorecard is the only linked chart normally visible beside the run list.
- **Current implementation:** The row calls `group.highlightKey(run.id)` on `mouseenter`; the line and bar series expose numeric `meta.runId` keys through `highlight.getKey`. The external `group.highlightKey()` broadcast path lacks an end-to-end group test, and the source row does not expose a persistent pressed/focused state.
- **Desired behavior:** Focusing a run gives immediate feedback on the source row and every participating chart, with the same behavior available to pointer, keyboard, and touch users.
- **Candidate directions:**
  - Add an integration test covering `group.highlightKey()` → stable-key resolution → renderer dimming across differently ordered charts.
  - Provide a reactive group focus primitive/state so external controls can render `aria-pressed`, selected styling, and persistent touch focus.
  - Extend highlight identity to scatter data points, or explicitly expose a separate linked-datum focus channel.
  - Avoid copy such as “every linked chart” when the primary scatter cannot participate.
- **Acceptance evidence:** Hover, keyboard focus, and tap on a run visibly focus the corresponding line, scorecard bars, and scatter point; leaving/clearing restores all views predictably.

### COH-02 — Symmetric axis-title spacing and consistent padding semantics

- **Status:** Candidate
- **Priority:** High
- **Owner:** Snaplot layout/axes
- **Evidence:** In the measured 1014×430 scatter chart, the Y title begins about 5.5px from the outer edge but has roughly 21px before the tick-label column. The X title has about 5.5px below it but nearly 40px above it to the tick labels. This matches the asymmetry marked in the supplied critique image.
- **Current behavior:** Vertical gutters compute a measured requirement and take the maximum with `padding.left/right`; bottom/top title layout instead adds `titleStrip` to the configured padding. CohortLab supplies `bottom: 58` and the title strip is added again, making application padding and automatic title reservation difficult to reason about.
- **Desired behavior:** Axis titles sit in visually balanced reserved strips, and `padding` has one consistent meaning on every side.
- **Candidate directions:**
  - Treat configured padding as a minimum total gutter rather than adding title space on some sides and taking a maximum on others.
  - Model each gutter explicitly as outer safe area + title strip + title/tick gap + measured tick strip + tick/plot gap.
  - Center titles in their own strips rather than anchoring them a fixed inset from the outer edge.
  - Expose low-level per-strip controls only as an escape hatch; the default should solve the common case automatically.
- **Acceptance evidence:** Axis-title spacing is optically balanced on all four sides across short/long labels, log/linear scales, and desktop/mobile dimensions without manual padding tuning.

### COH-03 — Bar tooltips must use category labels

- **Status:** Candidate
- **Priority:** High
- **Owner:** Snaplot bar tooltip/formatting API
- **Evidence:** The Normalized scorecard X axis correctly displays `Accuracy`, `Speed`, and `Cost`, but its tooltip header displays raw indices such as `0`.
- **Current behavior:** Axis rendering resolves the bar chart's custom ticks through `axes.x.tickFormat`. `findBarTooltipPoints()` bypasses that resolver and directly stringifies the numeric X value unless `tooltip.xFormat` is separately configured.
- **Desired behavior:** Default bar tooltips use the same resolved category label as the visible X axis.
- **Candidate direction:** Centralize tick/category formatting and have axes, bar hit testing, cursor snapshots, and tooltips call the same resolver. A tooltip-specific override may still win when supplied.
- **Acceptance evidence:** Hovering each scorecard group reports `Accuracy`, `Speed`, or `Cost` without duplicating the formatter in tooltip configuration.

### COH-04 — Chart-type-aware cursor defaults for bars

- **Status:** Candidate
- **Priority:** High
- **Owner:** Snaplot cursor/interaction defaults
- **Evidence:** On the grouped scorecard, Snaplot snaps the cursor to the group center and highlights the group, but also paints a vertical crosshair. The crosshair looks like an incorrect continuous X coordinate rather than categorical group feedback.
- **Desired behavior:** Grouped bars retain tooltip and group emphasis without an unnecessary vertical crosshair by default.
- **Candidate directions:**
  - Default `cursor.xLine` to `false` for bar and histogram-only charts while leaving tooltips and hover/group emphasis enabled.
  - Introduce chart-type-aware cursor presets rather than one universal visual default.
  - Preserve an explicit `cursor.xLine: true` override for analytical cases that genuinely need it.
- **Acceptance evidence:** The scorecard hover state clearly emphasizes one group and shows its tooltip without a misleading center line; line/scatter chart cursor defaults remain unchanged.

### COH-05 — Legends for scatter encodings

- **Status:** Candidate
- **Priority:** High
- **Owner:** Snaplot scatter/Solid companion UI
- **Evidence:** The scatter subtitle says colour represents model family or cost and size represents parameter count, but there is no visual key mapping colours to families, showing the continuous cost ramp/domain, or explaining representative point sizes.
- **Desired behavior:** Categorical colour, continuous/diverging colour, density, and size encodings can generate compact, theme-aware legends without application code duplicating resolved palettes and domains.
- **Candidate directions:**
  - Add encoding legend models/components alongside the proposed series legend primitive.
  - Support categorical swatches, continuous gradient/domain ticks, density gradients, and representative size marks.
  - Expose headless resolved legend data for card-header or sidebar layouts.
- **Acceptance evidence:** Family, Cost, and parameter-size mappings are understandable before hover and update reactively when the encoding control changes.

### COH-06 — Encoding controls must reflect render-mode capabilities

- **Status:** Candidate
- **Priority:** Medium
- **Owner:** CohortLab application and Snaplot scatter API documentation
- **Evidence:** Family/Cost remains active in Density mode even though density rendering uses the heatmap/sequential gradient rather than the point-level `colorBy` and `sizeBy` encodings. The subtitle can therefore describe an encoding that is not being rendered.
- **Desired behavior:** Controls and explanatory text always match the active rendering semantics.
- **Candidate directions:**
  - Disable or hide point-encoding controls in Density mode and show a density-gradient legend instead.
  - Expose resolved render mode/capabilities so application UI does not have to duplicate Snaplot's `auto` threshold logic.
  - Document which encodings are ignored, aggregated, or transformed by each render mode.
- **Acceptance evidence:** Switching Points/Density updates controls, subtitle, legend, and tooltip semantics as one coherent state.

### COH-07 — Adjacent identity keys for trajectories and scorecards

- **Status:** Candidate
- **Priority:** Medium
- **Owner:** CohortLab application / compact legend primitive
- **Evidence:** Training trajectories and the Normalized scorecard use one series per selected run, but neither chart contains a persistent run key. On narrower layouts, the Comparison set moves after the entire analytical workspace, so its swatches are no longer adjacent to either chart.
- **Desired behavior:** Run identity remains visible wherever several selected-run series are compared.
- **Candidate direction:** Reuse the compact external legend proposed in PUL-07, or move a shared selected-run legend directly above the linked chart cluster at every breakpoint.
- **Acceptance evidence:** Every line and bar colour can be mapped to a run without scrolling or hovering on desktop, tablet, and mobile.

### COH-08 — Input-modality-aware analytical instructions

- **Status:** Candidate
- **Priority:** Medium
- **Owner:** Snaplot interaction UX and CohortLab application
- **Evidence:** The scatter footer always says “Drag a box”, “Shift-drag”, and “Wheel”, including on touch layouts. The configured touch behavior is one-finger pan, double-tap-drag selection, and pinch zoom. Hover-only run focus is also unavailable to touch and keyboard users.
- **Desired behavior:** Instructions and controls describe interactions that are actually available for the current input modality, with equivalent focus actions for keyboard and touch.
- **Candidate directions:**
  - Provide an interaction-help model derived from the resolved interaction/touch configuration.
  - Use responsive/pointer media queries only for presentation, not to guess capabilities already known to Snaplot.
  - Make run focus a persistent click/tap/keyboard action, with hover as an optional preview.
- **Acceptance evidence:** Mouse, keyboard, and touch users see accurate instructions and can complete selection, pan, zoom, and linked focus workflows.

### COH-09 — High-performance point-cloud rendering without changing scatter semantics

- **Status:** Candidate
- **Priority:** Medium
- **Owner:** Snaplot scatter rendering/performance
- **Evidence:** At 24,000 encoded points, Points mode forms an almost solid wedge and can feel more expensive to render and interact with than expected. Density mode uses a more visually consolidated rendering style, but it changes the meaning to aggregated density and discards some family/cost/size semantics. A useful intermediate mode would borrow the efficient rasterized appearance and pipeline of density rendering while still representing the original scatter points and their values.
- **Desired behavior:** Dense scatter plots can switch to a high-throughput point-cloud renderer that preserves the same point coordinates, encodings, selection, and tooltip identity as normal scatter rendering. Any visual consolidation must be understood as a rendering optimization, not a new density statistic.
- **Candidate directions:**
  - Add a rasterized or tiled point-cloud mode that batches points into an offscreen surface but composites their actual glyph colour, opacity, and size rather than emitting density values.
  - Where multiple points occupy one pixel, define deterministic compositing semantics such as stable draw order, alpha accumulation, or a documented representative-point policy; do not silently map occupancy to a heat scale.
  - Retain a lightweight spatial index or ID buffer so hover, selection, linked focus, and accessibility expose original data points rather than raster cells.
  - Keep selected, focused, and hovered points in a small crisp overlay above the rasterized base layer.
  - Benchmark typed-array preparation, draw-call count, hit testing, pan/zoom redraws, memory use, and device-pixel-ratio cost before choosing Canvas batching, an offscreen bitmap pipeline, or WebGL.
  - Let `renderMode: 'auto'` choose the optimized point renderer from measured workload and device capability, while exposing the resolved mode and allowing an explicit override.
  - Separately consider a true hybrid density + sampled/selected-points visualization when changing the statistical representation is intentional.
- **Important constraint:** The optimized mode must not make a categorical or continuous colour encoding look like density. Alpha accumulation may make crowded regions visually stronger, but tooltips, legends, and documentation must continue to describe point values rather than an inferred density measure.
- **Acceptance evidence:** The 24,000-run scatter retains the same coordinates, family/cost colours, parameter-size encoding, tooltips, selection, and linked-run identity as Points mode while materially improving initial render and interaction frame times. Switching modes must not alter the analytical meaning of the chart.

### COH-10 — Locale-aware large count labels

- **Status:** Candidate
- **Priority:** Low
- **Owner:** Snaplot numeric formatting defaults
- **Evidence:** Histogram Y axes show counts such as `2500` while surrounding application metrics use `24,000`. This is readable but visually less polished in the consumer-facing workspace.
- **Desired behavior:** Default numeric formatting uses consistent compact or grouped notation appropriate to available axis space.
- **Candidate direction:** Evaluate locale/grouping or compact-number defaults without destabilizing axis widths; retain exact raw formatting as an explicit option.
- **Acceptance evidence:** Large counts are concise and consistent across axes, tooltips, and application metrics without unwanted locale surprises.

## CohortLab demo corrections independent of library design

1. Diagnose and fix the selected-run hover wiring, and add visible selected/pressed styling to the source row.
2. Replace “every linked chart” until the primary scatter can participate in datum-level focus.
3. Hide the scorecard crosshair while retaining group highlight and tooltip behavior.
4. Use `Accuracy`, `Speed`, and `Cost` in scorecard tooltips.
5. Remove manual scatter padding once automatic axis-title layout is corrected.
6. Add categorical, continuous-gradient, and size legends to the scatter controls.
7. Replace or disable Family/Cost in Density mode and present density-specific semantics.
8. Keep selected-run colour keys adjacent to trajectories and scorecards at every breakpoint.
9. Replace hover-only focus and desktop-only interaction instructions with pointer, keyboard, and touch equivalents.
10. Give the two distribution charts distinct, intentional colours rather than the same default blue.

## GridScope findings

### GRI-01 — Controlled brush selection and data-domain invalidation

- **Status:** Candidate
- **Priority:** High
- **Owner:** Snaplot selection API/Solid integration and GridScope application
- **Evidence:** Creating a 7.2-hour brush correctly updates the GridScope metrics. Changing from Today to Yesterday then replaces the chart data with timestamps from a different day, but both Snaplot's persistent brush and the application's copied `selectedRange` remain on the old epoch range. The visible metrics become `0.0 kWh`, `0.0 kg CO₂`, and `NaN%` while the interface still says `7.2 hour selection`.
- **Current behavior:** `Chart.setData()` deliberately preserves `this.selection`. Snaplot exposes imperative `getSelection()` and `setSelection()`, but `SelectionConfig` has no controlled value, invalidation policy, or callback when a new natural domain no longer intersects the brush. The Solid application must retain the relevant instance and synchronize two independent states manually.
- **Desired behavior:** Applications can declaratively control brush selection and choose a predictable policy when data or the natural scale domain changes.
- **Candidate directions:**
  - Add a controlled Solid `selection` primitive/prop that round-trips through `selection:change` without feedback loops.
  - Add a policy such as `selection.dataChange: 'preserve' | 'clamp' | 'clear-if-outside' | 'clear'`, retaining today's serialization-friendly behavior as an explicit option if necessary.
  - Emit `selection:invalidated` with the previous selection and new natural domain when no overlap remains.
  - Provide chart-group or Solid-context access to clear a selection without separately capturing and classifying chart instances.
- **Acceptance evidence:** Switching GridScope's day never leaves an invisible stale brush or contradictory metrics; deliberate streaming/URL-restored selections can still opt into preservation.

### GRI-02 — Native reference regions for time periods

- **Status:** Candidate
- **Priority:** High
- **Owner:** Snaplot annotations/plugins
- **Evidence:** Peak tariff periods are represented by four labeled boundary lines (`peak`, `off`, `peak`, `off`) on both the main flow and tariff charts. The transition points are accurate, but users must infer which entire spans are expensive, and repeated boundary labels add visual noise.
- **Desired behavior:** Snaplot can express a bounded X or Y interval as a subtle labeled region with theme-aware fill, edge treatment, tooltip/accessibility text, and optional synchronization across chart groups.
- **Candidate API:** Extend reference annotations with `{ from, to, axisKey, fill, label, edges? }`, or add `createReferenceRegionsPlugin()` if line and region semantics are cleaner when separated.
- **Acceptance evidence:** GridScope shades 06:00–09:00 and 17:00–21:00 consistently across relevant charts with one label per period, while lines remain available for exact thresholds.

### GRI-03 — Legend marks should communicate series geometry

- **Status:** Candidate
- **Priority:** High
- **Owner:** Snaplot legend model/renderers
- **Evidence:** GridScope's built-in legend represents Solar forecast (band), Solar generation (area), and Home consumption (line) with essentially the same circular colour swatch. The two solar yellows are close, so colour alone does not explain forecast interval versus measured generation.
- **Desired behavior:** Default and external legends expose a resolved mark that reflects line, dashed line, area, band, bar, histogram, and scatter geometry in addition to colour.
- **Candidate direction:** Add a legend-mark model containing stroke, dash, fill, opacity, and series type, and render compact glyphs such as a line segment, filled block, band envelope, or point. Headless legend primitives should expose the same model.
- **Acceptance evidence:** The three energy-flow series remain distinguishable in grayscale and are understandable without toggling or hovering.

### GRI-04 — Explicit timezone contract for all time presentation

- **Status:** Candidate
- **Priority:** High
- **Owner:** Snaplot time scales/formatting
- **Evidence:** GridScope represents a specific Cape Town day, but Snaplot time ticks use the viewer's local timezone implicitly. The demo had to offset its deterministic UTC data and ensure its custom tooltip formatter happened to match the browser-local scale. Viewing the same home from another timezone can shift the displayed day and tariff boundaries.
- **Desired behavior:** Axis ticks, tooltips, cursor tables, reference annotations, and application-accessible formatters share an explicit timezone such as `local`, `UTC`, or an IANA zone.
- **Candidate direction:** Add a resolved time-format context or `axes.x.timeZone`, and let default/custom companion formatting consume it rather than independently constructing `Intl.DateTimeFormat` instances.
- **Acceptance evidence:** A Cape Town GridScope day displays the same local clock times when opened from Johannesburg, London, and New York; an explicitly viewer-local chart remains available.

### GRI-05 — Declarative Solid chart-group lifecycle

- **Status:** Candidate
- **Priority:** Medium
- **Owner:** Snaplot Solid integration
- **Evidence:** The linked energy, battery, and tariff plots align and synchronize well once configured, but `group.apply()` alone is insufficient. Every `<Chart>` must also call `onReady={register}`, and `register` imperatively calls `group.link(chart, { yDomain: false, gutters: true })`.
- **Desired behavior:** A Solid group provider/component owns apply, link, unlink, gutter alignment, zoom/cursor/highlight channels, and per-axis domain choices declaratively.
- **Candidate direction:** A `<ChartGroup>` context or `useChartGroup()` binding whose child `<Chart>` accepts `groupOptions`, with cleanup tied to component disposal.
- **Acceptance evidence:** GridScope's three linked charts require no instance-capture callback and remain correctly linked through conditional rendering and remounts.

### GRI-06 — Reactive plugin configuration in Solid

- **Status:** Candidate
- **Priority:** Medium
- **Owner:** Snaplot plugin API/Solid integration
- **Evidence:** Changing GridScope's day must move all tariff annotations. Reactive chart config does not update a plugin instance's closed-over options, so the application retains `tariffLines` and duplicates the initial line construction inside a Solid effect that calls `setLines()`.
- **Desired behavior:** Plugin inputs can be derived from Solid signals without duplicating config or mixing declarative chart updates with plugin-specific imperative effects.
- **Candidate directions:**
  - Solid plugin factories that accept accessors and own update effects.
  - A standard plugin `update(options)` contract used by the Solid chart adapter.
  - Clear documentation and development warnings when a plugin object in reactive config will not consume changed options.
- **Acceptance evidence:** Switching days moves every tariff region/line from one reactive definition with no retained imperative effect.

### GRI-07 — Input-aware selection summaries and guidance

- **Status:** Candidate
- **Priority:** Medium
- **Owner:** Snaplot interaction recipes and GridScope application
- **Evidence:** The metrics card always says `Brush the main chart`, although touch selection is configured as double-tap-drag. A completed selection is summarized as `7.2 hour selection`, which is less scannable than a clock range or `7 h 12 min` and omits its start/end times.
- **Desired behavior:** Applications can obtain a formatted, accessible selection summary and interaction guidance that reflects the resolved input configuration.
- **Candidate direction:** Extend the interaction-help model proposed in COH-08 and expose selection range/duration formatting helpers using the chart's time context.
- **Acceptance evidence:** GridScope reports a range such as `06:15–13:25 · 7 h 10 min`; mouse, keyboard, and touch users receive accurate instructions for creating, moving, resizing, and clearing it.

### GRI-08 — State treatment across a multi-chart analytical workspace

- **Status:** Candidate
- **Priority:** Medium
- **Owner:** Solid recipes/application state
- **Evidence:** GridScope's Loading scenario replaces only Today's energy flow with a loader. Its derived metrics and the battery, tariff, and historical cards remain fully populated and current-looking; the mobile header also hides `Live · updated 2 min ago`, removing freshness context when space is constrained.
- **Desired behavior:** Each view states whether it is loading, retained last-known data, independently available, or unaffected. Freshness information should compact rather than disappear.
- **Candidate direction:** Build on PUL-13 with an official state wrapper recipe and compact stale/live badges that remain available at mobile widths.
- **Acceptance evidence:** Loading and partial-outage scenarios have no ambiguous current-looking values, preserve layout, and retain a concise freshness signal on mobile.

### GRI-09 — Responsive chart sizing contract

- **Status:** Candidate
- **Priority:** Medium
- **Owner:** Snaplot Solid integration/documentation
- **Evidence:** Every GridScope chart requires an application-owned height class, with the main chart changing from 390px to 340px to 310px and secondary charts collapsing to 210px at mobile width. `<Chart>` fills its parent, so omitting any link in that CSS height chain collapses the canvas.
- **Desired behavior:** Responsive chart height requirements are obvious and common aspect-ratio/min-height behavior does not require a parallel class system.
- **Candidate direction:** Prominently document the containing-block contract and consider optional `aspectRatio`, `minHeight`, or responsive recipe primitives on the Solid component.
- **Acceptance evidence:** A new GridScope-style card can achieve stable desktop/mobile geometry with one local sizing declaration and cannot silently render at zero height.

### GRI-10 — Consistent category and metric legends in compact comparisons

- **Status:** Candidate
- **Priority:** Medium
- **Owner:** Snaplot legend/encoding companions
- **Evidence:** Daily energy has two bar colours without a Solar/Home key. Demand & temperature colours points by the same temperature value already encoded on X, but provides no gradient key or explanation, making the extra colour appear decorative or ambiguous.
- **Desired behavior:** Common grouped-bar and continuous-colour configurations can surface concise legends from resolved series/encoding data without copying palette information into application DOM.
- **Candidate direction:** Treat this as additional acceptance coverage for PUL-07 and COH-05: the same headless legend system should support series keys, category swatches, continuous ramps, and representative size marks.
- **Acceptance evidence:** Every lower GridScope chart's colour has either a visible semantic key or is intentionally removed as redundant decoration.

### GRI-11 — Visible axis tick marks as label-to-position anchors

- **Status:** Candidate
- **Priority:** Medium
- **Owner:** Snaplot axis renderer/theme
- **Evidence:** In GridScope's Daily energy chart, X gridlines are intentionally disabled to keep the grouped bars quiet, but labels such as `Jul 1`, `Jul 4`, and `Jul 7` have no visual anchor at their exact data coordinate. Estimating the center of variable-width text makes it unnecessarily difficult to determine which bar group a date denotes.
- **Current behavior:** Snaplot draws the rounded plot frame, optional full gridlines, and DOM tick labels, but no short tick marks. `ThemeConfig.tickColor` already describes “the short tick marks along each axis,” and `Layout` reserves four pixels for a tick mark plus an eight-pixel label gap, so the theme and layout imply a renderer feature that is currently absent.
- **Desired behavior:** A small, crisp mark connects every visible tick label to its exact scale position even when gridlines are disabled, without adding full-height visual noise.
- **Candidate direction:**
  - Render a 4px outward tick stub from the plot border for each visible tick, using `theme.tickColor` and device-pixel-aligned one-pixel strokes.
  - Add `axis.tickMarks?: boolean | { length?: number; direction?: 'out' | 'in' | 'both'; color?: string }`, with a restrained default or an `auto` policy.
  - Use the same final, thinned tick set as the labels so a mark never appears without its label.
  - For bar/category axes, place the mark at the category/group center represented by the tick value—not at a bar edge.
  - Suppress or carefully join endpoint marks at rounded plot corners; preserve the corner-collision safe area from PUL-02.
- **Why not full gridlines:** Full vertical rules would also reveal positions but add substantially more ink through fourteen dense bar groups. Tick stubs preserve the current visual hierarchy while solving the local mapping problem.
- **Acceptance evidence:** With X gridlines disabled, each Daily energy date is immediately traceable to its bar group at desktop and mobile widths. Marks remain crisp on DPR 1/2, follow pan/zoom, and work consistently on bottom, top, left, and right axes.

## GridScope demo corrections independent of library design

1. Clear or translate the brush when the selected day changes; guard `selfPowered` against a zero denominator so `NaN%` is impossible.
2. Format brush summaries as a clock range and human-readable duration rather than a decimal hour count.
3. Add a Solar/Home key to Daily energy.
4. Either explain the Demand & temperature colour ramp with a legend or remove the redundant temperature colour encoding.
5. Use series-type-aware marks for the main energy legend once available; meanwhile increase the distinction between forecast and measured solar.
6. Replace repeated tariff-boundary labels with lightly shaded peak spans once reference regions exist.
7. Keep a compact live/stale timestamp visible on mobile rather than hiding all card metadata.
8. Make the scope of Loading explicit for metrics and sibling charts; mark retained values as last-known if that is intentional.
9. Replace mouse-centric `Brush the main chart` guidance with pointer-, keyboard-, and touch-appropriate help.
10. Re-test and remove manual chart padding after collision-aware corners and automatic axis-title strips are implemented.
11. Enable short outward X-axis tick marks on Daily energy once supported; keep its full vertical gridlines disabled.

## Future critique sections

The following sections will be added after equally rigorous review. Repeated issues should reference and strengthen the existing item rather than create duplicates.

- Cross-application synthesis and implementation sequence
