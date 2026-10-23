# M3a: Visual and geometry harness

- **Branch:** `ovh/m3a-visual` · **Worktree:** `.claude/worktrees/m3a` · **Base:** `16547da` (`overhaul`
  at start, = `ovh-m1-done` tip).
  - `overhaul` has since gained M5, M4, M6a and M6b (up to `8faea93`, `ovh-m6b-done`). None of them
    touch `src/` or a path M3a owns.
  - The branch is not rebased; the integrator rebases at merge. Requests 6 gives the one conflict
    and its resolution, simulated onto `8faea93` in this attempt.
- **Status:** complete, after the fixes for review #3 (and reviews #1 and #2 before it).
  - The visual platform is local macOS Chromium (EXECUTION.md rule 1), so the committed baselines are
    the `-darwin` set.
  - Refresh the Linux baselines with the `update-snapshots` workflow.
- **Departure from plan §11.3 G10 (review #2):** a run against a ref compares exactly (`threshold: 0`,
  `maxDiffPixels: 0`), not at the plan's `maxDiffPixelRatio: 0.002`. Committed baselines keep the ratio,
  with `threshold: 0`. The evidence is under "Review #2 response"; ADR 0002 should record it
  (Requests 8).

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
    the grid and data layers have rendered and the data layer holds ink (`paint.ts`, unit-tested in
    `paint.test.ts`).
    - For a fixture declaring `blankData` (empty, single point, isolated points), the grid layer must
      hold ink instead.
    - A `blankData` fixture that also declares `blankGrid` needs no ink, only both renders. This is
      for plan §5.1's empty state (no ticks, no grid), which M10 gives `axes/empty` (review #3 note 3).
      No fixture sets it yet.
    - It waits up to 5 s. It never asks for a redraw, so a chart that does not paint fails its tests.
  - Data is seeded.
  - The config fixes the viewport (1280 × 800), `contextOptions.reducedMotion: 'reduce'`, `en-US` and
    UTC.
  - The 24 px minimum-font fixture runs in a persistent full-Chromium profile, because the headless
    shell ignores the preference.
  - Every full run in this attempt gave 0 diffs and no flaky result, outside the deliberate
    self-tests.
- **Comparison** (`packages/snaplot/test/visual/record.mjs`, recorded in `meta.json` as `comparison`):

  | Run | Settings |
  |---|---|
  | `--against <ref>` (the merge gate) | exact: `threshold: 0`, `maxDiffPixels: 0` |
  | Committed baselines, and CI | `threshold: 0`, `maxDiffPixelRatio: 0.002` |
  | Committed baselines with `--strict` | exact |

- **Runner.** `npm run test:visual` → `packages/snaplot/test/visual/run.mjs`.
  - Default: both projects against the committed `__screenshots__/<area>/<name>-<platform>.png`.
  - `--against <ref>`:
    - It checks that the ref has the fixture app (`git cat-file`).
    - It extracts the ref with `git archive` into `/Users/liam/Projects/snaplot/.claude/visual-cache/<sha>/`
      (`SNAPLOT_SNAPSHOT_DIR`).
    - It runs the ref's own config twice into `shots-<platform>-<pw>-<chromium>/`: once with
      `--update-snapshots=all`, then once more, compared exactly, to check that every shot
      reproduces.
    - Two runs against the same SHA take turns through `<sha>/capture.lock` (a `mkdir` lock with
      `owner.json`). The second waits, then reads the cache. A lock whose owner has exited, or older
      than 2 hours, is moved aside, never deleted.
    - `meta.json` records the reference outcome: `against.exit`, `verifyExit`, `complete`, `declared`,
      `shots` and `hashes`.
    - Only a complete reference is cached (`capture.json`, format 4). Otherwise the runner exits
      non-zero. Entries in an older format are captured again.
    - It reuses the head's `node_modules` when the lockfiles match: a symlink, replaced if dangling.
      Otherwise it runs `npm ci` there and keys the cache by the ref's Playwright version.
    - It then compares the working tree exactly with its own copy of the reference.
    - It never writes into the tracked `__screenshots__/` or into the cache.
  - `--strict`: compares the committed baselines exactly too.
  - `--update`: rewrites the committed set and prunes stale files.
  - `--serve`: serves the fixture app.
  - **Bench lock.** It waits while the bench lock exists:
    - default path `<main checkout>/.claude/bench.lock`, found through git's common directory (asked
      for as an absolute path);
    - `SNAPLOT_BENCH_LOCK` or `SNAPLOT_CLAUDE_DIR` move it (the same variables as `bench/`);
    - it warns when the lock's directory does not exist, as in a plain clone.
  - It uses port 5333 (a free port if that is busy).
  - Each run writes `test-results/visual/{report.json, meta.json, contact-sheet.html}`. `meta.json`
    records the head's SHA, dirty flag and `inputs` (below).
  - A head run that dies before reporting leaves an empty report, never the previous one.
  - **Refused flags (review #3).** `run-args.mjs` parses the command line. It refuses (exit 2) the
    Playwright flags that would write, skip or relocate the expected images: `-u`,
    `--update-snapshots[=…]`, `--update-source-method`, `--ignore-snapshots` and `--config` (also
    inside a short cluster such as `-xu`, and after `--`). `--update` stays the only way to rewrite
    the committed baselines.
  - **The head never writes into the cache (review #3).**
    - `capture.json` (format 4) and `meta.json`'s `against.hashes` record the SHA-256 of every usable
      reference image.
    - The head compares against a per-run copy in `test-results/visual/reference/`, checked against
      those hashes as it is made.
    - A cached reference whose images no longer match is moved aside to
      `shots-….damaged-<time>` (never deleted) and captured again.
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
- **`scripts/overhaul/check-visual-diffs.mjs`** (G10), locked by 38 scenario tests in
  `test/visual/check-visual-diffs.test.ts`, plus 4 tests of the settings in `record.test.ts` and 6 of
  the runner's command line in `run-args.test.ts`:
  - **Zero changes** for M2, M9a and M9b.
  - **Rows.** Otherwise, every changed or removed shot's fixture is named in a row file of the merging
    milestone. That is a `V<n>.md` that differs from the base and whose `**Milestone:**` line names
    the milestone. `<area>/<prefix>*` patterns are allowed. `V0.md` never covers a change, and editing
    it fails the check.
  - **Added.** A head-only shot is "added" only when the reference is complete. Otherwise it is
    "unverified".
  - **Comparison.** A run against a ref must be exact. The zero-change rule needs an exact run in
    either mode. A committed-baseline run within the tolerance passes the row rule with a note that it
    is not the merge gate.
  - **Stale report.** `head.inputs` fingerprints the working-tree content of `packages/snaplot`,
    `package.json` and `package-lock.json`. If the working tree no longer matches it, the report is
    stale and the check fails. `--any-head` judges it anyway, with a note. Row files and handoffs are
    outside the fingerprint. The tracked baselines are inside it, so a committed-baseline run that
    wrote into them is stale.
  - **Reference images (review #3).** In a run against a ref, every image of the head's reference
    copy must match the hash recorded at capture. An image that changed, is gone, or was never
    captured fails the check, even with `--allow-partial`. A `meta.json` without the hashes is
    refused.
  - **Merge base (review #3).** On a milestone branch (`ovh/m<N>-…`), a run against a ref must have
    compared against the branch's merge base with `overhaul`. Otherwise the check fails and names
    the merge base, because against the branch's own commits a change compares with itself. An
    explicit `--base <ref>` judges another reference deliberately, with a note. A merge base older
    than the fixture app (M3a's own branch) and a clone without `overhaul` print a note instead.
  - **A base that does not resolve** (a clone without a local `overhaul`) exits 2 and asks for
    `--base <ref>`. The zero-change rule reads no rows, so it goes on without one.
  - **Failures:**
    - a reference that compared nothing (0 shots, or no committed baselines);
    - a reference image written after its capture;
    - on a milestone branch, a reference other than the merge base (without `--base`);
    - a run against a ref that was not exact, and a non-exact zero-change run;
    - a stale report, or a `meta.json` that lacks the comparison, the inputs, the reference outcome
      or the reference hashes;
    - geometry failures and broken shots;
    - unverified shots, incomplete references, and partial or narrowed runs (`--allow-partial`
      overrides these three).
  - **Diff images** are copied to `notes/overhaul-audit/visual-diffs/<m>/`.
- **`scripts/overhaul/check-visual-ledger.mjs`** (P13), locked by 7 scenario tests in
  `test/visual/check-visual-ledger.test.ts` (`ledger-scenario.mjs` runs it over a throwaway
  history):
  - per commit in `overhaul-baseline..HEAD`: screenshots or a `visual:` paragraph require a row file
    (and each named V-id);
  - it validates the format of every added row: the heading, and the Commit, Milestone, Fixtures,
    Before → after, Finding and Revert lines (the last three since review #3). A value is on the
    field's line or in a nested list below it, so an empty field fails;
  - the commits in `baseline-commits.txt` are exempt, matched by SHA or, after a rebase, by
    `git patch-id` (`--refresh` rewrites the file).
- **`scripts/visual-docker.sh`:** the optional Linux path (Playwright 1.61.1 noble image,
  `linux/amd64` by default, `--against`, `--update`). See Known gaps.
- **Docs:**
  - `packages/snaplot/test/visual/README.md`, which has a Comparison section with the measurements;
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
| `98dbec4` | docs(handoff): record the M3a review fixes and gates |
| `7ee510a` | test(visual): record the tolerant comparison as repo-10 expected failures |
| `19e859b` | test(visual): compare runs against a ref exactly and fail check-visual-diffs on a tolerant one |
| `c76018d` | test(visual): record a stale visual report as repo-10 expected failures |
| `518005e` | test(visual): fail check-visual-diffs on a report from other render inputs |
| `1bd429c` | test(visual): take turns on a shared reference capture, honour SNAPLOT_BENCH_LOCK |
| `eb8f8a1` | test(visual): find the main checkout through an absolute common directory |
| `c1faeb0` | test(visual): record the measured pixel counts of the fixture self-test |
| `bfbe43e` | docs(handoff): record the M3a review #2 fixes and gates |
| `1b49a1c` | test(visual): move the runner's argument parsing into run-args.mjs |
| `11e564b` | test(visual): record a reference written after capture as repo-10 expected failures |
| `5fde1fd` | test(visual): hash the reference, compare the head against a copy, refuse -u |
| `e5c8938` | test(visual): record an off-merge-base reference and an unresolved base as repo-10 expected failures |
| `c23be72` | test(visual): check the reference against the merge base, and a base that does not resolve |
| `3e0c576` | test(visual): lock check-visual-ledger with scenarios, a row without the P13 fields as a repo-10 expected failure |
| `631cad0` | test(visual): record an empty visual-ledger field as a repo-10 expected failure |
| `8183973` | chore(scripts): require every P13 field in a new visual-ledger row |
| `0e05ac8` | test(visual): let an empty-state fixture declare a blank grid layer |
| `6634839` | test(visual): document the refused flags, the reference copy and hashes, the merge-base check |
| (tip) | docs(handoff): record the M3a review #3 fixes and gates |

Departures from the brief's commit list:
- Commit 3 says "darwin" instead of "Linux" (EXECUTION.md rule 1).
- Commit 5 is a robustness follow-up to the runner, found while running the exit commands.
- `c039f61` to `85e4a57` are the review #1 fixes, `7ee510a` to `c1faeb0` the review #2 fixes, and
  `1b49a1c` to `6634839` the review #3 fixes.

Closes: repo-10.

## Review #3 response

Review #3 (`notes/overhaul-audit/state/M3a-final-review.json`) asked for changes: 1 blocking item and
6 notes. The worktree was clean at `bfbe43e`, the reviewed tip: the interrupted earlier attempt at
this step had left no commits, changes or stashes (`stash@{0}` belongs to M6b and is untouched).
This attempt added 10 commits and updated this handoff, then re-ran every gate and exit command at
`6634839` (Gates).

**Blocking: `--against <ref> -u` poisoned the shared reference cache, and the next run passed.**
Fixed, tests first, with three defences. Each is enough on its own for the gate.

- **The problem.** The head run pointed `SNAPLOT_VISUAL_EXPECTED_DIR` at the cached reference and
  appended the passthrough after `--update-snapshots=none`. So `-u` (or `-- --update-snapshots=all`)
  wrote the head's screenshots into `<cache>/<sha>/shots-…/`, `capture.json` still said complete,
  and the next plain run against that SHA reported 0 changed shots and OK, for every worktree with
  that merge base.
- **`1b49a1c`** moves the argument parsing into `run-args.mjs` (a pure move, with 4 tests of the
  current behaviour), so the command line can be tested without starting Playwright.
- **`11e564b` (tests).** Seven tests; six start as `it.fails` with `[repo-10]`:
  - `check-visual-diffs.test.ts`: a reference image rewritten after capture (under the zero-change
    rule, also with `--allow-partial`, and under the row rule with a covering `marks/*` row), an
    image the capture never produced, a captured image that is gone (with `--allow-partial`), and a
    `meta.json` without the hashes. `diff-scenario.mjs` records the hashes that run.mjs will write,
    and can write into the reference after the "run".
  - `run-args.test.ts`: the runner refuses `-u`, `--update-snapshots` (bare, `=all`, and with a
    separate value), `--update-source-method`, `--ignore-snapshots`, `-xu`, `--config` and `-c`,
    before and after `--`, with or without `--against`. A normal test keeps a `--grep` pattern that
    looks like a flag.
- **`5fde1fd` (fix).**
  - `run-args.mjs` refuses those flags (exit 2). It reads short clusters the way Playwright's parser
    does, and skips the values of options that take one.
  - `record.mjs` gains `listPngs`, `sha256`, `shotHashes` and `compareShots`, shared by the runner and
    the checker.
  - `run.mjs`:
    - records the SHA-256 of every usable shot in `capture.json` (format 4) and in `meta.json`'s
      `against.hashes`;
    - verifies a cached reference before using it, and moves a damaged one aside, then captures
      again;
    - compares the head against a per-run copy in `test-results/visual/reference/`, checked against
      the hashes as it is made. The cache is never a write target for the head.
  - `check-visual-diffs` verifies the copy against the hashes. A changed, missing or uncaptured image
    fails the check, and `--allow-partial` does not override it.
  - `visual-docker.sh` no longer copies the reference itself; run.mjs's copy comes back with the
    results.
  - The six tests flip. One existing scenario ("does not trust a reference shot that did not
    reproduce itself") now models the copy, which leaves non-reproduced shots out.
- **The reviewer's repro, re-run at `6634839`** (Gates, "Review #3 self-tests"):
  - `--against HEAD -u` and `-- --update-snapshots=all` exit 2 before anything runs, and the cache is
    byte-identical afterwards.
  - The cache poisoned the way the old runner did it (Playwright run directly into the cache with
    `--update-snapshots=changed`, after the `axes/y2-dual` title edit): the next
    `--against HEAD` warns, moves the damaged directory aside, captures again, and reports the
    2 changed shots. `check-visual-diffs` FAILs without a row.
  - A head that writes into its own copy (Playwright `-u` against the copy: the report says 688
    passed, 0 changed): `check-visual-diffs` FAILs on "changed after capture: axes/y2-dual,
    axes/y2-dual@2x", also with `--allow-partial` and under `--milestone M9a`. The cache is untouched.
    The plain re-run, which gave OK before the fix, now reports the 2 changed shots, and
    `check-visual-diffs --milestone M9a` FAILs.

**Notes:**

| # | Note | Outcome |
|---|---|---|
| 1 | `check-visual-diffs` never checked that the reference is the merge base; after a milestone's commits, `--against HEAD` passes either rule | `e5c8938` (tests; 3 `[repo-10]` `it.fails`) and `c23be72` (fix). On a milestone branch (`ovh/m<N>-…`), a run against a ref other than `git merge-base HEAD overhaul` FAILs and names the merge base. An explicit `--base` judges another reference deliberately, with a note. A merge base older than the fixture app (only M3a's own branch) and a clone without `overhaul` print a note. End to end in a scratch clone: a commit on a simulated `ovh/m10-sim`, then `--against HEAD` gives 0 changed shots and FAIL (merge base); `--against overhaul` gives the 2 changed shots, FAIL without a row and OK with a `V30.md` row for M10. |
| 2 | M2 is zero-change, so the M1 mount fix cannot ride in M2 | Requests 1 is rewritten. Land the fix as its own integrator step after M3a merges, with its own row (V90+) and the two refreshed annotation baselines in the same commit, judged under the row rule. This matches state/runs.md's plan. |
| 3 | The paint wait needs canvas ink; plan §5.1's empty state may leave both canvases blank, and M10 could not fix that from `fixtures/axes.ts` | `0e05ac8`: `blankGrid` (with `blankData`) means no ink is expected, only both renders. The rule moves to `paint.ts` with 4 unit tests. Every current fixture behaves as before (Gates: 688 passed). M10 adds `blankGrid` to `axes/empty` in the commit that removes its grid. |
| 4 | `check-visual-diffs` exited 2 with "bad revision 'overhaul'" in a clone without a local `overhaul`, even under the zero-change rule | Fixed in `c23be72` (tests in `e5c8938`, 2 `[repo-10]` `it.fails`). The zero-change rule reads no rows and goes on. The row rule exits 2 with "the base overhaul does not resolve (a clone without a local overhaul branch?) … pass --base <ref>". |
| 5 | `check-visual-ledger` checked only the heading and the Commit, Milestone and Fixtures lines | `3e0c576` adds `check-visual-ledger.test.ts` (5 tests over throwaway histories; 1 `[repo-10]` `it.fails`), `631cad0` two more (an `it.fails`: an empty field followed by the next one passed, because `\s*\S` matched across the line; and a normal test: a value in a nested list passes), and `8183973` the fix: Before → after, Finding and Revert are required too, each with a value on its line or in a nested list below it (V0.md's shape, kept passing by a test). `diff-scenario.mjs`'s `row()` writes every field. |
| 6 | Checked and fine | No action. |

## Review #2 response

Review #2 asked for changes: 1 blocking item and 7 notes. The worktree was clean at `98dbec4`, the
reviewed tip, so this attempt started there. It added 7 commits and rewrote this handoff, then re-ran
every gate and exit command (Gates says at which commit).

**Blocking: the default comparison could not see library-wide default changes.** Fixed, tests first.

- **The problem.** `playwright.config.ts` set only the plan's `maxDiffPixelRatio: 0.002` and left
  Playwright's per-pixel `threshold` at 0.2. `--strict` was opt-in. The reviewer measured these cases
  against `98dbec4`:

  | Change | Default | `threshold: 0` + 0.002 | Exact |
  |---|---:|---:|---:|
  | 1. `layout/axis-titles` `lineWidth` 2 → 3 (fixture) | 0 | 1 of 2 (see below) | 2 |
  | 2. Light `gridColor` `#c3c6cf` → `#d6d8de` | 0 | 127 | 127 |
  | 3. Default line width 1.5 → 2 | 1 | 42 | 72 |

  The counts are changed shots, from the review, except case 1 at `threshold: 0`. The review reported
  that cell as passing. This attempt measured it in committed-baseline mode, which now uses exactly
  those settings: the DPR 1 shot (246 px) fails and the `@2x` shot (72 px) passes.

  Under the zero-change rule, `check-visual-diffs` only printed a note on a non-exact run.
- **`7ee510a` (tests).** Six scenarios in `check-visual-diffs.test.ts`; five start as `it.fails`
  with `[repo-10]`:
  - an `--against` run within a tolerance fails, under the zero-change rule and under the row rule;
  - a `meta.json` without the comparison is refused;
  - the zero-change rule fails on a committed-baseline run within the tolerance;
  - an exact committed-baseline run passes the zero-change rule (a normal test);
  - a tolerant committed-baseline run passes the row rule and says it is not the merge gate.
- **`19e859b` (fix).**
  - `test/visual/record.mjs` holds the settings for the config, the runner and the checker:
    - `--against` is always exact (`threshold: 0`, `maxDiffPixels: 0`), with no opt-out;
    - committed baselines keep the plan's 0.002 and add `threshold: 0`;
    - `--strict` makes them exact too.

    Both sides of an `--against` run render on this machine in one session, and the reference's second
    render must already match exactly, so this adds no flakiness. Every `--against` run in this
    attempt gave 0 diffs on an unchanged tree.
  - `run.mjs` records `comparison` in `meta.json`.
  - `check-visual-diffs`:
    - FAILs a run against a ref that was not exact, under either rule;
    - FAILs the zero-change rule unless the run was exact;
    - refuses a `meta.json` without `comparison`;
    - prints the comparison on every run.
  - `record.test.ts` locks the settings (`[repo-10]` on the `--against` case).
  - The five scenarios flip.
- **Measured after the fix** at `eb8f8a1` (Gates, exit 4 and "Default changes"):
  - Case 1: `check-visual-diffs` FAILs without a row and passes with one. Both shots change: 246 px at
    DPR 1 and 72 px at DPR 2.
  - Case 2: 127 shots change.
  - Case 3: 72 shots change.

  Each case gives FAIL under M2, and case 2 also under M11 without a row. The committed-baseline
  tolerance (`threshold: 0` + 0.002) flags only the DPR 1 shot of case 1, so the `@2x` shot (72 px)
  still hides there (Known gaps).
- **Handoff and README.** Requests 7 now gives a plain `--against <merge-base>` run for every
  milestone. Requests 8 asks for the departure to be recorded in ADR 0002. The README has a Comparison
  section. The tolerance known gap now covers committed-baseline mode only.

**Notes:**

| # | Note | Outcome |
|---|---|---|
| 1 | `check-visual-diffs` never compared `meta.json`'s head with the current tree, so a stale report could be judged as current | `c76018d` (tests; 3 `[repo-10]` `it.fails`) and `518005e` (fix). `run.mjs` records `head.inputs`, a fingerprint of the working-tree content of `packages/snaplot`, `package.json` and `package-lock.json` (tracked and untracked files; ignored files left out). The check recomputes it and FAILs a stale report. It works by content rather than SHA, so it needs no flag for `visual-docker.sh`, whose head is a synthetic commit: that script copies the same files and commits them afresh. Row files and handoffs sit outside the fingerprint, so a row written after the run still counts. `--any-head` judges a stale report anyway, with a note. An end-to-end check is under Gates, exit 4. |
| 2 | Rebase onto `overhaul` (M5): the only conflict is the `scripts` block of `packages/snaplot/package.json` | The integrator rebases at merge. Requests 6 now gives the reviewer's resolution (keep M5's block, no `test:consumers`, add `test:visual`) and the expected results. Requests 2 still asks for the `--refresh` commit. |
| 3 | Two concurrent `--against` runs on one SHA built into the same cache tree | `1bd429c`: `<sha>/capture.lock`, as described in the Summary. In an end-to-end check, a clone and the worktree ran against the same SHA, 4 s apart. One captured; the other printed "waiting for another run (pid …) that is capturing this reference", then read the cache. Both exited 0. A lock left by a dead pid was moved aside to `capture.lock.stale-<time>`, and the run captured normally. |
| 4 | In a plain clone, the runner looked for the bench lock inside the clone | `1bd429c` adds `SNAPLOT_BENCH_LOCK` and `SNAPLOT_CLAUDE_DIR` (the same variables as `bench/`) and a warning when the lock's directory does not exist. Testing it found a worse bug: from `packages/snaplot`, `git rev-parse --git-common-dir` prints `../../.git`, and `run.mjs` resolved that against the repository root. In a plain clone, the "main checkout" (and with it the default lock and cache) was two levels above the clone. `eb8f8a1` asks git for an absolute path, in `run.mjs` and, for consistency, in `check-visual-diffs`. Worktrees were not affected: git gives them an absolute path. |
| 5 | CI runs only `--project visual`; the geometry project runs nowhere in CI | Not M3a's file (`ci.yml` is M5's). Requests 5 now asks for the blocking `--project geometry` step outright. |
| 6 | The V0 baselines `axes/annotations-390` and `@2x` record the M1 mount regression | Unchanged. Requests 1 gives the fix and its row and baseline refresh. |
| 7 | Checked and fine | No action. |

## Review #1 response (summary)

Review #1 (`notes/overhaul-audit/state/M3a-review1.json`) asked for changes: 1 blocking item and 8
notes. The fixes are `c039f61` to `85e4a57`.

- **Blocking: `check-visual-diffs` passed when the reference capture failed.** Fixed, tests first:
  - `c039f61` added 16 scenario tests (9 `[repo-10]` `it.fails`);
  - `e62c59f` renders the reference twice and records the reference outcome in `meta.json`;
  - `check-visual-diffs` judges against that shot list: a shot the reference lacks is `added` only
    when the reference is complete, else `unverified`;
  - `90ffd44` flips the last two;
  - `85e4a57` makes the second render exact.
- **Notes:**
  1. A flaky reference shot: `c5a7cab` (paint-ready), plus the exact double render.
  2. The tolerance: `c2acbc6` added `--strict`. Review #2 made exactness the `--against` default.
  3. The M1 mount regression: Requests 1.
  4. `getLayout`/`getAxis`/`setHighlight` call sites: Requests 3.
  5. Other milestones' rows: `90ffd44`.
  6. The docker fallback is manual: Known gaps.
  7. The 5-minute axis: corrected in the Summary.
  8. A dangling `node_modules` link: `e62c59f`.

The broken-reference self-tests below re-run review #1's cases at this tip.

## Gates

All gates ran at `6634839`, the last source commit of this attempt, in the worktree, except the
per-commit proof, the merge-base self-test and the rebase simulation, which ran in a scratch clone.
Every `--against` run used a fresh reference cache in the session scratchpad
(`SNAPLOT_SNAPSHOT_DIR`), so the first run captured from scratch. The bench lock (M4) was free before
every Playwright run; the runner waits on it in any case.

`$S` below is `/private/tmp/claude-501/-Users-liam-Projects-snaplot/76647906-acb8-4a29-8fd6-6a20ecda8e45/scratchpad/m3a-r3`,
which holds every log of this attempt.

**`npm run verify`** (exit 0). Test total: 520 at M1, + 8 (`checks.test.ts`), + 38
(`check-visual-diffs.test.ts`), + 7 (`check-visual-ledger.test.ts`), + 6 (`run-args.test.ts`), + 4
(`record.test.ts`), + 4 (`paint.test.ts`) = 587.

```
> biome ci . && npm run typecheck && npm test && npm run build
Checked 193 files in 111ms. No fixes applied.
> tsc -p tsconfig.json --noEmit && tsc -p tsconfig.test.json
 Test Files  53 passed (53)
      Tests  586 passed | 1 expected fail (587)
[vite:dts] Declaration files built in 1227ms.
✓ built in 1.62s
✓ built in 382ms
```

The one expected failure is M1's `[arch-01]` (owned by M8).

**Per-commit proof.** EXECUTION rule 4 requires it, since the branch has more than 6 commits.

- It ran in a scratch clone (`$S/clone`, at `6634839`, with APFS-cloned `node_modules`), from the
  merge-base `16547da`, so nothing moved onto the newer `overhaul`.
- Every pick fast-forwarded, so no SHA changed (the clone ended at `6634839`).
- The lockfile never changed, so `npm ci` never ran.

```
$ git rebase -x 'git diff --quiet HEAD~1 -- package-lock.json || npm ci; npm test' 16547da
Rebasing (2/66)Executing: git diff --quiet HEAD~1 -- package-lock.json || npm ci; npm test
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
      Tests  543 passed | 1 expected fail (544)        # 98dbec4
      Tests  544 passed | 6 expected fail (550)        # 7ee510a
      Tests  553 passed | 1 expected fail (554)        # 19e859b
      Tests  554 passed | 4 expected fail (558)        # c76018d
      Tests  557 passed | 1 expected fail (558)        # 518005e
      Tests  557 passed | 1 expected fail (558)        # 1bd429c
      Tests  557 passed | 1 expected fail (558)        # eb8f8a1
      Tests  557 passed | 1 expected fail (558)        # c1faeb0
      Tests  557 passed | 1 expected fail (558)        # bfbe43e
      Tests  561 passed | 1 expected fail (562)        # 1b49a1c
      Tests  562 passed | 7 expected fail (569)        # 11e564b
      Tests  568 passed | 1 expected fail (569)        # 5fde1fd
      Tests  570 passed | 6 expected fail (576)        # e5c8938
      Tests  575 passed | 1 expected fail (576)        # c23be72
      Tests  579 passed | 2 expected fail (581)        # 3e0c576
      Tests  580 passed | 3 expected fail (583)        # 631cad0
      Tests  582 passed | 1 expected fail (583)        # 8183973
      Tests  586 passed | 1 expected fail (587)        # 0e05ac8
      Tests  586 passed | 1 expected fail (587)        # 6634839
Successfully rebased and updated refs/heads/ovh/m3a-visual.
rebase-exit=0
```

The SHA column is added here; the raw log (`$S/rebase-x.log`) has one `Executing` line per commit.
The counts show the tests-first order:
- review #1: `c039f61` adds 16 tests, 9 of them `[repo-10]` expected failures; `e62c59f` flips 7 and
  `90ffd44` the other 2;
- review #2: `7ee510a` adds 6 tests, 5 of them expected failures; `19e859b` flips them and adds the 4
  in `record.test.ts`; `c76018d` adds 4 tests, 3 of them expected failures; `518005e` flips them;
- review #3: `1b49a1c` adds 4 tests of the moved parser; `11e564b` adds 7, 6 of them expected
  failures, and `5fde1fd` flips them; `e5c8938` adds 7, 5 of them expected failures, and `c23be72`
  flips them; `3e0c576` adds 5 (1 expected failure) and `631cad0` 2 (1 expected failure), and
  `8183973` flips both; `0e05ac8` adds the 4 in `paint.test.ts`.

**Exit 1: `npm run test:visual -- --against HEAD` twice in a row shows zero diffs.** Run 1 extracts the
ref, renders it, renders it again exactly, records the hashes, copies the reference, then compares the
head exactly. Run 2 uses the cache (verified against the hashes).

```
$ npm run test:visual -- --against HEAD      # run 1, exit 0
visual: extracting HEAD (663483992f) into $S/cache-final/663483992f2450b98996876c4442e448f477e6fa/tree
  137 passed (14.3s)
visual: rendering the reference again; every shot must reproduce exactly
  137 passed (9.5s)
visual: captured 137 reference screenshots (each reproduced)
visual: comparing exact (threshold 0, maxDiffPixels 0)
  4 skipped
  688 passed (21.5s)
$ node scripts/overhaul/check-visual-diffs.mjs       # exit 0
check-visual-diffs: head 663483992f vs HEAD (663483992f)
  reference: complete, 137 shots; comparison exact (threshold 0, maxDiffPixels 0)
  note: the merge base with overhaul (16547da580) predates the fixture app (M3a's own branch), so the reference is not checked against it
  milestone M3a, rows of this milestone changed since 663483992f24: none
  137 shots: 0 changed, 0 added, 0 removed, 0 broken, 0 unverified; geometry: 555 checks, 0 failing
check-visual-diffs: OK

$ npm run test:visual -- --against HEAD      # run 2, exit 0
visual: reference HEAD (663483992f) from cache $S/cache-final/663483992f…/shots-darwin-arm64-pw1.61.1-chromium1228 (137 shots)
visual: comparing exact (threshold 0, maxDiffPixels 0)
  4 skipped
  688 passed (19.9s)
$ node scripts/overhaul/check-visual-diffs.mjs       # exit 0
  reference: complete, 137 shots (cached); comparison exact (threshold 0, maxDiffPixels 0)
  137 shots: 0 changed, 0 added, 0 removed, 0 broken, 0 unverified; geometry: 555 checks, 0 failing
check-visual-diffs: OK
$ node scripts/overhaul/check-visual-diffs.mjs --milestone M2 --no-copy      # exit 0
  milestone M2, zero-change rule
  137 shots: 0 changed, 0 added, 0 removed, 0 broken, 0 unverified; geometry: 555 checks, 0 failing
check-visual-diffs: OK
```

`meta.json` records `expectedDir: test-results/visual/reference` (137 PNGs) and 137 `against.hashes`.
The 688 tests are 137 shots + 551 geometry checks. The 4 skips are:
- the paint check on the two density fixtures;
- `axes/empty`'s paint and minimum-label checks (the §5.1 empty state).

**Exit 2: the committed baselines number ≤ 150 and total ≤ 10 MB.** Unchanged since V0:

```
$ git ls-files 'packages/snaplot/test/visual/__screenshots__/*-darwin.png' | wc -l
     137
3667350 bytes (3.50 MB)
@2x: 20
```

**Exit 3: the geometry specs pass, or are `test.fail` with an `[id]`.** 0 unexpected results. The tagged
tests, from `report.json` of the final `--against HEAD` run at `6634839`:

```
axes/titles-320           | no two label boxes overlap [visuals-21:def-01]                    | expected (failed)
axes/titles-320           | every label stays inside the chart box [visuals-21:def-01]        | expected (failed)
axes/titles-480           | every label stays inside the chart box [visuals-21:def-01]        | expected (failed)
axes/long-ticks-320       | no two label boxes overlap [render-14]                            | expected (failed)
axes/categories-30-480    | no two label boxes overlap [visuals-21:def-03]                    | expected (failed)
axes/categories-30-320    | no two label boxes overlap [render-02]                            | expected (failed)
axes/single-320           | every finite datum paints at least 1 pixel [visuals-21:def-04]    | expected (failed)
axes/log-under-decade     | every axis of 120 px or more shows at least 2 labels [render-06]  | expected (failed)
axes/time-seconds         | no two adjacent labels on an axis share text [dxtrial-10]         | expected (failed)
axes/format-collapse      | no two adjacent labels on an axis share text [render-19]          | expected (failed)
axes/histogram-tiny-range | no two adjacent labels on an axis share text [render-08]          | expected (failed)
axes/iso-strings          | no two label boxes overlap [dataapi-07]                           | expected (failed)
axes/min-font-24          | no two label boxes overlap [gap-environments-07]                  | expected (failed)
axes/min-font-24          | every label stays inside the chart box [gap-environments-07]      | expected (failed)
marks/isolated-points     | every finite datum paints at least 1 pixel [render-05]            | expected (failed)
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

Reviews #1, #2 and #3 re-checked all 15. All 15 fail inside the check's own assertion.

**Exit 4: a deliberately changed fixture fails `check-visual-diffs`, and a row file that names it
passes.** The reviewer's edit, in the worktree: `axes/y2-dual`'s y title `'Requests'` →
`'Requests per second'` (`fixtures/axes.ts:310`), uncommitted and reverted afterwards. These ran on
the report of the plain re-run in the review #3 self-tests below (2 changed shots).

```
$ node scripts/overhaul/check-visual-diffs.mjs --no-copy      # exit 1
check-visual-diffs: FAIL: changed or removed fixtures without a visual-ledger row from this milestone: axes/y2-dual
+ untracked docs/decisions/visual-ledger/V99.md naming axes/y2-dual (Milestone M3a)
$ node scripts/overhaul/check-visual-diffs.mjs --no-copy      # exit 0
  milestone M3a, rows of this milestone changed since 663483992f24: V99.md
  changed  axes/y2-dual  (V99.md: axes/y2-dual)
  changed  axes/y2-dual@2x  (V99.md: axes/y2-dual)
check-visual-diffs: OK
+ the row names `axes/y2-*` instead
$ node scripts/overhaul/check-visual-diffs.mjs --no-copy      # exit 0
  changed  axes/y2-dual  (V99.md: axes/y2-*)
check-visual-diffs: OK
$ node scripts/overhaul/check-visual-diffs.mjs --no-copy --milestone M2      # exit 1
check-visual-diffs: FAIL: M2 must not change any fixture (zero-change rule): axes/y2-dual, axes/y2-dual@2x
+ the row with **Milestone:** M10
$ node scripts/overhaul/check-visual-diffs.mjs --no-copy      # exit 1
  milestone M3a, rows of this milestone changed since 663483992f24: none (ignored: V99.md (Milestone M10))
check-visual-diffs: FAIL: changed or removed fixtures without a visual-ledger row from this milestone: axes/y2-dual
+ the row removed and the fixture edit reverted
$ node scripts/overhaul/check-visual-diffs.mjs --no-copy      # exit 1
check-visual-diffs: FAIL: the report is stale: packages/snaplot, package.json, package-lock.json changed in the working tree since the run at 663483992f + working tree. Run npm run test:visual again, or pass --any-head to judge this report anyway
```

**Review #3 self-tests: the reviewer's `-u` repro, and the two other defences.** In the worktree,
with the same `axes/y2-dual` edit, against the `$S/cache-final` entry of `6634839` from exit 1.
"Cache digest" is the SHA-256 over the per-file SHA-256 of the cached PNGs.

```
$ npm run test:visual -- --against HEAD -u      # exit 2, nothing ran
visual: -u would let Playwright write, skip or relocate the expected images, which run.mjs owns: the head always compares with --update-snapshots=none, and a reference from --against is never updated. To rewrite the committed baselines (M3a and M14 only), use --update
$ npm run test:visual -- --against HEAD -- --update-snapshots=all      # exit 2, nothing ran
visual: --update-snapshots would let Playwright write, skip or relocate the expected images, …
cache digest before and after: af3a49b9f028…  (unchanged)

# The cache poisoned the way the old runner did it: Playwright straight into the cache.
$ SNAPLOT_VISUAL_EXPECTED_DIR=<cache shots> SNAPLOT_VISUAL_STRICT=1 npx playwright test --project visual --update-snapshots=changed
  137 passed (9.3s)                       # cache digest changed; capture.json still format 4, complete
$ npm run test:visual -- --against HEAD      # exit 1
visual: WARNING: the cached reference $S/cache-final/663483992f…/shots-darwin-arm64-pw1.61.1-chromium1228 no longer matches its capture (changed: axes/y2-dual, axes/y2-dual@2x). Moved it aside to …/shots-darwin-arm64-pw1.61.1-chromium1228.damaged-1792754984986; capturing again
visual: extracting HEAD (663483992f) into $S/cache-final/663483992f…/tree
visual: rendering the reference again; every shot must reproduce exactly
visual: captured 137 reference screenshots (each reproduced)
      388 pixels (ratio 0.01 of all image pixels) are different.
      829 pixels (ratio 0.01 of all image pixels) are different.
  2 failed
  686 passed (17.9s)
$ node scripts/overhaul/check-visual-diffs.mjs --no-copy      # exit 1
  137 shots: 2 changed, 0 added, 0 removed, 0 broken, 0 unverified; geometry: 555 checks, 0 failing
check-visual-diffs: FAIL: changed or removed fixtures without a visual-ledger row from this milestone: axes/y2-dual

# A head that writes into its own reference copy (the -u the runner now refuses).
$ npm run test:visual -- --against HEAD      # exit 1, 2 changed (cache digest recorded)
$ SNAPLOT_VISUAL_EXPECTED_DIR=$PWD/test-results/visual/reference SNAPLOT_VISUAL_STRICT=1 npx playwright test --project visual --project geometry --update-snapshots=changed
  4 skipped
  688 passed (17.7s)                      # report.json: {"expected":688,"skipped":4,"unexpected":0,"flaky":0}
$ node scripts/overhaul/check-visual-diffs.mjs --no-copy      # exit 1 (also with --allow-partial, and --milestone M9a --allow-partial)
  reference images differ from the capture: changed after capture: axes/y2-dual, axes/y2-dual@2x
  137 shots: 0 changed, 0 added, 0 removed, 0 broken, 0 unverified; geometry: 555 checks, 0 failing
check-visual-diffs: FAIL: the reference images no longer match their capture (changed after capture: axes/y2-dual, axes/y2-dual@2x): something wrote into the reference after it was captured, such as a Playwright -u or --update-snapshots run. Run npm run test:visual -- --against HEAD again
cache digest: unchanged by the write into the copy

# The reviewer's "natural next step", which gave OK before the fix.
$ npm run test:visual -- --against HEAD      # exit 1
visual: reference HEAD (663483992f) from cache … (137 shots)
  2 failed
  686 passed (18.0s)
$ node scripts/overhaul/check-visual-diffs.mjs --no-copy --milestone M9a      # exit 1
  milestone M9a, zero-change rule
  137 shots: 2 changed, 0 added, 0 removed, 0 broken, 0 unverified; geometry: 555 checks, 0 failing
check-visual-diffs: FAIL: M9a must not change any fixture (zero-change rule): axes/y2-dual, axes/y2-dual@2x
```

Along the way, the recaptured reference differed from the first capture in 3 pixels of
`overlay/hover-scatter-3` (the left edge of the tooltip's three swatch dots, at most 4 levels in one
channel; each capture reproduced itself exactly). Playwright's exact comparison classifies them as
anti-aliasing: compared with `threshold: 0, maxDiffPixels: 0`, the two images match, and the head
matched both captures. The hashes are checked only against the capture they came from, so this does
not affect them (Known gaps).

**Review #3 self-test: the merge base** (note 1). In the scratch clone: a local `overhaul` at
`6634839` (as if M3a had merged), a branch `ovh/m10-sim` with one commit making the `axes/y2-dual`
title edit, `SNAPLOT_BENCH_LOCK` pointing at the main checkout's lock.

```
$ npm run test:visual -- --against HEAD      # exit 0: the change compared with itself
visual: captured 137 reference screenshots (each reproduced)
  688 passed (17.8s)
$ node scripts/overhaul/check-visual-diffs.mjs --no-copy      # exit 1
check-visual-diffs: head 16ed8f341f vs HEAD (16ed8f341f)
  milestone M10, rows of this milestone changed since 16ed8f341fc3: none
  137 shots: 0 changed, 0 added, 0 removed, 0 broken, 0 unverified; geometry: 555 checks, 0 failing
check-visual-diffs: FAIL: the run compared against HEAD (16ed8f341f), but this branch's merge base with overhaul is 663483992f. Against the branch's own commits, a change compares with itself. Run npm run test:visual -- --against 663483992f (the merge gate), or pass --base HEAD to judge against HEAD deliberately
$ npm run test:visual -- --against overhaul      # exit 1 (reference from the shared cache)
  2 failed
  686 passed (18.1s)
$ node scripts/overhaul/check-visual-diffs.mjs --no-copy      # exit 1
check-visual-diffs: FAIL: changed or removed fixtures without a visual-ledger row from this milestone: axes/y2-dual
+ untracked V30.md (Milestone M10) naming axes/y2-dual
$ node scripts/overhaul/check-visual-diffs.mjs --no-copy      # exit 0
  milestone M10, rows of this milestone changed since 663483992f24: V30.md
check-visual-diffs: OK
```

**Synthetic scenarios** (inside `npm test`):
- `check-visual-diffs.test.ts` (38 tests):
  - the reference: a complete reference that matches; a change under the zero-change rule; an added
    shot; 0 reference shots, with and without `--allow-partial`; an incomplete reference, then with
    `--allow-partial`; a non-reproduced shot; a `meta.json` without the outcome; a head shot that
    threw (broken);
  - committed baselines: a match, an added shot, and no baselines at all;
  - the comparison (review #2): a tolerant `--against` run under both rules; a `meta.json` without the
    comparison; a tolerant and an exact committed-baseline run under the zero-change rule; the
    not-the-merge-gate note;
  - a stale report (review #2): an edit to the render inputs after the run; a `meta.json` without the
    inputs; edits outside the inputs; `--any-head`;
  - visual-ledger rows: a missing row, a good row, an edit to `V0.md`, and another milestone's row;
  - a reference written after capture (review #3): an image rewritten (both rules, and with
    `--allow-partial`), an image never captured, an image gone (with `--allow-partial`), and a
    `meta.json` without the hashes;
  - the merge base (review #3): a run against the branch tip fails; the merge base passes; `--base`
    judges another ref; a pre-harness merge base and a clone without `overhaul` print notes;
  - a base that does not resolve (review #3): the zero-change rule goes on; the row rule asks for
    `--base`.
- `check-visual-ledger.test.ts` (7): a complete row; a screenshot without a row; a `visual:`
  paragraph without its row; a Commit line that does not quote the subject; a row without Before →
  after, Finding or Revert; an empty field; a nested-list value.
- `run-args.test.ts` (6), `record.test.ts` (4), `paint.test.ts` (4) and `checks.test.ts` (8).

31 tests carry `[repo-10]`: 27 in `check-visual-diffs.test.ts`, 2 in `check-visual-ledger.test.ts`,
1 in `record.test.ts` and 1 in `run-args.test.ts`. None is an `it.fails` any more.

**`check-visual-ledger`** at the tip (exit 0):

```
  baseline  4597c43a12 test(visual): initial darwin baselines (137 screenshots, V0)
check-visual-ledger: 63 commits in overhaul-baseline..HEAD, 1 with visual changes, 1 listed baseline commit(s)
check-visual-ledger: OK
```

V0.md passes the stricter row check. The first implementation ran the script's self-tests in a
scratch clone, and review #1 re-ran them; `check-visual-ledger.test.ts` now locks them (a screenshot
without a row, a `visual:` paragraph without a row, a malformed row, a good row). The patch-id match
after a rebase, and `--refresh`, were last exercised by review #3's rebase simulation and this
attempt's (below).

**Rebase simulation onto `overhaul` at `8faea93`** (`ovh-m6b-done`), in the scratch clone, with the
main checkout's `node_modules` (APFS clones of the root, `packages/snaplot` and `site` ones):
- `git rebase origin/overhaul` stops once, on `packages/snaplot/package.json`'s `scripts` block in
  `eeb1a7c`. Resolved as Requests 6 says; the other 32 commits apply cleanly.
- `npm run verify`: exit 0. Biome 320 files. The library: 55 files, 588 passed + 2 expected fail
  (590). The bench tests pass; the site: 77 passed, 1 skipped.
- `check:api`, `check:size` and `check:package` (with `check-consumers`): exit 0.
- `check-visual-ledger`: OK, with "listed as 4597c43a12 before a rebase; run with --refresh"
  (Requests 2).
- `npm run test:visual -- --strict`: exact against the committed darwin baselines, 688 passed, 4
  skipped (Vite 7.3.7); `check-visual-diffs --milestone M2`: OK.
- `npm run test:visual -- --against HEAD`: captured 137 (each reproduced), 688 passed;
  `check-visual-diffs`: OK, with the note that the merge base `8faea93` predates the fixture app.

**Final state.** After the self-tests (the fixture edit reverted), and again after the
broken-reference self-tests below:
- a committed-baseline run (`npm run test:visual`): 688 passed, 4 skipped, exit 0;
  `check-visual-diffs` OK with the not-the-merge-gate note;
- a last `npm run test:visual -- --against HEAD` (from the cache): 688 passed, exit 0;
  `check-visual-diffs` OK with 0 changed, 0 added, 0 removed, 0 broken and 0 unverified.

The worktree is clean apart from this handoff before its commit. No server is left on ports 5333 or
5334.

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
- `check:package`, `check:size` and `check:api`: they arrived on `overhaul` (M5) after this branch's
  base, so they ran in the rebase simulation above (OK). M3a changes no library source, export or
  type;
- `build:site` (M6a): the rebase simulation's `npm run verify` ran the site's tests; M3a touches no
  site path.

**Broken-reference self-tests (review #1's blocking item), re-run at `6634839`** with a fresh cache
(`$S/cache-broken`). Each reference is a commit object made with `git commit-tree` from `de0ac26`
plus a 1–5 line change to the ref's `test/visual/app.ts` (Data notes). The head is the clean tip.
The outcomes are the same as at `c1faeb0`: the head's reference copy holds only the usable shots,
so a shot the reference did not produce is still "unverified".

- **A, review #1's case: the reference's fixture app does not build.** Before review #1's fix this
  gave "137 added … OK".

  ```
  $ npm run test:visual -- --against d56f222      # exit 1
    137 failed
    551 passed (31.3s)
  visual: the reference d56f222 is incomplete (0 of 0 shots usable): this run cannot pass check-visual-diffs; run it again
  $ node scripts/overhaul/check-visual-diffs.mjs --milestone M2 --no-copy      # exit 1
    reference: INCOMPLETE (capture exit 1; 0 of 0 declared shots usable); comparison exact (threshold 0, maxDiffPixels 0)
    137 shots: 0 changed, 0 added, 0 removed, 0 broken, 137 unverified; geometry: 555 checks, 0 failing
  check-visual-diffs: FAIL: the reference d56f222 produced no shots (capture exit 1; 0 of 0 declared shots usable): nothing was compared
  check-visual-diffs: FAIL: the reference capture did not complete (capture exit 1; 0 of 0 declared shots usable): 137 head shot(s) unverified. Run npm run test:visual -- --against d56f222 again, or pass --allow-partial to judge only the shots the reference produced
  ```

  - `--allow-partial` still fails on "nothing was compared" (exit 1).
  - No `capture.json` was written, and the capture lock was released.
- **B: one reference fixture throws** (`marks/basic-line`). This is the partial failure.

  ```
  $ npm run test:visual -- --against ce497d7      # exit 1
  visual: comparing exact (threshold 0, maxDiffPixels 0)
    2 failed
    686 passed (17.9s)
  visual: the reference ce497d7 is incomplete (135 of 137 shots usable): this run cannot pass check-visual-diffs; run it again
  $ node scripts/overhaul/check-visual-diffs.mjs --milestone M2 --no-copy      # exit 1
    137 shots: 0 changed, 0 added, 0 removed, 0 broken, 2 unverified; geometry: 555 checks, 0 failing
  check-visual-diffs: FAIL: the reference capture did not complete (capture exit 1; 135 of 137 declared shots usable): 2 head shot(s) unverified. …
  ```

  - `--milestone M10` gives the same FAIL (exit 1).
  - `--milestone M2 --allow-partial` gives OK (exit 0), judging only the 135 shots the reference
    produced. The copy held 135 images.
  - No `capture.json` was written.
- **C3 and C4** (a reference shot that does not reproduce) were not re-run. The second-render code
  did not change in reviews #2 and #3; `85e4a57`'s runs (in `98dbec4`'s handoff) gave FAIL with
  exit 1 for both, and the scenario test "does not trust a reference shot that did not reproduce
  itself" locks the check's side.

A last `npm run test:visual -- --against HEAD` after these (from `$S/cache-final`): 688 passed,
exit 0; `check-visual-diffs`: OK.

### Earlier self-tests (not re-run in this attempt)

These exercised the comparison settings and the pre-M3a refusal, which review #3 did not change.
Their logs are in the review #2 attempt's scratch directory (`…/scratchpad/m3a-r2`, called `$S`
inside these blocks).

**Default changes (review #2's cases 2 and 3).** These ran in a scratch clone of `eb8f8a1`
(`$S/clone`, with APFS-cloned `node_modules` and `SNAPLOT_BENCH_LOCK` pointing at the main checkout's
lock). Each was an uncommitted `src/` edit, reverted afterwards, run against the clone's `HEAD` in the
default mode:

```
# 2. src/constants.ts:100, light gridColor '#c3c6cf' → '#d6d8de'
$ npm run test:visual -- --against HEAD      # exit 1
visual: comparing exact (threshold 0, maxDiffPixels 0)
  127 failed
  4 skipped
  561 passed (39.1s)
$ node scripts/overhaul/check-visual-diffs.mjs --milestone M2 --no-copy      # exit 1
  137 shots: 127 changed, 0 added, 0 removed, 0 broken, 0 unverified; geometry: 555 checks, 0 failing
check-visual-diffs: FAIL: M2 must not change any fixture (zero-change rule): axes/titles-320, axes/titles-480, …
$ node scripts/overhaul/check-visual-diffs.mjs --milestone M11 --no-copy      # FAIL
check-visual-diffs: FAIL: changed or removed fixtures without a visual-ledger row from this milestone: axes/titles-320, …

# 3. `lineWidth ?? 1.5` → `?? 2` in renderers/LineRenderer.ts (3) and core/Chart.ts (1)
$ npm run test:visual -- --against HEAD      # exit 1
  72 failed
  4 skipped
  616 passed (35.9s)
$ node scripts/overhaul/check-visual-diffs.mjs --milestone M2 --no-copy      # exit 1
  137 shots: 72 changed, 0 added, 0 removed, 0 broken, 0 unverified; geometry: 555 checks, 0 failing
check-visual-diffs: FAIL: M2 must not change any fixture (zero-change rule): axes/titles-320, …
```

Before the fix, review #2 measured 0 and 1 changed shots, with check-visual-diffs OK.

**A pre-M3a ref is refused**, before anything is extracted (run at `eb8f8a1`, unchanged since). Run in the plain clone without
`SNAPLOT_BENCH_LOCK`, this also shows the new warning, which now names the clone's own `.claude`:

```
$ npm run test:visual -- --against 16547da      # exit 2
visual: $S/clone/.claude does not exist, so this checkout shares no bench lock with the others. In a plain clone, set SNAPLOT_BENCH_LOCK to the main checkout's .claude/bench.lock
visual: 16547da (16547da580) has no visual fixture app: refs older than the M3a merge are not valid references (plan §11.3 G10)
```

Before `eb8f8a1`, the same run named `$S/.claude`, two levels above the clone (review #2 note 4).

## Visual-ledger rows

- **V0**, `test(visual): initial darwin baselines` (`4597c43`).
  - Fixtures: `axes/*`, `marks/*`, `theme/*`, `layout/*`, `overlay/*` (all 111 fixtures, 137 shots).
  - These are the initial committed baselines, not a default change.
  - The commit is listed in `docs/decisions/visual-ledger/baseline-commits.txt`.
- The review fixes change no screenshot. `check-visual-ledger` passes at the tip.

## Requests for integrator

1. **A regression on `overhaul` from M1: plugins installed at creation are not painted at mount.** This
   covers the built-in reference lines and regions and user `plugins` with draw hooks. Reviews #1,
   #2 and #3 confirmed it, and M3b found it independently (`[gap-annotations-extensibility-06:mount]`).
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
   - **Not inside M2 (review #3 note 2).** M2 is a zero-change milestone, and the fix changes
     `axes/annotations-390` and `axes/annotations-390@2x`, so M2's `check-visual-diffs` would FAIL.
     Land it as its own integrator step after M3a merges, as state/runs.md plans:
     - one commit with the fix, its test, a `visual: V90` paragraph and a new
       `docs/decisions/visual-ledger/V90.md` (V90+ is the integrator's range; every P13 field, since
       `check-visual-ledger` now requires them all);
     - the gate: `npm run test:visual -- --against <overhaul before the fix>`, then
       `node scripts/overhaul/check-visual-diffs.mjs --milestone <the row's Milestone>` (for example
       `M1`). Expect exactly those two shots changed, covered by the row.
     - The two committed baselines then show the old rendering until M14's approved set. If you
       refresh them in the same commit instead (`npm run test:visual -- --update`, then check that
       only those two files changed), the row covers the screenshots for `check-visual-ledger`.
   - **If the fix lands on `overhaul` before M3a merges** (not the planned order), regenerate those
     two baselines after rebasing this branch:
     - run `npm run test:visual -- --update`, then check that only those two files changed;
     - commit them separately (for example `test(visual): refresh the annotation baselines after the
       mount fix`);
     - list that commit in `baseline-commits.txt`, since it is part of M3a's initial set.
2. **After rebasing this branch onto the newer `overhaul`**, the SHA in
   `docs/decisions/visual-ledger/baseline-commits.txt` goes stale.
   - `check-visual-ledger` still passes, matching by patch-id with a warning.
   - Run `node scripts/overhaul/check-visual-ledger.mjs --refresh` and commit the one-line change
     (e.g. `chore(repo): refresh the V0 baseline commit after rebase`).
3. **Ownership of the new shared files**, for plan §12. Please record it:
   - Each owning milestone edits its own `packages/snaplot/test/visual/expected/m<N>.ts` (M7, M10, M11,
     M12a; M12b adds `m12b.ts`), the same way as its `fixtures/<area>.ts`.
   - Flipping a geometry finding means changing `fails(` to `fixed(` on its line.
   - The shared harness stays with M3a, then the integrator: `checks.ts`, `probe.ts`, `paint.ts`, the
     specs, `run.mjs`, `run-args.mjs`, `record.mjs` (each with its `.d.mts` and `.test.ts`),
     `expected/index.ts`, `diff-scenario.mjs`, `ledger-scenario.mjs`, `check-visual-diffs.test.ts`
     and `check-visual-ledger.test.ts`.
   - A fixture owner may set `blankData` or `blankGrid` in its own `fixtures/<area>.ts`.
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
   - The 31 `[repo-10]` tests (27 in `check-visual-diffs.test.ts`, 2 in
     `check-visual-ledger.test.ts`, 1 in `record.test.ts`, 1 in `run-args.test.ts`) are normal
     passing vitest tests. repo-10 is closed by M3a.
   - `test:browser` goes into the same `packages/snaplot/playwright.config.ts`, which M3a owns:
     - add a `browser` project with `testMatch: 'browser/**/*.spec.ts'`;
     - keep the `webServer` (or add a second), the `PORT` contract and the `SNAPLOT_VISUAL_*`
       variables;
     - keep the `toHaveScreenshot` settings from `record.mjs`;
     - decide whether `test:browser` also runs `--project geometry` (G9 lists geometry).
   - The fixture app can host browser specs: `window.__snaplotFixture` exposes the chart handle.
5. **CI and `update-snapshots` (M5 has merged both).**
   - **What runs.** `ci.yml`'s `visual` job and `update-snapshots.yml` both run
     `npx playwright test --project visual` in `packages/snaplot`, in the pinned
     `mcr.microsoft.com/playwright:v1.61.1-noble` image. That works with M3a's config:
     - the `webServer` honours `PORT` (default 5333);
     - the image has the full `chromium` channel that the 24 px minimum-font fixture needs;
     - without `run.mjs`, the config applies the committed-baseline settings (`threshold: 0`,
       `maxDiffPixelRatio: 0.002`).
   - **Please add a blocking `npx playwright test --project geometry` step** (review #2 note 5). G10
     says the geometry specs gate on every platform, but today they run nowhere in CI. The step can
     share the visual job's image, since the 24 px fixture needs full Chromium. It needs no baselines.
     This is a small follow-up in M5's file.
   - **The commit that adds the `-linux` set** touches `__screenshots__`. List its SHA in
     `baseline-commits.txt` or give it a row, or `check-visual-ledger` fails. The workflow's header
     already says so.
   - **If CI ever runs `check-visual-diffs` in committed-baseline mode** before a `-linux` set exists,
     it fails with "no committed linux baselines … nothing was compared". That is deliberate
     (review #1).
6. **`packages/snaplot/package.json`** gains one line (`"test:visual": "node test/visual/run.mjs"`).
   This attempt simulated the rebase onto `overhaul` at `8faea93` (`ovh-m6b-done`) in a scratch clone
   (Gates, "Rebase simulation"):
   - The only conflict is the `scripts` block of `packages/snaplot/package.json`, in `eeb1a7c`. The
     other 32 commits apply cleanly.
   - **Resolution:** keep `overhaul`'s block as it is. M5 dropped `test:consumers`, so do not bring
     it back. Add `"test:visual": "node test/visual/run.mjs"` after `test:conformance`.
   - Then run `npm ci`: M5, M4 and M6a changed `package-lock.json` (and M6a added the `site`
     workspace).
   - Expect, as the simulation found with the main checkout's `node_modules`:
     - `npm run verify` exits 0: Biome 320 files; the library 590 tests (588 passed + 2 expected
       fail); the bench and site tests pass;
     - `check:api`, `check:size` and `check:package` are OK;
     - `check-visual-ledger` is OK with the patch-id warning, so make the `--refresh` commit
       (Requests 2);
     - `npm run test:visual -- --strict` and `-- --against HEAD`: 688 passed; `check-visual-diffs`
       OK, with a note that the merge base predates the fixture app.
   - The root `test:visual` delegation from M0 already exists.
7. **Merge-time gate for later milestones** (every milestone, M2/M9a/M9b included):
   1. `npm run test:visual -- --against <merge-base>`. It compares exactly by default, so no
      `--strict` is needed;
   2. `node scripts/overhaul/check-visual-diffs.mjs` (the milestone comes from the branch name, or
      pass `--milestone M<N>`; the base defaults to the ref the run compared against);
   3. `node scripts/overhaul/check-visual-ledger.mjs`.

   Notes:
   - `test:visual` exits non-zero whenever a screenshot differs, or the reference is incomplete.
     `check-visual-diffs` decides whether a difference is allowed. It also fails on:
     - geometry failures;
     - any reference that is incomplete or empty;
     - a run against a ref that was not exact;
     - a reference image that changed after its capture (review #3);
     - on a milestone branch, a reference other than the branch's merge base with `overhaul`
       (review #3): after the milestone's commits, `--against HEAD` compares the change with
       itself. Pass `--base <ref>` only to judge another reference deliberately;
     - a stale report: an edit under `packages/snaplot` or to the root package files after step 1.
       Re-run step 1.
   - The runner refuses `-u`, `--update-snapshots`, `--update-source-method`, `--ignore-snapshots`
     and `--config` (exit 2). A reference is never updated; it is captured from its ref.
   - Because the comparison is exact, a library-wide default change shows every shot it touches. A
     row may name them with `<area>/*` patterns (e.g. `marks/*`), but must name them all.
   - A FAIL saying the reference "did not complete" means: re-run step 1 (a failed reference is
     never cached). Do not reach for `--allow-partial`.
   - If the runner names the same shots under "did not reproduce" every time, that fixture is not
     deterministic. Fix the fixture.
   - In a plain clone rather than a worktree, set
     `SNAPLOT_BENCH_LOCK=/Users/liam/Projects/snaplot/.claude/bench.lock`.
8. **Record the G10 departure in ADR 0002** (M14 or M17 edits it; M3a may not). Suggested text: "A
   visual run against a ref compares exactly (`threshold: 0`, `maxDiffPixels: 0`), not at §11.3's
   `maxDiffPixelRatio: 0.002`. At 0.002, Playwright's default 0.2 per-pixel threshold hid a theme-wide
   grid colour change (0 of 137 shots changed). Committed baselines keep 0.002 with `threshold: 0`
   (M3a review #2)." For plan §11.3 G10's settings line, record it the same way.
9. **M10 (review #3 note 3).** When plan §5.1's empty state (no ticks, no grid; visuals-23) lands,
   add `blankGrid: '<reason>'` next to `blankData` on `axes/empty` in `fixtures/axes.ts`, in the same
   commit. Without it, the fixture times out as "did not paint" if both canvases stay blank.

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
  - The exact `--against` comparison, and the reference's exact second render, have not been tried
    under its software raster. Both sides render in the same container, so they should reproduce.
  - Run it once from the `update-snapshots` workflow, then tick this off.
- **Canvas-drawn labels are outside the geometry checks.** Annotation labels are painted on the
  canvas, so the label checks cannot see them (gap-annotations-extensibility-02).
  - The visual fixture `axes/annotations-390` covers them by pixels, but today it shows no
    annotations at all (Requests 1).
  - If M10 moves annotation labels into the DOM label layer, the checks pick them up automatically.
    Every non-empty span in the chart host counts, as does `[data-snaplot-label]` when present.
- **Pixel-only defects.** Clamped end labels on the 5-minute time axis (`axes/time-minutes-480`,
  render-14) pass all five geometry checks. Only the screenshot records them.
- **Committed-baseline mode keeps the plan's tolerance** (`maxDiffPixelRatio: 0.002`, with
  `threshold: 0`). That covers CI and other machines. It still hides small changes on large shots: the
  fixture self-test's `@2x` shot (72 px) passes there.
  - It is not the merge gate (`check-visual-diffs` says so, and refuses it under the zero-change rule).
  - CI's visual job is advisory until M14.
  - M14 could make it exact for the `-linux` set, which renders in one pinned image.
- **Exact still keeps pixelmatch's anti-alias detection**, which Playwright does not expose. A change
  made only of pixels it classifies as anti-aliasing would pass. None of the measured cases did.
  - It also absorbs real render noise. In this attempt, two separate captures of the same ref
    differed in 3 pixels of `overlay/hover-scatter-3` (the left edge of the tooltip's swatch dots,
    at most 4 levels in one channel). Each capture reproduced itself, and the exact comparison
    classed the 3 pixels as anti-aliasing, so the head matched both. This is why the reference
    hashes are compared only with the capture they came from, never across renders.
- **The reference's second render is exact.** A reference fails to complete when any shot does not
  reproduce exactly, apart from pixels that pixelmatch classifies as anti-aliasing.
  - Locally, every run reproduced all 137 shots exactly.
  - A fixture that cannot reproduce exactly is a fixture bug: make it deterministic. Loosening the
    check would let a wobbling reference into the cache.
- **The stale-report fingerprint covers `packages/snaplot`, `package.json` and `package-lock.json`.**
  Nothing else feeds the fixture app today. A milestone that makes the app read another path (a shared
  workspace package, say) should add it to `INPUT_PATHS` in `record.mjs`.
- **The capture lock is best effort.** If two runs judge the same dead lock stale at the same moment,
  both may capture. That fails safe, as before review #2: an incomplete reference gives FAIL, then
  re-run.
- **The reference hashes guard what the head compares against, not the head itself** (review #3).
  - Anything that writes into the head's reference copy, or into the cache, is caught: the runner
    refuses the Playwright flags that would do it, recaptures a damaged cache, and
    `check-visual-diffs` fails a changed copy.
  - A process that rewrites both an image and `meta.json`'s hash list would not be caught. Nothing
    in the harness does that; it would take a deliberate edit.
  - The flag refusal reads Playwright's command line the way its parser does, with a fixed list of
    options that take a value. A Playwright release that adds a new snapshot-writing flag needs a line
    in `run-args.mjs`; the hashes catch its effect meanwhile.
  - The cache entries written before review #3 (format 3, no hashes) are captured again on first
    use.
- **`--allow-partial` accepts a narrowed run** (`--grep`, extra Playwright arguments, one project) and
  judges only what ran. It never overrides an empty reference, a changed reference image, a
  non-exact run against a ref, or the merge-base rule. Use it only for a deliberate partial look,
  never for a merge.
- **The paint check is weaker for bars and histograms.** It probes at half height across the slot,
  so a grouped bar can be satisfied by its neighbour. Density series are not probed, and both density
  fixtures skip the check.
- **Paint readiness is by ink, not content.** The app waits until the data layer has any ink. It
  does not check that every series painted. That is the geometry paint check's job, which runs on
  the head only. A `blankGrid` fixture waits only for both layers to render, so the screenshot alone
  shows whether it painted what it should.
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
  - entries from the review #1 fix attempts: `90ffd44…`, `c5a7cab…` and `de0ac26…`.

  All of them are in `capture.json` format 3 or older (no hashes), so they are captured again on use,
  never trusted. Neither the review #2 nor the review #3 attempt wrote there.
- **This attempt's runs** (review #3) used scratch caches and logs in
  `/private/tmp/claude-501/-Users-liam-Projects-snaplot/76647906-acb8-4a29-8fd6-6a20ecda8e45/scratchpad/m3a-r3/`:
  - `cache-final`: exit 1, the review #3 self-tests and the merge-base self-test. It holds
    `shots-….damaged-1792754984986`, the directory poisoned on purpose and moved aside by the runner;
  - `cache-broken`: the broken-reference self-tests (no `capture.json`, by design);
  - `cache-rebased`: the rebase simulation;
  - `cache-dev`: a development run;
  - `poison-out`: the output of the direct Playwright run that poisoned the cache;
  - `hover/`: the two `overlay/hover-scatter-3` captures compared in Known gaps;
  - `clone/`, a scratch clone with APFS-cloned `node_modules`: the per-commit proof (`rebase-x.log`),
    the `ovh/m10-sim` merge-base self-test, and the rebase simulation (branch `rebase-sim`, with the
    main checkout's `node_modules`; the branch's own are in `nm-m3a/`);
  - the review #2 attempt's logs and caches stay in `…/scratchpad/m3a-r2/`.
- **The broken-reference self-tests** use commit objects made with `git commit-tree` from `de0ac26`
  during review #1. No ref points at them, and they are pruned with the repository's normal gc:
  - `d56f222` (A): the app does not build;
  - `ce497d7` (B): `marks/basic-line` throws;
  - `3594911` (C3): `marks/basic-area` gets a random series `stroke` hue;
  - `6d9e6e1` (C4): `marks/basic-area` gets random per-point noise.
- An early `--against overhaul` test, before the pre-extraction check, extracted a tree. It was moved
  aside to `/Users/liam/Projects/snaplot/.claude/backups/leftovers/visual-cache-16547da-pre-harness`
  rather than deleted.
- `/Users/liam/Projects/snaplot/notes/overhaul-audit/visual-diffs/m3a/` holds the first self-test's
  diff images (`marks/basic-line`, `marks/basic-nogrid`). They are not a real change; delete them
  freely. The later self-tests used `--no-copy`.
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
