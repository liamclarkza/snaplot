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
| `node scripts/overhaul/check-visual-diffs.mjs` | Judges the last run: zero changes for M2/M9a/M9b, else every changed fixture needs a visual-ledger row from this milestone. It fails a run against a ref that was not exact, a reference image that changed after its capture, and on a milestone branch a reference other than the merge base with `overhaul` |
| `node scripts/overhaul/check-visual-ledger.mjs` | P13: every commit that touches screenshots or has a `visual:` paragraph adds or edits its row file, and every new row has the Commit, Milestone, Fixtures, Before → after, Finding and Revert lines |
| `npm run test:visual -- --update` | Rewrites the committed baselines and prunes stale ones (M3a and M14 only) |
| `npm run test:visual -- --serve` | Serves the fixture app; open `/index.html` for the list, `?fixture=<id>` for one |

Other flags: `--project visual|geometry`, `--grep <re>`, `--workers <n>`, and anything after `--` goes to
Playwright. The port is `$PORT`, else 5333 (EXECUTION.md rule 6), else a free one.

The runner refuses (exit 2) the Playwright flags that would write, skip or relocate the expected
images: `-u`, `--update-snapshots`, `--update-source-method`, `--ignore-snapshots` and `--config`
(`run-args.mjs`). The head always compares with `--update-snapshots=none`. `--update` is the only
way to rewrite the committed baselines, and a reference from `--against` is never updated. Before
review #3, `--against <ref> -u` wrote the head's screenshots into the shared reference cache, and
the next run against it passed with 0 changed shots.

Every run writes `packages/snaplot/test-results/visual/`:
- `report.json` (Playwright JSON);
- `meta.json`:
  - the mode and the `comparison` (see Comparison);
  - the head: its SHA, whether the tree was dirty, and `inputs`, a fingerprint of the render inputs;
  - where the expected images live;
  - for `--against`, the reference outcome: `complete`, the capture and second-render exit codes,
    the declared shot count, the `shots` that rendered and reproduced, and their `hashes`
    (SHA-256 of each image);
- for `--against`, `reference/`: the head's own copy of the reference images (see below);
- `contact-sheet.html` (open it from disk to review every shot, with diffs for changed ones).

The reference cache is `$SNAPLOT_SNAPSHOT_DIR/<sha>/`, default `<main checkout>/.claude/visual-cache/`.
A ref is extracted with `git archive` and renders its own fixtures with its own config. A fixture whose
options a milestone renamed therefore still compares like with like. Refs older than the M3a merge have
no fixture app and are not valid references.

Every worktree shares the cache. Two runs against the same SHA take turns through
`<sha>/capture.lock` (a `mkdir` lock with `owner.json`): one captures, and the other waits, then
reads the cache. A lock whose owner has exited, or that is older than 2 hours, is moved aside to
`capture.lock.stale-<time>`, never deleted. The runner deletes nothing else outside the worktree.

The runner waits while the bench lock exists. Like `bench/`, it finds the lock at
`<main checkout>/.claude/bench.lock` through git's common directory. `SNAPLOT_BENCH_LOCK` (or
`SNAPLOT_CLAUDE_DIR`) moves it. A plain clone finds itself as the main checkout, so the runner warns
when that directory does not exist. In a clone, set `SNAPLOT_BENCH_LOCK` to the main checkout's
lock.

The reference is rendered twice, and the second render must match the first exactly (no tolerance,
whatever the comparison then uses). It is cached (`capture.json`, format 4) only when every shot it
declares rendered and reproduced, with the SHA-256 of each image. The cache is never a write
target for the head:
- the head compares against a per-run copy in `test-results/visual/reference/`, made only from
  images whose hash matches the capture;
- a cached reference whose images no longer match is moved aside to `shots-….damaged-<time>` and
  captured again;
- `check-visual-diffs` fails, even with `--allow-partial`, when an image of the copy changed after
  the capture, is gone, or was never captured.

A reference that did not complete is never cached. The runner exits non-zero, and
`check-visual-diffs` fails the run:
- a head shot is `added` only when the reference is complete and lacks it, else `unverified`
  (a failure unless `--allow-partial`);
- a reference with no shots, or a platform with no committed baselines, fails outright: nothing was
  compared.

Row files count for a milestone only when they differ from the base and their `**Milestone:**` line
names it. `V0.md` never covers a change, and editing it fails the check. A base that does not resolve
(a clone without a local `overhaul`) exits 2 and asks for `--base <ref>`, except under the
zero-change rule, which reads no rows.

On a milestone branch (`ovh/m<N>-…`), a run against a ref must compare against the branch's merge
base with `overhaul`, the merge gate's reference. After a milestone's commits, `--against HEAD`
compares the change with itself, so `check-visual-diffs` fails it and names the merge base. An
explicit `--base <ref>` judges another reference deliberately, with a note. A merge base older
than the fixture app (M3a's own branch) and a clone without `overhaul` print a note instead.

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
- `layout/axis-titles` `lineWidth` 2 → 3: none (both shots when exact: 246 px at DPR 1, 72 px at
  DPR 2).

`threshold: 0` with the ratio catches more (127 shots for the grid colour, 42 for the line width,
and the DPR 1 shot of the fixture edit), but the fixture edit's 72-pixel `@2x` shot still passes.
Only an exact comparison catches all three.

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
  once the grid and data layers have rendered and the data layer holds ink (`paint.ts`). A fixture
  with `blankData` needs grid-layer ink instead, and one that also has `blankGrid` (plan §5.1's
  empty state, which draws no grid) needs only both renders. It waits up to 5 s and never asks for
  a redraw; a chart that does not paint fails its tests.
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
