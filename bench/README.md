# snaplot benchmarks

The perf gate (plan §3.4, gate G12): a same-run A/B of main-thread busy time between two builds
of snaplot, on GPU raster, with heap-per-operation, fidelity and absolute budgets. It replaces the
pre-1.0 harness, which timed rAF deltas on software raster against a committed baseline (see
[History](#history)).

## Quick start

```bash
npm ci
npx playwright install chromium        # once: full Chromium (GPU raster) and the headless shell

# The merge gate: the milestone's set against the merge base (up to about 15 minutes).
npm run bench:ab -- --base "$(git merge-base HEAD overhaul)" --set M7

# Against the last release, through the v0.12.0 API adapter.
npm run bench:ab -- --base v0.12.0 --filter legacy

# Self-test: the same commit on both sides; every required ratio must be 1 ± 0.07.
npm run bench:ab -- --base ovh-m1-done --head ovh-m1-done --profile desktop

# One-sided run of the working tree (profiling, quick checks), and a comparison of two saved runs.
npm run bench -- --profile mobile --filter scatter-pan
npm run bench:compare -- --base bench/results/a.json --current bench/results/b.json

# The page itself, for DevTools: build the library first (npm run build).
npm run dev -w bench                   # http://127.0.0.1:5304 (PORT overrides)
```

`bench:ab` options: `--head <ref>` (default: the working tree, built in place), `--profile
desktop|mobile|both` (default both), `--runs N` (default `runs` in `gate.json`), `--raster
gpu|software` (default gpu), `--set M<N>` (default: every scenario, with `default` as the required
set), `--filter <area|name>[,…]` (an area name, or a name substring), `--api v012|v1|v2` or
`--api base:v012,head:v1`, `--allow-new`, `--strict-budgets`, `--retries N`, `--heap-profile`,
`--skip-build`, `--headed`, `--out <file.md>`. It writes `bench/results/ab-<base>-<head>.md` and
`.json` (gitignored) and exits 1 on a blocking failure, 2 on a usage error.

Environment: `SNAPLOT_BENCH_LOCK`, `SNAPLOT_AB_CACHE` and `SNAPLOT_CLAUDE_DIR` move the lock and
the extraction cache (default: the main checkout's `.claude/`, found through git's common
directory, so every worktree shares them). For diagnostics only, `BENCH_JS_FLAGS` adds V8 flags
to the one `--js-flags` switch (which keeps `--expose-gc`), and `BENCH_CHROMIUM_ARGS` adds
Chromium switches; both show in the report's browser line.

## Method

### Two sides, one harness

- **Extraction.** A ref is extracted with `git archive <sha> | tar -x` into
  `<main checkout>/.claude/ab-cache/<sha>` (cached by commit SHA; no git worktree is registered),
  then `npm ci --ignore-scripts -w packages/snaplot` and `npm run build -w packages/snaplot`.
  Scripts stay off so an extraction inside the main checkout never installs git hooks. A failed
  attempt is renamed to `<sha>.failed-<time>`, never deleted; remove it by hand. Without `--head`,
  the working tree's library is built in place.
- **One harness.** The bench page is always built from *this* checkout's `bench/src`, once per side,
  against that side's `packages/snaplot/dist` (`lib/vite-config.mjs`): `snaplot` resolves to
  `dist/index.js` and `snaplot/react` to `dist/react.js`, or to a stub when the build has none. The
  bench consumes the built package (plan §11.2) and imports only `snaplot` and `snaplot/react`.
- **API adapters** (`src/api/`). Scenarios describe charts in the bench's own vocabulary
  (`ChartSpec`, `BenchChart`), and an adapter translates it into each version's public API:
  - `v012`: the v0.12.0 `ChartCore` constructor over `[x, …fields]` columns addressed by
    `dataIndex` (ported from the audit's `adapter-v012.ts`);
  - `v1`: the rows-first `createChart` of `overhaul-baseline` to M7 (`setViewport`, `getAxis`,
    `getLayout`, `getStats`, legend plugins, React `onReady`);
  - `v2`: the plan §4 surface (`setOptions`, `update({ viewport })`, `scale()`, built-in legend,
    `createLegendTable`, plugins with `drawAbove`, the debug symbol's plot rectangle, React
    `ref`), finalised by M8 against the shipped handle.

  The page picks the adapter from the module's shape: `'ChartCore' in mod && !('createChart' in
  mod)` is v012; otherwise it constructs a chart, and a handle with `setOptions` is v2, else v1.
  `--api` overrides the detection. A scenario that an API cannot express (rows on v0.12.0, React
  before the overhaul, `alignPlots` before groups) reports `n/a`, which never fails the gate.
- **Interleaving.** For each profile and scenario, `runs` rounds run both sides back to back,
  alternating the order (base, head; head, base; …), each on a fresh browser context in one
  browser. Each side's value is the median over runs of each run's median (median of medians).

### What is measured

Each scenario drives one operation per animation frame (a pan step, a pointer move, an append) or
per repetition (a mount), after a warm-up, and reports:

| metric | meaning |
| :-- | :-- |
| `busy` | the call plus every callback the library scheduled before the next frame: its rAF paint, timers, Resize/Intersection/Mutation observers and their microtasks (`src/instrument.ts` wraps those entry points before the library loads). A long-animation-frame entry overlapping the operation raises it to the frame's duration. **The main gated metric.** |
| `sync` | the call alone, including its microtasks. Gated for one-shot API costs: `update`, React re-render, ingest, a pointer move. |
| `wall` | from the call to just after the next frame rendered (first paint). |
| `frame` | the rAF-to-rAF delta, kept only as a jank signal: it is quantised to the display interval and saturates at vsync on a GPU. |
| `taskMsPerOp` | CDP `Performance.getMetrics` TaskDuration over the scenario's window per operation: all main-thread task time, including style, layout, paint and the harness. A cross-check. |
| `heap.grossKBPerOp` | `usedJSHeapSize` growth summed over the window (drops from GC ignored) per operation, and `heap.retainedKB` after a forced GC. Needs `--enable-precise-memory-info --js-flags=--expose-gc` (always passed); `null` otherwise. A lower bound: a scavenge between two samples hides what it collected. |
| `allocKBPerOp` | with `--heap-profile` only: CDP's sampling heap profiler over the window, including objects scavenges collected. About 2× `grossKBPerOp` on the streams. Opt-in because the profiler costs time. |
| `fidelity` | during scatter interactions, `drawnPoints / min(inViewPoints, max(400, 1.5 × plot width))` from the debug symbol (`chart[Symbol.for('snaplot.debug')]`), sampled every 6th frame right after a paint. `null` before `ovh-m1-done`. |

Each scenario names its primary metric (`busy`, `sync` or `wall`); the A/B ratio is head/base of
that metric's median of medians. Scenarios also self-validate: a sweep that never moved the
viewport, or a hover that repainted the data layer, is `invalid`.

### Raster and profiles

- **GPU raster (default):** the full Chromium build (`channel: 'chromium'`) in new-headless mode
  with `--enable-gpu --enable-gpu-rasterization --ignore-gpu-blocklist`, `--use-angle=metal` on
  macOS, and `--canvas-oop-rasterization`. Left to Chromium, contexts alternated between two
  canvas 2D paths whose main-thread cost differs by about 1.5× (pan 1.2 vs 1.8 ms, hover 0.35 vs
  0.9 ms), which made runs bimodal; pinning out-of-process canvas raster removed that.
- **`--raster software`:** the headless shell (SwiftShader). It overstates raster-heavy frame times
  (the audit measured 6–100× on mobile), so it is a named profile for the software budget
  (`stream-50hz-idle`) and for CI, never the default.
- Pages are served with COOP/COEP, so they are cross-origin isolated and `performance.now()` has
  5 µs resolution (100 µs otherwise).

| profile | CPU throttle (CDP) | DPR | viewport | touch |
| :-- | --: | --: | :-- | :-- |
| desktop | 1× | 2 | 1280×800 | no |
| mobile | 4× | 3 | 390×720 | yes |

The mobile profile approximates a mid-range phone; it is not a device. For ground truth, open the
page with `npm run dev -w bench`, connect a phone through `chrome://inspect`, and click a scenario.

### Thresholds (`gate.json`)

- **Ratios.** Busy-time median of medians ≤ `ratio` (1.5) on the set's scenarios, or the set's own
  ratio: 1.2 for the move-only and deletion milestones (M2, M9a, M9b). Both sides are raised to
  `floorMs` (0.25 ms) first, so sub-floor noise cannot make a ratio. `overrides` tighten single
  scenarios: `line-pan-200k` ≤ 1.2× everywhere, `ingest-cols-1m` ≤ 0.5× in M7, and in M10
  `time-pan-200k` ≤ 1.2× busy and ≤ 1.5× p95.
- **Heap.** Gross heap per operation ≤ 1.5× (16 KB floor), or the sampled allocation when both
  sides ran with `--heap-profile`.
- **Budgets.** Absolute targets on the head from plan §3.4 and the milestone exits (ingest,
  re-ingest, React re-render, group append, heap per append, first paint, the software idle
  stream, offscreen share, offscreen paints, canvas MB per phone chart, fidelity, overlays per
  move, theme resolves, hover cost). `kind: "time"` budgets are recorded as met or missed and block
  only in `budgetsBlockIn` (M14's quiet run; EXECUTION rule 3) or with `--strict-budgets`.
  `kind: "count"` budgets (debug counters, bytes, fidelity) are deterministic and block in their
  own sets.
- **Sets.** `sets.<M>` lists what each milestone's merge runs (`--set M<N>`); `default` is the §3.4
  set, required when no `--set` is given; M14 runs everything. A head-only scenario that no set or
  budget lists is `unlisted` and fails unless `--allow-new`.
- **Self-test.** When base and head are the same commit, every required ratio must be 1 ± 0.07.

### Noise and the lock

- **The bench lock** is `mkdir <main checkout>/.claude/bench.lock` with an `owner.json` (pid, cwd,
  load, arguments). `bench:ab` waits while another session holds it before installing or building,
  then takes it for the measurement; `bench` (one-sided) waits but does not hold it. A lock older
  than two hours is stale and is moved aside to `bench.lock.stale-<time>`, never deleted. Sessions
  starting Playwright, Docker or `npm ci` wait while it exists (plan §11.1).
- **Noisy rows.** A row is noisy when a round ran with the 1-minute load average above half the
  core count, or when one side's runs disagree by more than `noise.spread` (1.25× max/min). A
  blocking failure on a noisy row is re-measured, up to `noise.retries` (3) times. The report also
  gives `best`, the ratio of each side's fastest run: on a contended machine, slow runs come from
  the OS (other processes, efficiency cores), so a failure whose `best` ratio passes is noise.
  Per EXECUTION rule 3, a noisy failure on a path the milestone did not touch is recorded as
  "noisy, recheck at M14", and M14 re-runs it with nothing else running.

## Scenarios

`npm run bench -- --filter <area>` runs one area. Every scenario seeds its data.

| area | scenario | primary | what it measures (§3.4 path) |
| :-- | :-- | :-- | :-- |
| legacy | `independent-lines-pan-75k` | busy | pan over two unjoined sources (50K + 25K) |
| legacy | `scatter-render-{10k,50k,200k}` | busy | full redraw of a resting scatter |
| legacy | `scatter-pan-{50k,200k}`, `scatter-zoom-{50k,200k}` | busy | `setViewport` sweeps; fidelity (scatter sampling) |
| legacy | `scatter-offaxis-pan-50k`, `scatter-encoded-pan-50k` | busy | unsorted X; `colorBy` + `sizeBy` |
| legacy | `heatmap-pan-300k`, `two-heatmaps-highlight-150k` | busy | density mode under pan; per-chart density cache |
| legacy | `line-pan-200k` | busy | culling, affine fast path, auto Y (≤ 1.2×) |
| legacy | `append-stream-50k-window` | busy | 200-point appends every frame into a 50K ring |
| legacy | `hover-sweep-50k` | busy | pointer sweep; overlay-only repaint |
| legacy | `touch-pan-gesture-50k`, `pinch-zoom-gesture-50k`, `wheel-zoom-gesture-50k` | busy | synthetic gestures end to end; fidelity |
| api | `reingest-{rows,cols}-200k-{title,callback}` | sync | `update` of a title or a callback on 200K × 2 series; ingests per update |
| api | `react-rerender-200k-{stable,inline}` | sync | a parent re-render with memoised or inline props |
| api | `ingest-cols-1m` | sync | constructing a 1M-point typed-column line; retained heap |
| streaming | `stream20hz-50k-{none,plugin,legendtable}` | busy | 20 Hz appends into a full 50K ring; heap and ring copies per append |
| streaming | `group-append-3x20k-align` | sync | appends in an `alignPlots` group |
| streaming | `stream-50hz-idle` | busy | an idle 50 Hz stream (software budget: frame p50 ≤ 33 ms) |
| interaction | `hover-sync-{line,scatter,unsorted}-200k` | sync | cost per pointer move (≤ 0.2 ms mobile, M12a) |
| interaction | `hover-sync-group-20` | busy | cursor sync over 20 members, 18 below the fold |
| interaction | `time-pan-200k` | busy | a 3-day window over 30 days: date formatting, formatter reuse |
| scale | `firstpaint-line-1m` | wall | construct to first painted frame, 1M points |
| scale | `mount-24-charts` | busy | 24 charts: mount cost, canvas MB per chart, offscreen paints |
| scale | `offscreen-stream-24` | busy | 24 streaming charts, in view and below the fold (offscreen share) |
| scale | `resize-storm-24` | busy | the container of 24 charts resized every frame |
| scale | `theme-churn-24` | busy | 100 body class mutations per frame under 24 charts |

## Reference machine

Budgets are for this machine, on GPU raster, with nothing else running (plan §3.4):

- Apple M2 Max (8 performance + 4 efficiency cores), 32 GB, macOS 26.6 (Darwin 25.6);
- Node 24.18, Playwright 1.61.1, Chromium 149 (`channel: 'chromium'`), ANGLE Metal;
- the display does not matter: the pages run headless.

Durations measured at M4, on this machine while other agents were running (load average 2–16):

| run | duration |
| :-- | :-- |
| the full suite, one pass, desktop (`npm run bench -- --profile desktop`, 40 scenarios) | 1.5 min |
| the full suite, one pass, mobile | 3 min |
| the full suite, one pass, both profiles (`npm run bench -- --profile both`, load 11–16) | 5 min |
| the self-test, every scenario, desktop, 3 runs (`bench:ab -- --base ovh-m1-done --head ovh-m1-done --profile desktop`, two retry passes) | 9.5 min |
| the self-test on the `default` set, desktop, 5 runs (`--set default --runs 5`, one retry pass) | 9.3 min |
| the legacy area against v0.12.0, both profiles, 3 runs (`bench:ab -- --base v0.12.0 --head ovh-m1-done --filter legacy`, three retry passes) | 14 min |
| the full A/B, both profiles, 3 runs (M14) | about 30 min (estimate: 9.5 min desktop, mobile about twice that) |
| extracting, installing and building one ref (first use; cached afterwards) | 7–8 s |

A milestone's merge set is 2–21 scenarios, so its A/B takes up to about 15 minutes on both
profiles.

## Limitations

- Timings from a contended machine are noisy (see [Noise](#noise-and-the-lock)); only M14's quiet
  run makes time budgets blocking.
- `heap.grossKBPerOp` is a lower bound once an operation allocates enough to trigger a scavenge
  between frames; use `--heap-profile` for the sampled allocation.
- Fidelity needs the debug symbol (`ovh-m1-done` and later); older refs report it as n/a.
- CI runs the software profile only, advisory (plan §11.3 G12).

## History

`bench/baselines/baseline.json` is history only: a frame-time run from sha `24f06c6` (July 2026,
before v0.10). No tool reads it.

### The 0.10 interaction-path work (from `notes/PERF.md`)

The headline problem was laggy mobile scatter charts while panning and zooming. Every viewport
change during a gesture paid, per frame:

1. **A vertical auto-range rescan** of every visible point per series, behind a cache keyed by exact
   viewport indices that missed on every gesture frame and grew without bound; off-axis scatter
   scanned the whole store.
2. **A full layout recompute with forced reflows**: the layout cache key included every scale's
   min/max, and tick labels were measured through a hidden span's `offsetWidth`.
3. **A full grid repaint with DOM churn**: axis labels rebuilt from scratch every frame.
4. **A full data repaint with per-point overhead**: two polymorphic `dataToPixel` calls per scatter
   point, `drawImage` for off-plot points, a string cache key and a colour-ramp parse per point
   for `colorBy`/`sizeBy`, and density heatmaps cached in one module-level slot shared by every
   chart, so two density series rebinned each other every frame.
5. **Hit-test rebuilds**: one shared scatter hit-grid slot, rebuilt O(n) on every pointer move.
6. **No-op gestures that still repainted** all three layers after clamping to the same viewport.

The fixes: block min/max range indexes built lazily per data change (`data/columnRangeIndex.ts`),
O(blocks) per frame; `measureText` behind a memo cache and gutters quantised to 8 px; pooled axis
label nodes; per-chart, per-series scatter caches and encoding domains computed once per data
change; a hoisted affine transform, off-plot culling and integer colour bins in the scatter loop;
stride sampling of scatter above a point budget during interaction and M4 decimation (first,
last, min and max per pixel column) of lines above four points per pixel, both repainted at full
fidelity about 150 ms after the gesture (hit tests always use the full data); per-series hit
grids; early returns for clamped viewports; and grid-skip on data-only updates.

Median ms per frame during a scripted sweep, mobile profile, headless shell, before and after
(0.9 → 0.10):

| scenario | 0.9 | 0.10 |
| :-- | --: | --: |
| scatter-zoom-200k | 1068 | 92 |
| scatter-pan-200k | 783 | 92 |
| scatter-encoded-pan-50k | 791 | 126 |
| line-pan-200k | 400 | 17 |
| scatter-offaxis-pan-50k | 350 | 66 |
| two-heatmaps-highlight-150k | 42 | 17 |

### Why the harness was replaced (the overhaul audit, M4)

The audit (`gap-perf-gate`, backlog-23) found that the old gate passed the overhaul while missing
its regressions:

- it measured SwiftShader raster, not snaplot, and on a GPU every scenario but cold scatter paint
  sat at vsync, so nothing under one frame (8.3 ms) was visible (gap-perf-gate-02);
- `heapDeltaMB` was a constant zero without `--enable-precise-memory-info` (gap-perf-gate-07);
- there were no API-layer, React, plugin, group, ingest or scale scenarios, `compare.mjs` ignored
  scenarios absent from the baseline, and nothing checked output fidelity, so a 2–12× fidelity
  loss during scatter gestures read as a 2× speed-up (gap-perf-gate-01, -08);
- the tracked baseline predated v0.10, and `append-stream-50k-window` measured about 100 ms of
  software rasterisation the library did not spend (backlog-23);
- the harness could not support competitive claims: no first paint, no multiples, software
  raster by default (gap-competitive-05; a published comparison stays deferred).

### First measurements with this harness (M4, `ovh-m1-done`)

Measured on the reference machine with other agents running (load average 2–16), so read them
as orders of magnitude; M14 re-measures with nothing else running. Reports:
`bench/results/ab-*.md` in the M4 worktree; the tables are in `docs/handoff/m4.md`.

- **Self-test** (`--base ovh-m1-done --head ovh-m1-done --profile desktop`): 19 of 21 required
  ratios within 1 ± 0.07 with 3 runs (outside: `pinch-zoom-gesture-50k` 0.91,
  `stream20hz-50k-plugin` 1.08), and 19 of 21 with `--set default --runs 5`
  (`pinch-zoom-gesture-50k` 1.10, `stream20hz-50k-legendtable` 0.92). Five runs did not help, and
  the outliers change scenario and direction between attempts, which points at contention, not
  at a bias between the sides. So `runs` stays 3; if M14's quiet self-test still fails, it
  becomes 5 (plan §3.4).
- **v0.12.0 → `ovh-m1-done`, legacy area, both profiles.** For rendering, the audit's verdict
  (no regression over 1.5×) holds: `line-pan-200k` 1.00/1.01×, `heatmap-pan-300k` 1.05/1.22×,
  appends, renders, wheel zoom and the unsorted and encoded scatters within 1.25×, and the scatter
  pan and zoom sweeps faster (0.58–0.88×, at full fidelity). Busy time also shows what the old
  gate hid, the per-pointer-event cost of the v1 API layer (gap-perf-gate-03): `hover-sweep-50k`
  2.7× desktop and 3.9× mobile (0.14 → 0.99 ms per move; the dispatch alone 0.10 → 0.95 ms),
  `pinch-zoom-gesture-50k` 1.53× and `touch-pan-gesture-50k` 1.78× on mobile (1.25× and 1.46× on
  desktop), mostly in the dispatch itself rather than in the paint. The causes are the
  Controller's `publish()`/`readState()` on every engine event and the whole-column scatter cursor
  scan (arch-06). M8 (coalesced notifications) and M12a (hit testing, the hover budgets) own the
  fix, so a `--base v0.12.0` run of the default set fails until they land.
- **The head against the §3.4 budgets** (`ovh-m1-done`, GPU raster; desktop from the self-test,
  mobile from one pass at load 11–16, so an upper bound):

  | budget | limit | desktop | mobile | owner |
  | :-- | :-- | --: | --: | :-- |
  | `ingest-cols-1m` sync | ≤ 40 / 135 ms | 118 | 398 | M7 |
  | `reingest-rows-200k-title` sync | ≤ 2 / 8 ms | 55.5 | 234 | M8 |
  | `react-rerender-200k-inline` sync | ≤ 3 ms | 38.7 | – | M8, M13 |
  | `group-append-3x20k-align` sync | ≤ 0.5 ms mobile | – | 8.75 | M8 |
  | `stream20hz-50k-{none,plugin,legendtable}` heap per append | ≤ 50 KB | 432, 505, 508 | 418, 528, 452 | M8, M12b |
  | `firstpaint-line-1m` wall | ≤ 45 / 150 ms | 124 | 464 | M11 |
  | `offscreen-stream-24` offscreen share | ≤ 0.15 | 1.06 | 0.99 | M11 |
  | `mount-24-charts` offscreen paints (20 charts below the fold); canvas MB per phone chart | 0; ≤ 5 | 20 | 20; 7.4 | M11 |
  | `hover-sync-group-20` offscreen overlays per move (18 members below the fold) | 0 | 18 | 18 | M11 |
  | `pinch-zoom-gesture-50k` fidelity | ≥ 0.8 | 0.14 | 0.14 | M11 |
  | `hover-sync-{line,scatter,unsorted}-200k` sync | ≤ 0.2 ms mobile | – | 1.25, 2.58, 2.08 | M12a |

  `scatter-pan-200k` fidelity (1.00) and `theme-churn-24` grid renders per chart per frame (1.0)
  already meet theirs. Ring copies per append are 0 without add-ons and 1.0 with a plugin or the
  legend table (arch-01, M8); the stream without add-ons still allocates about 430 KB per append,
  so another O(window) copy remains (M8: profile it with `--heap-profile`). Counts are the same on
  both profiles (the harness drives the same operations).
