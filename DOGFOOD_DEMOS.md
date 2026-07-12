# Snaplot dogfood applications

Three independent SolidJS applications exercise Snaplot in realistic product layouts. They live in the documentation-site workspace so they resolve the local `snaplot` package during development.

## Run locally

```bash
npm install
npm run dev
```

Open the URL printed by Vite, then use one of these hash routes:

- `#/pulseops` — dark streaming infrastructure dashboard
- `#/cohortlab` — light experiment-analysis workspace
- `#/gridscope` — warm responsive home-energy planner

The product switcher in each application moves directly between all three. `#/demos` also contains launch links.

## Deterministic scenarios

All datasets come from seeded generators in `site/src/dogfood/data.ts`. Reloading a route recreates the same initial values and outliers. PulseOps then appends a deterministic live sequence once per second to demonstrate Snaplot's ring-buffer streaming API.

State controls expose non-happy paths without editing code:

- PulseOps: loading, empty, disconnected, and partial telemetry
- CohortLab: `Archived (empty state)` produces a no-results workspace
- GridScope: loading, missing readings, and unavailable forecast

## Feature coverage

| Capability | PulseOps | CohortLab | GridScope |
| --- | --- | --- | --- |
| Line | CPU, latency, errors | Training trajectories | Consumption, tariff |
| Area | Memory, requests | — | Solar, battery |
| Band | Latency envelope | — | Solar forecast |
| Scatter points | — | Quality/latency sweep | Temperature/demand |
| Density scatter | — | Explicit density toggle | — |
| Grouped bar | Regional availability | Normalized scorecard | Daily solar vs use |
| Histogram | Latency | Accuracy and latency | Usage distribution |
| Time axis | All telemetry charts | — | Daily synchronized charts |
| Linear axis | Histograms and bars | Histograms and progress | All supporting charts |
| Log axis | — | Scatter latency axis | — |
| Streaming / ring buffer | Five live service metrics | — | — |
| Cursor sync | Three telemetry charts | — | Flow, battery, tariff |
| Zoom sync | Three telemetry charts | — | Flow, battery, tariff |
| Stable-key highlight sync | — | Trajectories, bars, run list | — |
| Box selection | — | Scatter run selection | — |
| Persistent brush | — | — | Main chart and summary totals |
| Reference markers | SLO and thresholds | — | Tariff boundaries |
| Clickable legend | — | — | Main energy flow |
| Legend table | Synced latency values | — | — |
| Light / dark presentation | Dark | Light | Light/warm |
| Large data | Streaming window | 24,000 scatter records | 1,080 historical records |
| Responsive/mobile layout | Yes | Yes | Mobile-first review target |

## Implementation summary

### Completed

- Three standalone product routes with separate visual systems, controls, data models, and layouts
- Deterministic data generation and reproducible edge cases
- Streaming through the public `ChartInstance.appendData()` API
- Coordinated cursor, zoom, gutter, and stable-key highlight examples
- Desktop, tablet, and mobile CSS layouts
- Loading, empty, disconnected, missing-data, no-results, and no-forecast states
- Keyboard-visible focus styles, semantic controls, chart instructions, and skip links

### Snaplot changes

None. The applications use the current public `snaplot` and `snaplot/solid` exports. Application-level workarounds are intentionally retained and documented in the friction log.

### Known limitations to inspect during critique

- PulseOps uses manual right padding for its dual-axis chart, so compare its plot alignment with the single-axis charts.
- CohortLab can link highlights between multi-series charts but cannot highlight one point in its single-series scatter plot from the run table.
- GridScope's tariff periods are boundary lines rather than shaded regions because the built-in reference plugin exposes lines only.
- Every chart container requires an explicit application-owned height. Review whether the chosen responsive heights feel natural.
- Chart themes, DOM legend-table styling, and surrounding product styling are three separate surfaces and should be reviewed as one system.

The detailed, chronological findings are in `notes/dogfood-friction-log.md`.
Candidate library and application improvements from the visual critiques are maintained in `SNAPLOT_IMPROVEMENT_BACKLOG.md`.
