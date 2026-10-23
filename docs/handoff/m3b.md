# M3b: Expected-failure ledger, browser specs and trace ids

- **Branch:** `ovh/m3b-ledger` · **Worktree:** `.claude/worktrees/m3b` · **Base:** `504d934` (`overhaul` =
  `ovh-m5-done`). The branch started on `16547da` (`ovh-m1-done`). It was rebased onto `overhaul` after M5
  merged, so the review's M5 findings could be fixed and checked against the real tree. That rebase only
  resolved the `packages/snaplot/package.json` scripts block, keeping every script; `git range-diff` shows
  no other change to the first five commits.
- **Status:** complete (review #1 fixed)

## Summary

- **Browser specs** (`packages/snaplot/test/browser/`, `npm run test:browser`). A Vite-served harness page
  builds charts through the public API. Every geometry helper (`plotRect`, `toClient`, `domain`, `tooltip`,
  `pixel`, `counters`) lives in `harness.ts`, so when M8 removes `getLayout`/`getAxis` only that file changes.
  - **Input and tools.** Playwright drives real mouse, keyboard and CDP touch input, axe, print and
    forced-colours emulation, CDP screencasts and `page.pdf()`.
  - **Config.** It honours `PORT` (default 5363, EXECUTION rule 6) and never reuses a running server. It
    writes `packages/snaplot/test-results/browser.json`.

  The specs, named by owning milestone:
  - `m12a-interaction` (hover model, brush, box zoom, slow clicks, wheel/keys, dialog, CSS transforms);
  - `m12a-touch` (CDP touch, Pixel 7 emulation);
  - `m12a-a11y` (axe and D20);
  - `m12a-tooltip-rows`;
  - `m12a-hover-sweep`: the 12×8 grid from `evidence/uisite/herosweep.mjs`; today 57 of 96 probes miss. It is
    tagged `[uisite-03:library]`, so M12a's flip cannot lock M16a's homepage half;
  - `m11-lifecycle`, read from what the compositor showed:
    - a 30-step resize, one width change per animation frame, under a CDP screencast;
    - the first composited frame after mount;
    - print through `page.pdf()`: the canvases at `afterprint`, and the canvas bitmaps embedded in the PDF;
  - `m11-marks` (every finite datum paints);
  - `m11-colour` (colour parsing, fills, ramps, surfaces, read from canvas pixels);
  - `m10-tooltip-format` (the dxtrial values `20.4%`, `-0.8`, `4.84%`, `718 ms`);
  - `m10-axes` (tabular digits, a 24 px minimum font, forced colours);
  - `m12b-legend` (the legend text has the axis labels' `muted` colour, and the buttons are padded, without
    any CSS import).
- **Unit ledger** (`packages/snaplot/test/ledger/m<N>-<area>.test.ts`). Each file ports the audit repros
  (`evidence/repro/**`) by inverting them into `it.fails('[id] <expected behaviour>')`. The files use
  `createChart`, the shared fakes and `debug()` only. Where M7/M8 introduce final option names, the files
  use them through casts. The files:
  - `m7-ingest` and `m7-types`; `m7-types` compiles the typed-rows snippets once with the TypeScript API, from
    memory;
  - `m8-update`, `m8-state`, `m8-plugins`;
  - `m10-axes`, `m10-format`, `m10-annotations`;
  - `m11-surface`, `m11-marks`, `m11-bundle` (esbuild over the public entry);
  - `m12b-legend`; `m13-adapters` (React 19 and Solid on the real core);
  - `wont-do` and `wont-do-bundle` (the §6 won't-do parts, expected failures through the release).

  Every marker was first run as a plain `it()` (or read from the Playwright JSON `errors`) and checked to fail
  for the reported reason. Cases that passed today became controls (no id in the title) or locks of M0–M2
  fixes, not markers.
- **Perf guards** (`packages/snaplot/test/perf-guards.test.ts`): the 21 §3.4 call-count guards, titled
  `[perf:<guard>]`, with owners in `trace-ids.json` (`perfGuards`).
  - **Passing today:** `visible-range`, `overlay-only`, `label-nodes-reused` and `theme-coalesce`. Each has
    a lower and an upper bound, so a path that draws or resolves nothing fails. M9a has nothing to flip for
    `[perf:visible-range]`.
  - **`theme-coalesce` is calibrated.** It lets timers and frames run, measures the computed-style reads of
    one resolution with a single class toggle (and requires that to be non-zero), then requires 100 toggles
    to cost exactly one resolution per chart.
  - **Every other guard is an `it.fails`.** The arch-01 plugin guard stays `[arch-01]` in
    `test/debug-counters.test.ts`.
  - **Missing counters.** Four guards read a D31 counter that does not exist yet, as an optional field. The
    owner adds it with the path: `hitVisits` (M12a), `densityRebins` (M11), `rangeScanPoints` (M10),
    `xValidations` (M7).
- **`scripts/ledger.mjs`.** Scans `packages/snaplot/{src,test}/**` and `site/tests/**` (comments ignored;
  regex literals are skipped, so a quote inside one cannot flip the string state) and prints ids, file:line
  and title. Each marker names the suite that runs it:
  - `vitest`: `npm test`;
  - `consumers`: `test/consumers/**` under `check:package`;
  - `browser`: `test:browser`;
  - `visual`: M3a's geometry project;
  - `site`: `site/tests/**`.

  M3a's geometry entries are listed too. Each `fails('<owner>', '<fixture>', '<check>', '<id>')` line in
  `test/visual/expected/m<N>.ts` is a marker titled `${CHECKS[check]} [<id>]`. The data-driven `test.fail` in
  `geometry.spec.ts` is recognised as their template. `--json` gives one entry per marker. `--allow <ids>`
  fails on any other id. These also exit non-zero:
  - a marker without an `[id]`;
  - a conditional `test.fail`;
  - a modified marker (`it.fails.skip`, `it.skip.fails`, `.only`, `.each`);
  - a data-driven title.
- **`scripts/overhaul/trace-ids.mjs` → `trace-ids.json`.** Generated from `_results.json`, every milestone's
  Closes list and the §6 root-cause and won't-do tables: 192 required ids, 212 trace units (ids and parts),
  162 test locks and 50 gate locks.
  - **What each id records:** severity, verdict, `required`, owners, parts, root causes (§6 ranges such as
    `uisite-04–07` and part-only mentions such as `frameworks-01:state` count), its lock
    (`{kind:'test', title:'[id]'}` or `{kind:'gate', name}`) and the §14 lock note.
  - **`status` is static:** `tracked` or `wont-do`. Closure is computed from the owners' `ovh-<m>-done`
    tags (trace-check, `--render`), so `--check` stays valid after every merge.
  - **Gate-locked ids** are packaging, bench, metrics, palettes, docs, site and demos (`LOCKS` in the
    script).
  - **The JSON is authoritative from here on.** Generating refuses to overwrite it without `--force`;
    `--check` compares; `--render` prints the per-milestone, per-root-cause and lock views.
- **`scripts/overhaul/trace-check.mjs`** reads `trace-ids.json`, the ledger and the suites' reports. By
  default it runs every suite that exists first:
  - vitest, through `scripts/overhaul/vitest-ledger-reporter.mjs`;
  - `npm run build` plus `check-consumers`;
  - `test:browser`;
  - M3a's `test:visual --project geometry` once that exists.

  Playwright waits for the bench lock. `--run`, `--no-run`, `--skip` and `--<suite>-report` choose what
  runs. Its checks:
  1. every closed unit has its lock:
     - a test lock is a passing test whose title has `[id]` or `[id:part]`. An ad-hoc part tag does not lock
       the whole id;
     - a gate lock needs the id in the **Summary "Closes" block** of every owning handoff;
  2. no closed unit remains in the ledger;
  3. ledger hygiene: known ids, each marker in a file of a milestone that owns it (including
     `expected/m<N>.ts`), and the ledger's own errors;
  4. per suite, every marker ran as an expected failure with the same file and title, the counts are equal,
     and no expected failure is missing from the ledger;
  5. with `--milestone M<N>`, no marker is left in M<N>'s own files (`--partial` reports them as notes).

  The other modes:
  - `--coverage` lists required units with no marker, gate lock or M0–M2 closer. A passing test counts only
    for units with an M0–M2 owner, so an open defect needs a marker;
  - `--release`: the ledger holds only won't-do parts.
- **Workspace scripts** in `packages/snaplot/package.json`: `test:browser`, `ledger`, `trace-check`. The root
  delegations already existed (M0).

Commits (oldest first):

| SHA | Subject |
|---|---|
| `c3da3cc` | test(browser): interaction, touch, a11y, lifecycle, marks and tooltip specs |
| `2748a9f` | test(browser): colour, fill and label-measurement specs |
| `aa6cbc3` | test: record known defects as expected failures with finding ids |
| `cfb5cd7` | test(perf): call-count guards for the hot paths |
| `061c6c3` | chore(scripts): ledger report and finding traceability |
| `cab280e` | docs(handoff): record the M3b ledger, trace ids and gates |
| `2a52071` | test(browser): read lifecycle locks from composited frames and page.pdf() |
| `b332d94` | test: record the useChartGroup <Activity> crash as a frameworks-07 expected failure |
| `beec784` | test(perf): measure the theme refresh in the coalescing guard, add lower bounds |
| `4b51cf8` | test: lock dxtrial-06 on computed styles, split uisite-03's sweep, never reuse a server |
| `b1a4cc2` | chore(scripts): match markers per suite, list the geometry entries, tighten locks |
| (tip) | docs(handoff): record the review #1 fixes and re-run the M3b gates |

The brief's commit 1 is split in two (`c3da3cc`, `2748a9f`). The six commits from `2a52071` on fix review #1.

Closes: none. This milestone records the ledger that later milestones flip.

**Review #1 fixes:**

1. **The lifecycle locks now see the defects.** The old specs took element screenshots and used
   `emulateMedia('print')`. A screenshot forces a fresh frame and emulation keeps frames running, so all
   three passed on `ovh-m0-done`.
   - **Resize and mount** now count near-black pixels in every CDP screencast frame, as the audit's
     `flicker3.mjs` did.
   - **Print** reads the canvases at `afterprint` and decodes the canvas bitmaps that `page.pdf()` embeds.
   - **Proof.** All three fail on an `ovh-m0-done` extraction and pass at the tip (both runs under Gates).
     Run with the PDF assertions first, the print test also fails on the PDF half alone: no canvas image is
     embedded at all.
2. **frameworks-07 has a marker.** `it.fails('[frameworks-07] two charts grouped inside a component survive
   an <Activity> hide and show')` in `m13-adapters.test.ts` fails today with the audit's
   `group must be a live createChartGroup() result`.
   - It uses `useChartGroup` while the hook exists, and falls back to §4.2's
     `useState(() => createChartGroup())[0]` once it does not. I checked that the fallback passes. So
     M8's deletion of the hook turns the marker red until M8 flips it.
   - The module-scope test stays as a control without the id.
   - `--coverage` now counts a passing test only for units with an M0–M2 owner.
3. **`[perf:theme-coalesce]` measures the refresh.** It is calibrated as described under Perf guards.
   Against two broken cores (temporary edits, reverted):
   - resolving once per mutation fails with `expected [ 100, 100, 100 ] to deeply equal [ 1, 1, 1 ]`;
   - never refreshing fails the calibration: `one mutation re-resolves the theme: expected 0 to be greater
     than 0`.
4. **Ledger and trace-check after M3a and M5.**
   - **M5** is in the base now. Its four consumer markers run in the `consumers` suite, read from
     `test-results/consumers.json`.
   - **M3a.** Its 15 geometry entries are listed, and its template is no longer flagged.
   - **Simulation.** I built the future tree in a scratch copy: this branch plus M3a's own diff (`16547da..ovh/m3a-visual`),
     with the `test:visual` script added to the scripts block. I ran its four suites there; the output is
     under Gates. The first run was red on `[frameworks-10]` because the scratch copy symlinks
     `node_modules`, which makes the declaration rollup emit un-rolled types. A plain extraction of this
     branch shows the same, so it is not a merge conflict.

Non-blocking notes, all taken:
- Gate locks need the Summary "Closes" block, not any mention in the file.
- `status` is static, and `--render` recomputes closure.
- en-dash ranges and part-only mentions now give root causes; `--render --by root-cause` shows no `(none)`.
- `[perf:visible-range]` needs at least 101 vertices, and `[perf:label-nodes-reused]` an unchanged label
  count.
- `[dxtrial-06]`:
  - the unit marker asserts computed padding and a 12 px swatch;
  - the new browser spec compares the legend text colour with the axis labels' colour, today
    `rgb(107, 113, 129)` = `#6b7181`, the plan's light `muted`.
- `[uisite-03:library]` and the exact lock rule (above).
- The ledger flags modified markers and skips regex literals. On a scratch tree, the old scanner counted two
  commented-out markers (a quote inside a regex flipped its string state), missed a real one and missed
  `it.fails.skip`/`it.skip.fails`.
- `reuseExistingServer: false`.
- The reporter file outside the Owns list is in Requests (3).
- `--milestone M<N>` makes a milestone flip the markers in its own files.
- The M1 regression in Request 1 is now addressed to the integrator.

Ledger markers by owning file (`npm run ledger`, 210 markers, 176 distinct ids):

| Owner | Markers | Files |
|---|---:|---|
| M7 | 24 (+1 `[research-12]` in M5's `golden-api`) | `m7-ingest`, `m7-types` |
| M8 | 27 (+1 `[arch-01]` in `debug-counters`) | `m8-update`, `m8-state`, `m8-plugins` |
| M10 | 44 | `m10-axes`, `m10-format`, `m10-annotations`, browser `m10-tooltip-format`, `m10-axes` |
| M11 | 37 (+3 `[repo-04]` in M5's `test/consumers/jsdom.consumer.*`) | `m11-surface`, `m11-marks`, `m11-bundle`, browser `m11-lifecycle`, `m11-marks`, `m11-colour` |
| M12a | 35 | browser `m12a-*` |
| M12b | 9 | `m12b-legend`, browser `m12b-legend` |
| M13 | 5 (+1 `[frameworks-19]` in M5's `test/consumers/ssr.mjs`) | `m13-adapters` |
| perf guards | 18 | `perf-guards` (owners per guard) |
| won't do | 5 | `wont-do`, `wont-do-bundle` (6 part ids) |

## Gates

All at `b1a4cc2` (the last commit before this file), in the worktree. Outputs are trimmed to their tails.

**`npm run verify`** (exit 0):

```
> biome ci . && npm run typecheck && npm test && npm run build
Checked 202 files in 392ms. No fixes applied.
> snaplot@0.12.0 typecheck
> tsc -p tsconfig.json --noEmit && tsc -p tsconfig.test.json
> snaplot@0.12.0 test
> vitest run
 Test Files  65 passed (65)
      Tests  531 passed | 142 expected fail (673)
> snaplot@0.12.0 build
[vite:dts] Declaration files built in 3132ms.
✓ built in 3.62s
✓ built in 766ms
```

Tests: `overhaul` has 523 (521 passing, plus `[arch-01]` and `[research-12]`). M3b adds 150:
- 140 `it.fails`;
- 10 passing tests: 2 type controls, 3 behaviour controls, the module-scope `<Activity>` control and the 4
  passing perf guards.

**Per-commit proof.** EXECUTION rule 4 requires it (more than 6 commits). The permission classifier refused
`git rebase -x` in this session. So, as the reviewer did, each commit was extracted with `git archive`
(node_modules linked) and `npx vitest run` ran in `packages/snaplot`. The branch was not touched, and the
lockfile never changes:

```
504d934 docs(handoff): record the M5 gates          | Tests  521 passed | 2 expected fail (523)
c3da3cc test(browser): interaction, touch, a11y, …   | Tests  521 passed | 2 expected fail (523)
2748a9f test(browser): colour, fill and label-…     | Tests  521 passed | 2 expected fail (523)
aa6cbc3 test: record known defects as expected …    | Tests  527 passed | 123 expected fail (650)
cfb5cd7 test(perf): call-count guards for the hot … | Tests  531 passed | 141 expected fail (672)
061c6c3 chore(scripts): ledger report and finding … | Tests  531 passed | 141 expected fail (672)
cab280e docs(handoff): record the M3b ledger, …     | Tests  531 passed | 141 expected fail (672)
2a52071 test(browser): read lifecycle locks from …  | Tests  531 passed | 141 expected fail (672)
b332d94 test: record the useChartGroup <Activity> … | Tests  531 passed | 142 expected fail (673)
beec784 test(perf): measure the theme refresh in …  | Tests  531 passed | 142 expected fail (673)
4b51cf8 test: lock dxtrial-06 on computed styles, … | Tests  531 passed | 142 expected fail (673)
b1a4cc2 chore(scripts): match markers per suite, …  | Tests  531 passed | 142 expected fail (673)
```

**Lifecycle locks against `ovh-m0-done`** (the review's request). This branch's `test/browser/` was copied
into a `git archive ovh-m0-done` extraction:

```
$ PORT=5363 CI=1 npx playwright test -c test/browser/playwright.config.ts m11-lifecycle    # ovh-m0-done
  ✘  2 … [gap-scale-longevity-01] the first composited frame after mount shows the chart, not black (774ms)
  ✘  1 … [gap-scale-longevity-01] no composited frame of a 30-step resize is more than 5% black (1.1s)
  ✘  3 … [gap-environments-01] page.pdf() prints the chart canvases with their ink (127ms)
  ✘  4 … [gap-environments-02:print-basics] printing hides the tooltip (195ms)
  ✘  5 … [gap-environments-02:print-basics] a printed chart does not split across pages (152ms)
    Error: black fraction per frame: 1.00 1.00 1.00 1.00 1.00 1.00 1.00 1.00 0.99 0.99 0.99 0.99 0.99 0.99 0.99 0.99 0.99 0.99 0.99 0.99 0.99 0.99 0.99 0.00
    Received:    0.9953630796150481       # resize: worst frame
    Received:    0.99445                  # mount: the first frame is black
    Received:   0                         # print: the grid layer at afterprint is cleared
  3 failed
  2 passed (2.4s)                         # the two test.fail markers

$ PORT=5363 CI=1 npx playwright test -c test/browser/playwright.config.ts m11-lifecycle    # this branch
  ✓  2 … [gap-scale-longevity-01] the first composited frame after mount shows the chart, not black (770ms)
  ✓  3 … [gap-environments-01] page.pdf() prints the chart canvases with their ink (127ms)
  ✓  1 … [gap-scale-longevity-01] no composited frame of a 30-step resize is more than 5% black (1.1s)
  ✘  4 … [gap-environments-02:print-basics] printing hides the tooltip (172ms)
  ✘  5 … [gap-environments-02:print-basics] a printed chart does not split across pages (118ms)
  5 passed (1.9s)
```

The new spec also passed `--repeat-each=6 --workers=4` (30 of 30) on this branch.

**`npm run test:browser`** (exit 0, three runs in a row):

```
run1 exit=0  73 passed (6.1s)
run2 exit=0  73 passed (6.1s)
run3 exit=0  73 passed (6.1s)
browser.json: { total: 73, expectedFail: 64, notExpected: 0 }
```

73 tests: 64 `test.fail` markers and 9 passing tests (controls, and the M1 resize, mount and print locks).

**`npm run ledger`** (at least 80 entries required; exit 0):

```
perf:group-offscreen gap-scale-longevity-07  packages/snaplot/test/perf-guards.test.ts:425        [perf:group-offscreen][gap-scale-longevity-07] a 20-member group with 18 offscreen paints 2 overlays per move
perf:offscreen                               packages/snaplot/test/perf-guards.test.ts:443        [perf:offscreen] an offscreen chart paints 0 frames

210 expected-failure markers (vitest 146, playwright 64; by suite: vitest 142, consumers 4, browser 64), 176 distinct ids
```

`ledger --allow backlog-06:iana` exits 1 (`ledger: not allowed: perf:offscreen at …`).

**Markers executed = ledger length.** `npm run --silent ledger -- --json` has length 210:
- vitest 142: `npm test` reports `142 expected fail`;
- consumers 4: `check:package` reports `4 expected fail`;
- browser 64: the Playwright JSON has 64 `expectedStatus: 'failed'` tests, all `status: 'expected'`.

trace-check matches each marker per suite, by file and title.

**`npm run trace-check`** (runs vitest, build and check-consumers, and the browser specs; 19 s; exit 0):

```
trace-check: merged: M0, M1, M5
  closed units checked: 13, locked: 13
  ledger: 210 markers (vitest 142, consumers 4, browser 64); executed expected failures: vitest 142, consumers 4, browser 64
  note: ad-hoc part [uisite-03:library] at packages/snaplot/test/browser/m12a-hover-sweep.spec.ts:15 (owners of uisite-03)
  note: ad-hoc part [visuals-01:x] at packages/snaplot/test/ledger/m10-format.test.ts:40 (owners of visuals-01)
  note: ad-hoc part [gap-annotations-extensibility-06:mount] at packages/snaplot/test/ledger/m8-plugins.test.ts:60 (owners of gap-annotations-extensibility-06)
  note: ad-hoc part [gap-annotations-extensibility-06:mount] at packages/snaplot/test/ledger/m8-plugins.test.ts:75 (owners of gap-annotations-extensibility-06)
OK
```

The 13 closed units:
- M0's repo-02, repo-03 and demos-17, and M5's nine gate locks, all found in the Summary "Closes" blocks of
  `m0.md` and `m5.md`;
- gap-environments-01 (the passing `[gap-environments-01]` tests).

**`node scripts/overhaul/trace-check.mjs --milestone M3b`** (exit 0; M3b closes nothing and owns no `m3b-*`
file):

```
trace-check: M3b (as merged)
  closed units checked: 0, locked: 0
  ledger: 210 markers (vitest 142, consumers 4, browser 64); executed expected failures: vitest 142, consumers 4, browser 64
OK
```

**`trace-check --coverage`** (0 of 192; exit 0):

```
coverage: 0 of 192 required ids uncovered (units covered by a ledger marker 156, a gate lock 49, an M0–M2 passing test lock 7, closed in M0–M2 0)
ledger: 210 markers (vitest 142, consumers 4, browser 64); executed expected failures: vitest 142, consumers 4, browser 64
```

The 7 M0–M2 passing-test units are M1's fixes whose co-owner has work left:
- dataapi-01, dxtrial-01, frameworks-06 and interact-01 (with M8);
- dxtrial-02 (with M10);
- gap-scale-longevity-01 (with M11);
- gap-environments-01 (M1 only).

frameworks-07 is now a ledger unit. frameworks-19 moved from the gate count to the ledger count, because of
M5's consumer marker.

**Simulated M5 + M3a + M3b tree** (scratch copy, see Summary 4). Suites run one at a time, behind the bench
lock:

```
$ node scripts/ledger.mjs | tail -1        # exit 0; M3a's template is not flagged
225 expected-failure markers (vitest 146, playwright 79; by suite: vitest 142, consumers 4, browser 64, visual 15), 176 distinct ids
$ npx playwright test -c test/browser/playwright.config.ts      → 73 passed (21.7s)
$ node test/visual/run.mjs --project geometry                    → 4 skipped, 551 passed (21.0s)
$ node scripts/overhaul/trace-check.mjs --no-run
trace-check: merged: M0, M1, M5
  closed units checked: 13, locked: 13
  ledger: 225 markers (vitest 142, consumers 4, browser 64, visual 15); executed expected failures: vitest 142, consumers 4, browser 64, visual 15
OK
$ node scripts/overhaul/trace-check.mjs --no-run --coverage
coverage: 0 of 192 required ids uncovered (units covered by a ledger marker 156, a gate lock 49, an M0–M2 passing test lock 7, closed in M0–M2 0)
```

Negative check there: one geometry `fails(` turned into `fixed(` without re-running gives `1 expected
failure(s) in visual not in the ledger: … [render-06]` and `visual ran 15 expected failures; the ledger has
14 visual markers`.

**`node scripts/overhaul/trace-ids.mjs`**:

```
$ trace-ids.mjs --check
trace-ids.json matches a fresh generation
$ trace-ids.mjs --render          (per-milestone counts of required units)
M0 (4) M1 (8) M4 (2) M5 (9) M6a (7) M6b (1) M7 (20) M8 (36) M9a (1) M9b (1) M10 (38) M11 (43) M12a (24) M12b (9) M13 (11) M15a (3) M15b (6) M16a (10) M16c (1) won't do (6)
required: 192 (open 180, closed 12, won't do 0; merged: M0, M1, M5)
$ trace-ids.mjs --render --by lock
test locks: 162; gate locks: 50
$ trace-ids.mjs --render --by root-cause | grep -c '(none)'
0
$ trace-ids.mjs
trace-ids: trace-ids.json exists and is authoritative (plan §0). Use --force to regenerate, --check to compare.   (exit 1)
```

The regeneration in `b1a4cc2` (`--force`) changed only `status` and the root causes of 24 ids. Owners, parts
and locks are byte-identical.

The six won't-do units are parts: `backlog-06:iana`, `demos-07:iana`, `visuals-13:light`,
`gap-scale-longevity-06:shared-loop`, `backlog-28:cold-scatter` and `gap-competitive-06:registry`.

**M5's gates** (exit 0 each):

```
$ npm run check:package
      Tests  23 passed | 4 expected fail (27)
check-consumers: passed (report: …/packages/snaplot/test-results/consumers.json)
$ npm run check:size
| createLegendTable (as createLegendTablePlugin until it exists) | 5.6 | 2.4 | 2.4 | 2.0% | ok |
$ npm run check:api
check-api: dist/ matches the golden declarations (core.d.ts, index.d.ts, react.d.ts, solid.d.ts).
```

**Metrics** (`node scripts/overhaul/metrics.mjs`, exit 0). Unchanged, because M3b touches no library source
(`git diff overhaul...HEAD -- packages/snaplot/src` is empty):
- 69 files, 20,236 physical and 15,381 code lines;
- 169 option leaves; 24 handle members; 13 events; 4 legend implementations.

The `testFiles` field reads 44.

**Not applicable:**
- `test:visual --against` and `check-visual-diffs`: M3a has not merged;
- `bench:ab`: M3b touches no `src/**`.

**Bench lock.** Early in this fix, several short Playwright runs did not check the bench lock first. At
least one started while M4's lock was held: the 10 s pre-change trace-check run at about 10:40 (the old
script did not wait). Every Playwright run from the gates on waited for the lock, through trace-check or a
wait loop.

## Visual-ledger rows

None. No library code changed. The harness page is test-only and its screenshots are never committed.

## Requests for integrator

1. **M1 regression: annotations and plugins given at creation are not drawn until a later repaint.** Please
   land the fix as an integrator-request commit (or in M2) rather than leave it to M8.
   - **Symptom.** In a real browser, `createChart(el, { …, referenceLines: [{ axis: 'y', value: 50 }] })` shows
     no line until something else repaints. User plugins' draw hooks behave the same way. In Chromium, the
     pixel at the line is the background, and it turns the line's red after `chart.redraw()`.
   - **Cause.** The controller constructs the engine, which paints synchronously, before it installs the
     annotation and user plugins through `engine.use()`, and `use()` schedules nothing. The first
     ResizeObserver delivery used to repaint and hide this.
   - **Bisect** (over `git archive` extractions, with the two tests below as plain `it`):
     - `ovh-m0-done` and `af4c8c2` draw the line;
     - `e67aa2a` breaks it;
     - `4fb045e` fixes it again;
     - `5106dd4` ("skip the relayout when a resize leaves the layout current") breaks it again.
   - **Recorded** as `it.fails('[gap-annotations-extensibility-06:mount] …')` (2 tests in
     `test/ledger/m8-plugins.test.ts`).
   - **Suggested fix** (about 2 lines): mark the grid, data and overlay layers dirty in `ChartCore.use()`, or
     call `this.engine.redraw()` at the end of the `Controller` constructor. The same commit flips the two
     markers: they will pass unexpectedly.
   - **Who.** `src/core/**` belongs to M2 in this wave. M3b did not touch library code.
2. **Merging M3a and M3b.**
   - **Scripts.** `packages/snaplot/package.json` will conflict textually with M3a's `test:visual`. Keep every
     script; M3b's are `test:browser`, `ledger` and `trace-check`, after `test:watch`.
   - **Re-run after both merge.** Run `npm run ledger` and `npm run trace-check`. trace-check then also runs
     M3a's `test:visual --project geometry` and matches its 15 entries (simulated above: OK).
   - **Two Playwright configs.** M3a asks for `test:browser` to become a `browser` project in its
     `packages/snaplot/playwright.config.ts`. I kept a separate config (`test/browser/playwright.config.ts`)
     because that file is M3a's. Merging them later is optional. Neither config's `testMatch` overlaps the
     other's files.
3. **Outside M3b's Owns list:** `scripts/overhaul/vitest-ledger-reporter.mjs` (31 lines). vitest's JSON
   reporter reports a failed `it.fails` as passed. trace-check needs this reporter to tell a marker from a
   lock. Please record it as M3b's (or the integrator's).
4. **CI (M5's `ci.yml`).**
   - **Browser job.** Its comment expects "Chromium in full, plus the WebKit and Firefox smoke subset (D25,
     gap-environments-08)". `test:browser` is Chromium only (Known gaps). Running the specs in all three
     browsers would double-run markers. Add `webkit` and `firefox` projects over a passing-only smoke spec,
     and keep markers in Chromium.
   - **Ledger job.** It runs `npm run trace-check`. That now needs a build (it runs `npm run build` before
     check-consumers) and Chromium. It takes about 20 s, or longer once M3a's geometry suite is in.
     `--skip <suite>` exists for a job that cannot run a suite, but the job then verifies less.
5. **Handoff convention for gate locks** (`docs/handoff/README.md`, M0-owned). Please add: "List every id this
   milestone closes, with part suffixes, in the Summary's `Closes:` paragraph or in a table right after a
   `Closes …:` line. trace-check reads only that block." The merged handoffs `m0.md`, `m1.md` and `m5.md`
   already do this.
6. **Merge after M2 (plan order).** M2's planned `it.fails('[visuals-09] …')` will sit beside this branch's
   `[render-13][visuals-09]` marker in `m10-axes.test.ts`. Both are M10's to flip.
   - trace-check skips the owner check for files without a milestone prefix (M2's `engine-*.test.ts`).
   - M2 does not touch `test/{ledger,browser}`.
7. **For M7 and M8 (renames and flips).**
   - **Today's API in the tests.** The ledger and browser specs use `getAxis`, `getLayout`, `setViewport`,
     `setSelection`, `getCursorSnapshot` and `getLegendItems`. M7 owns `test/ledger/**` for renames.
   - **One file for the browser specs.** The browser geometry helpers are all in `test/browser/harness.ts`.
   - **Final names behind casts.** Some tests already use final names, through casts: `setOptions`, the
     `viewport`, `legend`, `locale` and `timeZone` options, and `createLegendTable` and `getState().series`
     through a namespace import. They fail today because the feature is missing. The owner makes them pass
     by implementing the feature, not by editing the expectation.
   - **M8 flips `[frameworks-07]`** in `m13-adapters.test.ts` in the commit that deletes `useChartGroup`. The
     marker turns red then.
   - **`--milestone M<N>` now fails on markers left in M<N>'s own files.** Each milestone flips its own
     markers, or moves one to a later owner's file and says so. `--partial` is for a timeboxed milestone.
8. **`trace-ids.json` is now authoritative.**
   - If M11's stretch (the shared rAF loop) lands, change `gap-scale-longevity-06:shared-loop` from
     `wont-do` to `tracked`, give it the owner `M11`, and flip its `wont-do.test.ts` marker into an M11 test.
   - Regenerate the file only with `--force`; it overwrites hand edits.
9. **M1 Requests 1 (lefthook typecheck on test-only commits)** was closed by M5's lefthook change. I saw the
   hook type-check every commit in this fix.

## Known gaps

- **Counters that do not exist yet.** Four perf guards fail today only because their D31 counter is missing:
  - `[perf:hover-visits]` (`hitVisits`, M12a);
  - `[perf:density-cache]` (`densityRebins`, M11);
  - `[perf:pan-no-scan]` (`rangeScanPoints`, M10);
  - `[perf:x-validated-once]` (`xValidations`, M7).

  The owner must add the counter and the behaviour together. A counter that only reports a passing value
  would make the guard vacuous.
- **Features that do not exist yet.** Several markers fail because the final feature is missing, not
  because of a measured wrong value:
  - M12b's legend and legend-table tests (including both `[dxtrial-06]` markers);
  - `[gap-environments-03]` (the handle still has `resize`);
  - `[frameworks-05]` (`setOptions`);
  - `timeZone`, `locale` and the `[dataapi-16]` throw.

  Each states the final behaviour of plan §4–§5.
- **`[perf:theme-coalesce]` counts computed-style reads, not resolves.** It is exact, because it is
  calibrated against one resolution. M11 may swap it for a resolve counter when it adds the coalesced
  observer.
- **Guards that pass today.** `[perf:visible-range]`, `[perf:overlay-only]`, `[perf:label-nodes-reused]` and
  `[perf:theme-coalesce]` already hold. M9a's "flip if it passes" step for `[perf:visible-range]` is
  therefore a no-op.
- **Chromium only.** G9's WebKit and Firefox smoke subset is not here:
  - those browsers are not installed locally, and downloading them is outside this milestone;
  - the touch specs emulate a Pixel 7 in Chromium with CDP touch;
  - real-device checks stay with M17's human steps;
  - see Requests 4 for CI.
- **Only required findings are ported.** Non-required (medium and low judgement) findings are not in the
  ledger, as the brief scopes; their repros remain in `evidence/repro/`.

## Data notes

None. No downloads or datasets. Playwright and vitest reports go to `packages/snaplot/test-results/`, which is
gitignored. The `ovh-m0-done` extraction, the per-commit extractions and the M3a simulation are in the
session scratchpad (`m3b-fix/`).

## Human steps

None for this milestone. Real-device touch and scroll checks remain in M17's list.

## Merge onto `overhaul` (integrator)

- **Rebase.** Onto `c1778b9` (`ovh-m2-done`; M3a, M4, M6a, M6b, M1b and M2 had merged). Only
  `packages/snaplot/package.json` changed on both sides, and git merged its scripts block cleanly: every
  script is kept (M3a's `test:visual`, M3b's `test:browser`, `ledger` and `trace-check`). The lockfile is
  `overhaul`'s, unchanged by this branch.
- **The two `[gap-annotations-extensibility-06:mount]` markers** in `test/ledger/m8-plugins.test.ts` passed
  unexpectedly after the rebase: M1b (`4a042b7`) fixed the regression in Request 1. With that fix reverted
  in the working tree (temporarily), both fail, and so do M1b's two locks in `m1-mount.test.ts`; with it,
  all pass. `fd8f306` flips both markers to plain tests. M2 changed no marker's state.
- **Per-commit state.** The history was not rewritten, so each commit from `a481073` to `a8c107a` still has
  those two `it.fails`. On `overhaul` they fail vitest there with exactly those 2 unexpected passes
  (checked on `git archive` extractions of every commit; everything else as expected). A bisect that runs
  the whole suite should skip that range or exclude `m8-plugins.test.ts`.
- **Gates at `fd8f306`** (worktree): `npm run verify` exit 0 (603 passed, 141 expected fail, 744);
  `test:browser` 73 passed (64 expected failures, 0 unexpected); `npm run ledger` 224 markers (vitest 141,
  consumers 4, browser 64, visual 15; 175 distinct ids), each suite's executed expected failures equal;
  `trace-check` OK (merged M0, M1, M1b, M2, M3a, M4, M5, M6a, M6b; 21 of 21 closed units locked);
  `--milestone M3b` OK; `--coverage` 0 of 192 uncovered; `trace-ids.mjs --check` OK; `test:visual --against
  c1778b9` exact, then `check-visual-diffs --milestone M3b`: 137 shots, 0 changed, geometry 555 checks, 0
  failing; `check-visual-ledger` OK; `check:package`, `check:size`, `check:api`, `build:site` and
  `metrics.mjs` exit 0.
