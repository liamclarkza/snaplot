# M9a: Engine split: file moves only

- **Branch:** `ovh/m9a-engine-moves` · **Worktree:** `.claude/worktrees/m9a` · **Base:** `926d091` (`overhaul` at start = `ovh-m8-done` = `ovh-api-frozen`)
- **Status:** complete

## Summary

- **The §3.1 `engine/` layout, moved verbatim.** `src/core/**`, `src/{data,scales,config,plugins,renderers,interaction}/**`
  now live under `src/engine/**`, and `interaction/TooltipManager.ts` is `dom/tooltip.ts`. The 4,343-line
  `core/Chart.ts` is `engine/Engine.ts` (1,100 lines), the composition root, and its logic is in one module per
  concern, extracted in the brief's order: `ranging.ts`, `viewport.ts`, `selection.ts`, `cursor.ts` (both snapshot
  paths as they were), `highlight.ts`, `hit.ts`, `axes/{ticks,render,labels}.ts`, `layout.ts`, then, to get the
  root under the cap, `debug.ts`, `marks/index.ts` (the series pass), `render/overlay.ts` (the overlay pass) and
  `interaction/actions.ts` (the gesture action wiring).
- **The only edits are mechanical.** A `ChartCore` method becomes a function of the engine,
  `export function m(engine: ChartCore, …)`, whose body is the method body with `this` → `engine`; a call
  `this.m(a)` becomes `m(this, a)`, and `engine.m(a)` in a module `m(engine, a)`. A method that never reads the
  engine takes no engine parameter. The engine methods the public layer and the tests call (`setAxis`, `applyViewport`,
  `getSelection`, `setCursorDataX`, `getCursorSnapshot`, `setHighlight`, `setPlotInsets`, `debugSnapshot`, …:
  15 in all) stay on `ChartCore` as one-line delegates, so the public layer, the tests and the
  `vi.spyOn(ChartCore.prototype, …)` guards are untouched; calls of those go through the delegate exactly as
  before. The fields the modules read lose their TypeScript `private` (compile-time only; the class is in no
  public declaration). Beyond that: one rename (`renderSegments` → `toRenderSegments`, whose old name a local in
  `renderAllSeries` shadows once it is a free function), `resolveAxisCornerCollisions` gains `export` (it moved to
  `axes/labels.ts`), the two annotation plugins are one file, `engine/annotations.ts`, and comments that named
  the old modules name the new ones.
- **How the moves were made and checked.** A TypeScript-AST codemod did each extraction from a spec (method list,
  delegates), and a separate verifier compares every declaration of `packages/snaplot/src` (tests excluded) at a
  commit with its parent, as parse-tree token streams with formatting and comments ignored, modulo exactly the
  rewrites above: **0 differences in every commit and over the whole range** (Gates). It was checked to report a
  one-token edit. Both tools, the per-step specs and the move maps are kept (gitignored) in
  `/Users/liam/Projects/snaplot/.claude/review/m9a-impl-tools/`:
  `node verify-moves.mjs <repo> <base> <head> [--rename renderSegments=toRenderSegments]`.
- **Tests moved with their code** (`core/*.test.ts` → `engine/{layout,render/scheduler,interaction/bus}.test.ts`,
  `renderers/*.test.ts` → `engine/marks/*.test.ts` and `engine/axes/*.test.ts`, `HitTester.test.ts` →
  `engine/hit.test.ts`, `GestureManager.test.ts` → `engine/interaction/gestures.test.ts`, `TooltipManager.test.ts`
  → `dom/tooltip.test.ts`, …). The `axisTickValues` and `thinTicks` tests (with the `[visuals-09]` marker) moved
  to `engine/axes/ticks.test.ts` with a copy of their scale helper; the DOM label test is
  `engine/axes/labels.test.ts`. Test totals are unchanged: 913 passed, 80 expected fail (993), one more test file.
- **`[perf:visible-range]` was not flipped:** it was already a passing test (M3b's handoff), and still passes; it is
  M9a's one closed unit in `trace-check --milestone M9a` (locked).
- **`check-architecture` has the file-size rule** (warn mode, cap 1,200 physical lines, counted as `metrics.mjs`
  counts them; M9b lowers it to 900 and makes it an error). It named `core/Chart.ts` (4,343) at the start and names
  no file now. The moves also put the canvas and frame-loop observers in the files P2 allows
  (`engine/render/{surface,scheduler}.ts`) and the series pass's type switch in `engine/marks/index.ts`:
  145 → 136 violations, all warn mode (by rule below).
- **Exit criteria:** zero changed visual fixtures against `926d091`; the golden `api/{index,react,solid}.d.ts`
  byte-identical to the build; the ledger unchanged (160 markers, 120 ids); no source file over 1,200 lines (largest
  `public/chart.ts` at 1,191, then `engine/spec.ts` 1,152 and `engine/Engine.ts` 1,100); `bench:ab --set M9a`
  within 1.2× (PASS; most desktop rounds noisy, Gates).

Module sizes (physical lines): `Engine.ts` 1,100, `hit.ts` 766 (HitTester 482 + the hit pipeline), `ranging.ts`
630, `viewport.ts` 582, `cursor.ts` 457, `layout.ts` 430 (computeLayout + the cached layout), `render/overlay.ts`
420, `marks/index.ts` 418, `axes/render.ts` 363, `interaction/actions.ts` 254, `annotations.ts` 245,
`selection.ts` 201, `debug.ts` 158, `axes/labels.ts` 141, `axes/ticks.ts` 117, `highlight.ts` 68; `dom/tooltip.ts`
295.

Commits (oldest first):

| SHA | Subject |
|---|---|
| `51ae489` | chore(scripts): report source files over 1,200 lines in check-architecture |
| `d40561c` | refactor(engine): move the engine sources under src/engine |
| `86cfe3b` | refactor(engine): extract ranging |
| `715fcb9` | refactor(engine): extract viewport |
| `58c1a6d` | refactor(engine): extract selection |
| `583cd26` | refactor(engine): extract cursor and snapshot |
| `078db2c` | refactor(engine): extract highlight |
| `3ae0a29` | refactor(engine): extract hit |
| `e6211b9` | refactor(engine): extract axes ticks, render and labels |
| `89a29d9` | refactor(engine): extract layout |
| `ff48374` | refactor(engine): extract the debug counters |
| `5445776` | refactor(engine): extract the series pass |
| `c6db05b` | refactor(engine): extract the overlay pass |
| `f6a4af8` | refactor(engine): extract the gesture action wiring |
| `e226141` | refactor(engine): Engine.ts as the composition root |
| `eb0b418` | refactor(engine): move the tooltip to dom/ |
| `6ce17ee` | docs(engine): say which ChartCore members the engine modules use |

Closes: arch-14 (with M9b, its second owner; the gate lock, "largest file ≤ 850 (cap 900); check-architecture;
the M9b probe snapshot", is M9b's to meet; `trace-check` notes "[arch-14] also waits on M9b").

## Gates

Every gate ran at `eb0b418` with a clean tree. `6ce17ee` after it rewords the class comment of
`engine/Engine.ts` only: for it, `verify-moves` (0 problems), `npx vitest run` (`Tests 913 passed | 80 expected
fail (993)`) and the pre-commit biome and typecheck ran again; the handoff commit adds only this file. Logs are in
`/private/tmp/claude-501/-Users-liam-Projects-snaplot/76647906-acb8-4a29-8fd6-6a20ecda8e45/scratchpad/m9a/`
(scratchpad, may disappear).

**`npm run verify`** (exit 0):

```
> biome ci . && npm run typecheck && npm test && npm run build
Checked 385 files in 343ms. No fixes applied.
> tsc -p tsconfig.json --noEmit && tsc -p tsconfig.test.json
> tsc --noEmit
 Test Files  91 passed (91)
      Tests  913 passed | 80 expected fail (993)
ℹ pass 47
ℹ fail 0
 Test Files  11 passed (11)
      Tests  77 passed | 1 skipped (78)
[vite:dts] Declaration files built in 3175ms.
✓ built in 4.03s
✓ built in 1.09s
```

At the base `926d091` the same run gave `Test Files 90 passed (90)` and `Tests 913 passed | 80 expected fail (993)`.

**Per-commit proof** (EXECUTION rule 4: a serial milestone with 16 commits), in this worktree. Every pick
fast-forwarded and no SHA changed (`rebase: fast-forward` for each in the reflog); the lockfile never changes, so
`npm ci` never ran. Each block is one commit's `npm test` (snaplot, bench, site):

```
$ git rebase -x 'while [ -d /Users/liam/Projects/snaplot/.claude/bench.lock ]; do sleep 5; done; git diff --quiet HEAD~1 -- package-lock.json || npm ci; echo "== $(git log --oneline -1)"; npm test 2>&1 | grep -E "Tests |Test Files|pass |fail |Unhandled|ERR" ; exit ${PIPESTATUS[0]}' ovh-m8-done
== 51ae489 chore(scripts): report source files over 1,200 lines in check-architecture
 Test Files  90 passed (90)
      Tests  913 passed | 80 expected fail (993)
ℹ pass 47
ℹ fail 0
 Test Files  11 passed (11)
      Tests  77 passed | 1 skipped (78)
== d40561c refactor(engine): move the engine sources under src/engine
 Test Files  90 passed (90)
      Tests  913 passed | 80 expected fail (993)
== 86cfe3b refactor(engine): extract ranging
 Test Files  90 passed (90)
      Tests  913 passed | 80 expected fail (993)
== 715fcb9 refactor(engine): extract viewport
 Test Files  90 passed (90)
      Tests  913 passed | 80 expected fail (993)
== 58c1a6d refactor(engine): extract selection
 Test Files  90 passed (90)
      Tests  913 passed | 80 expected fail (993)
== 583cd26 refactor(engine): extract cursor and snapshot
 Test Files  90 passed (90)
      Tests  913 passed | 80 expected fail (993)
== 078db2c refactor(engine): extract highlight
 Test Files  90 passed (90)
      Tests  913 passed | 80 expected fail (993)
== 3ae0a29 refactor(engine): extract hit
 Test Files  90 passed (90)
      Tests  913 passed | 80 expected fail (993)
== e6211b9 refactor(engine): extract axes ticks, render and labels
 Test Files  91 passed (91)
      Tests  913 passed | 80 expected fail (993)
== 89a29d9 refactor(engine): extract layout
 Test Files  91 passed (91)
      Tests  913 passed | 80 expected fail (993)
== ff48374 refactor(engine): extract the debug counters
 Test Files  91 passed (91)
      Tests  913 passed | 80 expected fail (993)
== 5445776 refactor(engine): extract the series pass
 Test Files  91 passed (91)
      Tests  913 passed | 80 expected fail (993)
== c6db05b refactor(engine): extract the overlay pass
 Test Files  91 passed (91)
      Tests  913 passed | 80 expected fail (993)
== f6a4af8 refactor(engine): extract the gesture action wiring
 Test Files  91 passed (91)
      Tests  913 passed | 80 expected fail (993)
== e226141 refactor(engine): Engine.ts as the composition root
 Test Files  91 passed (91)
      Tests  913 passed | 80 expected fail (993)
== eb0b418 refactor(engine): move the tooltip to dom/
 Test Files  91 passed (91)
      Tests  913 passed | 80 expected fail (993)
ℹ pass 47
ℹ fail 0
 Test Files  11 passed (11)
      Tests  77 passed | 1 skipped (78)
Successfully rebased and updated refs/heads/ovh/m9a-engine-moves.
rebase exit=0
```

(Shortened: every commit printed the same bench line, `ℹ pass 47 / ℹ fail 0`, and the same site line,
`Tests 77 passed | 1 skipped (78)`, as the first and last shown. The per-commit typecheck and biome ran in the
pre-commit hook of each commit.)

**Verbatim-move check** (`verify-moves.mjs`, Summary), each commit against its parent and over the range:

```
51ae489  verify-moves: 1220 declarations at 51ae489~1, 1220 at 51ae489; 0 engine functions (0 without the engine), 0 delegating wrappers; 0 problem(s)
d40561c  verify-moves: 1220 declarations at d40561c~1, 1220 at d40561c; 0 engine functions (0 without the engine), 0 delegating wrappers; 0 problem(s)
86cfe3b  verify-moves: 1220 declarations at 86cfe3b~1, 1220 at 86cfe3b; 15 engine functions (5 without the engine), 0 delegating wrappers; 0 problem(s)
715fcb9  verify-moves: 1220 declarations at 715fcb9~1, 1227 at 715fcb9; 34 engine functions (5 without the engine), 7 delegating wrappers; 0 problem(s)
58c1a6d  verify-moves: 1227 declarations at 58c1a6d~1, 1229 at 58c1a6d; 39 engine functions (0 without the engine), 2 delegating wrappers; 0 problem(s)
583cd26  verify-moves: 1229 declarations at 583cd26~1, 1231 at 583cd26; 50 engine functions (0 without the engine), 2 delegating wrappers; 0 problem(s)
078db2c  verify-moves: 1231 declarations at 078db2c~1, 1232 at 078db2c; 54 engine functions (0 without the engine), 1 delegating wrappers; 0 problem(s)
3ae0a29  verify-moves: 1232 declarations at 3ae0a29~1, 1232 at 3ae0a29; 63 engine functions (2 without the engine), 0 delegating wrappers; 0 problem(s)
e6211b9  verify-moves: 1232 declarations at e6211b9~1, 1232 at e6211b9; 63 engine functions (0 without the engine), 0 delegating wrappers; 0 problem(s)
89a29d9  verify-moves: 1232 declarations at 89a29d9~1, 1234 at 89a29d9; 71 engine functions (0 without the engine), 2 delegating wrappers; 0 problem(s)
ff48374  verify-moves: 1234 declarations at ff48374~1, 1235 at ff48374; 72 engine functions (0 without the engine), 1 delegating wrappers; 0 problem(s)
5445776  verify-moves: 1235 declarations at 5445776~1, 1235 at 5445776; 80 engine functions (2 without the engine), 0 delegating wrappers; 0 problem(s)   # --rename renderSegments=toRenderSegments
c6db05b  verify-moves: 1235 declarations at c6db05b~1, 1235 at c6db05b; 80 engine functions (0 without the engine), 0 delegating wrappers; 0 problem(s)
f6a4af8  verify-moves: 1235 declarations at f6a4af8~1, 1235 at f6a4af8; 81 engine functions (0 without the engine), 0 delegating wrappers; 0 problem(s)
e226141  verify-moves: 1235 declarations at e226141~1, 1235 at e226141; 81 engine functions (0 without the engine), 0 delegating wrappers; 0 problem(s)
eb0b418  verify-moves: 1235 declarations at eb0b418~1, 1235 at eb0b418; 81 engine functions (0 without the engine), 0 delegating wrappers; 0 problem(s)
range    verify-moves: 1220 declarations at ovh-m8-done, 1235 at eb0b418; 95 engine functions (14 without the engine), 15 delegating wrappers; 0 problem(s)   # --rename renderSegments=toRenderSegments
```

(The "engine functions" count is the extracted functions the step compares, those it moves plus the earlier ones
its bodies call; the 15 extra declarations at the head are the delegates.)

**Exit: visual, exact, against the merge base** (`PORT=5339`, EXECUTION rule 6), then the two checks:

```
$ PORT=5339 npm run test:visual -- --against 926d091
visual: extracting 926d091 (926d091983) into /Users/liam/Projects/snaplot/.claude/visual-cache/926d0919835969f0d898c8944edc5905493cbc3c/tree
  141 passed (14.1s)
visual: rendering the reference again; every shot must reproduce exactly
  141 passed (9.5s)
visual: captured 141 reference screenshots (each reproduced)
visual: comparing exact (threshold 0, maxDiffPixels 0)
  5 skipped
  706 passed (26.7s)
visual: contact sheet test-results/visual/contact-sheet.html
visual exit=0

$ node scripts/overhaul/check-visual-diffs.mjs --milestone M9a
check-visual-diffs: head eb0b418abd vs 926d091 (926d091983)
  reference: complete, 141 shots; comparison exact (threshold 0, maxDiffPixels 0)
  milestone M9a, zero-change rule
  141 shots: 0 changed, 0 added, 0 removed, 0 broken, 0 unverified; geometry: 570 checks, 0 failing
check-visual-diffs: OK

$ node scripts/overhaul/check-visual-ledger.mjs
check-visual-ledger: 252 commits in overhaul-baseline..HEAD, 6 with visual changes, 1 listed baseline commit(s)
check-visual-ledger: OK
```

(The 5 skipped are the fixtures' declared geometry skips, as in M8.)

**Exit: the golden `.d.ts` is byte-identical.** `npm run check:api` after `npm run build`, plus `cmp` of each
emitted file against its golden (no `api:update` ran; `git diff ovh-m8-done -- packages/snaplot/api` is empty):

```
check-api: dist/ matches the golden declarations (index.d.ts, react.d.ts, solid.d.ts).
index.d.ts identical
react.d.ts identical
solid.d.ts identical
```

**Exit: the ledger count is unchanged** (`npm run ledger`; the same line as at `926d091` and in M8's handoff):

```
160 expected-failure markers (vitest 84, playwright 76; by suite: vitest 80, consumers 4, browser 62, visual 14), 120 distinct ids
```

**`PORT=5339 npm run trace-check -- --milestone M9a`** (it runs every suite first; exit 0):

```
trace-check: M9a (as merged)
  closed units checked: 1, locked: 1
  ledger: 160 markers (vitest 80, consumers 4, browser 62, visual 14); executed expected failures: vitest 80, consumers 4, browser 62, visual 14
  note: ad-hoc part [uisite-03:library] at packages/snaplot/test/browser/m12a-hover-sweep.spec.ts:15 (owners of uisite-03)
  note: ad-hoc part [visuals-01:x] at packages/snaplot/test/ledger/m10-format.test.ts:40 (owners of visuals-01)
  note: [arch-14] also waits on M9b
OK
```

The one closed unit is `[perf:visible-range]`. M9a has no ledger files of its own.

**Exit: no file over 1,200 lines** (`node scripts/check-architecture.mjs`, exit 0, all rules in warn mode):

```
size lines [warn]: 0 — source files over 1,200 lines
check-architecture: 136 violation(s), all in warn mode (P2 errors from M14, P3 from M13, size from M9b).
```

By rule, base `926d091` (run with this script) → head: P2 color 17 → 17, errors 27 → 27, format 14 → 14, marks
57 → 55, observers 17 → 11, P3 imports 12 → 12, size 1 (`core/Chart.ts`, 4,343 lines) → 0.

**`node scripts/overhaul/metrics.mjs`** (`gitHead` `eb0b418`; the base figures are the same script with
`--pkg` on an extract of `926d091`):

| Metric | `926d091` | `eb0b418` |
|---|---:|---:|
| Source files | 65 | 74 |
| Physical / code lines | 21,814 / 15,901 | 22,107 / 16,124 (+293 / +223: module headers, imports, the 15 delegates) |
| Largest file | 4,343 (`core/Chart.ts`) | 1,191 (`public/chart.ts`) |
| Runtime exports `.` / `react` / `solid` | 4 / 6 / 6 | 4 / 6 / 6 |
| Option leaves / handle members / events | 106 / 14 / 7 | 106 / 14 / 7 |
| Legend implementations | 1 | 1 |

**`PORT=5339 npm run test:browser`** (exit 0; the `✘` lines are the `test.fail` markers failing as expected):

```
  ✓  74 [chromium] › test/browser/m8-legend.spec.ts:6:3 › legend › [frameworks-11] two series show a styled legend above the plot, with sized buttons (158ms)
  ✘  68 [chromium] › test/browser/m12a-touch.spec.ts:70:3 › touch › [interact-05] a tap keeps the tooltip after the finger lifts (980ms)

  74 passed (9.6s)
```

**`npm run check:package`**, **`npm run check:size`** (exit 0 each). `createChart` is 71.0 KiB gzip against M8's
71.5: module functions minify smaller than methods (`e.x` for `this.x`):

```
 Test Files  7 passed (7)
      Tests  23 passed | 4 expected fail (27)
check-consumers: passed (report: /Users/liam/Projects/snaplot/.claude/worktrees/m9a/packages/snaplot/test-results/consumers.json)

| import | min KiB | gzip KiB | budget KiB | headroom | |
|---|---:|---:|---:|---:|---|
| createChart | 226.2 | 71.0 | 72.0 | 1.4% | ok |
| Chart (react) | 227.1 | 71.4 | 72.4 | 1.4% | ok |
| Chart (solid) | 227.1 | 71.4 | 72.5 | 1.4% | ok |
| histogram | 4.1 | 1.8 | 1.9 | 2.0% | ok |
| createLegendTable | 8.2 | 2.8 | 2.8 | 0.2% | ok |
```

`attw` reports 🟢 for `snaplot`, `snaplot/react`, `snaplot/solid` and `snaplot/package.json` under node16 (ESM)
and bundler, as in M8.

**G11:** `npm run build:site`, `npm run check:examples`, and the smoke spec (`PORT=5339 npx playwright test` in
`site/`), exit 0 each; nothing listens on 5339 afterwards:

```
typedoc-validate: 0 undocumented public declarations (error), 0 other warnings, 0 errors.
15:55:13 [build] 115 page(s) built in 6.46s
15:55:13 [build] Complete!

Result (43 files):
- 0 errors
- 0 warnings
- 5 hints
check-examples: tsc -p tsconfig.examples.json passed
check-examples: tsc -p tsconfig.examples.solid.json passed

  148 passed (28.5s)
```

**Not applicable:** `npm run test:conformance` arrives with M13 (`test/conformance/` does not exist at the base).

**Exit: `npm run bench:ab -- --base 926d091 --set M9a`** (both profiles, 3 interleaved pairs, GPU raster, 537 s;
exit 0, **PASS**). Other worktrees were running: the load was 23.87 at the start and 3.54 at the end, and 61 of 120
rounds were noisy (load > 6), almost all of them desktop; the tool re-measured two noisy mobile rows
(`wheel-zoom-gesture-50k`, `hover-sync-line-200k`). The required rows (limit 1.2, floor 0.25 ms):

```
## desktop
| scenario | metric | base | head | ratio | limit | verdict |
| append-stream-50k-window | busy.median | 1.55 | 1.45 | 0.93 | 1.2 | ok (noisy: load) |
| heatmap-pan-300k | busy.median | 2.87 | 2.73 | 0.95 | 1.2 | ok (noisy: load) |
| hover-sweep-50k | busy.median | 0.290 | 0.235 | 0.86 | 1.2 | ok (noisy: load, spread 1.34×) |
| independent-lines-pan-75k | busy.median | 1.26 | 1.16 | 0.92 | 1.2 | ok (noisy: load) |
| line-pan-200k | busy.median | 1.21 | 1.28 | 1.06 | 1.2 | ok (noisy: load) |
| pinch-zoom-gesture-50k | busy.median | 1.17 | 0.975 | 0.83 | 1.2 | ok (noisy: load, spread 1.38×) |
| scatter-pan-200k | busy.median | 0.755 | 0.740 | 0.98 | 1.2 | ok (noisy: load, spread 1.52×) |
| scatter-render-50k | busy.median | 29.39 | 30.98 | 1.05 | 1.2 | ok (noisy: load) |
| scatter-zoom-200k | busy.median | 0.820 | 0.975 | 1.19 | 1.2 | ok (noisy: load, spread 1.28×) |
| touch-pan-gesture-50k | busy.median | 1.00 | 1.00 | 1.00 | 1.2 | ok (noisy: load, spread 1.3×) |
| two-heatmaps-highlight-150k | busy.median | 0.175 | 0.180 | 1.00 | 1.2 | ok (noisy: load) |
| wheel-zoom-gesture-50k | busy.median | 0.905 | 0.920 | 1.02 | 1.2 | ok (noisy: load, spread 1.33×) |
| ingest-cols-1m | sync.median | 43.12 | 43.20 | 1.00 | 1.2 | ok (noisy: load) |
| reingest-cols-200k-title | sync.median | 2.66 | 2.68 | 1.01 | 1.2 | ok (noisy: load) |
| stream20hz-50k-none | busy.median | 3.02 | 2.98 | 0.99 | 1.2 | ok (noisy: load) |
| stream20hz-50k-plugin | busy.median | 1.86 | 1.66 | 0.89 | 1.2 | ok (noisy: load, spread 1.52×) |
| hover-sync-line-200k | sync.median | 0.130 | 0.120 | 1.00 | 1.2 | ok (noisy: load) |
| hover-sync-scatter-200k | sync.median | 0.145 | 0.133 | 1.00 | 1.2 | ok (noisy: load) |
| time-pan-200k | busy.median | 1.71 | 1.70 | 1.00 | 1.2 | ok (noisy: load) |
## mobile
| append-stream-50k-window | busy.median | 3.88 | 3.92 | 1.01 | 1.2 | ok |
| heatmap-pan-300k | busy.median | 6.07 | 5.65 | 0.93 | 1.2 | ok (noisy: spread 1.33×) |
| hover-sweep-50k | busy.median | 0.140 | 0.150 | 1.00 | 1.2 | ok |
| independent-lines-pan-75k | busy.median | 2.22 | 2.28 | 1.03 | 1.2 | ok (noisy: load) |
| line-pan-200k | busy.median | 3.47 | 3.44 | 0.99 | 1.2 | ok |
| pinch-zoom-gesture-50k | busy.median | 2.20 | 2.50 | 1.14 | 1.2 | ok |
| scatter-pan-200k | busy.median | 1.36 | 1.39 | 1.02 | 1.2 | ok |
| scatter-render-50k | busy.median | 120.8 | 112.4 | 0.93 | 1.2 | ok (noisy: load) |
| scatter-zoom-200k | busy.median | 1.56 | 1.70 | 1.09 | 1.2 | ok |
| touch-pan-gesture-50k | busy.median | 1.65 | 1.59 | 0.96 | 1.2 | ok |
| two-heatmaps-highlight-150k | busy.median | 0.095 | 0.063 | 1.00 | 1.2 | ok |
| wheel-zoom-gesture-50k | busy.median | 1.77 | 1.61 | 0.91 | 1.2 | ok (noisy: spread 1.49×) |
| ingest-cols-1m | sync.median | 168.3 | 160.2 | 0.95 | 1.2 | ok |
| reingest-cols-200k-title | sync.median | 10.42 | 10.45 | 1.00 | 1.2 | ok |
| stream20hz-50k-none | busy.median | 4.79 | 4.42 | 0.92 | 1.2 | ok (noisy: spread 1.29×) |
| stream20hz-50k-plugin | busy.median | 4.72 | 4.66 | 0.99 | 1.2 | ok (noisy: spread 1.29×) |
| hover-sync-line-200k | sync.median | 0.080 | 0.110 | 1.00 | 1.2 | ok |
| hover-sync-scatter-200k | sync.median | 0.100 | 0.135 | 1.00 | 1.2 | ok |
| time-pan-200k | busy.median | 2.47 | 2.62 | 1.06 | 1.2 | ok |
## Result
**PASS**: no blocking failure.
Re-measured after a noisy failure: mobile wheel-zoom-gesture-50k, mobile hover-sync-line-200k.
```

The closest row, desktop `scatter-zoom-200k` at 1.19, ran under load with overlapping per-run medians (base 1.02,
0.800, 0.820; head 0.990, 0.975, 0.820); its mobile row is 1.09. A 5-run re-measure of just that row (still under
load, 17–19) gave 1.01:

```
$ npm run bench:ab -- --base 926d091 --set M9a --filter scatter-zoom-200k --profile desktop --runs 5
| scatter-zoom-200k | busy.median | 1.00 | 1.01 | 1.01 | 1.2 | ok (noisy: load, spread 1.26×) | 0.89 | 1.00, 1.02, 1.03, 0.920, 1.00 | 1.01, 1.03, 1.01, 1.03, 0.815 | …
**PASS**: no blocking failure.
```

Because most desktop rounds were noisy, M14's quiet run should re-check the M9a set (EXECUTION rule 3). Heap per
operation is within 1.5× everywhere (the stream rows move between 255 and 327 KB on both sides, as in M8's three
runs). Absolute budgets (non-blocking until M14), unchanged in kind from M8: `ingest-cols-1m` 43.20 / 160.2 ms
(missed, ≤ 40 / 135), the four stream heap budgets 255–327 KB (missed, ≤ 50), `scatter-pan-200k` fidelity
0.999 / 0.998 (met), `pinch-zoom-gesture-50k` fidelity 0.718 / 0.719 (missed, ≥ 0.8; M11's sampling),
`hover-sync-{line,scatter}-200k` mobile 0.110 / 0.135 ms (met, ≤ 0.2).

## Visual-ledger rows

None. No shot changes, exactly (above).

## Requests for integrator

- **Integrator-owned files touched by the move** (`d40561c`, import paths only, needed in the same commit as the
  files they import so that every commit is green): `src/public/chart.ts` (5 import lines: `ChartCore`,
  `inferPosition`, `ColumnarStore`, `createScale`, and the two annotation factories now one import from
  `../engine/annotations`), `src/public/chart.test.ts` (1), `src/public/normalize.ts` (1, `createTheme`),
  `src/public/state.ts` (1, `nextFrame`). No other integrator-owned file (`src/index.ts`, the adapters' export
  lists, `engine/spec.ts`, `api/*.d.ts`) changed.
- **Shared test files touched** (import paths only): `test/fakes/engine.ts` (`ChartCore`, and `DebugSnapshot` from
  `engine/debug`), `test/ledger/m1-group.test.ts`, `test/debug-counters.test.ts`,
  `test/engine-{bar-axis,follow,selection}.test.ts`, and one comment in `test/golden-api.test.ts`.
- **Rebasing the parallel tracks.** M13 and M16a/b/c touch only `src/react`, `src/solid`, `test/conformance` and
  `site/`, which import nothing that moved (the adapters import `src/public/**` only). A branch that adds an import
  of a moved path must rename it when it rebases; the old → new map is in the message of `d40561c` (and
  `map-a.json` in the tools folder).
- **For M9b.**
  - `docs/architecture.md` (M9b's) still describes `core/Chart.ts` and `renderers/`; the tree is now the one in this
    file's Summary.
  - The class is still named `ChartCore` (in `engine/Engine.ts`), to keep the public layer, the tests and
    `scripts/overhaul/trace-ids.json` untouched; renaming it `Engine` is a free choice for M9b.
  - Where M9b's work now sits: the per-type branches of the series pass are in `marks/index.ts`
    (`renderAllSeries`); the hit, bar, histogram and click branches in `hit.ts`; `drawPointIndicators` in
    `render/overlay.ts`; `wireEvents` (the action table) in `interaction/actions.ts`; `fillSnapshot` and
    `fillIndependentSnapshot` side by side in `cursor.ts`; the readout formatters (`formatReadout`,
    `formatAxisReadout`, `formatAxisValue`, `formatHistogramBinRange`, 66 lines) are still `ChartCore` methods,
    left for the `engine/format.ts` contract.
  - Every extracted function is exported, including those used only inside their own module; M9b can narrow that.
    The modules import each other (`ranging` ↔ `viewport`, `cursor` ↔ `layout` ↔ `hit`, …): function-only
    cycles that nothing evaluates at load time (the build reports none).
  - Members now read by the modules are public on the class; the class comment says so.
- **Bench:** the run passed with most desktop rounds noisy (other worktrees were running); M14's quiet run
  should re-check the M9a set (Gates).

## Known gaps

None for M9a. `check-architecture`'s size rule stays in warn mode at 1,200 lines until M9b (cap 900, error mode),
and arch-14 closes with M9b.

## Data notes

None. The visual reference for `926d091` is now cached in
`/Users/liam/Projects/snaplot/.claude/visual-cache/926d0919835969f0d898c8944edc5905493cbc3c/` and the A/B build of
`926d091` in `/Users/liam/Projects/snaplot/.claude/ab-cache/`.

## Human steps

None beyond the overhaul's usual ones (push, publish; refresh the Linux visual baselines with the
`update-snapshots` workflow, EXECUTION rule 1).
