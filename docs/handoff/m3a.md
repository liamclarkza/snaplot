# M3a: Visual and geometry harness

- **Branch:** `ovh/m3a-visual` · **Worktree:** `.claude/worktrees/m3a` · **Base:** `16547da` (`overhaul`
  at start, = `ovh-m1-done` tip).
  - `overhaul` has since gained M5 (15 commits, up to `504d934`). None of them touch `src/` or a path
    M3a owns.
  - The branch is not rebased; the integrator rebases at merge (Requests 2).
- **Status:** complete, after the fixes for review #1.
  - The visual platform is local macOS Chromium (EXECUTION.md rule 1), so the committed baselines are
    the `-darwin` set.
  - Refresh the Linux baselines with the `update-snapshots` workflow.

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
  - **Edge cases** (all 17 in the brief):
    - empty data, all-negative bars, log under one decade;
    - a 4 s time axis, epoch-ms bars, ISO strings;
    - annotations at 390 px, a y2 dual axis, a 24 px minimum font, explicit ticks;
    - isolated points, histogram `fill`, area with negatives;
    - a transparent background, a dark CSS-variable surface;
    - bar+line hover, 3-series scatter hover.
  - **Tick-defect fixtures:**
    - The geometry checks catch:
      - long ticks overlapping (`axes/long-ticks-320`, render-14);
      - repeated labels on the 4 s time axis (dxtrial-10);
      - format collapse (render-19);
      - the histogram over 0–0.003 (render-08);
      - log under one decade with no labels (render-06).
    - The 5-minute time axis (`axes/time-minutes-480`, render-14's clamped end labels) passes all five
      checks and is covered by pixels only.
  - **`#/visual` ports:** 10 of the 12 as-is:
    - `theme-swatches` became `theme/swatches`: the default palette drawn as 8 bar series, since the
      theme objects go in M8;
    - `legend-table` waits for M8 ("legend fixtures arrive with M8").
  - **Basics:** all 10 of `gap-overhaul-delta/srv/fixtures.js`.
  - **Audit grid:** 6 marks × {1, 3, 8} series × {320×200, 640×320, 1200×480}, defaults only.
  - **Options:** only those that survive §4.4. `sizeBy.scale` and `heatmap*` were dropped from the
    ports.
- **Shots.** 137:
  - 111 at DPR 1;
  - 20 at DPR 2, the crispness set:
    - the 3-series 640 × 320 grid cell of every mark;
    - six basics and `spangaps-off`;
    - y2, explicit ticks, the 4 s time axis, annotations and axis titles;
    - two overlay fixtures;
  - the 6 theme fixtures as `@light` and `@dark` (12 shots).
- **Determinism:**
  - IBM Plex Sans (`@fontsource`) is loaded with `document.fonts.load` before the chart exists, and
    `theme.fontFamily` is set explicitly.
  - The app reports ready after `document.fonts.ready`, two frames and an idle callback, and only once
    the grid and data layers have rendered and the data layer holds ink.
    - For a fixture declaring `blankData` (empty, single point, isolated points), the grid layer must
      hold ink instead.
    - It waits up to 5 s. It never asks for a redraw, so a chart that does not paint fails its tests.
  - Data is seeded.
  - The config fixes:
    - the viewport (1280 × 800);
    - `contextOptions.reducedMotion: 'reduce'`;
    - `en-US` and UTC;
    - `maxDiffPixelRatio: 0.002`, or exact comparison with `--strict`.
  - The 24 px minimum-font fixture runs in a persistent full-Chromium profile, because the headless
    shell ignores the preference.
  - Every full run in this attempt gave 0 diffs and no flaky result, outside the
    deliberate self-tests.
- **Runner.** `npm run test:visual` → `packages/snaplot/test/visual/run.mjs`.
  - Default: both projects against the committed `__screenshots__/<area>/<name>-<platform>.png`.
  - `--against <ref>`:
    - It checks that the ref has the fixture app (`git cat-file`).
    - It extracts the ref with `git archive` into `/Users/liam/Projects/snaplot/.claude/visual-cache/<sha>/`
      (`SNAPLOT_SNAPSHOT_DIR`).
    - It runs the ref's own config twice into `shots-<platform>-<pw>-<chromium>/`: once with
      `--update-snapshots=all`, then once more, compared exactly, to check that every shot
      reproduces.
    - `meta.json` records the reference outcome: `against.exit`, `verifyExit`, `complete`, `declared`
      and `shots`.
    - Only a complete reference is cached (`capture.json`, format 3). Otherwise the runner exits
      non-zero.
    - It reuses the head's `node_modules` when the lockfiles match: a symlink, replaced if dangling.
      Otherwise it runs `npm ci` there and keys the cache by the ref's Playwright version.
    - It never writes into the tracked `__screenshots__/`.
  - `--strict`: exact comparison (`threshold: 0`, `maxDiffPixels: 0`), recorded in `meta.json`.
  - `--update`: rewrites the committed set and prunes stale files.
  - `--serve`: serves the fixture app.
  - It waits while `.claude/bench.lock` exists, and uses port 5333 (a free port if that is busy).
  - Each run writes `test-results/visual/{report.json, meta.json, contact-sheet.html}`. A head run that
    dies before reporting leaves an empty report, never the previous one.
- **Geometry specs** (`geometry` project, blocking on every platform). Five checks in `checks.ts`, with
  unit tests in `checks.test.ts`. They run over facts that `probe.ts` collects in the page:
  - DOM label boxes (`getBoundingClientRect`), attributed to axes through the debug `labelBoxes()`;
  - data-layer ink at every finite datum (`scale().toPixel` once M8 adds it).

  Checks that fail today are `test.fail` with `[id]` in the title. They are declared per owner as
  `fails('<owner>', '<fixture>', '<check>', '<id>')` in `test/visual/expected/m<N>.ts`. The fix flips
  `fails(` to `fixed(`, so the passing test keeps its id as the lock. There are 15:
  - M7: `dataapi-07`.
  - M10: `visuals-21:def-01` ×3, `visuals-21:def-03`, `render-02`, `render-06`, `render-08`,
    `render-14`, `render-19`, `dxtrial-10`, `gap-environments-07` ×2.
  - M11: `visuals-21:def-04`, `render-05`.
- **`scripts/overhaul/check-visual-diffs.mjs`** (G10), locked by 16 scenario tests in
  `test/visual/check-visual-diffs.test.ts`:
  - **Zero changes** for M2, M9a and M9b.
  - **Rows.** Otherwise, every changed or removed shot's fixture is named in a row file of the merging
    milestone. That is a `V<n>.md` that differs from the base and whose `**Milestone:**` line names
    the milestone. `<area>/<prefix>*` patterns are allowed. `V0.md` never covers a change, and editing
    it fails the check.
  - **Added.** A head-only shot is "added" only when the reference is complete. Otherwise it is
    "unverified".
  - **Failures:**
    - a reference that compared nothing (0 shots, or no committed baselines);
    - geometry failures and broken shots;
    - unverified shots, incomplete references, and partial or narrowed runs (`--allow-partial`
      overrides these three).
  - **Diff images** are copied to `notes/overhaul-audit/visual-diffs/<m>/`.
- **`scripts/overhaul/check-visual-ledger.mjs`** (P13):
  - per commit in `overhaul-baseline..HEAD`: screenshots or a `visual:` paragraph require a row file
    (and each named V-id);
  - it validates the format of every added row;
  - the commits in `baseline-commits.txt` are exempt, matched by SHA or, after a rebase, by
    `git patch-id` (`--refresh` rewrites the file).
- **`scripts/visual-docker.sh`:** the optional Linux path (Playwright 1.61.1 noble image,
  `linux/amd64` by default, `--against`, `--update`). See Known gaps.
- **Docs:**
  - `packages/snaplot/test/visual/README.md`;
  - `docs/decisions/visual-ledger/V0.md`;
  - `baseline-commits.txt`, which lists `4597c43a127deb4b1899f522a7029ef341fd9d33`.

Commits (oldest first):

| SHA | Subject |
|---|---|
| `eeb1a7c` | test(visual): deterministic fixture app and docker screenshot runner |
| `9089696` | test(visual): geometry specs over DOM label boxes |
| `4597c43` | test(visual): initial darwin baselines |
| `06ee468` | chore(scripts): check screenshot diffs against the visual ledger |
| `935c0b6` | test(visual): check the reference before extracting it, never cache a failed capture |
| `576708d` | docs(handoff): record the M3a gates |
| `c039f61` | test(visual): record the diff check's unverified references as expected failures |
| `e62c59f` | test(visual): verify the reference and fail the diff check when it is incomplete |
| `90ffd44` | chore(scripts): accept only the merging milestone's own visual-ledger rows |
| `c5a7cab` | test(visual): report a fixture ready only once its canvas layers have painted |
| `c2acbc6` | test(visual): add an exact comparison mode for the zero-change milestones |
| `bab8643` | test(visual): document the reference outcome, row rules, paint check and --strict |
| `de0ac26` | test(visual): point the incomplete-reference warning at the report that failed |
| `85e4a57` | test(visual): require the reference's second render to match exactly |
| (tip) | docs(handoff): record the M3a review fixes and gates |

Departures from the brief's commit list:
- Commit 3 says "darwin" instead of "Linux" (EXECUTION.md rule 1).
- Commit 5 is a robustness follow-up to the runner, found while running the exit commands.
- `c039f61` to `85e4a57` are the review #1 fixes (see below).

Closes: repo-10.

## Review #1 response

Review #1 (`notes/overhaul-audit/state/M3a-review1.json`) asked for changes: 1 blocking item and 8 notes.
This attempt resumed after a usage-limit stop. It kept the 7 commits the interrupted attempt had made
(`c039f61` to `de0ac26`), which cover the blocking item and notes 1, 2, 5 and 8. It added one commit,
`85e4a57`, after a self-test showed that the reference's second render was too lenient. It also
rewrote this handoff and re-ran every gate.

**Blocking: `check-visual-diffs` passed when the reference capture failed.** Fixed, tests first:
- `c039f61`: 16 scenario tests in `test/visual/check-visual-diffs.test.ts`. Each one builds a synthetic
  Playwright report in a throwaway git repository (`diff-scenario.mjs`) and runs the real script.
  The 9 `[repo-10]` cases start as `it.fails`.
- `e62c59f`: `run.mjs` renders the reference twice; the second render must reproduce the first. It
  records the outcome in `meta.json` as `against`:
  - `exit` and `verifyExit`;
  - `complete`;
  - `declared`, the number of shots the ref declares;
  - `shots`, the shots that rendered and reproduced.

  Only a complete reference is cached (`capture.json`, format 2; older entries are captured again). The
  runner exits non-zero when the reference is incomplete.

  `check-visual-diffs` now judges against that shot list:
  - a head shot counts as `added` only when the reference is complete and lacks it;
  - otherwise it is `unverified`, which fails unless `--allow-partial`;
  - a reference with 0 shots, or a platform with no committed baselines, fails even with
    `--allow-partial`;
  - a head shot that failed to render is `broken`, never `added`;
  - a `meta.json` without the reference outcome is refused.

  The fix flips 7 of the 9 tests.
- `90ffd44` flips the other 2 (see note 5).
- `de0ac26` makes the warning name the report that failed.
- `85e4a57` compares the second render exactly (`SNAPLOT_VISUAL_STRICT=1` for the ref's config), not
  within the tolerance. `capture.json` moves to format 3, so older entries are captured again.
- End-to-end, each case gives FAIL with exit 1: the reviewer's case, and three partial failures (one
  fixture throws; two fixtures do not reproduce). See the broken-reference self-tests under Gates.

**Notes:**

| # | Note | Outcome |
|---|---|---|
| 1 | Flaky `axes/titles-320` (labels over blank canvases) could be cached as a reference | `c5a7cab`: the app reports ready only once the grid and data layers have rendered and the data layer holds ink. It waits up to 5 s and never asks for a redraw. Three fixtures with a blank data layer today declare `blankData` with the reason. With the double render from `e62c59f`, a flaky reference shot is dropped from the shot list instead of being cached. `85e4a57` makes that second render exact. At the tolerance, a self-test reference that drew `marks/basic-area` in a random hue was cached once, because two renders happened to have close hues; it is now rejected. No flake in the runs below. |
| 2 | The tolerance hides a short title edit | `c2acbc6`: `npm run test:visual -- --strict` compares exactly (`threshold: 0`, `maxDiffPixels: 0`). The default stays the plan's `maxDiffPixelRatio: 0.002`. `check-visual-diffs` prints a note when a zero-change run used the tolerance. Self-test under Gates. Requests 7 asks M2/M9a/M9b to use `--strict`. |
| 3 | The M1 regression: reference lines and regions are not painted at mount | Not M3a's code. It stays as Requests 1, which now says what to do if the fix lands before M3a merges. |
| 4 | `probe.ts` and `app.ts` call `getLayout()` and `getAxis()`, and `overlay/highlight-dim` calls `setHighlight()`; M8 removes all three | Recorded rather than coded (README, `bab8643`; Requests 3). M8's removal turns these calls into type errors under `tsconfig.test.json`, so M8 cannot miss them. A fallback now would be untested code against APIs that do not exist yet (`scale(key)`, the plugin `plot` rect). `toPixel` already prefers `scale()`. |
| 5 | Any changed row file counted, so an edit to `V0.md` whitelisted every fixture | `90ffd44`: a row counts only when it differs from the base and its `**Milestone:**` line names the merging milestone. With no milestone known, only rows added since the base count. `V0.md` never covers a change, and editing it fails the check. Ignored rows are printed with the reason. |
| 6 | `visual-docker.sh` has no automatic arm64 fallback and has never run | Known gaps now say the fallback is manual (`--platform linux/arm64`). |
| 7 | The handoff listed the 5-minute time axis among the tick defects the checks catch | Corrected in the Summary. `axes/time-minutes-480` (render-14's clamped end labels) passes all five checks and is covered by pixels only. The render-14 geometry marker is on `axes/long-ticks-320`. |
| 8 | A dangling `node_modules` symlink in the cache made `symlinkSync` throw `EEXIST`; the cache key used the head's Playwright | `e62c59f`: `linkModules` checks with `lstat` and replaces a dangling or foreign link. The fingerprint uses the ref's own `@playwright/test` version when its lockfile differs. The dangling-link case is self-tested under Gates. |

## Gates

All gates ran at `85e4a57`, the last source commit, in the worktree. This attempt ran its own
`--against` runs with fresh reference caches in the session scratchpad (`SNAPLOT_SNAPSHOT_DIR`), so the
first exit-1 run captured from scratch. The bench lock (M4) was waited for, as the protocol says.

**`npm run verify`** (exit 0). Test total: 520 at M1, + 8 (`checks.test.ts`), + 16
(`check-visual-diffs.test.ts`) = 544.

```
> biome ci . && npm run typecheck && npm test && npm run build
Checked 182 files in 103ms. No fixes applied.
> tsc -p tsconfig.json --noEmit && tsc -p tsconfig.test.json
 Test Files  49 passed (49)
      Tests  543 passed | 1 expected fail (544)
[vite:dts] Declaration files built in 2004ms.
✓ built in 2.69s
✓ built in 638ms
```

The one expected failure is M1's `[arch-01]` (owned by M8).

**Per-commit proof.** EXECUTION rule 4 requires it, since the branch has more than 6 commits.
- It ran from the merge-base, `16547da`, so nothing moved onto the newer `overhaul`.
- Every pick fast-forwarded, so no SHA changed.
- The lockfile never changed, so `npm ci` never ran.

```
$ git rebase -x 'git diff --quiet HEAD~1 -- package-lock.json || npm ci; npm test' 16547da
Rebasing (2/28)Executing: git diff --quiet HEAD~1 -- package-lock.json || npm ci; npm test
      Tests  519 passed | 1 expected fail (520)        # eeb1a7c
      Tests  527 passed | 1 expected fail (528)        # 9089696
      Tests  527 passed | 1 expected fail (528)        # 4597c43
      Tests  527 passed | 1 expected fail (528)        # 06ee468
      Tests  527 passed | 1 expected fail (528)        # 935c0b6
      Tests  527 passed | 1 expected fail (528)        # 576708d
      Tests  534 passed | 10 expected fail (544)       # c039f61
      Tests  541 passed | 3 expected fail (544)        # e62c59f
      Tests  543 passed | 1 expected fail (544)        # 90ffd44
      Tests  543 passed | 1 expected fail (544)        # c5a7cab
      Tests  543 passed | 1 expected fail (544)        # c2acbc6
      Tests  543 passed | 1 expected fail (544)        # bab8643
      Tests  543 passed | 1 expected fail (544)        # de0ac26
      Tests  543 passed | 1 expected fail (544)        # 85e4a57
Successfully rebased and updated refs/heads/ovh/m3a-visual.
rebase-exit=0
```

The SHA column is added here; the raw log has one `Executing` line per commit. The counts show the
tests-first order:
- `c039f61` adds 16 tests, 9 of them `[repo-10]` expected failures;
- `e62c59f` flips 7 of them;
- `90ffd44` flips the other 2.

**Exit 1: `npm run test:visual -- --against HEAD` twice in a row shows zero diffs.** Run 1 extracts the
ref, renders it, and renders it again exactly. Run 2 uses the cache.

```
$ npm run test:visual -- --against HEAD      # run 1, exit 0
visual: extracting HEAD (85e4a57700) into …/m3a-selftest/cache-r3-exit1/85e4a5770030c10dbd556b6e2baec423fb1b1c78/tree
  137 passed (14.3s)
visual: rendering the reference again; every shot must reproduce exactly
  137 passed (8.9s)
visual: captured 137 reference screenshots (each reproduced)
  4 skipped
  688 passed (23.9s)
$ node scripts/overhaul/check-visual-diffs.mjs       # exit 0
check-visual-diffs: head 85e4a57700 vs HEAD (85e4a57700)
  reference: complete, 137 shots; tolerance maxDiffPixelRatio 0.002
  milestone M3a, rows of this milestone changed since 85e4a5770030: none
  137 shots: 0 changed, 0 added, 0 removed, 0 broken, 0 unverified; geometry: 555 checks, 0 failing
check-visual-diffs: OK

$ npm run test:visual -- --against HEAD      # run 2, exit 0
visual: reference HEAD (85e4a57700) from cache …/cache-r3-exit1/85e4a57…/shots-darwin-arm64-pw1.61.1-chromium1228 (137 shots)
  4 skipped
  688 passed (19.8s)
$ node scripts/overhaul/check-visual-diffs.mjs       # exit 0
  reference: complete, 137 shots (cached); tolerance maxDiffPixelRatio 0.002
  137 shots: 0 changed, 0 added, 0 removed, 0 broken, 0 unverified; geometry: 555 checks, 0 failing
check-visual-diffs: OK
```

The exact comparison (`--strict`, as Requests 7 asks of M2/M9a/M9b) also shows zero diffs:

```
$ npm run test:visual -- --against HEAD --strict      # exit 0
  4 skipped
  688 passed (17.9s)
$ node scripts/overhaul/check-visual-diffs.mjs --milestone M2 --no-copy      # exit 0
  reference: complete, 137 shots (cached); exact comparison (--strict)
  milestone M2, zero-change rule
  137 shots: 0 changed, 0 added, 0 removed, 0 broken, 0 unverified; geometry: 555 checks, 0 failing
check-visual-diffs: OK
```

So does the committed-baseline mode:

```
$ npm run test:visual      # exit 0
  4 skipped
  688 passed (20.4s)
$ node scripts/overhaul/check-visual-diffs.mjs       # exit 0
check-visual-diffs: head 85e4a57700 vs committed darwin baselines
  reference: 137 committed darwin baselines; tolerance maxDiffPixelRatio 0.002
  milestone M3a, rows of this milestone changed since overhaul: none (ignored: V0.md (initial baselines))
  137 shots: 0 changed, 0 added, 0 removed, 0 broken, 0 unverified; geometry: 555 checks, 0 failing
check-visual-diffs: OK
```

The 688 tests are 137 shots + 551 geometry checks. The 4 skips are:
- the paint check on the two density fixtures;
- `axes/empty`'s paint and minimum-label checks (the §5.1 empty state).

**Exit 2: the committed baselines number ≤ 150 and total ≤ 10 MB.** Unchanged since V0:

```
$ find packages/snaplot/test/visual/__screenshots__ -name '*-darwin.png' | wc -l
     137
3.50 MB (3667350 bytes)
axes 26 · marks 87 · theme 12 · layout 6 · overlay 6 · @2x 20 · @dark 6
```

**Exit 3: the geometry specs pass, or are `test.fail` with an `[id]`.** 0 unexpected results. The tagged
tests, from `report.json` of the committed-baseline run:

```
axes/titles-320          | no two label boxes overlap [visuals-21:def-01]                   | expected (failed)
axes/titles-320          | every label stays inside the chart box [visuals-21:def-01]       | expected (failed)
axes/titles-480          | every label stays inside the chart box [visuals-21:def-01]       | expected (failed)
axes/long-ticks-320      | no two label boxes overlap [render-14]                           | expected (failed)
axes/categories-30-480   | no two label boxes overlap [visuals-21:def-03]                   | expected (failed)
axes/categories-30-320   | no two label boxes overlap [render-02]                           | expected (failed)
axes/single-320          | every finite datum paints at least 1 pixel [visuals-21:def-04]   | expected (failed)
axes/log-under-decade    | every axis of 120 px or more shows at least 2 labels [render-06] | expected (failed)
axes/time-seconds        | no two adjacent labels on an axis share text [dxtrial-10]        | expected (failed)
axes/format-collapse     | no two adjacent labels on an axis share text [render-19]         | expected (failed)
axes/histogram-tiny-range| no two adjacent labels on an axis share text [render-08]         | expected (failed)
axes/iso-strings         | no two label boxes overlap [dataapi-07]                          | expected (failed)
axes/min-font-24         | no two label boxes overlap [gap-environments-07]                 | expected (failed)
axes/min-font-24         | every label stays inside the chart box [gap-environments-07]     | expected (failed)
marks/isolated-points    | every finite datum paints at least 1 pixel [render-05]           | expected (failed)
15 tagged geometry tests
{"expected":688,"skipped":4,"unexpected":0,"flaky":0}
```

The first implementation ran each of these as a plain test first, and each failed for the reason
recorded:
- titles overflow by 54 and 131 px and overlap each other;
- `"Window 0.0 seconds"` and `"Window 12.0 seconds"` overlap by 16 px;
- the 30 categories give hundreds of overlapping label pairs at both widths;
- the single point and the 4 isolated points have no ink;
- the log Y axis over 11–19 has 0 labels;
- `12:00:00 PM` repeats on the 4 s axis;
- `100.0%` and `99.9%` repeat on the format-collapse axis;
- `0.0` repeats on the histogram over 0–0.003;
- the 60 ISO date labels overlap their neighbours (hundreds of pairs);
- at a 24 px minimum font, the Y labels overflow by 45 px and `2021` overlaps `1200000`.

Review #1 re-checked all 15.

**Exit 4: a deliberately changed fixture fails `check-visual-diffs`, and a row file that names it
passes.**
- The change was a local edit to `basicLine()` (p50 + 4), not committed.
- The row was an untracked `V99.md` with `**Milestone:** M3a`.
- Both were reverted afterwards, and the final clean run (below) exited 0.

```
$ npm run test:visual -- --against HEAD      # exit 1
  4 failed
  684 passed (20.0s)
$ node scripts/overhaul/check-visual-diffs.mjs --no-copy      # exit 1
check-visual-diffs: head 85e4a57700 + working tree vs HEAD (85e4a57700)
  milestone M3a, rows of this milestone changed since 85e4a5770030: none
  137 shots: 4 changed, 0 added, 0 removed, 0 broken, 0 unverified; geometry: 555 checks, 0 failing
  changed  marks/basic-line
  changed  marks/basic-line@2x
  changed  marks/basic-nogrid
  changed  marks/basic-nogrid@2x
check-visual-diffs: FAIL: changed or removed fixtures without a visual-ledger row from this milestone: marks/basic-line, marks/basic-nogrid
+ untracked docs/decisions/visual-ledger/V99.md naming marks/basic-line, marks/basic-nogrid (Milestone M3a)
$ node scripts/overhaul/check-visual-diffs.mjs --no-copy      # exit 0
  milestone M3a, rows of this milestone changed since 85e4a5770030: V99.md
  changed  marks/basic-line  (V99.md: marks/basic-line)
  changed  marks/basic-line@2x  (V99.md: marks/basic-line)
  changed  marks/basic-nogrid  (V99.md: marks/basic-nogrid)
  changed  marks/basic-nogrid@2x  (V99.md: marks/basic-nogrid)
check-visual-diffs: OK
$ node scripts/overhaul/check-visual-diffs.mjs --no-copy --milestone M9b      # exit 1
check-visual-diffs: FAIL: M9b must not change any fixture (zero-change rule): marks/basic-line, marks/basic-line@2x, marks/basic-nogrid, marks/basic-nogrid@2x
+ the same row with **Milestone:** M10 (another milestone)
$ node scripts/overhaul/check-visual-diffs.mjs --no-copy      # exit 1
  milestone M3a, rows of this milestone changed since 85e4a5770030: none (ignored: V99.md (Milestone M10))
check-visual-diffs: FAIL: changed or removed fixtures without a visual-ledger row from this milestone: marks/basic-line, marks/basic-nogrid
```

**Broken-reference self-tests (review #1's blocking item).** Each reference is a commit object made
with `git commit-tree` from `de0ac26` plus a 1–5 line change to the ref's `test/visual/app.ts` (Data
notes). The head is the clean tip. Every one now gives FAIL with exit 1:

- **A, the reviewer's case: the reference's fixture app does not build.** Before the fix this gave
  "137 added … OK".

  ```
  $ npm run test:visual -- --against d56f2228294f…      # exit 1
  [WebServer] ✗ Build failed in 27ms
  visual: WARNING: the reference is incomplete: capture exit 1; 0 of 0 declared shots usable. See …/out/capture-report.json. check-visual-diffs fails on this run; re-run it.
    137 failed
  $ node scripts/overhaul/check-visual-diffs.mjs --milestone M2 --no-copy      # exit 1
    reference: INCOMPLETE (capture exit 1; 0 of 0 declared shots usable); tolerance maxDiffPixelRatio 0.002
    milestone M2, zero-change rule
    137 shots: 0 changed, 0 added, 0 removed, 0 broken, 137 unverified; geometry: 555 checks, 0 failing
  check-visual-diffs: FAIL: the reference d56f2228294f… produced no shots (capture exit 1; 0 of 0 declared shots usable): nothing was compared
  check-visual-diffs: FAIL: the reference capture did not complete (capture exit 1; 0 of 0 declared shots usable): 137 head shot(s) unverified. Run npm run test:visual -- --against d56f2228294f… again, or pass --allow-partial to judge only the shots the reference produced
  ```

  - `--milestone M10` gives the same two FAILs (exit 1).
  - `--allow-partial` still fails on "nothing was compared" (exit 1).
  - No `capture.json` was written.
  - **Dangling-link case** (review note 8). The cached tree's `node_modules` was then pointed at a
    removed directory and the run repeated. There was no `EEXIST`, and the link was restored to
    `/Users/liam/Projects/snaplot/.claude/worktrees/m3a/node_modules`.
- **B: one reference fixture throws** (`marks/basic-line`). This is the partial failure.

  ```
  $ npm run test:visual -- --against ce497d73d9ce…      # exit 1
    2 failed
    135 passed (12.7s)
  visual: WARNING: the reference is incomplete: capture exit 1; 135 of 137 declared shots usable. …
  visual: the reference ce497d73d9ce… is incomplete (135 of 137 shots usable): this run cannot pass check-visual-diffs; run it again
  $ node scripts/overhaul/check-visual-diffs.mjs --milestone M2 --no-copy      # exit 1
    137 shots: 0 changed, 0 added, 0 removed, 0 broken, 2 unverified; geometry: 555 checks, 0 failing
    unverified marks/basic-line: no usable reference image
    unverified marks/basic-line@2x: no usable reference image
  check-visual-diffs: FAIL: the reference capture did not complete (capture exit 1; 135 of 137 declared shots usable): 2 head shot(s) unverified. …
  ```

  - `--milestone M10` gives the same FAIL (exit 1).
  - `--milestone M2 --allow-partial` gives OK, judging only the 135 shots the reference produced.
  - No `capture.json` was written.
- **C3: the reference draws `marks/basic-area` in a random hue** (a sub-tolerance flake).
  - At `de0ac26`, where the second render used the tolerance, one run cached this reference: its two
    hues happened to be close.
  - At `85e4a57`, the exact second render rejects it:

  ```
  $ npm run test:visual -- --against 359491132c77…      # exit 1
  visual: rendering the reference again; every shot must reproduce exactly
    1 failed
    136 passed (9.6s)
  visual: WARNING: the reference is incomplete: capture exit 0, second render exit 1; 136 of 137 declared shots usable (did not reproduce: marks/basic-area). See …/out/verify-report.json. …
  $ node scripts/overhaul/check-visual-diffs.mjs --milestone M2 --no-copy      # exit 1
    137 shots: 0 changed, 0 added, 0 removed, 0 broken, 1 unverified; geometry: 555 checks, 0 failing
  check-visual-diffs: FAIL: the reference capture did not complete (capture exit 0, second render exit 1; 136 of 137 declared shots usable): 1 head shot(s) unverified. …
  ```

- **C4: the reference adds random per-point noise to `marks/basic-area`** (a gross flake). The output is
  the same as C3's: the shot did not reproduce, 1 unverified, FAIL with exit 1, and no `capture.json`.

**Sensitivity self-test (review note 2).** The y2-dual Y title was edited locally from `'Requests'` to
`'Requests per second'`, then reverted:

```
$ npm run test:visual -- --against HEAD      # exit 0: the tolerance hides it
$ node scripts/overhaul/check-visual-diffs.mjs --milestone M2 --no-copy      # exit 0
  note: the tolerance can hide a small change (a short title edit); run test:visual with --strict for the zero-change rule
  137 shots: 0 changed, …
check-visual-diffs: OK
$ npm run test:visual -- --against HEAD --strict      # exit 1
  2 failed
$ node scripts/overhaul/check-visual-diffs.mjs --milestone M2 --no-copy      # exit 1
  reference: complete, 137 shots (cached); exact comparison (--strict)
  changed  axes/y2-dual
  changed  axes/y2-dual@2x
check-visual-diffs: FAIL: M2 must not change any fixture (zero-change rule): axes/y2-dual, axes/y2-dual@2x
```

**Synthetic scenarios.** `check-visual-diffs.test.ts` (16 tests, inside `npm test`) covers:
- a complete reference that matches;
- a change under the zero-change rule;
- an added shot;
- 0 reference shots, with and without `--allow-partial`;
- an incomplete reference: unverified, then with `--allow-partial`;
- a non-reproduced shot;
- a `meta.json` without the outcome;
- a head shot that threw (broken);
- committed baselines that match, an added shot, and no baselines at all;
- a missing row, a good row, an edit to `V0.md`, and another milestone's row.

**`check-visual-ledger`** at the tip (exit 0):

```
  baseline  4597c43a12 test(visual): initial darwin baselines (137 screenshots, V0)
check-visual-ledger: 44 commits in overhaul-baseline..HEAD, 1 with visual changes, 1 listed baseline commit(s)
check-visual-ledger: OK
```

The first implementation ran its self-tests in a scratch clone, and review #1 re-ran them; both found
they behave as described:
- a screenshot without a row fails;
- a `visual:` paragraph without a row fails;
- a malformed row fails;
- a good row passes;
- after a rebase, a commit matches by patch-id, and `--refresh` works.

**A pre-M3a ref is refused**, before anything is extracted:

```
$ npm run test:visual -- --against overhaul      # exit 2
visual: overhaul (504d934f79) has no visual fixture app: refs older than the M3a merge are not valid references (plan §11.3 G10)
```

**Final clean run** after the self-tests: `npm run test:visual` exited 0 and `check-visual-diffs` gave
OK, with 0 changed, 0 added, 0 removed, 0 broken and 0 unverified. The working tree is clean.

**Metrics** (`node scripts/overhaul/metrics.mjs`, exit 0). Unchanged from M1, because M3a touches no
library source:

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
- `bench:ab` (M4; M3a touches no `src/`);
- `check:package`, `check:size` and `check:api`: M5 merged them after this branch's base. The
  integrator runs them after the rebase. M3a changes no library source, export or type;
- `build:site` (M6a).

## Visual-ledger rows

- **V0**, `test(visual): initial darwin baselines` (`4597c43`).
  - Fixtures: `axes/*`, `marks/*`, `theme/*`, `layout/*`, `overlay/*` (all 111 fixtures, 137 shots).
  - These are the initial committed baselines, not a default change.
  - The commit is listed in `docs/decisions/visual-ledger/baseline-commits.txt`.
- The review fixes change no screenshot. `check-visual-ledger` passes at the tip.

## Requests for integrator

1. **A regression on `overhaul` from M1: plugins installed at creation are not painted at mount.** This
   covers the built-in reference lines and regions and user `plugins` with draw hooks. Review #1
   confirmed it.
   - **Symptom.** `createChart(el, { …, referenceLines, referenceRegions })` paints the chart once
     (`debug(chart).renderCount` = `{ grid: 1, data: 1, overlay: 1 }`). The annotations appear only
     after the next unrelated render (a hover, an update or a real resize).
   - **Measured** with the `axes/annotations-390` fixture, in data-layer pixels with ink:
     - `ovh-m0-done`: 3,603, and 2 renders at load;
     - `overhaul` at `16547da`: 1,273 at load, then 3,603 after `chart.redraw()`.
   - **Cause.** The `Controller` constructor calls `this.lines.setLines(…)` and
     `this.regions.setRegions(…)` before `this.engine.use(plugin)`. The plugin's `chartRef` is still
     null, so no redraw is scheduled, and `ChartCore.use()` does not schedule one either. Before M1,
     the first ResizeObserver delivery repainted and hid this. Since `e67aa2a`/`5106dd4` ("observing
     an unchanged box paints nothing more"), nothing does.
   - **Effect on V0.** The baseline `axes/annotations-390` (and its `@2x`) shows no annotations.
     - The fixture app does not hide this: it never redraws.
     - The new paint wait passes, because the data line itself has ink.
   - **Suggested fix.** Request one render after installing the creation-time plugins, or call
     `setLines`/`setRegions` after `use()`. Lock it with a test that a chart created with a
     `referenceLines` entry has data-layer ink on that line after the first frame (fakes plus
     `debug()`).
   - **Visual row.** The fix changes `axes/annotations-390` and `axes/annotations-390@2x`, so it needs
     a visual-ledger row. That is V17–V29 if M7 or M8 lands it; otherwise allocate one from V90+.
   - **If the fix lands on `overhaul` before M3a merges,** regenerate those two baselines after
     rebasing this branch:
     - run `npm run test:visual -- --update`, then check that only those two files changed;
     - commit them separately (for example `test(visual): refresh the annotation baselines after the
       mount fix`);
     - list that commit in `baseline-commits.txt`, since it is part of M3a's initial set.
2. **After rebasing this branch onto the newer `overhaul`** (merge order M5 → M3a), the SHA in
   `docs/decisions/visual-ledger/baseline-commits.txt` goes stale.
   - `check-visual-ledger` still passes, matching by patch-id with a warning.
   - Run `node scripts/overhaul/check-visual-ledger.mjs --refresh` and commit the one-line change
     (e.g. `chore(repo): refresh the V0 baseline commit after rebase`).
3. **Ownership of the new shared files**, for plan §12. Please record it:
   - Each owning milestone edits its own `packages/snaplot/test/visual/expected/m<N>.ts` (M7, M10, M11,
     M12a; M12b adds `m12b.ts`), the same way as its `fixtures/<area>.ts`.
   - Flipping a geometry finding means changing `fails(` to `fixed(` on its line.
   - The shared harness stays with M3a, then the integrator: `checks.ts`, `probe.ts`, the specs,
     `run.mjs`, `expected/index.ts`, `diff-scenario.mjs` and `check-visual-diffs.test.ts`.
   - **One exception, for M8.** M8 removes `getLayout`, `getAxis` and `setHighlight` and renames
     `theme.backgroundColor` (§4.4). In the same commit, it updates these call sites:
     - `probe.ts`: `getLayout()` → the plugin `plot` rect or a debug field; `getAxis()` →
       `scale(key)`;
     - `app.ts` (`plotPoint`): the same `getLayout()` replacement;
     - `fixtures/overlay.ts` (`highlight-dim`): `setHighlight` → `update({ highlight })`;
     - `fixtures/theme.ts` (`transparent-background`): the renamed `backgroundColor`.

     `tsconfig.test.json` covers these files, so the removal cannot go unnoticed. The proof is
     `--against <merge-base>`: no changed shot and the same geometry results.
4. **M3b** (ledger, browser specs, trace ids):
   - `scripts/ledger.mjs` should also list the geometry markers. Each is one line,
     `fails('<owner>', '<fixture>', '<check>', '<id>')`, in `packages/snaplot/test/visual/expected/m*.ts`
     (15 today); `fixed(` lines are locks.
   - Playwright reports them as `test.fail` with `[<id>]` in the title, so the "executed markers equal
     ledger length" exit holds once they are counted.
   - `trace-check` can read the titles from `packages/snaplot/test-results/visual/report.json`.
   - The 9 `[repo-10]` tests in `check-visual-diffs.test.ts` are normal passing vitest tests. repo-10
     is closed by M3a.
   - `test:browser` goes into the same `packages/snaplot/playwright.config.ts`, which M3a owns:
     - add a `browser` project with `testMatch: 'browser/**/*.spec.ts'`;
     - keep the `webServer` (or add a second), the `PORT` contract and the `SNAPLOT_VISUAL_*`
       variables;
     - decide whether `test:browser` also runs `--project geometry` (G9 lists geometry).
   - The fixture app can host browser specs: `window.__snaplotFixture` exposes the chart handle.
5. **CI and `update-snapshots` (M5 has merged both).**
   - **What runs.** `ci.yml`'s `visual` job and `update-snapshots.yml` both run
     `npx playwright test --project visual` in `packages/snaplot`, in the pinned
     `mcr.microsoft.com/playwright:v1.61.1-noble` image. That works with M3a's config:
     - the `webServer` honours `PORT` (default 5333);
     - the image has the full `chromium` channel that the 24 px minimum-font fixture needs.
   - **Suggestion for after the merge** (a small integrator follow-up in M5's files): add
     `--project geometry` as a blocking step. It is platform-independent, so it can gate now.
   - **The commit that adds the `-linux` set** touches `__screenshots__`. List its SHA in
     `baseline-commits.txt` or give it a row, or `check-visual-ledger` fails. The workflow's header
     already says so.
   - **If CI ever runs `check-visual-diffs` in committed-baseline mode** before a `-linux` set exists,
     it fails with "no committed linux baselines … nothing was compared". That is deliberate
     (review #1).
6. **`packages/snaplot/package.json`** gains one line (`"test:visual": "node test/visual/run.mjs"`).
   M5 also edits this `scripts` block, so a trivial rebase conflict is possible. The root
   `test:visual` delegation from M0 already exists.
7. **Merge-time gate for later milestones:**
   1. `npm run test:visual -- --against <merge-base>`; add `--strict` for M2, M9a and M9b;
   2. `node scripts/overhaul/check-visual-diffs.mjs` (the milestone comes from the branch name, or
      pass `--milestone M<N>`; the base defaults to the ref the run compared against);
   3. `node scripts/overhaul/check-visual-ledger.mjs`.

   Notes:
   - `test:visual` exits non-zero whenever a screenshot differs, or the reference is incomplete.
     `check-visual-diffs` decides whether a difference is allowed. It also fails on geometry
     failures and on any reference that is incomplete or empty.
   - A FAIL saying the reference "did not complete" means: re-run step 1 (a failed reference is
     never cached). Do not reach for `--allow-partial`.
   - If the runner names the same shots under "did not reproduce" every time, that fixture is not
     deterministic. Fix the fixture.
   - **For M14:** consider making `--strict` the default for every milestone. Local Chromium renders
     byte-identical PNGs, and the plan's 0.002 hides a short title edit (Gates, sensitivity
     self-test).

## Known gaps

- **`scripts/visual-docker.sh` has not been run.** Agents never need it (EXECUTION.md rule 1), and
  pulling `mcr.microsoft.com/playwright:v1.61.1-noble` would be a download outside the plan. There is no
  `-linux` set yet.
  - The script passes `bash -n`.
  - **The G10 platform fallback is manual.** If the amd64 run fails or takes more than 3× the arm64
    run, re-run it with `--platform linux/arm64` and keep CI's visual job advisory. The script does not
    time or retry itself.
  - Its inner path relies on the image having `git`. It runs `git init` in the copied tree so that
    `run.mjs` works. If the image lacks `git`, add `apt-get install -y git` there or skip it.
  - Run it once from the `update-snapshots` workflow, then tick this off.
- **Canvas-drawn labels are outside the geometry checks.** Annotation labels are painted on the
  canvas, so the label checks cannot see them (gap-annotations-extensibility-02).
  - The visual fixture `axes/annotations-390` covers them by pixels, but today it shows no
    annotations at all (Requests 1).
  - If M10 moves annotation labels into the DOM label layer, the checks pick them up automatically.
    Every non-empty span in the chart host counts, as does `[data-snaplot-label]` when present.
- **Pixel-only defects.** Clamped end labels on the 5-minute time axis (`axes/time-minutes-480`,
  render-14) pass all five geometry checks. Only the screenshot records them.
- **The default tolerance is the plan's `maxDiffPixelRatio: 0.002`.** It hides small text changes:
  - a y2 title edit of 629 raw pixels (0.35 %) passes;
  - `--strict` catches it, but is opt-in.

  Even `--strict` keeps pixelmatch's anti-alias detection, which Playwright does not expose. A change
  made only of pixels it classifies as anti-aliasing would pass.
- **The reference's second render is exact.** A reference fails to complete when any shot does not
  reproduce exactly, apart from pixels that pixelmatch classifies as anti-aliasing.
  - Locally, every run reproduced all 137 shots exactly.
  - A fixture that cannot reproduce exactly is a fixture bug: make it deterministic. Loosening the
    check would let a wobbling reference into the cache.
  - The software-raster Linux path (`visual-docker.sh`) has not been tried with it (see the first
    gap).
- **The paint check is weaker for bars and histograms.** It probes at half height across the slot,
  so a grouped bar can be satisfied by its neighbour. Density series are not probed, and both density
  fixtures skip the check.
- **Paint readiness is by ink, not content.** The app waits until the data layer has any ink. It
  does not check that every series painted. That is the geometry paint check's job, which runs on
  the head only.
- **Tooltip-text specs** (G10 mentions them with geometry) belong to M3b (`m10-tooltip-format.spec.ts`,
  `m12a-tooltip-rows.spec.ts`). The overlay fixtures capture tooltips only as pixels.
- **The geometry thresholds are the plan's, with a 0.5 px slack:**
  - "120 px" is the plot length along the axis;
  - titles are excluded from the label counts but included in the overlap and inside checks;
  - the empty fixture skips the minimum-label check by design (§5.1 empty state).
- **The audit grid's line and area data** round with `Math.round(v * 100) / 100` instead of
  `+v.toFixed(2)`. It is deterministic, but not byte-identical to `evidence/play/visuals-grid.html`.

## Data notes

- No downloads.
  - Fixture data comes from seeded generators in `test/visual/fixtures/data.ts`: the `#/visual` and
    gap-overhaul-delta LCG, and the audit grid's mulberry32.
  - The fonts come from `@fontsource/ibm-plex-sans@5.3.0`, already a devDependency since M0.
- **Reference cache** (`/Users/liam/Projects/snaplot/.claude/visual-cache/`, gitignored, safe to
  delete):
  - entries from the first implementation: `935c0b6…`, `06ee468…`, `576708d…`, and `e1158f9…` (an
    earlier SHA of commit 4);
  - entries from the interrupted fix attempt: `90ffd44…`, `c5a7cab…` and `de0ac26…`.

  Entries in the old `capture.json` format are captured again on use, never trusted.
- **This attempt's runs used scratch caches** in the session scratchpad, with their logs:
  `/private/tmp/claude-501/-Users-liam-Projects-snaplot/76647906-acb8-4a29-8fd6-6a20ecda8e45/scratchpad/m3a-selftest/cache-*`.
  The gate runs above are `cache-r3-*`; the others are from the `de0ac26` runs.
- **The broken-reference self-tests** used commit objects made with `git commit-tree` from `de0ac26`.
  No ref points at them, and they are pruned with the repository's normal gc:
  - `d56f222` (A): the app does not build;
  - `ce497d7` (B): `marks/basic-line` throws;
  - `3594911` (C3): `marks/basic-area` gets a random series `stroke` hue;
  - `6d9e6e1` (C4): `marks/basic-area` gets random per-point noise;
  - `51a8697` and `8930865`: two first attempts at C3 that changed no pixel.
    - One set a chart-level `title`, which `ChartOptions` does not have; it has only `ariaLabel`.
    - The other set a series `color`, which is a reference-line field; the series field is
      `stroke`.

    Both references were complete and matched, as they should.
- An early `--against overhaul` test, before the pre-extraction check, extracted a tree. It was moved
  aside to `/Users/liam/Projects/snaplot/.claude/backups/leftovers/visual-cache-16547da-pre-harness`
  rather than deleted.
- `/Users/liam/Projects/snaplot/notes/overhaul-audit/visual-diffs/m3a/` holds the first self-test's
  diff images (`marks/basic-line`, `marks/basic-nogrid`). They are not a real change; delete them
  freely. This attempt's self-tests used `--no-copy`.
- Regenerating: `npm run test:visual -- --update` (M3a and M14 only), then review
  `packages/snaplot/test-results/visual/contact-sheet.html`.

## Human steps

- **Refresh the Linux baselines with the `update-snapshots` workflow.**
  - M5 added `.github/workflows/update-snapshots.yml`. Dispatch it, with `commit` set, on the pushed
    branch. Pushing is a human step.
  - List the resulting commit in `baseline-commits.txt`.
  - CI's visual job stays advisory until then, and until M14.
- **Review the V0 contact sheet** (`npm run test:visual`, then open
  `packages/snaplot/test-results/visual/contact-sheet.html`). It records today's defects as the starting
  point, so it is not an approval of the look; M14 approves the final set.
- Real-device checks: none for M3a.
