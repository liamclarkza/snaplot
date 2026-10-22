# Field trials: chart-library comparison lab

Five product scenarios × four chart libraries, in one private React workspace.
Each scenario has three charts: 20 dashboard combinations and 60 rendered chart
combinations. Shared fixtures, card sizes, controls and semantic series IDs make
the comparison repeatable. Snaplot uses the native `snaplot/react` integration.
The subsequent [visual refinements](VISUAL_REFINEMENT.md) update core rendering
and range defaults based on the comparison.

```sh
npm install
npm run dev:lab       # http://127.0.0.1:4175
npm run build:lab     # TypeScript + production build
npm run test -w snaplot-chart-lab
```

Choose a scenario, then a library or **Compare all**. Direct links:

For the primary goals—out-of-box layout, correction work, simple authoring and
expected behavior—start with the [defaults audit](http://127.0.0.1:4175/?audit=defaults)
and its [findings](DEFAULTS_FINDINGS.md). It includes ten stress cases and a
native-versus-tuned switch. The original dashboard results are integration
evidence and do not prove good defaults.

- [UAV ground station](http://127.0.0.1:4175/?scenario=uav&library=snaplot)
- [F1 pit wall](http://127.0.0.1:4175/?scenario=f1&library=snaplot)
- [ML experiment tracker](http://127.0.0.1:4175/?scenario=ml&library=snaplot)
- [Airport operations](http://127.0.0.1:4175/?scenario=transport&library=snaplot)
- [Biological experiment](http://127.0.0.1:4175/?scenario=biology&library=snaplot)
- [Four-library comparison](http://127.0.0.1:4175/?scenario=uav&library=snaplot&compare=1)

The links require the local server. URL state stores scenario/library/comparison
mode; stress controls intentionally reset on reload.

## Challenges

| Product | Charts | Main questions |
| --- | --- | --- |
| UAV ground station | Altitude + speed, battery reserve, radio integrity | Do two Y axes leave a useful plot? Are dropouts disconnected? Do warning lines remain legible? |
| F1 pit wall | Speed comparison, throttle/brake, signed lap delta | Do vertically stacked distance traces align? Does the zero line communicate gained/lost time? |
| ML tracker | Log loss, validation accuracy, quality/latency scatter | Can runs retain identity across charts? Are several decades readable? Does scatter handle a denser dataset? |
| Airport operations | Grouped hourly movements, gate occupancy, wait/passenger demand | Can numeric hourly bars and capacity markers fit? What happens with mixed units and long labels? |
| Biological experiment | Replicate growth, log dose response, treatment endpoints | Are decimal and log ticks readable? Are discrete treatment labels legible in a narrow card? |

Controls cover complete/missing/empty data, 180/2,000 samples, full/final-third
windows, light/dark themes, compact cards, sidebar resizing, explicit remounts,
and deterministic 2 Hz replay. Airport bars stay at 12 rows, biology endpoints at
3, and dose response at at most 60; those are deliberate semantic fixtures.

Legends toggle by stable ID across matching charts and all comparison libraries.
All data are synthetic. Top metrics and tables are labelled scenario snapshots;
they do not claim to be live values from the changing charts.

## Reading the result

- [API overhaul implementation and validation](API_OVERHAUL_VALIDATION.md)

- [Evaluation and prioritized follow-ups](EVALUATION.md)
- [Defaults failures and correction work](DEFAULTS_FINDINGS.md)
- [API friction and simpler authoring proposal](API_FRICTION.md)
- [Direct data API](ROW_API.md)
- [Expected behavior and feature gaps](EXPECTED_BEHAVIOR.md)
- [React integration and verification](REACT_READINESS.md)
- [Machine-readable browser audit](evidence/browser-audit.json)
- Adapter implementation notes: [Chart.js](notes/chartjs.md),
  [Recharts](notes/recharts.md), [ECharts](notes/echarts.md),
  [Snaplot](notes/snaplot.md)

Three Luna agents built the competitor adapters independently against
`src/types.ts`. The parent built the fixtures, shell and Snaplot/React adapter,
then reviewed and refined all four in the browser. They are four independent
renderer implementations inside a shared experiment, not four unrelated apps.

## Scope and fairness

This is a layout and authoring experiment, **not a performance benchmark**.
Animations are disabled. Replay replaces deterministic windows in all libraries;
it does not benchmark Snaplot's `appendData` or ring buffer. Native gesture zoom
is disabled for Snaplot; the shared window selector filters the input identically.
Native linked cursors, brushing, band/error-bar plots, WebGL, arbitrary scatter X,
timezones and large-scale streaming are future rounds.

Series colors, input rows, Y domains and outer card dimensions match. Libraries
still choose their own ticks, automatic X-domain rounding, plot insets, bar widths
and tooltip behavior. These are part of the layout experiment, and mean screenshot
differences cannot be attributed to a renderer bug without further inspection.
The shared legend/empty overlay are application code, not native library features.

The current lab uses the local Snaplot source, React 19.3.0, Chart.js 4.5.1,
Recharts 3.10.1 and ECharts 6.1.0 (exact versions in the root lockfile).
The native React integration is implemented locally; this overhaul has not been published. All chart parents have an
explicit height. Google Fonts are cosmetic and have system fallbacks.

## Repeat the review

1. At 1440×960, enable Compare all and visit all five scenarios.
2. For each, switch Complete → Missing samples → Empty → Complete.
3. On UAV, choose 2,000 samples and Final third; verify 667 rows per chart.
4. Flip theme, step/replay/pause, hide and restore series, and remount charts.
5. Compare compact biological cards; inspect log ticks and endpoint labels.
6. At 390×844, visit all five comparisons and inspect the vertical card flow.
7. Check browser console and page overflow; inspect marks visually, since a
   canvas/SVG element's existence alone does not prove correct chart rendering.

Unit tests protect fixture validity and React ownership. Browser checks are
recorded evaluation evidence rather than a new automated CI browser suite.
