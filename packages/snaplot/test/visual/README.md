# Visual and geometry harness

The pixel and geometry safety net of the overhaul (plan §11.3 G10, M3a). Two Playwright projects run
over one fixture app:

- **`visual`**: one screenshot per fixture shot. A run against a ref compares exactly; a run against
  the committed baselines allows the plan's `maxDiffPixelRatio: 0.002` (see Comparison).
- **`geometry`**: five platform-independent checks over DOM label boxes and data-layer ink. They are
  blocking on every platform.

Agents run them in local macOS Chromium. The committed baselines are the `-darwin` set.
`scripts/visual-docker.sh` is the optional Linux path for CI and the `update-snapshots` workflow, which
produce the `-linux` set.

## Commands

| Command | What it does |
|---|---|
| `npm run test:visual` | Both projects against the committed `__screenshots__/<area>/<name>-<platform>.png` |
| `npm run test:visual -- --against <ref>` | Renders `<ref>`'s own fixture app into the reference cache (twice: it must reproduce itself exactly), then compares the working tree with it exactly. This is the merge gate |
| `npm run test:visual -- --strict` | Compares the committed baselines exactly too (a run against a ref always does) |
| `node scripts/overhaul/check-visual-diffs.mjs` | Judges the last run: zero changes for M2/M9a/M9b, else every changed fixture needs a visual-ledger row from this milestone. It fails a run against a ref that was not exact |
| `node scripts/overhaul/check-visual-ledger.mjs` | P13: every commit that touches screenshots or has a `visual:` paragraph adds or edits its row file |
| `npm run test:visual -- --update` | Rewrites the committed baselines and prunes stale ones (M3a and M14 only) |
| `npm run test:visual -- --serve` | Serves the fixture app; open `/index.html` for the list, `?fixture=<id>` for one |

Other flags: `--project visual|geometry`, `--grep <re>`, `--workers <n>`, and anything after `--` goes to
Playwright. The port is `$PORT`, else 5333 (EXECUTION.md rule 6), else a free one.

Every run writes `packages/snaplot/test-results/visual/`:
- `report.json` (Playwright JSON);
- `meta.json`:
  - the mode and the `comparison` (see Comparison);
  - the head: its SHA, whether the tree was dirty, and `inputs`, a fingerprint of the render inputs;
  - where the expected images live;
  - for `--against`, the reference outcome: `complete`, the capture and second-render exit codes,
    the declared shot count, and the `shots` that rendered and reproduced;
- `contact-sheet.html` (open it from disk to review every shot, with diffs for changed ones).

The reference cache is `$SNAPLOT_SNAPSHOT_DIR/<sha>/`, default `<main checkout>/.claude/visual-cache/`.
A ref is extracted with `git archive` and renders its own fixtures with its own config. A fixture whose
options a milestone renamed therefore still compares like with like. Refs older than the M3a merge have
no fixture app and are not valid references. The runner never deletes anything outside the worktree,
and waits while `.claude/bench.lock` exists.

The reference is rendered twice, and the second render must match the first exactly (no tolerance,
whatever the comparison then uses). It is cached (`capture.json`) only when every shot it declares
rendered and reproduced. Otherwise the runner exits non-zero, and `check-visual-diffs` fails the run:
- a head shot is `added` only when the reference is complete and lacks it, else `unverified`
  (a failure unless `--allow-partial`);
- a reference with no shots, or a platform with no committed baselines, fails outright: nothing was
  compared.

Row files count for a milestone only when they differ from the base and their `**Milestone:**` line
names it. `V0.md` never covers a change, and editing it fails the check.

`check-visual-diffs` refuses a stale report. `inputs` fingerprints the working-tree content of
`packages/snaplot`, `package.json` and `package-lock.json` (`record.mjs`), so an edit there after
the run fails the check until the run is repeated. A row file or a handoff written after the run is
fine. `--any-head` judges a stale report anyway, with a note. The fingerprint is by content, so the
results that `scripts/visual-docker.sh` copies back match the host tree.

## Comparison

`record.mjs` holds the settings; `meta.json` records them as `comparison`.

| Run | Settings | Why |
|---|---|---|
| `--against <ref>` | `threshold: 0`, `maxDiffPixels: 0` (exact) | Both sides render on this machine in one session, and the reference's second render must already reproduce exactly, so exactness adds no flakiness |
| Committed baselines (and CI) | `threshold: 0`, `maxDiffPixelRatio: 0.002` | The plan's ratio, for baselines rendered on another machine, but every pixel whose colour differs counts |
| Committed baselines with `--strict` | exact | Local re-checks of the darwin set |

This departs from plan §11.3 G10, which sets only `maxDiffPixelRatio: 0.002` and so leaves
Playwright's per-pixel colour `threshold` at 0.2. M3a review #2 measured what that hides:
- a theme-wide light `gridColor` change: 0 changed shots of 137 (127 when exact);
- the default line width 1.5 → 2: 1 changed shot (72 when exact);
- `layout/axis-titles` `lineWidth` 2 → 3: none (2 shots of 72 px each when exact).

`threshold: 0` with the ratio catches the first two (127 and 42 shots) but not the third, so only
an exact comparison catches all three.

`check-visual-diffs` therefore fails a run against a ref that was not exact, and applies the
zero-change rule only to an exact run. A committed-baseline run within the tolerance passes the row
rule with a note: it is not the merge gate. Pixelmatch's anti-alias detection stays on even when
exact (Playwright does not expose it), so a change made only of pixels it classifies as
anti-aliasing would pass.

## Fixtures

`fixtures/<area>.ts`, one area per owner from W5:

| Area | Owner | Content |
|---|---|---|
| `axes/` | M10 | DEFAULTS_FINDINGS cases (DEF-01…05), time, log, categories, annotations, y2, 24 px minimum font, explicit ticks |
| `marks/` | M11 | `#/visual` ports, the gap-overhaul-delta basics, mark edge cases, the audit grid (6 marks × {1, 3, 8} series × 3 sizes) |
| `theme/` | M11 | White, cream and dark cards, swatches, transparent and CSS-variable surfaces, each under OS light and dark |
| `layout/` | M11 | Axis titles and box sizes |
| `overlay/` | M12a | Tooltip, hover and highlight states (real pointer moves) |

Rules:
- Ids are `<area>/<name>` and never change. A milestone that renames an option (M7, M8) edits the
  fixture in the same commit and keeps the id.
- Fixtures use only options that survive plan §4.4: no `padding`, `tickCount`, `rangePadding`,
  `heatmap*`, `fillGradient`, `pointShape` or legend plugins. Legend fixtures arrive with M8.
- Data is seeded (`fixtures/data.ts`).
- Fixtures `import type` from the library only. Runtime helpers come through `FixtureLib`, so the specs
  can read the registry in Node.

Shots:
- every fixture at DPR 1 under the light scheme;
- `dpr2: true` adds `<id>@2x` (the crispness set);
- `schemes: true`, for theme fixtures only, gives `<id>@light` and `<id>@dark`.

Budget: ≤ 150 PNGs and ≤ 10 MB per committed set.

Determinism:
- IBM Plex Sans (`@fontsource`) is loaded before the chart exists, and `theme.fontFamily` is set
  explicitly.
- The page reports ready after `document.fonts.ready`, two frames and an idle callback, and only
  once the grid and data layers have rendered and the data layer holds ink (the grid layer for a
  fixture with `blankData`). It waits up to 5 s and never asks for a redraw; a chart that does not
  paint fails its tests.
- The Playwright config fixes the viewport (1280 × 800), reduced motion, `en-US` and UTC.
- `minFontSize` fixtures run in a persistent full-Chromium profile, because the headless shell ignores
  the font preference.

## Geometry checks and expected failures

`checks.ts` holds five checks; `checks.test.ts` unit-tests them under vitest:
- no overlapping label boxes;
- no two adjacent labels with the same text;
- at least 2 labels per axis when the plot is 120 px or more along it;
- every finite datum paints at least 1 pixel (ink within 2 px on the data layer; bars and histograms are
  probed at half height across their slot);
- no label outside the chart box.

`probe.ts` collects the facts in the page. It reads the public handle and the debug symbol (D31), and
prefers `scale(key).toPixel` once M8 adds it. It also calls `getLayout()` and `getAxis()`, and
`app.ts` calls `getLayout()` for hover positions; M8 removes both (and `setHighlight`, used by
`overlay/highlight-dim`). The M8 commit that removes them updates `probe.ts`, `app.ts` and the
fixtures with the same output: `--against <merge-base>` shows no changed shot and the same geometry.

A check that today's code fails is listed in `expected/m<N>.ts` for its owning milestone:
- `fails('<owner>', '<fixture>', '<check>', '<finding id>')`: the test runs as `test.fail` with
  `[<finding id>]` in its title, so an unexpected pass turns the run red.
- The fixing commit flips `fails(` to `fixed(` on the same line. The passing test keeps the id in its
  title as the finding's lock.
- A fixture may skip a check that does not apply (`skip: { minLabels: 'reason' }`).

## The in-page contract

`page-api.ts`: the app publishes `window.__snaplotFixture` with `status`, `chart`, `plotPoint(fx, fy)`,
`geometry()` and `frames(n)`. `playwright.config.ts` reads these variables:

| Variable | Use |
|---|---|
| `PORT` | The preview port |
| `SNAPLOT_VISUAL_EXPECTED_DIR` | Expected screenshots, instead of the committed set |
| `SNAPLOT_VISUAL_OUTPUT_DIR` | Artifacts and report |
| `SNAPLOT_VISUAL_WORKERS` | The worker count |
| `SNAPLOT_VISUAL_STRICT` | `1` compares exactly; run.mjs sets it for `--against` and `--strict`, and for the reference's second render |

Keep these stable: `--against` drives an older ref's config through them.
