# snaplot benchmarks

Repeatable performance measurements for the render and interaction hot
paths, with a mobile-representative profile. This is the harness behind
`PERF.md` and the CI regression guard.

## Quick start

```bash
npm install
npx playwright install chromium   # one-time browser download
npm run bench                     # all scenarios, desktop + mobile profiles
npm run bench -- --profile mobile --filter scatter-pan
npm run bench:compare             # latest run vs bench/baselines/baseline.json
```

Results land in `bench/results/latest.json` (gitignored). The tracked
baseline lives in `bench/baselines/baseline.json`; refresh it with
`npm run bench -- --save-baseline` after landing an intentional change,
on the same machine that produced the previous baseline.

## Profiles

| profile | CPU throttle | DPR | viewport | touch |
| :-- | --: | --: | :-- | :-- |
| desktop | 1x | 2 | 1280x800 | no |
| mobile | 4x | 3 | 390x720 | yes |

The mobile profile approximates a mid-range phone via Chrome DevTools
Protocol CPU throttling. It is not a real device; treat it as a stable,
repeatable proxy. For ground truth, profile on-device: open the bench page
(`npm run dev -w bench`), connect via `chrome://inspect`, and use the
Performance panel while clicking a scenario button.

## Scenarios

- `scatter-render-{10k,50k,200k}`: full-pipeline redraw per frame at rest.
- `scatter-pan-{50k,200k}` / `scatter-zoom-{50k,200k}`: scripted viewport
  sweeps through `setAxis`, the same path pan/zoom gestures drive. This is
  the headline mobile-jank scenario.
- `scatter-offaxis-pan-50k`: scatter with `xDataIndex` pointing at an
  unsorted column, where sorted-X culling cannot apply.
- `scatter-encoded-pan-50k`: `colorBy` + `sizeBy` variable-style path.
- `heatmap-pan-300k`: density-mode scatter under viewport changes.
- `two-heatmaps-highlight-150k`: two density charts repainting at a fixed
  viewport, which exercises heatmap cache ownership across instances.
- `line-pan-200k`: line-chart viewport sweep.
- `append-stream-50k-window`: `appendData` ticks against a ring buffer.
- `hover-sweep-50k`: pointer-move sweep; must stay an overlay-only repaint.
- `touch-pan-gesture-50k`, `pinch-zoom-gesture-50k`,
  `wheel-zoom-gesture-50k`: end-to-end synthetic gestures through
  GestureManager, covering the full input-to-paint path.

Every scenario reports median/p95/max frame times, the fraction of frames
over the 60fps and 30fps budgets, per-layer render costs from
`debug.stats`, and (Chromium only) the JS heap delta as a GC-pressure
signal. Scenarios self-validate (`valid: false` means the run measured
nothing real, for example a gesture that failed to move the viewport) and
data generation is seeded, so runs are deterministic.

## Methodology notes

- The bench resolves `snaplot` to `packages/snaplot/src`, so it measures
  the working tree without a rebuild of the library package.
- Sweeps run 180 frames with a 20-frame warmup; frame cost is the
  rAF-to-rAF delta, which is what a user experiences during a gesture.
- Numbers are machine-specific. Compare runs from the same machine only;
  `compare.mjs` exists for exactly that, and applies a 2ms floor so
  sub-millisecond noise cannot fail a build.
