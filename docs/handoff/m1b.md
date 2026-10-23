# M1b: Annotations and plugins given at creation draw in the mount paint (orchestrator-added M1 fix)

- **Branch:** `ovh/m1b-mount-paint` · **Worktree:** `.claude/worktrees/m1b` · **Base:** `aebbeca` (`overhaul` at
  start)
- **Status:** complete. M1b is not in plan §12. The orchestrator's brief is its spec, and its ledger row is
  filed under Milestone M1.

## Summary

- **Symptom.** Since `5106dd4` (M1, "skip the relayout when a resize leaves the layout current"),
  `referenceLines`, `referenceRegions` and `plugins` given to `createChart` are not drawn until something
  else repaints the chart. M3b found it and recorded two `it.fails('[gap-annotations-extensibility-06:mount] …')`
  on `ovh/m3b-ledger`, which is not merged yet. M3a's V0 baselines `axes/annotations-390` and `@2x` show
  the chart without its annotations.
- **Root cause.** The controller (`Controller` constructor in `src/api/createChart.ts`) built the engine
  first. `ChartCore`'s constructor paints every layer synchronously. Only after that did the controller
  install the internal reference-line and reference-region plugins and the bridged user plugins, through
  `engine.use()`, and `use()` marks no layer dirty. Before `5106dd4`, the first ResizeObserver delivery at
  mount always repainted the whole chart, which hid the ordering. `5106dd4` correctly skips that delivery
  for a box whose layout is current, so nothing repainted after the plugins were installed.
- **Fix: one paint at mount, after the plugins are installed.**
  - `ChartCore`'s constructor takes a fifth argument, `deferFirstPaint` (default `false`), that skips the
    synchronous flush at its end. The layers stay marked dirty.
  - A new `ChartCore.paint()` flushes them now.
  - The controller constructs the engine deferred, installs its plugins, then calls `paint()`. That is
    before the group join and `coordinate()`, so it is where the old paint stood relative to everything
    else.

  The mount still paints each layer exactly once, and the first observation and the first frame still
  paint nothing more (`5106dd4`'s guarantee, now a test). User plugin `install` hooks still receive the
  completed handle. They now run before the first paint instead of after it.

  Other behaviour is unchanged:
  - a `ChartCore` constructed without the flag paints in its constructor as before (the engine tests);
  - `use()` is unchanged;
  - the golden API is unchanged, because `ChartCore` is not in `api/*.d.ts`.
- **Alternatives not taken.**
  - Mark the layers dirty in `use()` (M3b's first suggestion), or call `redraw()` at the end of the
    controller constructor (its second). Either leaves createChart's own paint without the annotations and
    adds a second full paint on the next frame, which undoes `5106dd4`'s single mount paint for every chart,
    because the line and region plugins are always installed. A chart created inside a rAF callback would
    still composite one frame without them.
  - Pass the plugins to the engine constructor. User `install` hooks would then receive a handle whose
    engine does not exist yet.
- **Verification beyond the brief's test.**
  - The mount paint records the same canvas calls on each layer as a later `redraw()` (a committed test),
    so the new baselines are exactly what a full repaint drew before the fix.
  - M3b's `test/ledger/*` and `test/perf-guards.test.ts`, copied temporarily into this worktree (not
    committed), give the same 150 results on the base, all as expected. With the fix, exactly the two
    `[gap-annotations-extensibility-06:mount]` markers change: they pass unexpectedly. Run as plain `it`,
    both pass.
- **Commits** (oldest first):
  1. `5e5a118 test: record annotations and plugins missing from the mount paint`. It adds
     `packages/snaplot/test/ledger/m1-mount.test.ts`:
     - two `it.fails('[gap-annotations-extensibility-06:mount] …')`:
       - right after `createChart`, with no frame, no ResizeObserver delivery and no `redraw()`, the line
         and region labels are on the data layer, and the plugin's three draw hooks ran once;
       - the mount paint equals a later `redraw()`, call for call;
     - one control `it`: the mount paints each layer once, and a ResizeObserver delivery plus a frame flush
       paint nothing more.
  2. `4a042b7 fix(core): install plugins before the mount paint`. The engine flag and `paint()`, the
     controller change, the two markers flipped to `it`, `docs/decisions/visual-ledger/V90.md`, and the two
     refreshed `-darwin` baselines. The body has the `visual: V90` paragraph.
  3. `docs(handoff): record the M1b mount-paint fix and gates` (this file).
- **Closes:** `gap-annotations-extensibility-06:mount` (part id). The finding's main part, an in-place push
  followed by `update({ referenceLines })`, stays with M8. The locks are the three test titles above, which
  contain `[gap-annotations-extensibility-06:mount]`.
- **Test count:** 588 passed + 2 expected fail before the fix (590). After it: 591 passed + 2 expected fail
  (593), which is the 3 new tests.

## Gates

`npm run verify` (at `4a042b7`; the handoff commit adds only this file):

```
> verify
> biome ci . && npm run typecheck && npm test && npm run build
Checked 321 files in 127ms. No fixes applied.
> snaplot@0.12.0 typecheck
> tsc -p tsconfig.json --noEmit && tsc -p tsconfig.test.json
> snaplot@0.12.0 test
> vitest run
 Test Files  56 passed (56)
      Tests  591 passed | 2 expected fail (593)
> test
> vitest run
 Test Files  11 passed (11)
      Tests  77 passed | 1 skipped (78)
> snaplot@0.12.0 build
> vite build && vite build --config vite.ssr.config.ts
[vite:dts] Declaration files built in 2057ms.
✓ built in 2.46s
✓ built in 368ms
(exit 0)
```

`git rebase -x 'git diff --quiet HEAD~1 -- package-lock.json || npm ci; npm test' overhaul` (both code
commits; the handoff commit is docs only):

```
Rebasing (2/4)Executing: git diff --quiet HEAD~1 -- package-lock.json || npm ci; npm test
 Test Files  56 passed (56)
      Tests  589 passed | 4 expected fail (593)
 Test Files  11 passed (11)
      Tests  77 passed | 1 skipped (78)
Rebasing (3/4)Rebasing (4/4)Executing: git diff --quiet HEAD~1 -- package-lock.json || npm ci; npm test
 Test Files  56 passed (56)
      Tests  591 passed | 2 expected fail (593)
 Test Files  11 passed (11)
      Tests  77 passed | 1 skipped (78)
Successfully rebased and updated refs/heads/ovh/m1b-mount-paint.
(exit 0)
```

`npm run test:visual -- --against aebbeca` (the branch's merge base with `overhaul`; `PORT=5361`). It exits 1
because two shots differ, which is what `check-visual-diffs` judges:

```
visual: reference aebbeca (aebbeca3c2) from cache /Users/liam/Projects/snaplot/.claude/visual-cache/aebbeca3c26e509135f4ca73f223927dff373f44/shots-darwin-arm64-pw1.61.1-chromium1228 (137 shots)
visual: comparing exact (threshold 0, maxDiffPixels 0)
  2 failed
    [visual] › test/visual/visual.spec.ts:18:5 › axes/annotations-390 › matches its reference ──────
    [visual] › test/visual/visual.spec.ts:18:5 › axes/annotations-390@2x › matches its reference ───
  4 skipped
  686 passed (18.5s)
visual: contact sheet test-results/visual/contact-sheet.html
```

(The 4 skipped are the fixtures' declared geometry skips: `axes/empty` ×2, `marks/density-heatmap`,
`marks/basic-density`.)

`node scripts/overhaul/check-visual-diffs.mjs --milestone M1`:

```
check-visual-diffs: head 4a042b77dd vs aebbeca (aebbeca3c2)
  reference: complete, 137 shots (cached); comparison exact (threshold 0, maxDiffPixels 0)
  milestone M1, rows of this milestone changed since aebbeca3c26e: V90.md
  137 shots: 2 changed, 0 added, 0 removed, 0 broken, 0 unverified; geometry: 555 checks, 0 failing
  changed  axes/annotations-390  (V90.md: axes/annotations-390)
  changed  axes/annotations-390@2x  (V90.md: axes/annotations-390)
  diff images: /Users/liam/Projects/snaplot/notes/overhaul-audit/visual-diffs/m1
check-visual-diffs: OK
(exit 0)
```

`node scripts/overhaul/check-visual-ledger.mjs`:

```
  baseline  c3d7ae8153 test(visual): initial darwin baselines (137 screenshots, V0)
  visual    4a042b77dd fix(core): install plugins before the mount paint → V90
check-visual-ledger: 116 commits in overhaul-baseline..HEAD, 2 with visual changes, 1 listed baseline commit(s)
check-visual-ledger: OK
(exit 0)
```

Baseline refresh, the sanctioned path, narrowed to the two shots so nothing else is rewritten or pruned. It
ran with the fix in the working tree, before commit 2. `PORT=5331` here was a slip; EXECUTION.md rule 6 gives
M1b 5361, which every later run used. Nothing listens on either port now.

```
$ npm run test:visual -- --update --grep 'axes/annotations-390'
visual: comparing tolerance (threshold 0, maxDiffPixelRatio 0.002)
Running 2 tests using 2 workers
  ✓  2 [visual] › test/visual/visual.spec.ts:18:5 › axes/annotations-390 › matches its reference (309ms)
  ✓  1 [visual] › test/visual/visual.spec.ts:18:5 › axes/annotations-390@2x › matches its reference (330ms)
  2 passed (2.7s)
visual: committed set for darwin: 137 PNGs, 3.51 MB
$ git status --short
 M packages/snaplot/test/visual/__screenshots__/axes/annotations-390-darwin.png
 M packages/snaplot/test/visual/__screenshots__/axes/annotations-390@2x-darwin.png
```

`npm run test:visual -- --strict` (head against the committed baselines, exact, at `c52b8dd`, whose
`packages/` tree is identical to `4a042b7`; the amend changed only V90.md wording):

```
visual: comparing exact (threshold 0, maxDiffPixels 0)
  4 skipped
  688 passed (18.3s)
(exit 0)
```

`npm run check:api` (G7; `ChartCore` is not in the golden declarations):

```
check-api: dist/ matches the golden declarations (core.d.ts, index.d.ts, react.d.ts, solid.d.ts).
(exit 0)
```

`npx vitest run test/ledger --reporter=verbose` (the new lock titles):

```
 ✓ test/ledger/m1-mount.test.ts > … > [gap-annotations-extensibility-06:mount] createChart paints reference lines, regions and plugins with no further repaint
 ✓ test/ledger/m1-mount.test.ts > … > [gap-annotations-extensibility-06:mount] the mount paint draws what a later full repaint draws
 ✓ test/ledger/m1-mount.test.ts > … > [gap-annotations-extensibility-06:mount] the mount paint stays the only paint of the first frame
 Test Files  4 passed (4)
      Tests  23 passed (23)
```

`npm run bench:ab -- --base aebbeca --filter firstpaint,stream20hz-50k-plugin --profile desktop`. This was
extra: the brief requires no bench, and gate.json has no M1 set. The fix touches `src/core/**`, so the
mount scenario and the plugin stream were checked. Load was 5.74 (no noisy rounds); 3 interleaved pairs:

```
| stream20hz-50k-plugin | busy.median | 4.29 | 4.27 | 0.99 | 1.5 | ok | …
| firstpaint-line-1m | wall.median | 128.8 | 129.4 | 1.00 | 1.5 | ok | …
**PASS**: no blocking failure.
```

Both absolute budgets (`firstpaint-line-1m-desktop` ≤ 45 ms, `stream20hz-50k-plugin-heap` ≤ 50 KB/op) were
already missed on the base. They are non-blocking until M14.

`node scripts/overhaul/metrics.mjs` (excerpt): `core/Chart.ts` 4540 physical lines (+15),
`api/createChart.ts` 1099 (+5); source 69 files, 15388 code lines.

## Visual-ledger rows

- **V90** `fix(core): install plugins before the mount paint`. Fixtures: `axes/annotations-390` (both shots,
  DPR 1 and `@2x`). Milestone M1; finding `gap-annotations-extensibility-06` (`:mount`).

## Requests for integrator

1. **V90 is from the unassigned V90+ range,** which the brief assigned. It is filed as Milestone M1, so
   `check-visual-diffs` is run with `--milestone M1`. Without the flag, the branch name gives `M1b`, which
   matches no row.
2. **Committed PNG baselines outside M3a and M14.** Plan §12.0 says only M3a and M14 commit baselines. The
   brief sanctioned this refresh, of exactly two files through `--update`. Their commit carries row V90, so
   P13 is satisfied and `baseline-commits.txt` is unchanged; its README says only M3a and M14 add lines
   there.
3. **M3b's rebase onto this.** Its two `it.fails('[gap-annotations-extensibility-06:mount] …')` in
   `packages/snaplot/test/ledger/m8-plugins.test.ts` will pass unexpectedly. Flip them to `it`, or delete
   them, since `test/ledger/m1-mount.test.ts` now locks the same behaviour. That keeps `npm run ledger` and the
   expected-failure counts consistent.
   - In `scripts/overhaul/trace-ids.json` and trace-check, the ad-hoc part
     `gap-annotations-extensibility-06:mount` is closed by M1b, locked by the test-title fragment
     `[gap-annotations-extensibility-06:mount]`. The parent id stays with M8.
   - M3b's handoff Request 1 (land the fix as an integrator request or in M2) is resolved by this branch.
4. **Owned paths.** Outside test and docs files, this milestone touched only the `Controller` constructor in
   `src/api/createChart.ts` (+5 lines) and the `ChartCore` constructor plus the new `paint()` in
   `src/core/Chart.ts` (+15 lines). `src/core/**` belongs to M2 in this wave, so M2 rebases over these two
   small hunks. Its deletion of the constructor `data` path touches the same constructor signature, and
   the fifth `deferFirstPaint` argument must survive it.
5. **V0.md** still says the annotations are missing at mount. That is true of the V0 commit, and editing V0.md
   fails `check-visual-diffs`, so it stays. V90 supersedes it for these two shots.

## Known gaps

- `ChartCore.use()` still marks no layer dirty, so a plugin installed with `use()` on a live engine draws
  only from the next repaint. `createChart` no longer depends on that, and `ChartHandle` has no `use()`.
  Only internal `ChartInstance`-typed plugins could call it. It was left unchanged to keep this change
  minimal. M8 owns the plugin lifecycle (reconcile by id, gap-annotations-extensibility-07).
- The `gap-annotations-extensibility-06` main part (an in-place push then `update({ referenceLines })`) is
  M8's, unchanged here.

## Data notes

None. No datasets or generators were touched.

## Human steps

- No `-linux` baselines are committed yet. When the `update-snapshots` workflow is dispatched (M3a's human
  step), it renders `axes/annotations-390` with this fix.
- Optionally review the two diffs in `notes/overhaul-audit/visual-diffs/m1/` or the contact sheet
  (`packages/snaplot/test-results/visual/contact-sheet.html`). Both show the band, the four lines and their
  labels appearing; nothing else changes.
