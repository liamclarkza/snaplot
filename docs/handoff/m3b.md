# M3b: Expected-failure ledger, browser specs and trace ids

- **Branch:** `ovh/m3b-ledger` · **Worktree:** `.claude/worktrees/m3b` · **Base:** `16547da` (`overhaul` at
  start, = `ovh-m1-done` plus the M1 handoff commit)
- **Status:** complete

## Summary

- **Browser specs** (`packages/snaplot/test/browser/`, `npm run test:browser`). A Vite-served harness page
  builds charts through the public API. Every geometry helper (`plotRect`, `toClient`, `domain`, `tooltip`,
  `pixel`, `counters`) lives in `harness.ts`, so when M8 removes `getLayout`/`getAxis` only that file changes.
  Playwright drives real mouse, keyboard and CDP touch input, axe, print and forced-colours emulation, and
  compositor screenshots. The config honours `PORT` (default 5363, EXECUTION rule 6) and writes
  `packages/snaplot/test-results/browser.json`. The specs, named by owning milestone:
  - `m12a-interaction` (hover model, brush, box zoom, slow clicks, wheel/keys, dialog, CSS transforms);
  - `m12a-touch` (CDP touch, Pixel 7 emulation);
  - `m12a-a11y` (axe and D20);
  - `m12a-tooltip-rows`;
  - `m12a-hover-sweep` (the 12×8 grid from `evidence/uisite/herosweep.mjs`; today 57 of 96 probes miss);
  - `m11-lifecycle` (30-step resize screencast, first frame, print emulation);
  - `m11-marks` (every finite datum paints);
  - `m11-colour` (colour parsing, fills, ramps, surfaces, read from canvas pixels);
  - `m10-tooltip-format` (the dxtrial values `20.4%`, `-0.8`, `4.84%`, `718 ms`);
  - `m10-axes` (tabular digits, a 24 px minimum font, forced colours).
- **Unit ledger** (`packages/snaplot/test/ledger/m<N>-<area>.test.ts`). Each file ports the audit repros
  (`evidence/repro/**`) by inverting them into `it.fails('[id] <expected behaviour>')`. The files use
  `createChart`, the shared fakes and `debug()` only, plus final option names where M7/M8 introduce them,
  reached through casts. The files:
  - `m7-ingest` and `m7-types`; `m7-types` compiles the typed-rows snippets once with the TypeScript API, from
    memory;
  - `m8-update`, `m8-state`, `m8-plugins`;
  - `m10-axes`, `m10-format`, `m10-annotations`;
  - `m11-surface`, `m11-marks`, `m11-bundle` (esbuild over the public entry);
  - `m12b-legend`; `m13-adapters` (React 19 and Solid on the real core);
  - `wont-do` and `wont-do-bundle` (the §6 won't-do parts, expected failures through the release).

  Every marker was first run as a plain `it()` (or read from the Playwright JSON `errors`) and checked to fail
  for the reported reason. Cases that passed today became controls or locks, not markers.
- **Perf guards** (`packages/snaplot/test/perf-guards.test.ts`): the 21 §3.4 call-count guards, titled
  `[perf:<guard>]`, with owners in `trace-ids.json` (`perfGuards`).
  - Passing today: `visible-range`, `overlay-only`, `label-nodes-reused`, `theme-coalesce`. So M9a has
    nothing to flip for `[perf:visible-range]`.
  - Every other guard is an `it.fails`. The arch-01 plugin guard stays `[arch-01]` in `test/debug-counters.test.ts`.
  - Four guards read a D31 counter that does not exist yet, as an optional field. The owner adds it with the
    path: `hitVisits` (M12a), `densityRebins` (M11), `rangeScanPoints` (M10), `xValidations` (M7).
- **`scripts/overhaul/trace-ids.mjs` → `trace-ids.json`.** Generated from `_results.json`, every milestone's
  Closes list and the §6 root-cause and won't-do tables: 192 required ids, 212 trace units (ids and parts),
  162 test locks and 50 gate locks. Each id records severity, verdict, `required`, owners, parts, status,
  root causes, its lock (`{kind:'test', title:'[id]'}` or `{kind:'gate', name}`) and the §14 lock note.
  - The gate-locked ids are packaging, bench, metrics, palettes, docs, site and demos. The table is `LOCKS`
    in the script.
  - The JSON is authoritative from here on. Generating refuses to overwrite it without `--force`; `--check`
    compares; `--render` prints the per-milestone, per-root-cause and lock views.
- **`scripts/overhaul/trace-check.mjs`** reads `trace-ids.json`, the ledger and the test reports. It runs both
  suites unless given `--no-run`. Its checks:
  1. every closed unit (all owners tagged `ovh-<m>-done`) has its lock;
  2. no closed unit remains in the ledger;
  3. ledger hygiene: known ids, and each marker sits in a file of a milestone that owns it;
  4. every marker ran as an expected failure.

  Modes:
  - `--milestone M<N>`: checks that milestone's units as if it had merged;
  - `--coverage`: lists required units with no marker, gate lock, passing test lock or M0–M2 closer;
  - `--release`: the ledger may hold only won't-do parts.

  Conventions:
  - **Test lock:** a passing test whose own title contains `[id]` or `[id:part]`.
  - **Gate lock:** recorded when every owning milestone's handoff mentions the id (its Closes list).
  - **Ad-hoc parts** (`[visuals-01:x]`, `[gap-annotations-extensibility-06:mount]`) belong to their base
    id's owners and are printed as notes.
- **`scripts/overhaul/vitest-ledger-reporter.mjs`.** vitest's JSON reporter reports an `it.fails` that failed
  as "passed", so it cannot tell a marker from a lock. This reporter records `options.fails`.
- **`scripts/ledger.mjs`.** It scans `packages/snaplot/{src,test}/**` and `site/tests/**`, ignoring comments,
  and prints ids, file:line and title. `--json` gives one entry per marker; `--allow <ids>` fails on any
  other id; a marker without an `[id]` fails.
- **Workspace scripts** in `packages/snaplot/package.json`: `test:browser`, `ledger`, `trace-check`. The root
  delegations already existed (M0).

Commits (oldest first):

| SHA | Subject |
|---|---|
| `8f80e81` | test(browser): interaction, touch, a11y, lifecycle, marks and tooltip specs |
| `a7641cc` | test(browser): colour, fill and label-measurement specs |
| `2976f51` | test: record known defects as expected failures with finding ids |
| `9d9d91d` | test(perf): call-count guards for the hot paths |
| `4d361a4` | chore(scripts): ledger report and finding traceability |
| (tip) | docs(handoff): record the M3b ledger, trace ids and gates |

The brief's commit 1 is split in two (`8f80e81`, `a7641cc`).

Closes: none. This milestone records the ledger that later milestones flip.

Ledger markers by owning milestone (`npm run ledger`, 203 markers, 173 distinct ids):

| Owner | Markers | Files |
|---|---:|---|
| M7 | 24 | `m7-ingest`, `m7-types` |
| M8 | 27 (+1 `[arch-01]` in `debug-counters`) | `m8-update`, `m8-state`, `m8-plugins` |
| M10 | 44 | `m10-axes`, `m10-format`, `m10-annotations`, browser `m10-tooltip-format`, `m10-axes` |
| M11 | 37 | `m11-surface`, `m11-marks`, `m11-bundle`, browser `m11-lifecycle`, `m11-marks`, `m11-colour` |
| M12a | 35 | browser `m12a-*` |
| M12b | 8 | `m12b-legend` |
| M13 | 4 | `m13-adapters` |
| perf guards | 18 | `perf-guards` (owners per guard) |
| won't do | 5 | `wont-do`, `wont-do-bundle` (6 part ids) |

## Gates

All at `4d361a4` (the last commit before this file), in the worktree.

**`npm run verify`** (exit 0):

```
> biome ci . && npm run typecheck && npm test && npm run build
Checked 184 files in 147ms. No fixes applied.
> snaplot@0.12.0 typecheck
> tsc -p tsconfig.json --noEmit && tsc -p tsconfig.test.json
> typecheck            (bench)
> tsc --noEmit
> snaplot@0.12.0 test
> vitest run
 Test Files  63 passed (63)
      Tests  529 passed | 140 expected fail (669)
   Duration  3.37s (transform 4.52s, setup 0ms, import 8.39s, tests 7.97s, environment 12.93s)
> snaplot@0.12.0 build
> vite build && vite build --config vite.ssr.config.ts
[vite:dts] Declaration files built in 1226ms.
✓ built in 1.63s
✓ built in 390ms
```

Test total: 520 (M1) + 149 new = 669. The new tests are 139 `it.fails` and 10 passing tests:
- 2 type controls, 3 behaviour controls;
- the `[frameworks-07]` `<Activity>` lock;
- the 4 passing perf guards.

The one pre-existing expected failure is M1's `[arch-01]`.

**Per-commit proof** (EXECUTION rule 4 does not require it at 5 commits; run anyway). Every pick
fast-forwarded, so no SHA changed:

```
$ git rebase -x 'git diff --quiet HEAD~1 -- package-lock.json || npm ci; npm test' overhaul
Rebasing (2/10)Executing: git diff --quiet HEAD~1 -- package-lock.json || npm ci; npm test
      Tests  519 passed | 1 expected fail (520)        # 8f80e81
Rebasing (4/10)Executing: git diff --quiet HEAD~1 -- package-lock.json || npm ci; npm test
      Tests  519 passed | 1 expected fail (520)        # a7641cc
Rebasing (6/10)Executing: git diff --quiet HEAD~1 -- package-lock.json || npm ci; npm test
      Tests  525 passed | 122 expected fail (647)      # 2976f51
Rebasing (8/10)Executing: git diff --quiet HEAD~1 -- package-lock.json || npm ci; npm test
      Tests  529 passed | 140 expected fail (669)      # 9d9d91d
Rebasing (10/10)Executing: git diff --quiet HEAD~1 -- package-lock.json || npm ci; npm test
      Tests  529 passed | 140 expected fail (669)      # 4d361a4
Successfully rebased and updated refs/heads/ovh/m3b-ledger.
rebase exit=0
```

(`#` annotations added; the lockfile never changed, so `npm ci` never ran.)

**`npm run test:browser`** (exit 0; run 5 times in a row while developing, green each time, 6–7 s):

```
  ✓  70 [chromium] › test/browser/m12a-touch.spec.ts:95:3 › touch › a swipe beside the chart scrolls the page (control) (642ms)
  ✘  69 [chromium] › test/browser/m12a-touch.spec.ts:82:3 › touch › [interact-06] a vertical swipe on a line chart scrolls the page (649ms)
  ✓  72 [chromium] › test/browser/m12a-touch.spec.ts:139:3 › touch › a two-finger pinch zooms X (293ms)
  ✘  68 [chromium] › test/browser/m12a-touch.spec.ts:70:3 › touch › [interact-05] a tap keeps the tooltip after the finger lifts (853ms)

  72 passed (6.0s)
```

72 tests: 63 `test.fail` markers (shown ✘, counted as passed because they failed as expected) and 9 passing
tests. The passing ones are controls and locks:
- the M1 resize screencast, first frame and print ink;
- pinch zoom, quick click, the swipe beside the chart, every dense-line datum, -0.8 grouped bars, axe.

**`npm run ledger`** (≥ 80 entries required):

```
perf:group-offscreen gap-scale-longevity-07  packages/snaplot/test/perf-guards.test.ts:420        [perf:group-offscreen][gap-scale-longevity-07] a 20-member group with 18 offscreen paints 2 overlays per move
perf:offscreen                               packages/snaplot/test/perf-guards.test.ts:438        [perf:offscreen] an offscreen chart paints 0 frames

203 expected-failure markers (vitest 140, playwright 63), 173 distinct ids
```

**Markers executed = ledger length.** The ledger length is `npm run --silent ledger -- --json`; `--silent`
keeps npm's banner out of the JSON. It equals the expected failures the runners report: vitest's summary
says `140 expected fail`, and the Playwright JSON has 63 tests with `expectedStatus: 'failed'`, all
`status: 'expected'`.

```
ledger --json length 203
vitest: Tests  529 passed | 140 expected fail (669)
playwright: { total: 72, expectedFail: 63, notExpected: 0 }
```

trace-check repeats this per marker, by file and title.

**`npm run trace-check -- --coverage`** (0 of 192 required):

```
coverage: 0 of 192 required ids uncovered (units covered by a ledger marker 154, a gate lock 50, a passing test lock 8, closed in M0–M2 0)
ledger: 203 markers (vitest 140, playwright 63); executed expected failures: vitest 140, playwright 63
```

The 8 units with a passing lock and no marker are the M1 locks whose co-owner has work left:
- dataapi-01, dxtrial-01, frameworks-06 and interact-01 (with M8);
- dxtrial-02 (with M10); gap-scale-longevity-01 (with M11);
- gap-environments-01 (closed);
- frameworks-07, locked by the passing `<Activity>` test.

visuals-01 has the M10 marker `[visuals-01:x]` (M1 Requests 4).

**`node scripts/overhaul/trace-check.mjs --milestone M3b`** (M3b closes nothing, so it checks ledger hygiene
and executed counts):

```
trace-check: M3b (as merged)
  closed units checked: 0, locked: 0
  ledger: 203 markers (vitest 140, playwright 63); executed expected failures: vitest 140, playwright 63
  note: ad-hoc part [visuals-01:x] at packages/snaplot/test/ledger/m10-format.test.ts:40 (owners of visuals-01)
  note: ad-hoc part [gap-annotations-extensibility-06:mount] at packages/snaplot/test/ledger/m8-plugins.test.ts:60 (owners of gap-annotations-extensibility-06)
  note: ad-hoc part [gap-annotations-extensibility-06:mount] at packages/snaplot/test/ledger/m8-plugins.test.ts:75 (owners of gap-annotations-extensibility-06)
OK
```

**`node scripts/overhaul/trace-check.mjs`** (all merged milestones: M0, M1):

```
trace-check: merged: M0, M1
  closed units checked: 4, locked: 4
  ledger: 203 markers (vitest 140, playwright 63); executed expected failures: vitest 140, playwright 63
OK
```

The 4 closed required ids: repo-02, repo-03 and demos-17 (gate locks in `m0.md`), and gap-environments-01
(passing `[gap-environments-01]` tests).

**`node scripts/overhaul/trace-ids.mjs --check`**: `trace-ids.json matches a fresh generation`. `--render`
prints the per-milestone counts of required units:

```
M0 (4) M1 (8) M4 (2) M5 (9) M6a (7) M6b (1) M7 (20) M8 (36) M9a (1) M9b (1) M10 (38) M11 (43) M12a (24) M12b (9) M13 (11) M15a (3) M15b (6) M16a (10) M16c (1) won't do (6)
required: 192 (open 188, closed 4, won't do 0)
```

The six won't-do units are parts: `backlog-06:iana`, `demos-07:iana`, `visuals-13:light`,
`gap-scale-longevity-06:shared-loop`, `backlog-28:cold-scatter` and `gap-competitive-06:registry`.

**Metrics** (`node scripts/overhaul/metrics.mjs`, exit 0): unchanged from M1, because M3b touches no library
source:
- 69 files, 20,236 physical and 15,381 code lines;
- largest file `core/Chart.ts` at 4,525;
- exports 35/35/12/13; 169 option leaves; 24 handle members; 13 events; 4 legend implementations.

The metrics `testFiles` field reads 44.

**Not applicable:**
- `test:visual` and `check-visual-diffs`: M3a has not merged.
- `bench:ab`: M3b touches no `src/**`.
- `check:package`, `check:size`, `check:api`: from M5.

## Visual-ledger rows

None. No library code changed; the harness page is test-only and takes no screenshots that are committed.

## Requests for integrator

1. **M1 regression: annotations and plugins given at creation are not drawn until a later repaint.**
   - **Symptom.** In a real browser, `createChart(el, { …, referenceLines: [{ axis: 'y', value: 50 }] })` shows
     no line until something else repaints. User plugins' draw hooks behave the same way. The same check
     in Chromium returns the background pixel at the line, and the line's red after `chart.redraw()`.
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
     call `this.engine.redraw()` at the end of the `Controller` constructor. Then flip the two markers.
   - **Who.** `src/core/**` belongs to M2 in this wave, so this needs an integrator-request commit or M2. M3b
     did not touch library code.
2. **`packages/snaplot/package.json` scripts** may conflict textually with M3a (`test:visual`) and M5
   (`check:*`). Keep every script. Mine are `test:browser`, `ledger` and `trace-check`, after `test:watch`.
3. **CI (M5's `ci.yml`).**
   - The browser job runs `npm run test:browser` after `npx playwright install chromium`, and should upload
     `packages/snaplot/test-results/browser.json`.
   - `trace-check` needs both suites, or `--no-browser`. It takes about 15 s; it runs vitest through
     `scripts/overhaul/vitest-ledger-reporter.mjs`.
4. **Handoff convention for gate locks.** trace-check counts a gate lock as recorded when every owning
   milestone's handoff mentions the id. Please add one line to `docs/handoff/README.md` (M0-owned): "List
   every id this milestone closes (with part suffixes) in Summary."
5. **Merge after M2 (plan order).** M2's planned `it.fails('[visuals-09] …')` will sit beside this branch's
   `[render-13][visuals-09]` marker in `m10-axes.test.ts`. Both are M10's to flip.
   - trace-check skips the owner check for files without a milestone prefix (M2's `engine-*.test.ts`).
   - M2 does not touch `test/{ledger,browser}`.
6. **For M7 and M8 (renames).**
   - **Today's API in the tests.** The ledger and browser specs use `getAxis`, `getLayout`, `setViewport`,
     `setSelection`, `getCursorSnapshot` and `getLegendItems`. M7 owns `test/ledger/**` for renames.
   - **One file for the browser specs.** The browser geometry helpers are all in `test/browser/harness.ts`.
   - **Final names behind casts.** Some tests already use final names, through casts: `setOptions`, the
     `viewport`, `legend`, `locale` and `timeZone` options, and `createLegendTable` and `getState().series`
     through a namespace import. They fail today because the feature is missing. The owner makes them pass
     by implementing the feature, not by editing the expectation.
7. **`trace-ids.json` is now authoritative.**
   - If M11's stretch (the shared rAF loop) lands, move `gap-scale-longevity-06:shared-loop` to closed in
     the JSON, give it an owner, and flip its `wont-do.test.ts` marker into an M11 test.
   - Regenerate the file only with `--force`; it overwrites hand edits.
8. **M1 Requests 1 is still open.** Lefthook skips `typecheck` for test-only commits. I ran `npm run typecheck`
   by hand before every commit; it is also inside `verify`.

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
  - M12b's legend and legend-table tests;
  - `[gap-environments-03]` (the handle still has `resize`);
  - `[frameworks-05]` (`setOptions`);
  - `timeZone`, `locale` and the `[dataapi-16]` throw.

  Each states the final behaviour of plan §4–§5.
- **frameworks-07** is locked by a passing test of the final pattern: a module-scope group under `<Activity>`.
  The audit's crash needs `useChartGroup`, which M8 deletes. Conformance #16 (M13) remains its full lock.
- **Chromium only.** The touch specs emulate a Pixel 7 in Chromium with CDP touch; Firefox and WebKit are
  not installed. Real-device checks stay with M17's human steps.
- **`[perf:theme-coalesce]` is loose.** It passes today with at most 4 computed-style reads per chart after
  100 class toggles. M11 should tighten it to a resolve counter when it adds the coalesced observer.
- **Guards that pass today.** `[perf:visible-range]`, `[perf:overlay-only]` and `[perf:label-nodes-reused]`
  already hold. M9a's "flip if it passes" step for `[perf:visible-range]` is therefore a no-op.
- **Only required findings are ported.** Non-required (medium and low judgement) findings are not in the
  ledger, as the brief scopes; their repros remain in `evidence/repro/`.

## Data notes

None. No downloads or datasets. Playwright and vitest reports go to `packages/snaplot/test-results/`, which is
gitignored. The bisect extractions and inspection copies lived in the session scratchpad and are deleted.

## Human steps

None for this milestone. Real-device touch and scroll checks remain in M17's list.
