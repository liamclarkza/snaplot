# M3a: Visual and geometry harness

- **Branch:** `ovh/m3a-visual` · **Worktree:** `.claude/worktrees/m3a` · **Base:** `16547da` (`overhaul`
  at start, = `ovh-m1-done` tip)
- **Status:** complete. The visual platform is local macOS Chromium (EXECUTION.md rule 1), so the
  committed baselines are the `-darwin` set. Refresh the Linux baselines with the `update-snapshots`
  workflow.

## Summary

- **Fixture app.** `packages/snaplot/test/visual/index.html?fixture=<area>/<name>` (Vite; it bundles
  `src/index.ts`, so each ref renders its own code). 111 fixtures in five area files, one per W5 owner:

  | Area | Owner | Fixtures | Content |
  |---|---|---:|---|
  | `axes/` | M10 | 22 | DEFAULTS_FINDINGS; edge cases; tick defects; annotations; y2; 24 px minimum font; explicit ticks |
  | `marks/` | M11 | 74 | 7 `#/visual` ports, 10 basics, 3 mark edge cases, the 54-cell audit grid |
  | `theme/` | M11 | 6 | Cards, swatches, transparent and CSS-variable surfaces; each under OS light and dark |
  | `layout/` | M11 | 5 | Axis titles and box sizes |
  | `overlay/` | M12a | 4 | Tooltip, highlight, bar+line hover, 3-series scatter hover |

  - **DEFAULTS_FINDINGS:** long titles at 320 and 480, long ticks, 30 long categories at 480 and 320,
    single, constant, precision and large.
  - **Edge cases** (all 17 in the brief): empty, all-negative bars, log under one decade, 4 s time axis,
    epoch-ms bars, ISO strings, annotations at 390 px, y2 dual axis, 24 px minimum font, explicit
    ticks, isolated points, histogram `fill`, area with negatives, transparent background, dark
    CSS-variable surface, bar+line hover and 3-series scatter hover.
  - **Tick defects that the geometry checks catch:** 5-minute time axis, format collapse, histogram over
    0–0.003.
  - **`#/visual` ports:** 10 of the 12 as-is; `theme-swatches` became `theme/swatches`, the default
    palette as 8 bar series, since the theme objects go in M8; `legend-table` waits for M8 ("legend
    fixtures arrive with M8").
  - **Basics:** all 10 of `gap-overhaul-delta/srv/fixtures.js`.
  - **Audit grid:** 6 marks × {1, 3, 8} series × {320×200, 640×320, 1200×480}, defaults only.
  - **Options:** only those that survive §4.4. `sizeBy.scale` and `heatmap*` were dropped from the
    ports.
- **Shots.** 137:
  - 111 at DPR 1;
  - 20 at DPR 2 (the crispness set: the 3-series 640 × 320 grid cell of every mark, six basics,
    `spangaps-off`, y2, explicit ticks, the 4 s time axis, annotations, axis titles and two overlay
    fixtures);
  - theme fixtures as `@light` and `@dark` (6 fixtures, 12 shots).
- **Determinism:**
  - IBM Plex Sans (`@fontsource`) is loaded with `document.fonts.load` before the chart exists, and
    `theme.fontFamily` is set explicitly.
  - The app reports ready after `document.fonts.ready`, two frames and an idle callback.
  - Data is seeded.
  - The config fixes the viewport (1280 × 800), `contextOptions.reducedMotion: 'reduce'`, `en-US`, UTC
    and `maxDiffPixelRatio: 0.002`.
  - The 24 px minimum-font fixture runs in a persistent full-Chromium profile, because the headless
    shell ignores the preference.
  - All 11 full runs on this machine gave 0 diffs (outside the deliberate self-test).
- **Runner.** `npm run test:visual` → `packages/snaplot/test/visual/run.mjs`.
  - Default: both projects against the committed `__screenshots__/<area>/<name>-<platform>.png`.
  - `--against <ref>`: it checks that the ref has the fixture app (`git cat-file`), extracts it with
    `git archive` into `/Users/liam/Projects/snaplot/.claude/visual-cache/<sha>/` (`SNAPLOT_SNAPSHOT_DIR`)
    and runs the ref's own config with `--update-snapshots=all` into `shots-<platform>-<pw>-<chromium>/`.
    It reuses the head's `node_modules` when the lockfiles match, else runs `npm ci` there. It never
    writes into the tracked `__screenshots__/`, and does not cache a failed capture.
  - `--update`: rewrites the committed set and prunes stale files.
  - `--serve`: serves the fixture app.
  - It waits while `.claude/bench.lock` exists, and uses port 5333 (a free port if that is busy). Each
    run writes `test-results/visual/{report.json, meta.json, contact-sheet.html}`.
- **Geometry specs** (`geometry` project, blocking on every platform). Five checks in `checks.ts`, with
  unit tests in `checks.test.ts`, over facts `probe.ts` collects in the page:
  - DOM label boxes (`getBoundingClientRect`), attributed to axes through the debug `labelBoxes()`;
  - data-layer ink at every finite datum (`scale().toPixel` once M8 adds it).

  Checks that fail today are `test.fail` with `[id]` in the title. They are declared per owner as
  `fails('<owner>', '<fixture>', '<check>', '<id>')` in `test/visual/expected/m<N>.ts`. The fix flips
  `fails(` to `fixed(`, so the passing test keeps its id as the lock. There are 15:
  - M7: `dataapi-07`.
  - M10: `visuals-21:def-01` ×3, `visuals-21:def-03`, `render-02`, `render-06`, `render-08`,
    `render-14`, `render-19`, `dxtrial-10`, `gap-environments-07` ×2.
  - M11: `visuals-21:def-04`, `render-05`.
- **`scripts/overhaul/check-visual-diffs.mjs`** (G10):
  - zero changes for M2, M9a and M9b;
  - otherwise, every changed or removed shot's fixture is named in a row file changed since the base
    (`<area>/<prefix>*` allowed);
  - head-only shots are "added";
  - geometry failures, broken shots, and partial or narrowed runs fail (`--allow-partial` to override);
  - diff images are copied to `notes/overhaul-audit/visual-diffs/<m>/`.
- **`scripts/overhaul/check-visual-ledger.mjs`** (P13):
  - per commit in `overhaul-baseline..HEAD`: screenshots or a `visual:` paragraph require a row file
    (and each named V-id);
  - it validates the format of every added row;
  - the commits in `baseline-commits.txt` are exempt, matched by SHA or, after a rebase, by
    `git patch-id` (`--refresh` rewrites the file).
- **`scripts/visual-docker.sh`:** the optional Linux path (Playwright 1.61.1 noble image,
  `linux/amd64` by default, `--against`, `--update`). See Known gaps.
- **Docs:** `packages/snaplot/test/visual/README.md`, `docs/decisions/visual-ledger/V0.md`, and
  `baseline-commits.txt`, which lists `4597c43a127deb4b1899f522a7029ef341fd9d33`.

Commits (oldest first):

| SHA | Subject |
|---|---|
| `eeb1a7c` | test(visual): deterministic fixture app and docker screenshot runner |
| `9089696` | test(visual): geometry specs over DOM label boxes |
| `4597c43` | test(visual): initial darwin baselines |
| `06ee468` | chore(scripts): check screenshot diffs against the visual ledger |
| `935c0b6` | test(visual): check the reference before extracting it, never cache a failed capture |
| (tip) | docs(handoff): record the M3a gates |

Two departures from the brief's commit list:
- Commit 3 says "darwin" instead of "Linux" (EXECUTION.md rule 1).
- Commit 5 is a robustness follow-up to the runner. It was found while running the exit commands.

Closes: repo-10.

## Gates

All at `935c0b6` (the last source commit), in the worktree.

**`npm run verify`** (exit 0). Test total: 520 at M1 + 8 (`test/visual/checks.test.ts`) = 528.

```
> biome ci . && npm run typecheck && npm test && npm run build
Checked 179 files in 110ms. No fixes applied.
> tsc -p tsconfig.json --noEmit && tsc -p tsconfig.test.json
 Test Files  48 passed (48)
      Tests  527 passed | 1 expected fail (528)
[vite:dts] Declaration files built in 1302ms.
✓ built in 1.71s
✓ built in 413ms
```

The one expected failure is M1's `[arch-01]` (owned by M8).

**Per-commit proof.** EXECUTION rule 4 does not require it (non-serial, at most 6 commits); it ran anyway.
Every pick fast-forwarded, so no SHA changed.

```
$ git rebase -x 'git diff --quiet HEAD~1 -- package-lock.json || npm ci; npm test' overhaul
Rebasing (2/10)Executing: git diff --quiet HEAD~1 -- package-lock.json || npm ci; npm test
      Tests  519 passed | 1 expected fail (520)        # eeb1a7c
      Tests  527 passed | 1 expected fail (528)        # 9089696
      Tests  527 passed | 1 expected fail (528)        # 4597c43
      Tests  527 passed | 1 expected fail (528)        # 06ee468
      Tests  527 passed | 1 expected fail (528)        # 935c0b6
Successfully rebased and updated refs/heads/ovh/m3a-visual.
rebase-exit=0
```

The `#` SHA annotations are added here; the raw log has one `Executing` line per commit. The lockfile
never changed, so `npm ci` never ran.

**Exit 1: `npm run test:visual -- --against HEAD` twice in a row shows zero diffs.** The first run
extracts and captures the reference; the second reuses the cache.

```
$ npm run test:visual -- --against HEAD            # run 1, exit 0
visual: extracting HEAD (935c0b6388) into /Users/liam/Projects/snaplot/.claude/visual-cache/935c0b638837baa501f876347f830b4f549a0fa1/tree
  137 passed (12.5s)
visual: captured 137 reference screenshots
  4 skipped
  688 passed (19.9s)
$ node scripts/overhaul/check-visual-diffs.mjs     # exit 0
check-visual-diffs: head 935c0b6388 vs HEAD (935c0b6388)
  milestone M3a, rows changed since 935c0b638837: none
  137 shots: 0 changed, 0 added, 0 removed, 0 broken; geometry: 555 checks, 0 failing
check-visual-diffs: OK

$ npm run test:visual -- --against HEAD            # run 2, exit 0
visual: reference HEAD (935c0b6388) from cache /Users/liam/Projects/snaplot/.claude/visual-cache/935c0b638837baa501f876347f830b4f549a0fa1/shots-darwin-arm64-pw1.61.1-chromium1228
  4 skipped
  688 passed (19.0s)
$ node scripts/overhaul/check-visual-diffs.mjs     # exit 0
  137 shots: 0 changed, 0 added, 0 removed, 0 broken; geometry: 555 checks, 0 failing
check-visual-diffs: OK
```

The committed-baseline mode (`npm run test:visual`, exit 0) also shows 0 diffs:

```
  4 skipped
  688 passed (18.0s)
check-visual-diffs: head 935c0b6388 vs committed darwin baselines
  milestone M3a, rows changed since overhaul: V0.md
  137 shots: 0 changed, 0 added, 0 removed, 0 broken; geometry: 555 checks, 0 failing
check-visual-diffs: OK
```

The 688 tests are 137 shots + 551 geometry checks. The 4 skips are the paint check on the two density
fixtures, and `axes/empty`'s paint and minimum-label checks (the §5.1 empty state).

**Exit 2: the committed baselines number ≤ 150 and total ≤ 10 MB.**

```
$ find packages/snaplot/test/visual/__screenshots__ -name '*-darwin.png' | wc -l
     137
3.50 MB (3667350 bytes)
axes 26 · marks 87 · theme 12 · layout 6 · overlay 6 · @2x 20 · @dark 6
```

**Exit 3: the geometry specs pass, or are `test.fail` with an `[id]`.** 0 unexpected results. The
tagged tests, from `report.json`:

```
axes/titles-320          | no two label boxes overlap [visuals-21:def-01]                 | expected (failed) owned by M10
axes/titles-320          | every label stays inside the chart box [visuals-21:def-01]     | expected (failed) owned by M10
axes/titles-480          | every label stays inside the chart box [visuals-21:def-01]     | expected (failed) owned by M10
axes/long-ticks-320      | no two label boxes overlap [render-14]                         | expected (failed) owned by M10
axes/categories-30-480   | no two label boxes overlap [visuals-21:def-03]                 | expected (failed) owned by M10
axes/categories-30-320   | no two label boxes overlap [render-02]                         | expected (failed) owned by M10
axes/single-320          | every finite datum paints at least 1 pixel [visuals-21:def-04] | expected (failed) owned by M11
axes/log-under-decade    | every axis of 120 px or more shows at least 2 labels [render-06] | expected (failed) owned by M10
axes/time-seconds        | no two adjacent labels on an axis share text [dxtrial-10]      | expected (failed) owned by M10
axes/format-collapse     | no two adjacent labels on an axis share text [render-19]       | expected (failed) owned by M10
axes/histogram-tiny-range| no two adjacent labels on an axis share text [render-08]       | expected (failed) owned by M10
axes/iso-strings         | no two label boxes overlap [dataapi-07]                        | expected (failed) owned by M7
axes/min-font-24         | no two label boxes overlap [gap-environments-07]               | expected (failed) owned by M10
axes/min-font-24         | every label stays inside the chart box [gap-environments-07]   | expected (failed) owned by M10
marks/isolated-points    | every finite datum paints at least 1 pixel [render-05]         | expected (failed) owned by M11
15 tagged geometry tests
{'expected': 688, 'skipped': 4, 'unexpected': 0, 'flaky': 0}
```

Each was first run as a plain test and failed for the reported reason:
- titles overflow by 54 and 131 px and overlap each other;
- `"Window 0.0 seconds" × "Window 12.0 seconds"` overlap by 16 px;
- the 30 categories give hundreds of overlapping label pairs at both widths;
- the single point and the 4 isolated points have no ink;
- the log Y axis over 11–19 has 0 labels;
- `12:00:00 PM` repeats on the 4 s axis, `100.0%` and `99.9%` repeat on the format-collapse axis, and
  `0.0` repeats on the histogram over 0–0.003;
- the 60 ISO date labels overlap their neighbours (hundreds of pairs);
- at a 24 px minimum font the Y labels overflow by 45 px and `2021` overlaps `1200000`.

**Exit 4: a deliberately changed fixture fails `check-visual-diffs`, and a row file that names it
passes.** The change was a local edit to `basicLine()` (p50 + 4), not committed; the row was an
untracked `V99.md`. Both were reverted, then a clean `npm run test:visual` exited 0.

```
$ npm run test:visual -- --against HEAD          # exit 1
  4 failed
  684 passed (20.4s)
$ node scripts/overhaul/check-visual-diffs.mjs --no-copy        # exit 1
check-visual-diffs: head 935c0b6388 + working tree vs HEAD (935c0b6388)
  milestone M3a, rows changed since 935c0b638837: none
  137 shots: 4 changed, 0 added, 0 removed, 0 broken; geometry: 555 checks, 0 failing
  changed  marks/basic-line
  changed  marks/basic-line@2x
  changed  marks/basic-nogrid
  changed  marks/basic-nogrid@2x
check-visual-diffs: FAIL: changed or removed fixtures without a visual-ledger row from this milestone: marks/basic-line, marks/basic-nogrid
$ # add docs/decisions/visual-ledger/V99.md naming `marks/basic-line`, `marks/basic-nogrid`
$ node scripts/overhaul/check-visual-diffs.mjs --no-copy        # exit 0
  milestone M3a, rows changed since 935c0b638837: V99.md
  changed  marks/basic-line  (V99.md: marks/basic-line)
  changed  marks/basic-line@2x  (V99.md: marks/basic-line)
  changed  marks/basic-nogrid  (V99.md: marks/basic-nogrid)
  changed  marks/basic-nogrid@2x  (V99.md: marks/basic-nogrid)
check-visual-diffs: OK
```

Further self-tests, run at `06ee468` with the same check scripts:
- **Zero-change rule.** The same diff with `--milestone M9b` fails even with the row:
  `M9b must not change any fixture (zero-change rule): marks/basic-line, …`, exit 1.
- **Added and removed.** A fixture renamed locally is reported as `removed marks/basic-area` plus
  `added marks/basic-area-renamed`, and fails for the removal. A new head-only fixture is reported as
  `added` and needs no row.
- **Partial runs.** A `--project visual` run fails with `the run did not include both projects …`
  unless `--allow-partial`.
- **Diff images.** With a milestone, they are copied to
  `/Users/liam/Projects/snaplot/notes/overhaul-audit/visual-diffs/m3a/`, with an `index.html`. Those
  files are from the self-test, not a real change.

**`check-visual-ledger`.** At the tip (exit 0):

```
  baseline  4597c43a12 test(visual): initial darwin baselines (137 screenshots, V0)
check-visual-ledger: 35 commits in overhaul-baseline..HEAD, 1 with visual changes, 1 listed baseline commit(s)
check-visual-ledger: OK
```

Self-tests in a scratch clone, each commit reset afterwards:

```
== screenshot without row:  FAIL: 18d7851919 fix(marks): tweak: touches 1 screenshot file(s) but adds or edits no docs/decisions/visual-ledger/V<n>.md   exit=1
== visual: V31, no row:     FAIL: ff83a837e6 fix(axes): change: has a visual: paragraph but adds or edits no docs/decisions/visual-ledger/V<n>.md      exit=1
== bad row:                 FAIL: V31.md: **Commit:** does not quote the subject "fix(axes): change"
                            FAIL: V31.md: **Fixtures:** names no fixture in backticks                                                              exit=1
== good row:                visual 463993741f fix(axes): change → V31 … check-visual-ledger: OK                                                     exit=0
== rebased onto a new base: warning: 55761232ca test(visual): initial darwin baselines: listed as 4597c43a12 before a rebase; run with --refresh
                            check-visual-ledger: OK (exit 0); --refresh rewrote baseline-commits.txt to 55761232ca50…
```

**A pre-M3a ref is refused.** It is checked before anything is extracted:

```
$ npm run test:visual -- --against overhaul      # exit 2
visual: overhaul (16547da580) has no visual fixture app: refs older than the M3a merge are not valid references (plan §11.3 G10)
```

**Metrics** (`node scripts/overhaul/metrics.mjs` at `935c0b6`, exit 0). Unchanged from M1, because M3a
touches no library source:

| Metric | Value |
|---|---|
| Code / physical lines | 15,381 / 20,236 |
| Source files | 69 |
| Largest file | `core/Chart.ts`, 4,525 lines |
| Runtime exports `.` / `./core` / `react` / `solid` | 35 / 35 / 12 / 13 |
| Option leaves / handle members | 169 / 24 |
| Legend implementations | 4 |

**Not applicable yet:**
- `ledger`, `trace-check` and `test:browser` (M3b);
- `bench:ab` (M4; M3a also touches no `src/`);
- `check:package`, `check:size` and `check:api` (M5);
- `build:site` (M6a).

## Visual-ledger rows

- **V0**, `test(visual): initial darwin baselines` (`4597c43`). Fixtures: `axes/*`, `marks/*`, `theme/*`,
  `layout/*`, `overlay/*` (all 111 fixtures, 137 shots). These are the initial committed baselines, not
  a default change. The commit is listed in `docs/decisions/visual-ledger/baseline-commits.txt`.

## Requests for integrator

1. **A regression on `overhaul` from M1: plugins installed at creation are not painted at mount.** This
   covers the built-in reference lines and regions and user `plugins` with draw hooks.
   - **Symptom.** `createChart(el, { …, referenceLines, referenceRegions })` paints the chart once
     (`debug(chart).renderCount` = `{ grid: 1, data: 1, overlay: 1 }`). The annotations appear only
     after the next unrelated render (a hover, an update or a real resize).
   - **Measured** with the `axes/annotations-390` fixture, in data-layer pixels with ink:
     - `ovh-m0-done`: 3,603, and 2 renders at load;
     - `overhaul` at `16547da`: 1,273 at load, then 3,603 after `chart.redraw()`.
   - **Cause.** The `Controller` constructor calls `this.lines.setLines(…)` and
     `this.regions.setRegions(…)` before `this.engine.use(plugin)`. The plugin's `chartRef` is still
     null, so no redraw is scheduled, and `ChartCore.use()` does not schedule one either. Before M1, the
     first ResizeObserver delivery repainted and hid this. Since `e67aa2a`/`5106dd4` ("observing an
     unchanged box paints nothing more"), nothing does.
   - **Effect on V0.** The baseline `axes/annotations-390` (and its `@2x`) shows no annotations.
   - **Suggested fix.** Request one render after installing the creation-time plugins, or call
     `setLines`/`setRegions` after `use()`. Lock it with a test that a chart created with a
     `referenceLines` entry has data-layer ink on that line after the first frame (fakes plus
     `debug()`).
   - **Visual row.** The fix changes `axes/annotations-390` and `axes/annotations-390@2x`, so it needs
     a visual-ledger row. That is V17–V29 if M7 or M8 lands it; otherwise allocate one from V90+.
2. **After rebasing this branch onto a newer `overhaul`** (merge order M5 → M3a), the SHA in
   `docs/decisions/visual-ledger/baseline-commits.txt` goes stale. `check-visual-ledger` still passes,
   matching by patch-id with a warning. Run `node scripts/overhaul/check-visual-ledger.mjs --refresh`
   and commit the one-line change (e.g. `chore(repo): refresh the V0 baseline commit after rebase`).
3. **Ownership of the new shared files**, for plan §12. Please record it:
   - each owning milestone edits its own `packages/snaplot/test/visual/expected/m<N>.ts` (M7, M10,
     M11, M12a; M12b adds `m12b.ts`), the same way as its `fixtures/<area>.ts`;
   - flipping a geometry finding means changing `fails(` to `fixed(` on its line;
   - the shared harness (`checks.ts`, `probe.ts`, the specs, `run.mjs`, `expected/index.ts`) stays with
     M3a, then the integrator.
4. **M3b** (ledger, browser specs, trace ids):
   - `scripts/ledger.mjs` should also list the geometry markers. Each is one line,
     `fails('<owner>', '<fixture>', '<check>', '<id>')`, in `packages/snaplot/test/visual/expected/m*.ts`
     (15 today); `fixed(` lines are locks.
   - Playwright reports them as `test.fail` with `[<id>]` in the title, so the "executed markers equal
     ledger length" exit holds once they are counted.
   - `trace-check` can read the titles from `packages/snaplot/test-results/visual/report.json`.
   - `test:browser` goes into the same `packages/snaplot/playwright.config.ts`, which M3a owns:
     - add a `browser` project with `testMatch: 'browser/**/*.spec.ts'`;
     - keep the `webServer` (or add a second) and the `PORT` contract;
     - decide whether `test:browser` also runs `--project geometry` (G9 lists geometry).
   - The fixture app can host browser specs: `window.__snaplotFixture` exposes the chart handle.
5. **M5** (CI, `update-snapshots`):
   - **CI visual job** (advisory until M14): `npx playwright install --with-deps chromium`, then
     `npm run test:visual`, uploading `packages/snaplot/test-results/visual/`. The geometry project is
     platform-independent and could gate there already.
   - **`update-snapshots.yml`** (`workflow_dispatch`): on `ubuntu-latest`,
     `npm run test:visual -- --update` (or `scripts/visual-docker.sh --update`), committing only the
     `*-linux.png` files.
   - The 24 px minimum-font fixture uses the full `chromium` channel, which
     `npx playwright install chromium` provides.
   - A commit that adds the `-linux` set touches `__screenshots__`. List its SHA in
     `baseline-commits.txt` or give it a row, or `check-visual-ledger` fails.
6. **`packages/snaplot/package.json`** gains one line (`"test:visual": "node test/visual/run.mjs"`).
   M5 also edits this `scripts` block, so a trivial rebase conflict is possible. The root
   `test:visual` delegation from M0 already exists.
7. **Merge-time gate for later milestones:**
   1. `npm run test:visual -- --against <merge-base>`;
   2. `node scripts/overhaul/check-visual-diffs.mjs` (the milestone comes from the branch name, or pass
      `--milestone M<N>`; the base defaults to the ref the run compared against);
   3. `node scripts/overhaul/check-visual-ledger.mjs`.

   `test:visual` exits non-zero whenever a screenshot differs. `check-visual-diffs` decides whether
   that is allowed, and also fails on geometry failures.

## Known gaps

- **`scripts/visual-docker.sh` has not been run.** Agents never need it (EXECUTION.md rule 1), and
  pulling `mcr.microsoft.com/playwright:v1.61.1-noble` would be a download outside the plan. There is no
  `-linux` set yet.
  - The script passes `bash -n`.
  - Its inner path relies on the image having `git`. It runs `git init` in the copied tree so that
    `run.mjs` works. If the image lacks `git`, add `apt-get install -y git` there or skip it.
  - Run it once from the `update-snapshots` workflow, then tick this off.
- **Canvas-drawn labels are outside the geometry checks.** Annotation labels are painted on the canvas,
  so the label checks cannot see them (gap-annotations-extensibility-02). The visual fixture
  `axes/annotations-390` covers them by pixels, but today it shows no annotations at all (Requests 1).
  If M10 moves annotation labels into the DOM label layer, the checks pick them up automatically:
  every non-empty span in the chart host counts, as does `[data-snaplot-label]` when present.
- **The paint check is weaker for bars and histograms.** It probes at half height across the slot, so a
  grouped bar can be satisfied by its neighbour. Density series are not probed, and both density
  fixtures skip the check.
- **Tooltip-text specs** (G10 mentions them with geometry) belong to M3b (`m10-tooltip-format.spec.ts`,
  `m12a-tooltip-rows.spec.ts`). The overlay fixtures capture tooltips only as pixels.
- **The geometry thresholds are the plan's, with a 0.5 px slack:**
  - "120 px" is the plot length along the axis;
  - titles are excluded from the label counts but included in the overlap and inside checks;
  - the empty fixture skips the minimum-label check by design (§5.1 empty state).
- **The audit grid's line and area data** round with `Math.round(v * 100) / 100` instead of
  `+v.toFixed(2)`. It is deterministic, but not byte-identical to `evidence/play/visuals-grid.html`.

## Data notes

- No downloads. Fixture data is generated from seeded generators in `test/visual/fixtures/data.ts`: the
  `#/visual` and gap-overhaul-delta LCG, and the audit grid's mulberry32. The fonts come from
  `@fontsource/ibm-plex-sans@5.3.0`, already a devDependency since M0.
- Reference cache (`/Users/liam/Projects/snaplot/.claude/visual-cache/`, gitignored, safe to delete):
  - `935c0b6…` and `06ee468…`: this branch's tip and its parent;
  - `e1158f9…`: an earlier SHA of commit 4, before its message and the partial-run rule were amended.

  An early `--against overhaul` test, before the pre-extraction check, extracted a tree. It was moved
  aside to `/Users/liam/Projects/snaplot/.claude/backups/leftovers/visual-cache-16547da-pre-harness`
  rather than deleted.
- `/Users/liam/Projects/snaplot/notes/overhaul-audit/visual-diffs/m3a/` holds the self-test's diff
  images (`marks/basic-line`, `marks/basic-nogrid`). They are not a real change; delete them freely.
- Regenerating: `npm run test:visual -- --update` (M3a and M14 only), then review
  `packages/snaplot/test-results/visual/contact-sheet.html`.

## Human steps

- **Refresh the Linux baselines with the `update-snapshots` workflow** once M5 adds it. CI's visual job
  stays advisory until then, and until M14.
- **Review the V0 contact sheet** (`npm run test:visual`, then open
  `packages/snaplot/test-results/visual/contact-sheet.html`). It records today's defects as the starting
  point, so it is not an approval of the look; M14 approves the final set.
- Real-device checks: none for M3a.
