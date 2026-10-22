# API overhaul implementation and validation

Implemented locally on 2026-09-17. No release was published.

## Delivered

- `createChart(element, options)` and direct React 19/Solid 1.9 props, with isolated optional framework peers.
- Rows, typed field/accessor contracts, named zero-copy columns, independent source stores, category axes and stable series/row identity.
- Named band/scatter encodings and direct histogram results with unpadded counts.
- Atomic option/data updates, complete framework snapshot reconciliation, ordered streaming with retention/tail correction, exact viewports and follow control.
- ID-based interaction state, row-aware events/custom tooltips, declarative annotations and core chart groups.
- Native legends/tables, controlled state, lifecycle cleanup, SSR/hydration and built-package consumption.
- Migrated comparison adapters, all three Solid dogfood dashboards, benchmarks, examples and generated documentation. The previous public conversion/constructor API is no longer exported.

Existing visual styling remains in place. API-specific renderer work is limited to preserving categorical color identity as old observations leave streaming retention; it does not restyle marks.

## Automated checks

Passed:

- `npm run typecheck`: library, site, benchmarks and comparison lab.
- `npm run lint`.
- `npm test`: 483 library tests, 43 site tests, 13 lab tests (539 total).
- `npm run build`, `npm run build:site`, `npm run build:lab`.
- `npm run test:consumers -w packages/snaplot`: built core import isolation, React/Solid declarations and server rendering.
- `tsc -p experiments/chart-lab/trials/tsconfig.json --noEmit`.

Coverage includes unsorted/frozen rows, gaps, empty schemas, category ordering, independent sampling, original indices, invalid-update rollback, callbacks, source reordering, retention, correction, controlled proposals, group lifecycle, pointer click/drag distinction, native framework ownership/hydration and live documentation snippets. The category documentation fixture includes an empty slot in an authoritative category order.

## Visual review

Reviewed all five migrated comparison scenarios in the browser: UAV dual axes/thresholds, F1 line/area charts in dark and light themes, ML lines/scatter, transport grouped bars/annotations, and biological log/scatter/bar charts. Inspected existing pre-overhaul evidence for appearance preservation; this was a qualitative comparison, not a pixel-difference gate. No browser errors were reported in the review. Existing card dimensions, adapter styles, legends, labels and data fixtures were retained.

Screenshots: `evidence/api-transport.png`, `api-f1-dark.png`, `api-f1-light.png`, `api-ml.png`, `api-uav.png`, `api-biology.png`.

## Performance evidence and baseline anomaly

The initial same-machine pre-refactor run is retained unchanged in `evidence/api-bench/before.json`. The after run is `after.json`, with all 36 workloads valid (18 desktop, 18 throttled mobile), including the new independent-source workload.

The initial 1.5× gate flagged one result: desktop `scatter-render-10k` was 25 ms versus an initial 8.3 ms. All other 33 comparable cases passed. An isolated repeat remained 25 ms. A diagnostic compared the new public factory to the current internal renderer: both were 25 ms, with nearly identical data-layer time. An isolated temporary checkout of the pre-overhaul tracked commit (`2375f32`, without the uncommitted API work or preceding visual refinements) also measured 25 ms. A full desktop control run reproduced that result and confirmed the desktop gate without changing its threshold or renderer behavior.

The anomaly is recorded rather than replacing or editing the original measurement. The checked-in artifacts distinguish the original pre-refactor baseline from this additional control:

- `before.json`: original desktop/mobile baseline.
- `after.json`: complete new-API result.
- `scatter-repeat.json`: repeat of the flagged case.
- `factory-renderer-check.json`: current factory versus current internal renderer diagnostic.
- `desktop-control.json`: full pre-overhaul tracked-code control run.
- `mobile-baseline.json`: unchanged mobile profile extracted from `before.json`.
- `desktop-gate.txt`, `mobile-gate.txt`: passing comparisons using the unchanged 1.5× gate.

Reproduce those comparisons:

```sh
node bench/compare.mjs --baseline experiments/chart-lab/evidence/api-bench/desktop-control.json --current experiments/chart-lab/evidence/api-bench/after.json
node bench/compare.mjs --baseline experiments/chart-lab/evidence/api-bench/mobile-baseline.json --current experiments/chart-lab/evidence/api-bench/after.json
```

The independent-source workload measured 8.3 ms desktop and 24 ms throttled mobile median frame time. Benchmarks use the existing headless software-raster setup and are relative evidence, not a general frame-rate guarantee. The final option-snapshot cache, empty-stream startup and tooltip payload refinements do not change the measured renderer paths.

## Developer trial

A Luna builder used only public types and examples to implement a plain TypeScript independent-run ML tracker and a React categorical biology chart with controlled visibility and a native legend. Both compiled. The tracker needed no alignment, plugin construction or wrapper lifecycle code. The initial React ref-only attempt exposed an example gap; a state-backed callback ref connected the legend without duplicate lifecycle glue. The README now shows this pattern. Trial source and first-attempt notes are in `trials/`.

## Scope

No compatibility aliases or migration guide were added. No stacking, animations, unrelated chart types, timezone behavior or automatic publishing was introduced. Public plugin hook failures are isolated and reported; data/configuration validation failures leave the prior chart state intact.
