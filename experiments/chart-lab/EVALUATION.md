# Field-trial evaluation — 17 September 2026

> Historical comparison findings from before the API overhaul. Current authoring and framework contracts are documented in [ROW_API.md](ROW_API.md), [REACT_READINESS.md](REACT_READINESS.md) and the [root README](../../README.md). These observations are retained as evaluation evidence, not current API instructions.

**This first round evaluated tuned integrations, not out-of-the-box quality.**
Its successful dashboards do not show how much corrective work the adapters hide.
The follow-up [defaults audit](DEFAULTS_FINDINGS.md) reproduces long-title clipping,
colliding ticks and an invisible single observation in Snaplot. Those findings
supersede the earlier broad conclusion that layout held up well.

The primary outcomes are now: correction work required for good appearance,
concepts/ceremony required for common tasks, and expected behavior missing from
native defaults. React packaging supports that work; it is not the headline
recommendation. See [API friction](API_FRICTION.md) and
[expected behavior](EXPECTED_BEHAVIOR.md).

## Observed behavior

| Library | What worked | Friction exposed by implementation/review |
| --- | --- | --- |
| Snaplot | Automatic measured gutters; readable scientific log ticks; semantic theme creation; no application padding overrides needed here | Row-to-column conversion and index binding; framework adapter must own lifecycle and config identity; group helpers currently live in Solid |
| Chart.js | Responsive canvas, mixed units and marks, stable instance updates | `maintainAspectRatio: false` and a sized parent are essential; a custom plugin supplies reference lines here; automatic label rotation makes compact dose/treatment charts busier |
| Recharts | Declarative React composition, reference lines, visible SVG semantics | Axes/title margins required tuning; log scales needed explicit decade ticks for this comparison; scatter uses a per-series projection; numeric bars need edge padding |
| ECharts | Declarative options, mixed axes, built-in threshold annotations, explicit disposal | Explicit resize observer and grid/name spacing; series replacement semantics matter when hiding marks; compact treatment labels remain crowded in this adapter |

These are observations about the checked-in implementations, not claims that a
library cannot produce another result. In particular, the ECharts compact label
collision is a remaining adapter tuning task, not evidence of an inherent limit.
No speed, memory, bundle-size or accessibility ranking was measured.

### Layout

- All five four-library comparison pages fit within 1440px and 390px viewports
  without page-level horizontal overflow. That does not rule out label collisions
  inside a chart: the compact ECharts endpoint chart is a counterexample.
- Snaplot's compact biological cards retained titles, decimals, log concentration
  ticks and the half-response marker at a 195px chart height. Its phone dose
  chart was also visually inspected at 390px viewport width.
- On the stacked Snaplot F1 page, all three first X ticks were positioned at
  `left: 64px` inside their respective chart hosts. This fixture did **not**
  reproduce a left-gutter alignment defect.
- All four integrations require a nonzero parent height. This supports the
  existing **GRI-09 sizing-contract** work, but it is not unique to Snaplot.
- Mixed single/right-axis plot-box coordination remains an existing **PUL-05**
  concern. This round does not implement or claim to validate native chart groups.

### API and React

- Snaplot's renderer adapter maps records to `Float64Array` columns, maps missing
  values to `NaN`, and keeps `dataIndex` consistent with series order. Recharts
  accepts records more directly for line/bar charts; Chart.js and ECharts still
  need per-series projections. An optional named-column builder would help app
  authors without replacing the columnar core.
- Core already provides `replaceOptions`, `setData`, automatic resize and
  `destroy`. The React component stays small because these responsibilities
  already have clear core boundaries.
- Configuration must be applied before replacement data when the column schema
  changes. Core's `replaceOptions` intentionally performs structural validation
  without checking indices against the previous dataset. This is supported
  behavior, not a discovered atomic-update bug.
- React callers need immutable input references or explicit imperative updates.
  Recreating plugin/config objects every render can cause unnecessary work.
  The lab adapter retains static fixture configuration; the React component
  itself accepts ordinary `config` and `data` props.
- The root package remains framework-free and the existing Solid entrypoint is
  unchanged. No public `snaplot/react` export was added prematurely.

## Evidence

Matched biological compact-card screenshots, at 1440×960:

- [Snaplot](evidence/biology-compact-snaplot.png)
- [Chart.js](evidence/biology-compact-chartjs.png)
- [Recharts](evidence/biology-compact-recharts.png)
- [ECharts](evidence/biology-compact-echarts.png)
- [Snaplot ML overview](evidence/ml-snaplot.png)
- [Snaplot biology at phone width](evidence/biology-mobile-snaplot.png)

[Browser audit JSON](evidence/browser-audit.json) records:

- Five scenarios × four libraries × three data states: 60 dashboard/state checks.
  Each comparison contained 12 charts, 15 canvases and 3 SVG roots; no chart
  error alerts, invalid SVG paths or page overflow were observed.
- All five comparisons at 390×844: 12 charts each, no page overflow/error alerts.
- UAV stress pass: 2,000 input samples, final-third filtering to 667 rows,
  light theme, explicit remount, replay reaching tick 53, and all five series
  hidden across all four libraries. Canvas count remained 15; no errors were
  observed. This is a lifecycle smoke check, not a memory-leak proof.
- Console inspection returned no errors/warnings in the evaluated session.

Automatic verification: repository typecheck, library/site/lab production
builds, Biome and the full unit suite pass. The lab build emits Vite's large
chunk advisory for the lazy ECharts chunk; this does not affect Snaplot's
published package. Fixtures cover deterministic data, sorted finite X, positive
log domains, missing values and identical focus windows. React tests cover
StrictMode setup/cleanup, a live imperative ref, retained instances on data
updates, and declarative configuration replacement.

## Initial integration follow-ups (reprioritized by the defaults audit)

1. **React entrypoint.** Promote the tested ownership pattern after settling
   peer support, SSR behavior, callback semantics and package build isolation.
   See [the readiness plan](REACT_READINESS.md). Keep columnar data first-class.
2. **Sizing recipe and diagnostics (GRI-09).** Publish a React chart-card example
   with local height/min-height/aspect-ratio ownership and a helpful zero-size
   diagnostic. No library in this trial makes an unsized parent work magically.
3. **Named-column authoring helper.** Prototype a typed record-to-column builder
   that returns stable key→index bindings. Benchmark conversion separately and
   keep callers in control of allocations for streaming.
4. **Framework-neutral grouping (PUL-05 / GRI-05).** Extract group coordination
   from Solid before building React hooks. Test cleanup, domain subscriptions,
   both plot edges, reordering and independent chart lifetimes.
5. **A second, native-capabilities round.** UAV: append/ring-buffer + dropout
   recovery. F1: shared cursor/brush + sample-rate mismatch. ML: 50K/200K scatter
   + keyed point selection. Airport: timezone/DST + event intervals. Biology:
   uncertainty bands/error bars + log-domain missing-data edge cases. Report
   unsupported capabilities rather than quietly substituting another chart.

These integration tasks remain useful, but the defaults audit now places
reproducible layout and basic-data failures first. Earlier 0.12 fixes do not prove
that all text lengths and small-data cases are handled; new evidence should be
tracked as precise edge cases rather than dismissed as already complete.
