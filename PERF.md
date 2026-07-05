# snaplot performance report

Headline problem (reported): scatter charts on mobile are laggy, worst
while the axis range is changing (panning and zooming). This report
documents the root causes found, the fixes, and before/after numbers from
the repeatable benchmark in `bench/` (see `bench/README.md` for the
methodology and how to run it yourself).

Measurement setup: Playwright-driven Chromium, mobile profile = 4x CPU
throttling, DPR 3, 390x720 touch viewport. Headless-shell rasterizes in
software, so absolute numbers overstate blit costs relative to real
phones; treat them as a stable, repeatable proxy and compare ratios, not
absolutes. Baseline SHA and current SHA are recorded inside
`bench/baselines/baseline.json` and `bench/results/latest.json`.

## What a pan/zoom frame cost before

Every viewport change during a gesture paid, per frame:

1. **A vertical auto-range rescan.** "Zoom X, Y follows" re-derived the
   visible Y extent by scanning every visible point per series. The cache
   in front of it was keyed by exact viewport indices, so during a gesture
   it missed on every frame and grew by one dead entry per frame,
   unbounded until the next data change. Scatter series with a custom
   `xDataIndex` scanned the whole store, not just the visible window.
2. **A full layout recompute with forced DOM reflows.** The layout cache
   key included every scale's min/max, so any viewport change invalidated
   it; recomputing measured tick labels via a hidden span's `offsetWidth`,
   a synchronous reflow per label per frame.
3. **A full grid repaint with DOM churn.** Axis labels were rebuilt from
   scratch (`innerHTML = ''` plus `createElement` per label) every frame.
4. **A full data repaint with per-point overhead.** The scatter loop made
   two polymorphic `dataToPixel` calls per point and called `drawImage`
   even for points outside the plot. The variable-style path (colorBy or
   sizeBy) built a string cache key per point, re-parsed the color ramp
   per point, and rescanned the encoded columns per frame, which also made
   point colors depend on the viewport. Density heatmaps kept their cache
   in a single module-level slot shared by every chart, so two density
   series thrashed each other into a full rebin per frame.
5. **Hit-test rebuilds.** The scatter hit grid also lived in a single
   slot, so two scatter series rebuilt it O(n) on every pointer move.
6. **No-op gestures still repainted.** Panning against the data edge (or
   zooming out at full extent) was clamped to an unchanged viewport but
   still marked all three layers dirty, repainting everything at gesture
   rate for zero visual change.

## Fixes

- Viewport-driven auto-range queries block-aggregate min/max indexes
  (`data/columnRangeIndex.ts`), built lazily once per data change:
  O(blocks) per frame instead of O(visible points), and O(log n) window
  location for arbitrary-X scatter via a sorted permutation index. The
  data-change path keeps the direct scan, so streaming appends never pay
  an index rebuild.
- Tick labels are measured with canvas `measureText` behind a memo cache;
  no DOM reflow on the render path. Axis gutters quantize to 8px steps so
  label-width jitter stops invalidating layout mid-gesture.
- Axis label DOM nodes are pooled and updated in place.
- Scatter render caches (heatmap bitmaps, stamp tables) moved into
  per-chart, per-series state. Encoding domains (colorBy/sizeBy) are
  computed once per data change from the full column, which also makes
  point colors stable while panning.
- The scatter inner loop hoists affine scale transforms into two locals,
  skips off-plot points before `drawImage`, and resolves variable styles
  through integer color bins and a numeric-keyed stamp table: zero string
  allocation per point. The line and area paths hoist the same transform.
- While the viewport is actively moving, scatter series above a point
  budget (default 10000, `performance.interactionSampling`) are
  stride-sampled, then repainted at full fidelity ~150ms after the gesture
  settles. Hit-testing and tooltips always use the complete data, so only
  the transient in-gesture frames are decimated. This is what bounds the
  200k mobile pan.
- The scatter hit grid keeps one cache slot per series with integer cell
  keys.
- Fully clamped viewport changes return early: no repaint, no events, no
  sync publish.
- Data updates skip the grid layer when no scale moved (pinned axes or
  zoomed streaming), honoring the documented layered-repaint contract.

## Results

Median milliseconds per frame during a scripted viewport sweep, lower is
better. Full data in `bench/baselines/baseline.json` (before) and a fresh
`npm run bench` (after).

Mobile profile (4x CPU throttle, DPR 3):

| scenario | before | after | speedup |
| :-- | --: | --: | --: |
| scatter-zoom-200k | 1068 | 100 | 10.7x |
| scatter-pan-200k | 783 | 100 | 7.8x |
| scatter-encoded-pan-50k (colorBy + sizeBy) | 791 | 142 | 5.6x |
| scatter-offaxis-pan-50k (arbitrary xDataIndex) | 350 | 67 | 5.2x |
| scatter-zoom-50k | 276 | 92 | 3.0x |
| pinch-zoom-gesture-50k (synthetic touch) | 201 | 92 | 2.2x |
| scatter-pan-50k | 192 | 108 | 1.8x |
| two-heatmaps-highlight-150k | 42 | 17 | 2.5x |

Desktop profile (no throttle, DPR 2): every scatter pan/zoom scenario is
now rAF-bound at 16.7ms (60fps), down from 33-190ms. The render work no
longer sets the frame budget; the display refresh does.

Line/area pan at 200k on mobile (~390ms) is the largest remaining
interactive cost and did not materially improve: the affine hoist helped
the per-point math, but a wide line still strokes every visible segment.
Shape-preserving render-time decimation for line/area is the proposed
follow-up (`docs/feature-proposal-1.0.md`), held for sign-off because
dropping points from a line distorts its shape more visibly than sampling
a point cloud. First-frame render of a resting 200k scatter (~2s mobile)
is also unchanged; this work targeted the interaction path, not cold
paint.

## Keeping it fixed

- `npm run bench` reproduces every number above; scenarios are seeded and
  self-validating.
- `npm run bench:compare` diffs a run against `bench/baselines/baseline.json`
  and fails beyond a configurable ratio; CI runs it best-effort (see
  `.github/workflows/quality.yml`).
- Refresh the baseline intentionally with `npm run bench -- --save-baseline`
  on the same machine class after landing a deliberate change.
