# Feature proposal for snaplot 1.0

Method: ten prior-art studies (uPlot, Observable Plot, Vega-Lite, ECharts,
Plotly, Chart.js, Highcharts, lightweight-charts, D3, Recharts/visx) were
distilled into twenty candidates, then scored by three independent lenses:
daily user impact (an ML-dashboard operator), identity fit (a maintainer
guarding a small, dependency-light streaming library), and engineering
cost (value per unit of implementation, test, and perf-budget risk).
Scores below are the three-lens average out of 10.

The guiding rule from the prior art: every feature must reinforce the
streaming-dashboard identity, and anything a userland helper or plugin
can do stays out of core. uPlot's most durable asset is its published
out-of-scope list; 1.0 should ship one (see "Explicit non-goals").

## Tier 1: recommended for 1.0

Small items marked "built" were implemented during this pass; they are
additive, non-breaking, and were top-quartile in all three lenses. The
medium items need your sign-off before they are built.

| # | Feature | Score | Cost | Status |
| --: | :-- | --: | :-- | :-- |
| 1 | Live-follow viewport: explicit follow-latest window, `scrollToLatest()`, live/paused state | 8.8 | medium | needs sign-off |
| 2 | `appendData` tail update (`{ updateLast: true }`) for in-progress buckets | 8.2 | small | built |
| 3 | Render-time auto-decimation for line/area (default-on, cursor stays on raw columns) | 8.0 | medium | needs sign-off (hot path; coordinate with perf budget) |
| 4 | Persistent brush selection as first-class chart state | 7.8 | medium | needs sign-off |
| 5 | Chart-group fleet config: shared defaults, shared Y domains, aligned gutters | 7.8 | medium | needs sign-off |
| 6 | `series.spanGaps`: bridge NaN gaps per series | 7.7 | small | built |
| 7 | Cursor proximity auto-highlight (`highlight.proximity`) | 7.5 | small | built |
| 8 | Axis titles (`AxisConfig.label`) with layout margin reservation | 7.2 | small | built |

Notes on the sign-off items:

- **Live-follow viewport** formalizes the state machine that already half
  exists (`userZoomedAxes` suppressing auto-range). All three lenses put
  it at or near the top: streams yanking the viewport mid-inspection is
  the most common streaming complaint. Risk is in zoom-sync propagation
  and ring-buffer edge cases.
- **Auto-decimation** turns the exported `lttb`/`m4` utilities into a
  render-pipeline guarantee. It belongs with the perf workstream since it
  changes the hottest path and needs the benchmark suite to prove no
  fidelity or perf regressions.
- **Persistent selection** extends the existing selection gesture,
  `SelectionResult`, and sync machinery; it is also the prerequisite for
  cross-chart crossfilter dimming (tier 2).
- **Fleet config** prevents the config-drift failures that silently break
  sync groups; shared-domain broadcast needs care to avoid auto-range
  feedback loops, and `createChartGroup` needs a framework-free home
  first (it currently lives in the Solid layer).

## Tier 2: worth doing after tier 1

| Feature | Score | Why not now |
| :-- | --: | :-- |
| Annotations v2 (shaded regions, event markers, handle-based updates) | 7.3 | Extends the reference-lines plugin; scope should be split, regions first |
| `alignColumns()` outer-join utility (+ optional ema/rollingMean) | 7.3 | Load-bearing for the strict shared-X model; pure utility, zero runtime risk; smoothers are arguably userland |
| Per-series value formatting + last-value chips | 7.0 | Real correctness gap (mixed-unit series formatted by the axis formatter) but touches tooltip, legend, snapshot, and a new gutter surface at once |
| React adapter (`snaplot/react`) | 7.0 | Biggest adoption lever, zero core cost, but a permanent second-package maintenance tail; decide deliberately |
| Selection sync / crossfilter dimming | 6.7 | Hard-blocked on persistent selection |
| Overview minimap plugin | 6.2 | Most-requested navigation affordance but the only large-cost item; reuses live-follow semantics, so it must trail it |

## Tier 3: deferred or rejected

- **Tick-system upgrades** (SI notation, pixel-density counts, timeZone):
  each piece is small but the bundle is diffuse and SI-by-default is a
  silent behavior change. Do `AxisConfig.timeZone` alone when asked.
- **Encoding legends**: expose `getEncodingScale()` first if demand
  appears; full ramp/swatch DOM serves the analytical-scatter corner, not
  the streaming core.
- **Plugin contract v2** (per-series renderers, autoscale participation):
  strategically important before an API freeze, but it is the riskiest
  API design on the list and deserves its own proposal.
- **Accessibility layer**: keyboard pan/zoom and reduced-motion are
  already handled (the design workstream covers `prefers-reduced-motion`);
  the aria-live streaming announcer is a plugin-shaped project for later.
- **asinh scale**: real but narrow; smallest audience of any candidate.
- **Export to PNG/CSV**: OS screenshots cover most of the need; the
  layered-canvas compositing helper can be a cookbook recipe instead.
- **Ordinal/equi-spaced X** (rejected): financial-chart shaped, and it
  breaks the binary-search culling and cursor-snap invariants that the
  sorted-X model buys. List under non-goals.

## Explicit non-goals for 1.0

Stacked series, animations/transitions beyond hover and highlight,
OHLC/candlestick chart types, data munging beyond the exported utilities,
ordinal X distributions, and a scale plugin system. Userland or plugins
can do all of these; refusing them in writing is what keeps the library
small.
