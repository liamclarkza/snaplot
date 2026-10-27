# Backlog

The single backlog for snaplot. It replaces `SNAPLOT_IMPROVEMENT_BACKLOG.md`, `DOGFOOD_DEMOS.md`,
`notes/dogfood-friction-log.md` and the chart-lab reports (all deleted in overhaul M0; read them with
`git show overhaul-baseline:<path>`). Rows come from the reconciliation in the overhaul audit
(`notes/overhaul-audit/backlog.md` §2.1–§2.8, local only) and carry over every item that was still open,
partial or regressed at `overhaul-baseline` (6237289). Done and obsolete items are not repeated.

**Status vocabulary** (one, everywhere):

- `planned:M<N>` — an overhaul milestone owns it (plan §12; the plan's Closes lists win if this file disagrees).
- `open` — nobody owns it yet.
- `wontdo` — declined, with the reason. Declined *findings* are the plan §6 won't-do table, repeated in the
  "Won't do" section below.

**Finding** is the audit id (`notes/overhaul-audit/_index.md`) when one exists. **Acceptance** names the test
or gate that proves the item done; tests carry the finding id in their title (`[backlog-01] …`).

Sources marked *(local)* were gitignored notes; copies are in `notes/overhaul-audit/evidence/local-notes/`.

## 1. `SNAPLOT_IMPROVEMENT_BACKLOG.md`: library items

| Id | Title | Status | Finding | Acceptance |
|---|---|---|---|---|
| PUL-01 | Inherit the page background by default (plot surface seams against cards) | planned:M11 | backlog-19, visuals-04 | theme fixtures on white, cream and dark cards show no seam; the default surface paints nothing (D5) |
| PUL-02 | Corner-label collision rest: hard-coded 2 px clamp | planned:M10 | — | geometry spec: no label box outside the container; no overlapping label boxes |
| PUL-03 | Visible keyboard focus by default; the focused element has a name and `aria-keyshortcuts` | planned:M12a | backlog-14 | `m12a-a11y.spec.ts`: focus ring visible; the figure name is not tick text; axe 0 serious |
| PUL-06:y2 | A secondary value axis without a position defaults to the left and overprints `y` | planned:M10 | backlog-10 | `engine/layout.test.ts` › `[backlog-10] a second value axis defaults to the right` |
| PUL-06:warn | Warn when a reference line's value is implausible for its axis domain | open | — | a `warnOnce` case in `public/warnings.test.ts` |
| PUL-08 | Rounded formatters produce duplicate adjacent tick labels | planned:M10 | backlog-09 | `engine/axes/ticks.test.ts` › `[render-19] a rounding format produces no repeated adjacent labels`; geometry fixtures |
| PUL-09 | Companion (legend, legend table) styling needs a separate CSS import | planned:M12b | dxtrial-06 | `dom/legend.test.ts`: computed styles without any CSS import (D8) |
| PUL-10 | One formatter for axis, tooltip, cursor and legend table (regressed) | planned:M10 | backlog-01 | `engine/format.test.ts` › axis format drives tooltip, cursor and legend table; seeded by M1 `m1-readout.test.ts` |
| PUL-12 | Touch discoverability: an interaction-help model | planned:M15b | backlog-21 | docs recipe for interaction help; plan §10.1 #9 (help text matches the input modality) |
| PUL-13 | Loading, empty and stale states | planned:M15b | backlog-21 | docs state recipe page, executed in all three framework tabs |
| COH-01 | Datum-level linked focus (highlight is series-only) | wontdo | backlog-16 | plan §6: a plugin recipe through `chart.scale()` covers it |
| COH-05:categorical | Scatter encoding legend for categorical `colorBy` | planned:M12b | backlog-15:categorical | `dom/legend.test.ts` › auto legend for categorical `colorBy` |
| COH-05:ramp | Colour-ramp and size legends | wontdo | backlog-15:ramp | plan §6 and D36 (see §9) |
| COH-06 | Controls match the render mode; no public resolved-render-mode accessor | open | — | an accessor (or documented rule) for the resolved scatter render mode |
| COH-08 | Modality-aware interaction instructions (the "drag, shift-drag, wheel" hint is shown to every input) | planned:M15b | backlog-21 | see PUL-12 (the interaction-help recipe); the demo side is CohortLab-9 (planned:M16a, §10.1 #9) |
| COH-09 | Point-cloud renderer for dense scatter | wontdo | backlog-28:cold-scatter | plan §6; at-rest decimation (`backlog-28:at-rest`) is planned:M11 |
| COH-10 | Grouped or compact large numbers in ticks (`1000000`, `3000000000`) | planned:M10 | backlog-18 | `engine/format.test.ts` › grouping |
| GRI-01 | Brush cleared on data change emits no `selection:change` (regressed) | planned:M8 | backlog-02 | `public/events.test.ts` › a selection cleared by a data change emits `selection:change(null)` |
| GRI-04:utc | Explicit time zone (`timeZone: 'local' \| 'UTC'`) | planned:M10 | backlog-06:utc | `engine/axes/ticks.test.ts` › UTC ticks; DST hour ticks; `npm run test:tz` |
| GRI-04:iana | IANA time zones | wontdo | backlog-06:iana | plan §6 and D7; see §9 |
| GRI-07 | Input-aware selection summary and duration helpers | planned:M15b | backlog-21 | docs recipe |
| GRI-08 | Multi-chart loading and freshness treatment | planned:M15b | backlog-21 | docs state recipe |
| GRI-09 | Sizing contract: a 0 px host fails silently | planned:M11 | backlog-05 | `engine/render/surface.test.ts` › zero-height fallback with exactly one warning; docs Sizing page (M15b) |
| GRI-10:categorical | Series and category keys | planned:M12b | backlog-15:categorical | `dom/legend.test.ts` › auto at ≥ 2 series |
| GRI-10:ramp | Continuous-ramp legend | wontdo | backlog-15:ramp | plan §6 and D36 |

## 2. `SNAPLOT_IMPROVEMENT_BACKLOG.md`: demo corrections

PulseOps, CohortLab and GridScope are deleted in M0 (D33, plan §10). Their open corrections become the
acceptance checklist of the six new demos (plan §10.1), closed by `backlog-20` in M16a, or move to the
library item that causes them.

| Id | Correction | Status | Finding | Acceptance |
|---|---|---|---|---|
| PulseOps-1 | Budget line bound to the requests axis | planned:M16a | backlog-20 | §10.1 #9: threshold lines sit on the axis of the quantity they mark |
| PulseOps-2 | Availability tick precision | planned:M10 | backlog-09 | see PUL-08 |
| PulseOps-3 | Series keys | planned:M16a | backlog-20 | §10.1 #7: legend colours come from the chart; D6 auto legend |
| PulseOps-4 | Units in the cursor table | planned:M10 | backlog-01 | see PUL-10 |
| PulseOps-5 | Reorder the cursor details | planned:M16a | backlog-20 | demo task spec at 390 and 1280 px |
| PulseOps-6 | Stale and last-known treatment | planned:M15b | backlog-21 | docs state recipe |
| PulseOps-7 | Product focus ring | planned:M12a | backlog-14 | see PUL-03 |
| CohortLab-2 | "Every linked chart" copy contradicts the behaviour | planned:M16a | demos-03 | §10.1 #1–#2: the page's claims are computed and checked by an oracle |
| CohortLab-5 | Manual scatter padding | planned:M16a | backlog-20 | §10.1 #7: no manual padding |
| CohortLab-6 | Encoding legends | wontdo | backlog-15:ramp | categorical part planned:M12b |
| CohortLab-7 | Density semantics | planned:M11 | — | `engine/marks/scatter.test.ts` › several density series share one theme ramp (documented) |
| CohortLab-8 | Adjacent run keys use hard-coded colours that do not match the chart | planned:M16a | backlog-20 | §10.1 #7: legend colours from `getState().series`, never CSS copies |
| CohortLab-9 | Modality-aware help | planned:M16a | backlog-20 | §10.1 #9 |
| CohortLab-10 | Distinct histogram colours (`fill` ignored) | planned:M11 | backlog-12 | `engine/marks/*.test.ts` › histogram colour equals the legend |
| GridScope-1 | Clear the brush on day change; guard NaN | planned:M8 | backlog-02 | see GRI-01; §10.1 #9: no summary shows `NaN` |
| GridScope-2 | Clock-range summary | planned:M15b | backlog-21 | see GRI-07 |
| GridScope-3 | Solar/Home key | planned:M12b | backlog-15:categorical | D6 auto legend |
| GridScope-4 | Ramp legend, or drop the colour | wontdo | backlog-15:ramp | plan §6 |
| GridScope-7 | Live stamp hidden on mobile | planned:M16a | backlog-20 | §10.1 #9: freshness visible at 390 px |
| GridScope-8 | Loading scope | planned:M15b | backlog-21 | docs state recipe |
| GridScope-9 | Modality-aware help | planned:M16a | backlog-20 | §10.1 #9 |
| GridScope-10 | Manual padding on every chart | planned:M16a | backlog-20 | §10.1 #7 |
| BARSLOT | Phantom empty "Jul 15" bar slot from the bar-axis plan | planned:M10 | backlog-13 | `engine/ranging.test.ts` › numeric bars ±½ slot; no phantom slots |
| PUL-05:demo, PUL-06:demo, PUL-11, PUL-14, PUL-15, PUL-16, COH-07, VIS-02:demo, DX-06:demo | App-only fixes in the deleted demos (padding, wrong axis, layout, focus colour, duplicate SLO text, missing keys, numeric pseudo-categories) | planned:M16a | backlog-20 | §10.1 #7–#9 for the new demos |

## 3. `notes/dogfood-friction-log.md` (written against 0.11.1)

| Id | Title | Status | Finding | Acceptance |
|---|---|---|---|---|
| DX-02 | Height contract | planned:M11 | backlog-05 | see GRI-09 |
| DX-04 | Datum identity in highlight | wontdo | backlog-16 | see COH-01 |
| DX-07 | CSS subpath under the source alias | planned:M8 | backlog-27 | the `./legend-table.css` export is gone (D8); one alias mechanism (repo-16, M5) |
| VIS-04 | Theme versus DOM styling: the CSS import is still separate | planned:M12b | dxtrial-06 | see PUL-09 |
| VIS-05 | State overlays recipe | planned:M15b | backlog-21 | docs state recipe |
| VIS-06 | Implicit local time zone | planned:M10 | backlog-06:utc | see GRI-04:utc |

## 4. `notes/dx-audit.md` *(local; written for `revamp/v1-prep`)*

| Item | Status | Finding | Acceptance |
|---|---|---|---|
| Bundle budgets exceeded, `react.js` unbudgeted, size not checked in CI | planned:M5 | backlog-22 | `npm run check:size` in CI with budgets for `createChart`, React, Solid, `histogram`, `createLegendTable` |
| `getOptions` returns the caller's live object | planned:M8 | — | `getOptions` is removed from the handle (plan §4.1); intake copies (D16) |
| `redraw(layer?)` | planned:M8 | — | the 14-member handle has `redraw(layer?)` (plan §4.1, D21) |
| Post-destroy calls are silent no-ops | open | — | a test that a call after `destroy()` throws `snaplot: …` with a fix hint (P1) |
| Container accessible name and `aria-keyshortcuts` | planned:M12a | backlog-14 | see PUL-03 |
| Scatter `colorBy` palettes accept only hex | planned:M11 | backlog-17 | `engine/theme/color.test.ts` › named, `rgb()`, `hsl()`, `oklch()` palettes match the browser |
| A single-point line renders nothing | planned:M11 | backlog-04 | `engine/marks/*.test.ts` › isolated-point marker |
| Selection and brush colours are hard-coded | planned:M8 | backlog-27 | selection colours come from the theme tokens |
| Built-in tooltip, crosshair and legend plugin files are dead (~800 lines) | planned:M2 | backlog-24 | the files are gone; metrics: legend implementations count drops |
| Unreachable engine `syncKey` / `SyncGroup` path | planned:M2 | backlog-24 | the path is gone |
| `createScale` still falls back silently on an unknown type | open | — | an unknown scale type throws at the engine boundary too |
| Duplicate plugin id installs once, silently | planned:M8 | backlog-27 | `normalize` throws on a duplicate plugin `id` (plan §5.9) |
| `ReferenceLine` JSDoc still says "Defaults to '#888'" | planned:M7 | docs-02 | TypeDoc `validation.notDocumented` as an error; every default in `@defaultValue` |
| Legend-table `fallback` enum is unvalidated | planned:M8 | backlog-27 | `public/normalize.test.ts` case |
| Exports order: `types` not first for `.` and `./core` | planned:M5 | frameworks-10 | `npm run check:package` (publint, attw) |
| Coverage is configured but no provider is installed | planned:M0 | backlog-27 | `@vitest/coverage-v8` declared; `npx vitest run --coverage` runs (M14 adds the ratchet) |

## 5. `notes/feature-proposal-1.0.md` *(local)*

| Item | Status | Acceptance |
|---|---|---|
| Group `defaults` (fleet shared defaults) | wontdo | D17: a shared-options spread recipe in the migration guide |
| Annotations v2: event markers | open | see D36 text annotations (plugin recipe) |
| Last-value chips | open | — |
| Selection sync / crossfilter across a group | open | — |
| Minimap | open | — |
| Time zone (GRI-04) | planned:M10 | see GRI-04:utc; IANA is wontdo |
| Encoding legends | planned:M12b | categorical only; ramp and size are wontdo |
| Plugin v2 | planned:M8 | D21 minimal contract; `public/plugins.test.ts` |
| `asinh` scale | open | — |
| Export (PNG, SVG) | wontdo | D28; see D36 |
| Reconcile the non-goals with the README's "Not yet supported" list | planned:M15a | README "Not yet supported" lists the D36 items |

## 6. `notes/PERF.md` *(local)* and `bench/README.md`

| Item | Status | Finding | Acceptance |
|---|---|---|---|
| The tracked bench baseline predates 0.10 | planned:M4 | backlog-23 | same-run A/B (`bench:ab`) replaces committed baselines; `baselines/` is history only |
| `append-stream-50k-window` measures harness work (~100 ms the library does not spend) | planned:M4 | backlog-23 | the M4 scenario reports main-thread busy time; self-A/B within ±0.07 |
| Cold dense-scatter paint (`scatter-render-200k`) | wontdo (deeper work) | backlog-28:cold-scatter | plan §6; `backlog-28:at-rest` planned:M11 |
| `bench/README.md`: stale 0.9 → 0.10 table, misplaced scenario line | planned:M4 | — | rewritten README with method, reference machine and a History section |
| PERF.md's root causes and fixes | planned:M4 | — | `bench/README.md` History section |

## 7. `experiments/chart-lab/*.md` (deleted in M0)

| Id | Item | Status | Finding | Acceptance |
|---|---|---|---|---|
| DEF-01 | Long axis titles clip; no fitting policy | planned:M10 | backlog-07, visuals-21:def-01 | geometry fixtures (long titles at 320 and 480 px); no label outside the container |
| DEF-02 | Long formatted ticks overlap; the Y gutter has no cap | planned:M10 | backlog-08 | geometry fixtures (long ticks); measured gutters |
| DEF-03 | Native string categories never thin (regressed) | planned:M10 | backlog-03, visuals-21:def-03 | `engine/axes/ticks.test.ts` › 30 long categories do not overlap |
| DEF-04 | A single observation, or points isolated between gaps, draw nothing | planned:M11 | backlog-04, visuals-21:def-04 | isolated-point marker test; browser `m11-marks.spec.ts`: every finite datum paints |
| DEFAULTS ledger | "Count the correction work": no ledger existed | planned:M3b | — | `npm run ledger` lists every open required finding; M3a turns the DEFAULTS cases into fixtures |
| EXPECTED-empty | Empty data: fake 0..1 axes; `update({ data: [] })` keeps the old domain | planned:M10 | backlog-11 | `engine/ranging.test.ts` › empty → no ticks |
| API_FRICTION-format | "Format once" (regressed) | planned:M10 | backlog-01 | see PUL-10 |
| EVALUATION-2 | Sizing recipe and a zero-size diagnostic | planned:M11 | backlog-05, docs-05 | see GRI-09; docs Sizing page (M15b) |
| EVALUATION-5 | A native-capabilities round (append and dropout recovery, cursor and brush sync, keyed selection, time zone and DST intervals, uncertainty bands and log-domain gaps) | open | — | partly covered by the six demos (plan §10.2); error bars and IANA zones are D36 |
| trials-RESULTS | React ref-to-state friction | planned:M13 | — | the hooks accept a plain `useRef` (plan §4.2); conformance suite |

## 8. `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `DOGFOOD_DEMOS.md`

| Item | Status | Finding | Acceptance |
|---|---|---|---|
| CHANGELOG [Unreleased] and README state things that are no longer true; no breaking-change or migration section | planned:M15b | backlog-25 | migration guide with `check-migration`; CHANGELOG written in M17 |
| README links into the deleted lab and lists `dev:lab` / `build:lab` | planned:M15a | repo-17 | `sync-readme --check` and the internal link check (no links to untracked or deleted files) |
| CONTRIBUTING: stale workspaces and script table | planned:M15b | docs-17 | the script table is generated from `package.json` |
| `DOGFOOD_DEMOS.md` is stale | planned:M0 | demos-19 | deleted in M0 |

## 9. D36: deferred features (not findings)

Accepted as future work, outside 1.0. Each needs a design note before it starts.

| Feature | Acceptance (when built) |
|---|---|
| IANA time zones | `timeZone` accepts IANA names; property tests across UTC, Europe/London, America/Los_Angeles, Asia/Kathmandu, Australia/Lord_Howe and Pacific/Chatham, plus TZ-env runs |
| Reversed axes | `axes.<key>.reverse`; ticks, hit testing, zoom and brush all respect the direction (fixtures plus `engine/viewport.test.ts`) |
| Stacked bars and areas, with a `stack()` helper | stacked extents in the domain policy; tooltip rows show both segment and total; fixtures |
| Horizontal bars | a horizontal bar mark; category labels on Y; hit testing along Y |
| Error bars | a plugin recipe on the D21 contract, executed in the docs |
| Text annotations and event markers | a plugin recipe; labels laid out with the annotation label policy |
| Colour-ramp and size legends | a legend for continuous `colorBy` and `sizeBy` in core, in all three frameworks |
| Per-series density ramps | each density series uses its own ramp; documented |
| Datum-level linked focus | a group can highlight a datum by `rowId` across charts |
| PNG and SVG export | layers composited, the surface filled, labels painted from `LabelBox[]`, pixel-compared to the DOM rendering |
| JSX tooltips | `tooltip.render` may return framework JSX in React and Solid (today a recipe renders JSX into a `Node`) |
| `<snaplot-chart>` web component | the vanilla options as properties; conformance scenarios run against it |
| Data-table accessibility view | a toggleable table of the plotted data, keyboard-reachable; axe clean |
| Tidy-data `series.by` splitting | long data split into series by a field; until then, a clear error and a pivot recipe (dxtrial-18) |
| A DPR cap option | backing stores capped at a chosen DPR; memory measured in `mount-24-charts` |
| `Float32Array` columns | accepted without copying; precision documented |
| Tree-shaking by mark type | a line-only bundle excludes the other marks; `check:size` budget per mark set |
| Forced-colours mapping for canvas marks | marks follow system colours under `forced-colors: active` |
| A readonly single-canvas mode | readonly charts use one canvas; memory test |
| Raster heatmaps | a heatmap mark over binned grids |
| Releasing backing stores of far-offscreen charts | offscreen charts free their canvases and restore on view; memory test |
| `llms.txt` with a Markdown copy per page | a Starlight plugin emits both; link check |
| A published competitive benchmark page | generated from `bench/` competitive mode output on named reference hardware |

## 10. Won't do in this overhaul (plan §6)

Every item is a medium- or low-severity finding part. The closed parts of the same findings are listed on the
right.

| Item | Finding (part) | Reason | Acceptance if revisited | Closed part |
|---|---|---|---|---|
| Colour-ramp and size legends | backlog-15:ramp, dxtrial-13:ramp | New surface; no remaining demo needs them. | see D36 | `:categorical`, M12b |
| Datum-level linked focus | backlog-16 | New surface. A plugin recipe through `scale()` covers it. | see D36 | — |
| Tidy (long) data `series.by` splitting | dxtrial-18 | New surface. The duplicate-category error names the pivot fix, and a 6-line recipe covers it. | see D36 | — |
| IANA time zones | backlog-06:iana, demos-07:iana | D7. `'local' \| 'UTC'` closes the common case; the typed union allows a non-breaking later addition. | see D36 | `:utc`, M10 |
| Print mode beyond the DPR guard, synchronous paint, hidden tooltip and `break-inside` | gap-environments-02:print-mode | Needs print-specific themes; no user asked. | print emulation fixtures per theme | `:print-basics`, M11 |
| A published competitive benchmark | gap-competitive-05:publication | Needs competitor dependencies and reference hardware. | see D36 | `:harness`, M4 |
| Tree-shaking by mark type | gap-competitive-06:registry | Would need a registration ceremony. The size budget is enforced instead. | see D36 | `:budget`, M5 |
| A shared cross-chart frame loop, if the M11 stretch gate fails | gap-scale-longevity-06:shared-loop | Visibility gating and the lazy overlay take most of the gain. If the stretch lands, M11 moves this part to closed. | `mount-24-charts` and `resize-storm-24` improve, nothing regresses | `:visibility`, M11 |
| Remaining cold dense-scatter paint work | backlog-28:cold-scatter | Measured and recorded; at-rest decimation lands, deeper work waits for demand. | a scatter first-paint budget in `bench/gate.json` | `:at-rest`, M11 |
| Removing the four-sided frame (boxed chrome) | visuals-26 | D22: the maintainer-approved Chart.js look is kept. Recorded as a proposal in ADR 0002. | maintainer approval under ADR 0001 | — |
| Light palette members below 3:1 | visuals-13:light | D9 and D22: the Okabe–Ito order is the approved look; legend, tooltip swatches and mark shape carry series identity; `lineWidth` 2 is the recorded proposal. | `check:palettes` enforcing the light palette | `:dark`, M11 |
| PNG export | gap-environments-04, gap-annotations-extensibility-10 | D28: one text path; not asked for. | see D36 | — |

## 11. Left open after the overhaul

The overhaul closed every required finding: `trace-check` locks them all, and the expected-failure ledger holds
only the §6 won't-do parts. The units deferred at M17 (gap-perf-gate-03, gap-perf-gate-05, `perf:density-cache`)
closed in the final pass, and so did three items this table listed: the streaming heap (36–39 KB gross per append
on desktop, 32–36 on mobile, against 50; the bench had warmed up on frames, not appends), the data-layer repaint on an
option update that changes no mark, and reference lines and regions outside the automatic Y range. The
`planned:M<N>` statuses above are the plan's; every finding id they name is closed.
Every budget of the final `npm run bench:ab -- --base overhaul-baseline` is met on the desktop and the mobile
profiles. What is still open:

| Item | Finding | Status | Measured | Acceptance |
|---|---|---|---|---|
| Library size: about 17,700 code lines and 81.4 KiB gzip against 10,500 and 50 | — | open | ADR 0002 §6 | `node scripts/overhaul/metrics.mjs`; one option-schema table would remove about 1,000 lines |
| A check on real phones (iOS Safari, a low-end Android) | — | open | WebKit at iPhone size in the Playwright image only; the iOS Simulator needs the maintainer (one runtime does not finish booting, the other asks for access) | the handoff's human step 8 |

## Sources

Every document the audit reconciled, and where its open rows went.

| Source | Tracked at baseline | Open rows |
|---|---|---|
| `SNAPLOT_IMPROVEMENT_BACKLOG.md` | yes (deleted in M0) | §1, §2 |
| `DOGFOOD_DEMOS.md` | yes (deleted in M0) | §8 |
| `notes/dogfood-friction-log.md` | yes (deleted in M0) | §3 |
| `notes/dx-audit.md` | no (local) | §4 |
| `notes/feature-proposal-1.0.md` | no (local) | §5 |
| `notes/PERF.md` | no (local) | §6 |
| `bench/README.md` | yes | §6 |
| `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md` | yes | §8 |
| `experiments/chart-lab/DEFAULTS_FINDINGS.md` | yes (deleted in M0) | §7 |
| `experiments/chart-lab/VISUAL_REFINEMENT.md` | yes (deleted in M0) | became [ADR 0001](decisions/0001-visual-reference.md); side effect BARSLOT in §2 |
| `experiments/chart-lab/API_FRICTION.md` | yes (deleted in M0) | §7 |
| `experiments/chart-lab/EVALUATION.md` | yes (deleted in M0) | §7 |
| `experiments/chart-lab/EXPECTED_BEHAVIOR.md` | yes (deleted in M0) | §7 |
| `experiments/chart-lab/trials/RESULTS.md` | yes (deleted in M0) | §7 |
| `experiments/chart-lab/README.md`, `REACT_READINESS.md`, `ROW_API.md`, `API_OVERHAUL_VALIDATION.md`, `notes/{chartjs,echarts,recharts,snaplot}.md` | yes (deleted in M0) | none (accurate, redundant or informational) |
