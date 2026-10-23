> **M0 snapshot, not the working copy.** Overhaul milestone M0 copied this file verbatim (everything below
> this note) from the local, gitignored `notes/overhaul-audit/plan.md`. That working copy is the one agents
> read, and the orchestrator may amend it; this snapshot is not kept in sync. Absolute paths below are the
> maintainer's machine. M17 decides whether this file stays, is refreshed or is removed (ADR 0002).

# snaplot overhaul plan (final, executable)

- **Repository:** `/Users/liam/Projects/snaplot`.
- **Integration branch:** `overhaul`, a local branch. Its baseline commits are `aef1584` (the comparison lab) and `6237289` (the rows-first `createChart` API with React and Solid components). At this baseline typecheck passes and 483 library tests pass. The last release is v0.12.0.
- **Never push, never publish.**
- **Who executes this plan:** Claude Code agents, unattended, on local branches. Every decision below is applied as recommended. The maintainer can revisit any of them later; §1 says what would change.
- **Evidence:** a 19-auditor review that found 336 findings, copied to `/Users/liam/Projects/snaplot/notes/overhaul-audit/` (gitignored): `_index.md`, `_results.json` and one report per auditor. Finding ids such as `dataapi-01` refer to that index.
- **File:line references** in the reports point at `overhaul-baseline`. M0 reformats the code, so read them with `git show overhaul-baseline:<path> | sed -n '<a>,<b>p'` and find the current code by symbol.
- **Verdicts:** "confirmed" means an independent verifier reproduced the defect. "Judgement" means a design finding that is not a reproducible defect.
- **Required findings:** 192. That is every confirmed finding at any severity (158), plus the 34 high-severity judgement findings. Each one is owned by a milestone's **Closes** list or by the single won't-do table in §6. M3b generates `scripts/overhaul/trace-ids.json` from those lists and `_results.json`; from then on that file is authoritative, and M17's `trace-check` verifies all 192.
- **Part-tagged ids.** Some findings are partly fixed and partly declined. Their parts carry a suffix, such as `backlog-15:categorical` and `backlog-15:ramp`, in Closes lists, test titles and `trace-ids.json`.

---

## 0. Summary

**Why.** snaplot's engine is fast, and its core ideas are sound: one options object, typed fields over rows, zero-copy typed columns, ring-buffer streaming and layered canvases. The problems have one common source: everything exists twice. The overhaul put a new public API on top of the old engine. So today there are:

- two type systems and a 437-line translation layer;
- four legends and two colour parsers;
- three hit-test paths;
- a tick formatter reused for tooltip values;
- a full data re-ingest on every option change.

Those duplications cause the six critical defects (grouped charts overwrite each other's Y axis; tooltips round values to tick precision) and most of the 83 high ones. Four other problems compound them. The docs present snaplot as a Solid-only library. The examples are not executed. The site and demos share one templated "AI landing page" look. React users get a thin, leaky adapter.

**What changes.**

1. **Safety first.**
   - Tag and back up the baseline, including the gitignored evidence.
   - Fix the six criticals in the current code by day 2.25 (M1), each locked by a test.
   - Build the safety nets before refactoring: a deterministic visual and geometry gate, an expected-failure ledger covering all 192 required findings, a perf A/B gate that measures main-thread busy time, and packaging and API gates.
2. **Simplify.**
   - The engine *becomes* the public API: one type system, one update path with invalidation classes, and one of each pipeline (formatter, colour parser, tick pipeline, domain policy, hit test, hover model, dispatcher, legend, sync, scheduler).
   - `ChartCore` (4,077 lines) is split into modules of at most 850 lines.
   - About 30% of the public surface and about 4,000 lines of library code are deleted. There is no PNG export, no theme catalogue and no `tickCount` in 1.0.
3. **Correct, friendly defaults.**
   - Readouts at value precision, and the axis `format` drives tooltips.
   - The theme is taken from the page the chart sits on, with a transparent background.
   - An automatic legend appears from two series.
   - Honest domains and readable ticks.
   - Row data is sorted for you.
   - An explicit `height` always wins; a 0 px host gets 300 px and one warning.
   - Touch scrolls the page on line charts.
   - A named, keyboard-operable figure.
4. **One core, three thin bindings.**
   - The same options in vanilla, React (18.3 and 19) and Solid.
   - State options (`viewport`, `selection`, `hiddenSeries`, `highlight`) plus `on<Key>Change` work everywhere.
   - Adapters of about 150 lines use only the public API.
   - One conformance suite runs on four runtimes.
5. **Docs and site.**
   - Astro + Starlight with React and Solid islands, and 21 task-first pages.
   - Every example is executed in all three frameworks behind persisted tabs. There is a no-build `<script type="module">` path for vanilla.
   - A generated API reference and a migration guide from 0.12.
   - A plain white site.
6. **Six task-specific demos**, two per framework, on real public data or a documented simulator. Each follows the conventions of its own domain and computes an answer, which a test checks against an independent oracle.

**End state (measured by `node scripts/overhaul/metrics.mjs`).**

| Metric | Now | Target |
|---|---:|---:|
| Library code lines (non-test, non-comment) | 13,243 | ≤ 10,500 |
| Library physical lines | 18,086 | ≤ 14,000 |
| Largest source file | 4,077 | ≤ 850 (hard cap 900) |
| Runtime exports `snaplot` / `react` / `solid` | 35 / 12 / 13 | 4 / 4 (+2 re-exports) / 4 (+2) |
| Package entry points | 5 | 3 |
| Public option leaves | about 159, plus 12 controlled props | ≤ 110, with one name per concept |
| `ChartHandle` members / events | 24 / 13 | 14 / 7 |
| Built-in themes | 14 objects and 6 helpers | `'auto' │ 'light' │ 'dark'` plus 10 tokens |
| Legend implementations | 4 | 1 list legend and 1 legend table, both in core |
| gzip `{ createChart }` consumer bundle | 58.6 KB | ≤ 50 KB |
| Docs pages / demos | 11 sections plus Recipes / 3 dogfood apps and a hub | 21 pages / 6 demos |
| Known-defect ledger at release | none recorded | only §6 won't-do part-ids |

A missed line-count or size target is acceptable if `docs/decisions/0002-overhaul.md` explains it with a per-module table. Agents never delete tested behaviour to hit a number.

**Milestones.** W = wave. Tracks in the same wave run in parallel worktrees, with at most 4 agent sessions at once, the integrator included. Effort is in agent-days.

| # | Milestone | Wave | Effort | Runs alongside |
|---|---|---|---:|---|
| M0 | Protect the baseline, harvest evidence, clean the repo, formatter | W0 serial | 1 | none |
| M1 | Criticals on the current code; test config; debug counters | W0 serial | 1.25 | none |
| M2 | Delete dead and legacy engine code | W1 | 1.5 | M3a, M3b, M4, M5, M6a, M6b |
| M3a | Visual and geometry harness (Docker) | W1 | 2 | M2, M4, M5 |
| M3b | Expected-failure ledger, browser specs, trace ids | W1 | 2.5 | M2, M4, M6a, M6b |
| M4 | Perf gate v2 (same-run A/B, busy time, fidelity, heap) | W1 | 2.5 | M2, M3a, M3b, M5 |
| M5 | Packaging, golden API, CI and release tooling | W1 | 2 | M2, M3a, M4 |
| M6a | Docs site scaffold (Astro spike first) | W1 | 1.5 | M3b, M6b |
| M6b | Demo datasets, generators and answers with oracles | W1–W2 | 3 | M3b, M6a, M7 |
| M7 | One type system: public types, normalize, ingest | W2 serial | 5 | M6b, M13 harness |
| M8 | One update path, the final public surface, interim legends | W3 serial | 5.5 | M13 harness |
| M9a | Engine split: file moves only | W4 serial | 2 | M13, M15a, M16 |
| M9b | Engine refactors and the W5 contracts | W4 serial | 2 | M13, M15a, M16 |
| M10 | Axes, ticks, formatting, domains, time, annotations | W5 | 4.5 | M11, M12a, M12b |
| M11 | Marks, colour, theme, surface, sizing, visibility | W5 | 5 | M10, M12a, M12b |
| M12a | Hit test, hover, tooltip, viewport, selection, touch, keyboard | W5 | 5 | M10, M11, M12b |
| M12b | Legend, legend table, injected styles | W5 | 3 | M10, M11, M12a |
| M13 | React and Solid adapters; the four-runtime conformance suite | W3–W4 | 3.5 | M7 and M8 (harness only), M9a, M9b |
| M14 | Integration: visual approval, perf A/B, ratchets | W6 serial | 2 | none |
| M15a | Docs: framework, data, updating and linking pages; migration draft; README | W4, W6 | 3 | M9a, M9b, M16 |
| M15b | Docs: remaining pages, API reference, final migration guide | W7 | 4 | M16 finalisation |
| M16a/b/c | Demos: a = vanilla + hub + homepage, b = React, c = Solid | W4 → W7 | 9 | M9a, M9b, M15 |
| M17 | Release preparation (`1.0.0-beta.0`) and handoff | W8 serial | 1 | none |

**Totals.** About 72 agent-days, plus about 5% integration rework, gives about 75 agent-days. With at most 4 sessions that is about 33 calendar days (§12.1). The criticals are fixed and locked by day 2.25. A milestone that reaches 1.5× its estimate stops, merges its green prefix and records the rest (§12.0).

---

## How to execute this plan with Claude Code

**Sessions.** At most 4 run at once.
- **Session 1 is the integrator.** It runs in the main checkout `/Users/liam/Projects/snaplot` on `overhaul`. It runs the serial milestones (M0, M1, M7, M8, M9a, M9b, M14, M17) in their own worktrees, and it performs every merge, one at a time.
- **Sessions 2–4 are track sessions.** Each works in `/Users/liam/Projects/snaplot/.claude/worktrees/m<N>` on branch `ovh/m<N>-<slug>`, created with the §11.1 command.
- Every session first reads §12.0 (the protocol) and its milestone brief in §12.

**The first three sessions.**

1. **Session 1, M0 (1 day).** Brief:
   > Read plan §11.1 and §12 M0. Check the preconditions: a clean tree; HEAD is 6237289 on `overhaul`; `user.email` is liam.james.clark@gmail.com; `/Users/liam/Projects/snaplot-backups` is writable. Tag `overhaul-baseline`, then write and verify the bundle. Copy the evidence from the scratchpad and the gitignored lab and site screenshots into `notes/overhaul-audit/evidence/`, and tar `notes/overhaul-audit` into the backup directory. Make M0's commits in order in worktree `m0`, run the M0 exit commands, fast-forward `overhaul` and tag `ovh-m0-done`.
2. **Session 1, M1 (1.25 days).** Brief:
   > Read §12 M1. In worktree `m1`: commit 1 widens the vitest include and adds `tsconfig.test.json`; commit 2 adds the debug counters; commit 3 adds the fakes and the four `it.fails` ledger tests; then make one fix commit per critical. Exit: the four `[id]` tests pass, the test total is 483 plus the new tests, and `verify` is green. Fast-forward and tag `ovh-m1-done`.
3. **The W1 fan-out: four sessions started together after `ovh-m1-done`.**
   - Session 1: M5, then the W1 merges, then M6a.
   - Session 2: M3a, then M3b.
   - Session 3: M4, then M6b.
   - Session 4: M2. It ports the tests at once; its deletion commit waits for M3a's merge.

   Brief template for a track session:
   > You own milestone M<N> of the plan at `/Users/liam/Projects/snaplot/notes/overhaul-audit/plan.md`. Read §12.0, §11.1 and the M<N> brief. Create your worktree with the §11.1 command. Edit only the paths M<N> owns. Commit tests first. Before asking to merge, run the M<N> gates (table below), run `git rebase -x` (§12.0) and write `docs/handoff/m<N>.md`. Then report the branch name to the integrator. Never push.

**What runs in parallel** (disjoint file ownership, separate worktrees):

| Wave | Parallel tracks | Merge order |
|---|---|---|
| W1 | M2, M3a, M3b, M4, M5, M6a, M6b | M5 → M3a → M4 → M2 → M6a → M3b → M6b |
| W2–W3 | M7, then M8 (serial for the library). Alongside: M6b (finishing) and the M13 harness | M7 → M8 |
| W4 | M9a, then M9b (serial). Alongside: M13, M15a, M16a/b/c on the frozen API | M9a → M9b. M13, M15a and M16 merge whenever they are done |
| W5 | M10, M11, M12a, M12b | completion order, each rebased on the previous |
| W6 | M14 | none |
| W7 | M15b, M16 finalisation | any order |
| W8 | M17 | none |

**Gates at the end of each milestone.** The track runs them. The integrator re-runs the starred ones on `overhaul` after the merge.

| When | Gates |
|---|---|
| Every milestone | `npm run verify`* (biome ci, typecheck, test, build); `git rebase -x` per §12.0; `node scripts/overhaul/metrics.mjs`; a written `docs/handoff/m<N>.md` |
| From M3a | `npm run test:visual -- --against <merge-base>`, then `node scripts/overhaul/check-visual-diffs.mjs`* (§11.3 G10) |
| From M3b | `npm run ledger`; `node scripts/overhaul/trace-check.mjs --milestone M<N>`; `npm run test:browser`* |
| From M4, for milestones touching `src/engine/**`, `src/core/**` or `src/public/**` | `npm run bench:ab -- --base <merge-base> --set M<N>` |
| From M5 | `npm run check:package`*, `npm run check:size`*, `npm run check:api`* |
| From M6a | `npm run build:site`*, `npm run check:examples`, the site smoke spec |
| From M13 | `npm run test:conformance`* |
| M14 and M17 | all of the above, plus the full bench suite and `trace-check` without `--milestone` |

---

## 1. Decisions for the maintainer

The implementers apply each recommendation. M0 copies a condensed list into `docs/decisions/0002-overhaul.md`. **If changed** says what moves. **Panel** records dissent when the three reviewing judges disagreed; the majority call is applied unless a later critique overruled it, which is noted.

### Required decisions

**D1. Version target.**
- Options: 0.13.0; 1.0.0; `1.0.0-beta.0` on the `next` dist-tag.
- **Recommendation: `1.0.0-beta.0` on `next`.** The surface is cut to something we can promise. A beta lets real users find what the migration guide missed before `latest` moves. Agents make `scripts/release.sh` and `publish.yml` prerelease-capable and write the CHANGELOG. Publishing is a human step.
- **Install strings follow the version.** Until 1.0 ships, `npm i snaplot` installs 0.12.0 (`latest`). So the homepage, the Introduction and the README generate their install string from `packages/snaplot/package.json`: a prerelease version prints `npm i snaplot@next`.
- Prerelease builds of the site show a banner: "1.0 beta docs. 0.12 docs: README at tag v0.12.0", linking to GitHub.
- `deploy.yml` refuses to deploy a prerelease unless `npm view snaplot@next version` equals the package version, so the docs never go live before the beta.
- If changed: for 0.13.0, change the version string, the CHANGELOG heading and the banner, and the install string becomes plain (no code changes). For 1.0.0, skip the `next` workflow changes and the banner.

**D2. React 18 support.**
- Options: React 19 only (ref as a prop); React 18.3 and 19.
- **Recommendation: `"react": "^18.3.0 || ^19.0.0"`.** The adapter uses:
  - `forwardRef` with a generic cast;
  - `useSyncExternalStore`;
  - `useIsoLayoutEffect`, which is `useEffect` on the server and `useLayoutEffect` in the browser, so React 18's server renderer prints no warning;
  - no React-19-only API (no ref-as-prop, no ref-callback cleanup).
- React 18 is about 21.5% of React downloads (research-07). The cost is about 10 lines and one conformance runtime.
- **The React 18 runtime** is an isolated fixture package, `packages/snaplot/test/conformance/react18/`. It is not a workspace and has its own lockfile with `react@18.3.1` and `react-dom@18.3.1`.
  - `npm run conformance:install` runs `npm pack` on `packages/snaplot` and installs the tarball into the fixture. It is never a `file:` symlink, because `dist/react.js` would then resolve the root's React 19.
  - The fixture's Vite config sets `resolve.dedupe: ['react', 'react-dom']`.
  - Conformance scenario 1 asserts that `React.version` starts with `18.3` and that the build contains exactly one react-dom chunk.
- If changed: delete the React 18 runtime and use ref-as-prop.

**D3. Controlled-state semantics.**
- Options: veto-style controlled props (today, React and Solid only); value + onChange with `default*` siblings; **declarative state options**.
- **Recommendation: declarative state options, identical in vanilla, React and Solid.** `viewport`, `selection`, `hiddenSeries` and `highlight` are ordinary `ChartOptions`.
  - **Value.** `viewport` names only the axes it pins, and `{}` means "all automatic". `highlight` is `string | null`, where `null` means none. There are no `default*` props and no `null`/`undefined` distinction elsewhere.
  - **Gestures.** A gesture changes the chart immediately.
  - **`setOptions(full)`** is what the adapters call on every render. It compares each state option (deeply) with the *last value applied from options*, and applies the value only if that differs. So an un-echoed inline literal never snaps the chart back, and re-renders never repaint or pause follow.
  - **`update(patch)`** is the imperative call. It *always* applies any state key present in the patch. So `chart.update({ viewport: {} })` resets even when the chart was created with `{}`. `chart.resetViewport()` is the same as that update.
  - **Events.** `<key>:change` (and the matching `on<Key>Change` option) fires whenever the state changes for any reason *other than* the caller passing that value in through options. Gestures, `resetViewport()`, `resumeFollow()`, group sync, follow-mode panning and a selection cleared by new data all emit. Applying an option value never emits, because it is already the caller's value. One user action emits exactly one event carrying the complete new value. A reset emits `{}`.
  - **Pausing follow.** `update({ viewport: { x: [a, b] } })` pauses following; `resumeFollow()` resumes (dxtrial-19).
  - **What it deletes:** `setControls`, the guard hooks, `default*` props, `selectionState`, and `setHighlight` on the chart handle. The group keeps `setHighlight` for imperative linking. This fixes dxtrial-04, frameworks-04 and frameworks-05 by construction.
- If changed: veto semantics need the guard layer back (about 150 lines) and per-axis batching. Comparing against the *current* state instead (the rejected user-lens variant) makes an un-echoed `viewport={{}}` reset the user's zoom on every unrelated render.
- Panel: unanimous on state options. "`update` always applies" came from judge 1; "compare with the last applied value" came from judges 2 and 3. Judge 3 also asked for an imperative `setViewport()`. It is not added, because `update({ viewport })` is the same call. `highlight` became a state option in the final edit, so a table-row hover in React links to a series declaratively.

**D4. `theme: 'auto'` follows the page or the OS.**
- **Recommendation: the page.** `'auto'` is the default.
- Resolution order, first hit wins: explicit theme tokens → CSS variables on the container (`--chart-surface`, `--chart-text`, …) → the first opaque ancestor `background-color` → the luminance of the container's computed `color` (light text implies a dark page) → white.
- Mode: dark when the surface's relative luminance is below 0.4.
- The OS preference matters only through the page's own CSS (visuals-03, research-03).
- **Re-resolution.** One document-level observer per document watches class, style and `data-*` on `html` and `body`, plus `prefers-color-scheme` changes. It coalesces into one requestAnimationFrame per document and skips charts whose resolved surface and text are unchanged. `chart.redraw()` also re-resolves. Guard: `100 body class mutations in one frame → ≤ 1 resolve per chart` (M11), and the bench scenario `theme-churn-24`.
- If changed: add `theme: 'system'`. Nothing else moves.

**D5. Default background.**
- **Recommendation: transparent.** Paint nothing. All canvases use `alpha: true`, which measured free in the perf audit (gap-perf-gate §4). Remove the 6 px container radius.
- The resolved surface colour is still used to derive the mode, label halos and ramp contrast. `theme: { surface: '#fff' }` paints an explicit panel with radius 0.
- This fixes the seam (visuals-04, PUL-01), translucent backgrounds rendering black (render-04), and the black frame on mount and resize (gap-scale-longevity-01).
- If changed: an opaque default keeps `alpha: false` and must keep the synchronous-fill fix from M1.

**D6. Legend default.**
- **Recommendation: `legend: 'auto'`.** Show it when there are 2 or more series, or one scatter series with a categorical `colorBy` (its items are then the categories, display-only).
- Placement: above the plot, left-aligned, wrapping.
- Behaviour: click toggles a series; hover or focus highlights it. Core renders it for all three frameworks.
- If changed: `false` by default, and the docs' first multi-series example adds `legend: true`.

**D7. Time zone and locale scope.**
- **Recommendation: `timeZone?: 'local' | 'UTC'` and `locale?: string` at the top level.**
  - `locale` defaults to `document.documentElement.lang`, then the runtime default.
  - Both are applied by the single formatter, and by calendar tick stepping through native `Date` local or UTC getters. That stepping also fixes DST drift (render-12) and :45-offset alignment (gap-environments-09) for viewer-local time.
  - Numbers and dates share one locale, so digit systems never mix (gap-environments-06).
  - The type is a string union, so IANA names can be added later without a breaking change.
  - IANA zones go to `docs/backlog.md`. No demo needs them.
- If changed: IANA support becomes a separate milestone after M10. It would step through `Intl.DateTimeFormat#formatToParts` offsets, with property tests across UTC, Europe/London, America/Los_Angeles, Asia/Kathmandu, Australia/Lord_Howe and Pacific/Chatham, and TZ-env test runs (about 3 days).
- Panel: judges 1 and 3. Judge 2 wanted an isolated IANA milestone with this plan as its fallback.

**D8. Legend styling.**
- **Recommendation: auto-injected styles with no CSS import.**
  - One constructable stylesheet is adopted per document or shadow root (`adoptedStyleSheets`, supported from Safari 16.4), on the first legend, legend-table, tooltip or focus-ring use.
  - Every selector is wrapped in `:where()`, so any user CSS wins. Theme values flow through CSS custom properties.
  - Remove the `./legend-table.css` export (dxtrial-06, frameworks-17).
- **Interim (M8 → M12b).** M8 removes the CSS export and injects the existing `legendTable.css` text once per document through a `?inline` import, so the interim legend is styled. M12b replaces it with `dom/styles.ts`.
- **CSP.** M12b adds a strict-CSP browser test (`style-src 'self'`). If adopted sheets are blocked there, M12b also ships the same text as `snaplot/styles.css` with a `--snaplot-css: 1` sentinel that skips injection, and documents it.
- If changed: ship `snaplot/styles.css` and add the import to every first example.

**D9. Themes catalogue.**
- **Recommendation: `'auto' | 'light' | 'dark'` or a 10-token object.** The tokens are `mode`, `surface`, `text`, `muted`, `accent`, `categorical`, `sequential`, `diverging`, `fontFamily` and `fontSize`.
- Delete:
  - the 12 decorative themes;
  - `lightTheme`, `darkTheme`, `createTheme`, `resolveTheme` and `applyThemeToElement`;
  - the CSS-variable maps.
- Replace the dark categorical palette with colour-blind-safe candidate A (§5.3), in the same hue order as light, once `scripts/check-palettes.mjs` passes.
- Keep the light palette, the approved Okabe–Ito look. Three of its members are below 3:1 on white; that part of visuals-13 is a recorded exception (§6).
- The migration guide links to v0.12.0's `constants.ts` for anyone copying old colours (visuals-14, arch-16).
- If changed: a `snaplot/themes` subpath brings back about 470 lines and a fourth entry point, and every palette must pass the CVD check.

**D10. Chart-lab fate.**
- **Recommendation: delete `experiments/` from the tree.** History keeps the tracked files at `aef1584`.
- First, M0 copies the lab's gitignored `evidence/*.png` (23 files, the Chart.js comparison behind ADR 0001) into `notes/overhaul-audit/evidence/lab/`.
- Its rule ("Chart.js is the visual reference; visual changes need approval") becomes `docs/decisions/0001-visual-reference.md`. Its DEFAULTS_FINDINGS cases become visual fixtures (M3a).
- It adds 87 packages to every install today (repo-03).
- If changed: move it outside the root workspaces with its own lockfile, consuming `snaplot` via `npm pack`.

**D11. Docs site technology.**
- **Recommendation: Astro + Starlight**, with `@astrojs/react` (`include: ['**/*.react.tsx']`) and `@astrojs/solid-js` (`include: ['**/*.solid.tsx']`) islands, Pagefind search, path routes, `starlight-typedoc`, and static output for GitHub Pages under `base: '/snaplot/'`.
  - It deletes the hand-built shell: nav, sidebar, search, theme context, hash router and live editor (about 3,000 lines).
  - It fixes most site-shell findings by construction (uisite-01/02/04/05/06/12/14/15/19/20/21, docs-11/16). The smoke spec locks each one (§8.3).
  - **Theme mechanism:** Starlight's `ThemeProvider` and `ThemeSelect` components are overridden with the §9 three-state toggle (storage in try/catch, key `snaplot-site-theme-v2`), so blocked storage cannot blank the site.
- **Gating:** a 0.5-day spike at the start of M6a (criteria in §8.2).
- **Fallbacks:**
  - If mixing React and Solid JSX fails, examples run in *frame routes*: separate Vite entries shown in iframes, so they still execute real React and Solid files.
  - If Starlight itself fails the spike, use VitePress with the same IA and pipeline.
- If changed (keep the custom Solid site): re-implement path routes, search, a11y fixes and the theme pipeline by hand (about 2 weeks), and React examples need iframes anyway.

**D12. Single package or split.**
- **Recommendation: one package, `snaplot`, with entries `.`, `./react` and `./solid`.** Each adapter is about 150 lines with an optional peer. Splitting adds versioning ceremony for no user benefit.
- If changed: `@snaplot/react` and `@snaplot/solid` workspaces plus changesets. The adapters already import `'snaplot'` after M13, so the move is mechanical.

**D13. `snaplot/core` alias.**
- **Recommendation: remove it** (repo-19). It is identical to `snaplot`. The migration guide says "import from `snaplot`".
- If changed: add `./core` back as a documented alias.

### Further decisions (needed to execute)

**D14. Sequencing.**
- **Recommendation:**
  1. Protect the baseline.
  2. Fix the six criticals plus the print and black-frame boxes in the current code (M1), each locked by a public-API test that survives the refactors.
  3. Build the safety nets (W1). The visual harness (M3a) merges before M2's deletion commit, and the perf gate (M4) merges before M2.
  4. Restructure: types (M7) → update path and final surface (M8) → split (M9a moves, M9b refactors and contracts) → parallel subsystem tracks (W5).
- Remaining defects are recorded first as expected failures and fixed in the milestone that owns their structure, so no code is fixed twice.
- Demos and the framework docs start on the frozen API (after M8), so they can feed library defects back to the W5 tracks.
- If changed: the alternative is the delivery-lens order (fix every wrong-data bug in the current architecture, then delete, split, freeze types, then run parallel tracks). It reaches "all wrong data fixed" about 5 days earlier, but rewrites the controller and hit paths twice (about 2 extra days).
- Panel: judges 1 and 2. Judge 3 preferred the delivery order and splitting the engine before the type freeze.

**D15. Axis text stays DOM.**
- **Recommendation: keep the pooled DOM tick labels and titles,** and fix their defects directly:
  - Measure with canvas `measureText` (width cache keyed by font and text) on the label with digits mapped to `0`, which gives the tabular-figure width that the DOM renders. This fixes render-26.
  - Scale by a per-chart probe span's rendered-to-requested font-size ratio, which honours the user's minimum font size (gap-environments-07).
  - Re-measure on `document.fonts` `loadingdone`.
  - Set `aria-hidden="true"` on the label layer (interact-07).
  - Use `forced-color-adjust` handling for forced colours (gap-environments-05).
  - Never read layout in the render path (gap-scale-longevity-08).
- Why DOM: it keeps tabular numerals (canvas 2D has no `font-variant-numeric`), browser text rendering and the user's minimum font size. It also avoids a pixel change on every chart during an unattended run. Because 1.0 has no PNG export (D28), there is no second, canvas text path to keep in step.
- If changed: canvas axis text deletes the label pool (about 180 lines) but loses tabular figures, ignores minimum font size, and needs maintainer approval under ADR 0001.
- Panel: judges 2 and 3. Judge 1 preferred canvas text.

**D16. Change detection, callbacks and identity.**
- **Intake.** `normalize()` copies array- and object-valued options on intake, so a later in-place mutation of the caller's arrays cannot desynchronise the chart.
- **`update(patch)`** applies every key present; the change class comes from the key, not from a comparison. So `lines.push(x); chart.update({ referenceLines: lines })` draws the new line (gap-annotations-extensibility-06), and `chart.update({ data: rows })` re-ingests after an in-place edit.
- **`setOptions(full)`**, which the adapters call on every render, compares:
  - presentation options deeply, against the last applied value;
  - state options as in D3;
  - `data` by reference, where two arrays that are both empty count as equal;
  - accessors (`x`, `y`, `lower`, `upper`, `rowId`, encoding fields) by identity.
- **Latest-ref functions.** `on<Key>Change` and `onPointClick` are `ChartOptions` in all three entries. They are called through a latest-ref, 1:1 with the `<key>:change` and `point:click` events. Vanilla may also use `chart.on(name, fn)`. Function-valued *render* options (`format`, `tooltip.render`, per-point `color`, plugin hooks) are latest-ref too, so a new identity repaints only.
- **Accessors.** A new accessor identity re-extracts only that series from the retained rows. The `accessor-churn` warning fires only when that source retains ≥ 10,000 rows, after 3 consecutive identity-only re-extractions or more than 10 per second ("memoise the accessor or use a field name").
- **Replacing streamed data.** When a data-class change replaces a source that received `appendData` since the last applied `data`, it warns once: `snaplot: data replaced on a streamed source; N appended rows were discarded. Pass data once (useState/createSignal) or omit it.` The re-ingest-rate warning (more than 10 per second) also applies only to sources of ≥ 10,000 rows.
- Source-text equality of accessors is rejected unanimously, because a closure over a changing variable would silently render stale data.
- If changed: event-only callbacks (`chart.on`) in vanilla make the docs tabs diverge between frameworks.
- Panel: judges 2 and 3. Judge 1 preferred vanilla `chart.on` only.

**D17. Group sync.**
- **Recommendation: `createChartGroup({ viewport: true })` syncs horizontal axes only, and only axes the peer has.** It never marks a peer's Y as pinned, and resets propagate as `{}`.
- `yRange: true` is the only way to share Y (dataapi-01 and the other criticals).
- Colours are assigned by series id across the group (frameworks-21).
- **No group `defaults`, no per-chart link toggles, no `unlink`.** A chart leaves with `update({ group: undefined })` or `destroy()`. The July 2026 fleet `defaults` become a shared-options spread recipe in the migration guide.

**D18. ISO date strings.**
- **Recommendation: infer a time axis** when *every* non-null X value matches `YYYY-MM-DD[THH:mm[:ss[.sss]]][Z|±hh:mm]`.
- `axes.x.type: 'time'` also accepts ISO strings.
- Numbers between 1e11 and 1e13 on an inferred linear X produce one warning (dataapi-07, dxtrial-08, gap-scale-longevity-03).

**D19. Touch defaults.**
- **Recommendation:**
  - With zoom `'x'`, `'none'` or `'readonly'`, use `touch-action: pan-y`: vertical swipes scroll the page; a one-finger horizontal drag scrubs the cursor; two fingers pinch-zoom and pan.
  - With zoom `'xy'` (the scatter default) or `drag: 'pan'`, use `touch-action: none`: a one-finger drag pans, which was the July 2026 revamp's mobile scatter goal, and two fingers pinch-zoom.
  - A tap shows a tooltip that persists until a tap outside or a scroll (interact-05/06).
  - When `drag: 'select'`, a long-press then drag selects.
  - Touch momentum respects `prefers-reduced-motion`.
- Locks: `touch.spec.ts` › a vertical swipe scrolls the page (zoom `'x'`); one-finger pan on an xy scatter; a tap persists; a pinch zooms.

**D20. Accessibility model.**
- The host has `role="figure"`, named by `ariaLabel` or an automatic summary ("Line chart, 2 series: CPU, Memory").
- Canvases and the label layer are `aria-hidden`.
- An interactive chart has a focusable inner element: `role="application"`, `aria-roledescription="interactive chart"`, the same name plus a key hint, and `aria-keyshortcuts`. Readonly charts are not tab stops.
- Keys:
  - ←/→ move the cursor point by point; Home/End go to the first or last point;
  - Shift+←/→ pan;
  - `+`/`-` zoom; `0` resets;
  - Esc clears the selection and hides the tooltip;
  - Ctrl, ⌘ and Alt combinations pass through to the browser.
- A polite live region reads the tooltip text, throttled to one announcement per 250 ms.
- Focus ring: a 2 px `accent` outline from the injected stylesheet. A pointer down focuses the chart with `preventScroll`.
- **Host attributes.** Core records which attributes the host had before mount, never overwrites them and never removes them. React and Solid render `role` and the accessible name on their host element themselves (so SSR emits the figure); in vanilla, core adds them. `destroy()` removes only what core added. Conformance #16 asserts the host's attributes are identical after 20 StrictMode cycles.
- A data-table alternative is a docs recipe, not a feature (interact-07/08/23, backlog-14).

**D21. Plugin contract.**
- **Recommendation: a minimal contract, `{ id, install?(chart) → cleanup?, drawBelow?, drawAbove?, drawOverlay? }`.**
- Draw hooks receive `(ctx, chart, plot)`. `chart.scale(key)` gives `{ type, horizontal, min, max, categories?, toPixel, fromPixel }`. `chart.redraw('overlay' | 'data' | 'all')` invalidates.
- Plugin draw hooks run after the built-in reference lines and regions in the same slot, in array order.
- Plugins are reconciled by `id`, so inline plugin objects are free.
- Each hook is error-isolated: logged once per hook, then the plugin is disabled.
- Removed: the `beforeDraw` veto, `onDataUpdate` and `onOptionsUpdate` (use `chart.on`).
- Reference lines and regions are built on the same contract (arch-17, gap-annotations-extensibility-07/08/09/11/12).

**D22. Visual taste.**
- **Keep** the maintainer-approved Chart.js-like look:
  - the square four-sided frame (V1);
  - 1.5 px lines;
  - translucent bars at 0.75 alpha, with a 1 px outline in the series colour and a 2 px value-end radius;
  - a vertical grid on continuous X.
- **Change only defects and regressions** (§5 has the exact values):
  - readout precision; area to zero;
  - theme from the page; transparent surface;
  - nearest tooltip for scatter;
  - revert V9 (padding stacked on nice bounds), V6 (tick marks on grid-less axes) and V2's label-colour fallback; replace V13 stride thinning;
  - category thinning; isolated-point markers; density ramp from the theme; scatter style continuous in N;
  - no phantom bar slots;
  - CVD-safe dark palette; dark grid parity;
  - inherited font family; measured gutters.
- **One reference-following change:** category X gridlines sit at slot boundaries, as Chart.js and the existing numeric-bar plan (V11) already do.
- Each change lands as its own commit with a visual-ledger row file, so `git revert <sha>` undoes it.
- **Recorded as proposals, not applied:**
  - removing the top and right frame;
  - `lineWidth` 2 (which would also lift the light palette's low-contrast members, visuals-13:light);
  - automatic axis titles from field names;
  - opaque bars pre-mixed at 0.75 over the surface.
- Panel: unanimous on keeping the frame and 1.5 px lines. Judges 1 and 3 accepted opaque pre-mixed bars. The final edit moved them back to a proposal, for two reasons. The lab's rule requires approval for visual refinements (visuals.md marks this one "approval needed"). And a pre-mix ties bar colour to the inferred surface, so bars over an image or a gradient would get the wrong tint.

**D23. Data model.**
- A source is *either* rows *or* columns. Mixing them throws at `appendData` with a hint.
- **Sorting.**
  - Row sources are sorted by X with a stable index sort, as today. `rowId` and the original-index mapping that callbacks receive are preserved.
  - Typed `columns` must already be sorted (the zero-copy path), and so must histogram edges. Both throw if they are not.
  - An `appendData` row batch is sorted first; any append that starts before the last retained X throws.
- Appended data is retained, bounded by `maxPoints`. For row sources the row references are kept in a ring too, so an accessor change re-extracts from retained rows.
- `rowId` values must be unique in the retained window: checked with a `Set` at append time, and duplicates throw before any mutation.
- Inferred categories are rebuilt when data is replaced and evicted when they leave the ring.
- Replaced data that does not intersect a pinned X range unpins that axis (dataapi-02/03/04/05/12/14, gap-scale-longevity-03).

**D24. Dev warnings.**
- **Recommendation: always-on `warnOnce(code, message)` in a single build,** printed as `console.warn('snaplot: …')` and deduplicated per page on `(code, message)`. A 24-chart dashboard with 0 px hosts prints one warning, not 24. The checks are cheap, so they cost nothing measurable.
- Invalid input throws at the call that caused it.
- No `development` export condition, no `__DEV__` define, no `NODE_ENV` sniffing. This fixes repo-06, and nothing disappears in bundlers or CDNs that ignore conditions.

**D25. Browser floor.**
- Chrome/Edge 111+, Firefox 115+, Safari/iOS 16.4+. Build target `es2022`, no polyfills.
- Stated in the README and docs.
- CI runs WebKit and Firefox smoke tests (gap-environments-08).

**D26. Sizing.**
- **Recommendation:**
  - The chart fills its container's width.
  - **An explicit `height` always sets the chart's height.** React and Solid apply it as `style.height` on the host element they render. Vanilla applies it to snaplot's inner wrapper, which then sits in flow at that height. `height: 280` in a stretched flex or grid cell is 280, and changing 280 to 400 resizes.
  - **Without `height`, the chart fills the container's height.** snaplot's inner wrapper is absolutely positioned inside the container, so it never contributes to the size it measures (no feedback loop).
  - **If that height is 0**, the wrapper switches to an in-flow 300 px fallback and one warning is printed. While the fallback is active, any container height other than 300 px means the user has sized the container, so the fallback is removed.
- Removed: `width`, `autoResize`, `aspectRatio` (use CSS `aspect-ratio` on the container, documented on the Sizing page) and `resize(w, h)`.
- React and Solid hosts pass `style`, `className`/`class`, `id`, `data-*` and `aria-*` through to the host element.
- If changed: with no `height` option, CSS is the only sizing mechanism and React users must style a wrapper.
- Panel: judges 2 and 3. Judge 1 preferred CSS-only sizing. The final edit replaced "height applies only when the host measures 0" with this rule, because a stretched cell silently overrode the prop.

**D27. Legend table.**
- **Recommendation: keep one legend table.**
  - It is a core DOM view: `createLegendTable(el, { chart, columns, fallback })`, returning `{ update(options), destroy() }`.
  - Columns are data-only: `'swatch' | 'name' | 'value' | { header, value(point, item) → string, align? }`.
  - Updates are keyed, so focus is preserved.
- React and Solid ship thin `<LegendTable chart={…} columns={…} />` wrappers whose props are exactly the vanilla options. That is the same rule as `<Chart>`.
- There is no separate framework `<Legend>` component; the built-in `legend` option covers it.
- Fully custom legends use `useCursor`/`createCursor` (a docs recipe).
- If changed: deleting it removes about 260 lines and the two wrappers. Users then rebuild tables from the cursor hooks.
- Panel: judges 2 and 3. Judge 1 preferred no legend table. The vanilla name `createLegendTable` beats `mountLegendTable` because it mirrors `createChart(el, options)`.

**D28. PNG export.**
- **Recommendation: no export in 1.0.** `toBlob` is removed from the plan, and "PNG and SVG export" goes to the backlog (D36).
- Reasons: with DOM axis text, an export must repaint labels and titles on canvas, which is a second text path that must match the first (fonts, alignment, tabular widths). The maintainer did not ask for export, it closes only medium judgement findings (gap-environments-04, gap-annotations-extensibility-10, both now won't-do in §6), and print already works with DOM labels.
- Cross-runtime pixel equality (P5) uses each canvas layer's `toDataURL()` plus the label layer's text and boxes instead.
- Panel: judges 1 and 2 had kept `toBlob`; the final edit removed it to keep one text path.
- If changed: add `toBlob({ pixelRatio? })` that composites the layers, fills the resolved surface underneath, and paints labels from `engine/axes/labels.ts`'s `LabelBox[]`.

**D29. Option cuts.**
- **Recommendation:** apply the cut list in §4.4. Notable cuts:
  - `tickCount`, `interaction.minRange`/`maxRange` and `pointShape`;
  - `heatmap*`, `fillGradient`, `barWidthRatio` and `padding`;
  - about 30 interaction knobs.
- **`ticks` is kept** (explicit tick values): it is the only way to get 0/50/100 on a percent axis, min/max-only sparklines or chosen log decades. Measured tick selection reduces the need but does not remove it.
- Zooming keeps an internal minimum span: at least 2 adjacent data points on the zoomed axis and never below 1e-9 of the data extent, tested in `engine/viewport.test.ts`.
- The `'readonly'` interaction preset keeps its name, because `'none'` reads as "no tooltip".
- Panel: judges 1 and 3. Judge 2 wanted to keep `tickCount` and `minRange`/`maxRange`.

**D30. Names.**
- Restore the v0.12.0 name `nice` (for `roundBounds`).
- Series `stroke` → `color`, and `lineDash` → `dash`. These match `ReferenceLine` and the legend items.
- Event `follow:change` → `following:change`.
- `getCursorSnapshot` → `getCursor`.
- One vocabulary for following: "follow window" and "following the latest data". "Live window" is banned in docs and messages; demo button copy may still say "Back to live".

**D31. Statistics API.**
- **Recommendation: remove `getStats()` and `debug.stats`.** Tests and the bench read an untyped `chart[Symbol.for('snaplot.debug')]`: `{ ingestCount, renderCount, layers, drawnPoints, inViewPoints, materializeCount, labelBoxes() }`.
- The symbol lands in M1 as instrumentation only, so M3b's ledger and M4's fidelity metric can use it from the start. M8 deletes `getStats` and `debug.stats`.
- No demo depends on it.

**D32. Docs deployment.**
- Deploy on `v*` tags and manual dispatch only, gated on CI, so the docs always match npm (docs-16). A prerelease deploys only once `snaplot@next` on npm matches the version (D1).

**D33. Demo set.** Six demos, two per framework, on public-domain, CC BY 4.0, MIT or BSD data, or a labelled seeded simulator (§10).
- Excluded:
  - share-alike data (the HR-diagram demo, which also needs reversed axes);
  - health data;
  - IANA-zone demos;
  - a nine-demo set.

**D34. Homepage.**
- One sentence, the generated install string (D1), a streaming hero driven by the deploy-#482 simulator, a fact line, the examples list with real thumbnails, and a footer (§9).
- The code shown is the executed file, in three tabs. The hero pauses offscreen and under `prefers-reduced-motion`, and has a visible pause control.
- The only facts are generated bundle sizes. There are no performance adjectives or bench numbers until the maintainer publishes a measured comparison (gap-competitive-04). The word "dense" appears only if M14 records that `firstpaint-line-1m` met its budget.

**D35. Site typography and colour.**
- **Recommendation: IBM Plex Sans and IBM Plex Mono, self-hosted via `@fontsource` (OFL).** The visual fixtures already load Plex for determinism, so this adds no dependency.
- Surfaces are plain white and near-black (`#FFFFFF` / `#111113`), not warm paper. The accent is the library's own first series colour (`#0072B2` light, `#56B4E9` dark), so the site is visibly the chart's own palette rather than a stock "tasteful" teal.
- Panel: judge 2 on Plex. Judge 1 preferred the system stack, which is the one-line fallback if the maintainer disagrees.

**D36. Deferred features.** These go to `docs/backlog.md` with acceptance criteria. They are features, not findings; declined *findings* are listed only in the §6 won't-do table, which `docs/backlog.md` references.
- IANA time zones, reversed axes, stacked bars and areas (with a `stack()` helper), horizontal bars;
- error bars and text annotations (both plugin recipes);
- colour-ramp and size legends; per-series density ramps;
- datum-level linked focus (backlog-16);
- PNG and SVG export; JSX tooltips (a docs recipe renders JSX into a `Node` until then);
- a `<snaplot-chart>` web component, a data-table a11y view;
- tidy-data `series.by` splitting (dxtrial-18: better error plus a pivot recipe);
- a DPR cap option, `Float32Array` columns, tree-shaking by mark type;
- forced-colours mapping for canvas marks; a readonly single-canvas mode; raster heatmaps;
- releasing backing stores of far-offscreen charts;
- `llms.txt` with a Markdown copy per page (a Starlight plugin);
- a published competitive benchmark page (gap-competitive-05).

**D37. Frame scheduling.**
- Visibility gating is **required**: an IntersectionObserver with a 200 px margin, plus `visibilitychange`. Offscreen charts keep state but skip paint. Print forces a paint.
- A single shared requestAnimationFrame loop across charts is a **stretch** goal in M11. It lands only if `mount-24-charts` and `resize-storm-24` improve and nothing regresses; otherwise it goes to the backlog (gap-scale-longevity-06:shared-loop).
- Separate grid and data canvases stay, because they preserve the July 2026 grid-skip pan path. There is no lazily created grid canvas.

**D38. Remaining auditor questions.** Each answer lands as a test or a backlog line.

| Question (source) | Answer | Lands as |
|---|---|---|
| Should follow pause mid-drag? (interact Q5) | A pointer-down gesture sets `following` false. Follow never auto-resumes mid-gesture. An evicted window resumes. | `engine/viewport.test.ts` (M12a) |
| Context composition, `<Chart><LegendTable/></Chart>` (frameworks Q3, research rec 4) | Rejected. The ref registry is the single lookup path (P8). | — |
| Can tooltips render framework JSX? (dxtrial Q5) | `tooltip.render` returns `string │ Node`. A docs recipe renders JSX into a Node. JSX tooltips go to D36. | page 11 recipe |
| Tooltip row order (visuals Q5) | Series order, matching the legend. | `engine/hit.test.ts` (M12a) |
| Density with several series (visuals Q6) | They merge into one theme ramp; documented. Per-series ramps go to D36. | `engine/marks/scatter.test.ts` (M11) |
| Two value axes on one side without a position (backlog Q3) | An unpositioned second value axis goes right. A third unpositioned axis on a taken side throws, with a hint. | `engine/layout.test.ts` (M10) |
| Group `defaults`, link toggles, `unlink` (gap-overhaul-delta Q4) | None (D17). A chart leaves with `update({ group: undefined })`. The migration guide shows a spread recipe. | `public/group.test.ts` (M8) |
| Do handlers added during dispatch run? (gap-overhaul-delta Q5) | The dispatcher iterates a snapshot. Listeners added during dispatch run from the next emit. | `public/events.test.ts` (M8) |
| The touch sampling budget max(400, 1.5 × plot width) (gap-perf-gate Q1) | Kept, counted over in-view points, with the fidelity gate. | bench fidelity (M11) |
| Merge or lazily create the grid canvas (gap-scale-longevity Q3) | Neither (D37). | — |
| The 1.0 scale promise (gap-scale-longevity Q4) | `mount-24-charts` plus 20 Hz `offscreen-stream-24` on the mobile profile, stated on page 17. | bench budgets (M11, M14) |
| Should the canvas follow forced colours? (gap-environments Q6) | No canvas mapping in 1.0; DOM chrome only. D36. | — |
| A lighter readonly mode or a single canvas (gap-competitive Q6) | No; the lazy overlay covers most of it. D36. | — |
| Plot-style mark helpers (research Q8) | No (P8). | — |
| Raster heatmaps (demos rec 6) | D36. | — |
| Pan-y against the July revamp's mobile one-finger scatter pan (critic §3) | D19: under `zoom: 'xy'` one finger pans and a tap shows the tooltip. | `touch.spec.ts` (M12a) |

**D39. Module format.**
- **Recommendation: ESM only, with no UMD or IIFE build.**
- The no-bundler path is `<script type="module">` with an import from `https://cdn.jsdelivr.net/npm/snaplot@<version>/+esm`. Page 4 and the README show it, with the version generated by `sync-readme`.
- `site/tests/smoke.spec.ts` › "no-build page" loads the same HTML with an import map pointing `snaplot` at the local `dist`.
- If changed: add an IIFE build (about 1 hour) and a `<script src>` example.

### Auditor recommendations not adopted

M0 copies this table into ADR 0002.

| Recommendation | Auditor | Decision and reason |
|---|---|---|
| `llms.txt` with a `.md` per page | research | Later, via a Starlight plugin (D36). |
| A sandbox link or props playground | docs, research | Rejected. Copy gives a whole runnable file, and every example runs on the page. |
| A dead-export check in CI | uisite | Covered by `noUnusedLocals` plus the golden API diff. |
| `defineOptions` / `defineSeries` helpers | dxtrial | Rejected in favour of `satisfies ChartOptions<Row>`. |
| Data utilities on subpaths | research | Rejected. `histogram` is about 150 lines and tree-shakes. |
| An `aspectRatio` option | research | Rejected. CSS `aspect-ratio` on the container, documented on the Sizing page and in the migration guide. |
| Release backing stores of far-offscreen charts | gap-scale-longevity | D36. |
| A stacked-area recipe and a `stack()` helper | gap-annotations-extensibility rec 4 | D36. |
| Expose encoding legends as data (rec 5) | gap-annotations-extensibility | Rejected for 1.0: no remaining demo needs ramp legends (V1 uses categorical depth bands). D36 keeps ramp legends. |
| `toBlob` export | gap-environments, gap-annotations-extensibility | Rejected for 1.0 (D28). |
| A pause-follow method | dxtrial | Adopted as `update({ viewport: { x } })` (D3), tested in `[dxtrial-19]`. No new member. |

Adopted from the same review: `horizontal` on `scale()`; plugin draw hooks after the built-in annotations (D21); a §3.4 guard for density-cache hits on pan; a geometry assertion that no two adjacent labels repeat (M3a); a y2 peer in `[dataapi-01]`; the four backlog demo checklist items (§10.1 #9); and a glossary page (`site/src/content/docs/reference/glossary.mdx`).

---

## 2. Principles (each has a check)

| # | Rule | Check |
|---|---|---|
| P1 | **Never fail silently.** Invalid input throws `snaplot: <what is wrong>. <how to fix it>` at the call that caused it. Suspicious input gets exactly one `snaplot:` warning per page per `(code, message)` (§5.9). | `public/normalize.test.ts` and `public/warnings.test.ts` hold one case per listed misconfiguration and spy on `console.warn`. |
| P2 | **One implementation per concept.** There is one formatter, colour parser, tick pipeline, domain policy, hit test, hover model, viewport constraint, dispatcher, legend, legend table, sync mechanism, scheduler and validation layer. | `scripts/check-architecture.mjs` fails CI on any of: `toFixed(`/`toLocale`/`new Intl.` outside `engine/format.ts`; hex/rgb/hsl parsing outside `engine/theme/color.ts`; `matchMedia`/`ResizeObserver`/`IntersectionObserver`/`requestAnimationFrame` outside `engine/render/{surface,scheduler}.ts`; `throw new Error` outside `public/` and `engine/errors.ts`; `series.type ===` outside `engine/marks/index.ts`. |
| P3 | **Adapters use only the public API.** `src/react/**`, `src/solid/**` and `src/adapters/**` import runtime code only from `'snaplot'` (externalised in their builds) and `../adapters/bind`. | `check-architecture.mjs` (error mode from M13), plus a type test that builds the adapters against `dist/index.d.ts`. |
| P4 | **Public types are the only types users see.** There is no `Omit<Engine…>`, and every exported symbol and option field has JSDoc with its default. | TypeDoc `validation.notDocumented` as an error (from M7). The golden `packages/snaplot/api/*.d.ts` is diffed in CI and must not contain `EngineConfig`, `ChartCore`, `SeriesConfig` or `ChartInstance`. |
| P5 | **Same options, same pixels** in vanilla, React and Solid. | Conformance scenario `pixel-equality`: within one run, the SHA-256 of each canvas layer's `toDataURL()` and the label layer's ordered `(text, rounded rect)` list are equal across four runtimes. Hashes are never compared against committed values. |
| P6 | **Presentation changes never touch data.** Paint- and layout-class updates do not ingest. | Debug-counter tests in `public/update-classes.test.ts`. |
| P7 | **Hot paths are O(visible) and guarded.** | Every row of §3.4 has a call-count test in `test/perf-guards.test.ts` and a scenario in `bench/gate.json`. |
| P8 | **Delete before adding.** A new public option, export or event must replace one, or close a finding named in its commit body. | Metrics gate: option leaves ≤ 110; runtime exports 4/4/4; largest file ≤ 850 (hard cap 900, exceptions explained in ADR 0002). |
| P9 | **Readouts never lose precision.** A value readout uses `maximumFractionDigits = clamp(stepDecimals + 2, 0, 6)`. A non-zero value that would round to 0 uses `maximumSignificantDigits: 2` instead. A user `format` overrides both. So at an integer step 0.4567 reads `0.46`, 0.0004567 reads `0.00046`, 39.27 reads `39.27` and 1138371 reads `1,138,371`. | Property test in `engine/format.test.ts`, plus M1's `[visuals-01]` test. |
| P10 | **Defaults follow the page.** The theme comes from the surface, the font family from the container, and the background is transparent. | Visual fixtures `theme/*` on white, cream and dark cards, each under emulated OS light and dark. |
| P11 | **Docs code is executed code.** Every docs and README sample is a file that is type-checked (strict) against the built `.d.ts` and executed in Playwright, in every framework tab it shows. | `npm run check:examples` and `site/tests/smoke.spec.ts`. |
| P12 | **Known defects are visible.** Every unfixed required finding is an `it.fails`/`test.fail` tagged `[id]` (or `[id:part]`). A fix flips it, and an unexpected pass turns the run red. | `npm run ledger`. `scripts/overhaul/trace-check.mjs` verifies all 192 required ids: every closed id has a passing test whose title contains it, or its named gate lock exists; no closed id is still in the ledger; at release, the ledger holds only §6 won't-do part-ids. |
| P13 | **A visual default change is deliberate.** It lands as its own commit with a row file `docs/decisions/visual-ledger/V<n>.md` (V-id, commit subject, fixtures, before → after, finding, revert command). | `scripts/overhaul/check-visual-ledger.mjs` fails if a commit in `overhaul-baseline..HEAD` touches `**/__screenshots__/**`, or has a `visual:` paragraph in its body, without adding or editing its row file. The only exceptions are the commits listed in `docs/decisions/visual-ledger/baseline-commits.txt`. `check-visual-diffs.mjs` (§11.3 G10) fails a merge whose screenshot diff names a fixture that is not listed in that milestone's row files. |
| P14 | **One bad listener never blocks the others.** Each listener runs in try/catch; errors are rethrown asynchronously via `queueMicrotask`. The dispatcher iterates a snapshot, so listeners added during dispatch run from the next emit. | `public/events.test.ts`. |
| P15 | **Breaking changes are written down in the same commit**, in CHANGELOG `[Unreleased]` and the migration page. | CHANGELOG lint (backticked identifiers exist in the golden `.d.ts` or appear under "Removed"). `scripts/overhaul/check-migration.mjs` greps the migration guide for every name in `docs/decisions/removed-since-0.12.txt`, which M8 generates once from `git show v0.12.0:` declarations. |
| P16 | **Public vocabulary everywhere.** Errors, warnings and docs never use engine words (`dataIndex`, `maxLen`, `tickFormat`, `syncKey`, `gutter`, `setDataCount`) or the banned "live window". | `public/vocabulary.test.ts` collects every thrown and warned message and checks each option name against the golden option-leaf list. `site/tests/lint-copy.test.ts` checks the docs. |

---

## 3. Target architecture

### 3.1 Module layout (`packages/snaplot/src`, end state)

```
index.ts                createChart, createChartGroup, createLegendTable, histogram + public types (4 runtime exports)
react.ts  solid.ts      adapter entries; import 'snaplot' only ('use client' banner on react)
public/                 the ONLY public contract (user vocabulary lives here)
  types.ts      ~750    every public type, hand-written JSDoc with @defaultValue (TypeDoc source)
  normalize.ts  ~420    options → Spec; the single validation layer; intake copies; warnOnce; ISO/epoch inference
  ingest.ts     ~350    rows | { columns, rowIds } | bins → Source; stable row sort; zero-copy columns; one X pass;
                        sorted-X flag; retained row ring; rowId Set; category registry (rebuilt, evicted)
  chart.ts      ~480    createChart facade: update/setOptions diff classifier, appendData, the 14-member handle
  state.ts      ~200    cold store (revision, coalesced per frame) + hot cursor channel (lazy) + queued, isolated dispatcher
  group.ts      ~120    createChartGroup: cursor, highlight, X viewport, alignPlots (setPlotInsets), yRange, colours by id
  histogram.ts  ~150    histogram(values, { bins?, thresholds? }) with caps, nice thresholds, edge membership
adapters/
  bind.ts       ~90     framework-neutral: prop split (options | host attributes), lifecycle, ref registry
react/          ~150    Chart (forwardRef), LegendTable, useChartState, useCursor
solid/          ~140    Chart, LegendTable, createChartState, createCursor
engine/                 internal; never in a public .d.ts
  Engine.ts     ~700    composition root: owns stores, scales, layout and modules via registration tables
  spec.ts       ~250    resolved Spec (public field names) and Source types
  errors.ts     ~50     SnaplotError, warnOnce(code, message) (page-level dedupe)
  format.ts     ~320    the one formatter: formatTick(axis, v), formatReadout(series, v), formatX(v);
                        Intl caches keyed by (locale, timeZone, options)
  data/         ~1,080  ColumnarStore, RingColumnarStore (+ row-ref ring), binarySearch, columnRangeIndex, m4
  scales/       ~650    linear, log, time (local | UTC calendar stepping), category, nice numbers, affine
  axes/ticks.ts ~350    candidates per scale (or explicit ticks) → shared formatter → measured label-box selection
  axes/render.ts ~250   axis lines, tick marks and grid on the grid canvas (strokes through render/crisp.ts)
  axes/labels.ts ~180   pooled DOM labels and titles; LabelBox[] layout type; probe-span font scale; aria-hidden layer
  layout.ts     ~200    measured gutters, reserved chrome (legend), plot rect, setPlotInsets, tiny-container policy
  ranging.ts    ~450    the one domain policy (§5.1)
  viewport.ts   ~400    the one constraint function (bounds, category snap, minimum span), zoom/pan math, follow
  selection.ts  ~200    brush (drag:'select'), clamping, Esc and click-outside clear, data-change reconciliation
  cursor.ts     ~300    the one hover model: last pointer (client + data anchor), recomputed on every change
  hit.ts        ~350    the one hit pipeline: marks contribute candidates; merge by mode; grid index for unsorted
  highlight.ts  ~80
  marks/        ~1,700  index.ts (registry, the only series.type switch); per mark type <type>/draw.ts
                        (extent, draw, legendGlyph; M11) and <type>/hit.ts (hit, valueAt, readout; M12a):
                        line, area, band, bar, histogram, scatter (+ encoding, density cache)
  render/       ~520    surface.ts (canvases, alpha, DPR, RO, jsdom no-op, height rule, reserveChrome),
                        scheduler.ts (rAF, IntersectionObserver, visibility, one coalesced theme observer per
                        document), overlay.ts, crisp.ts (device-pixel snapping for every 1 px stroke)
  interaction/  ~980    gestures.ts (pointer, touch, wheel → actions), keyboard.ts (keys + live region)
  theme/        ~460    resolve.ts (surface → mode → roles), color.ts (single parser → RGBA), palettes.ts
  annotations.ts ~250   reference lines and regions on the public plugin context; label layout with halo
  plugins.ts    ~80     plugin host: reconcile by id, per-hook error isolation, draw order after annotations
dom/
  tooltip.ts    ~260    one tooltip element per document root: portalled to the nearest open <dialog> or
                        fullscreen element, else document.body; position: fixed; transform/zoom-aware
  legend.ts     ~260    the built-in list legend over cold state; keyboard + aria-pressed
  legendTable.ts ~260   createLegendTable core view; data-only columns; keyed, focus-preserving updates
  styles.ts     ~120    adoptStyles(root, id, css): one adopted stylesheet per root, :where() selectors
test/                   fakes/, ledger/, visual/, browser/, conformance/, consumers/, perf-guards.test.ts
api/                    golden index.d.ts, react.d.ts, solid.d.ts
```

**Estimate:** about 13,500 physical lines and about 10,200 code lines, against 18,086 and 13,243 today (−23%). The largest files are `interaction/gestures.ts` (about 800) and `Engine.ts` (about 700).

### 3.2 Responsibilities and the public/internal boundary

- **Public → engine.** `normalize(options) → Spec` and `ingest(data) → Source[]` are the only translation layer. The Spec uses public field names (`title`, `nice`, `format`, `maxPoints`, `followWindow`, `xAxis`, `color`, `dash`), so most of today's rename code is deleted rather than moved. `prepare.ts` (437 lines), `validateConfig.ts` (168 lines) and the `Omit<Engine…>` types go.
- **The final surface lands early.** M7 and M8 land every option leaf (normalised into final Spec fields that the W5 tracks only read), every handle member, every event and every export. Behaviour that a W5 track has not implemented yet is a no-op, or throws `snaplot: <feature> is not available yet`, and has an `it.fails` ledger entry owned by that track.
- **Engine → public.** `Engine` emits internal events to `public/state.ts`, which owns every public notification. That is one dispatcher: listeners are isolated, and events raised during a transaction are queued and delivered after the commit (backlog-02, gap-overhaul-delta-02/03).
- **Two state channels.**
  - The *cold* store is `{ revision, viewport, selection, hiddenSeries, highlight, following, series }`. It notifies at most once per animation frame, and every data, option or state commit bumps `revision`.
  - The *hot* cursor channel computes its snapshot lazily, and only when it has subscribers (arch-07, frameworks-01/03, gap-perf-gate-03).
- **DOM companions** (`dom/**`) read only the public handle and `engine/format.ts`. React and Solid mount the same views, so there is exactly one implementation of each.
- **W5 contracts** (created by M9b, changed only through the integrator):
  - `engine/format.ts` exports `formatTick(axis, v)`, `formatReadout(series, v)` and `formatX(v)`, first implemented over today's behaviour. M10 implements them properly; M12a only calls them.
  - `engine/axes/labels.ts` exports the `LabelBox[]` layout type.
  - `engine/render/surface.ts` exposes `reserveChrome('top' | 'bottom', px)`, which the legend (M12b) calls and layout (M10) reads.
  - `engine/render/crisp.ts` is the single snapping helper every 1 px stroke goes through.
  - `dom/styles.ts` exports `adoptStyles(root, id, css)`, first implemented with one `<style>` element per root. M12b reimplements it with adopted stylesheets.
  - Each mark is split into `<type>/draw.ts` (M11) and `<type>/hit.ts` (M12a).
- **Declarations.** The `.d.ts` is rolled up per entry, so `engine/` never appears in it. Only M7 and M8 change the golden `api/*.d.ts` by design. From `ovh-api-frozen` to M17, these files belong to the integrator: `src/public/**`, `engine/spec.ts`, `src/index.ts`, the `src/{react,solid}.ts` export lists and `api/*.d.ts`. A track that cannot avoid touching them makes one isolated commit, `chore(<scope>): integrator request — <what>`, of at most 30 lines, lists it in its handoff, and the integrator reviews it at merge.
- **Debug hook.** `chart[Symbol.for('snaplot.debug')]` exposes `{ ingestCount, renderCount, layers, drawnPoints, inViewPoints, materializeCount, labelBoxes() }` to tests and the bench (from M1). It is not typed publicly.

### 3.3 The five-step user model (all a user must learn)

1. One options object, the same in vanilla, React and Solid.
2. `data` (rows or columns) plus `x` plus `series[].y` (field names or accessors). Axes are inferred.
3. `update(patch)` for edits, `setOptions(full)` to replace, `appendData` for streams.
4. State options (`viewport`, `selection`, `hiddenSeries`, `highlight`) plus `on<Key>Change`.
5. `createChartGroup()` links charts. Plugins are the advanced extension point.

### 3.4 Perf-critical paths: preserved and guarded

Each guard lands in the milestone named, as a passing test or as an `it.fails` that the fix flips. M4 implements every bench scenario named here up front.

| Path | Preserved by | Call-count guard (milestone) | Bench scenario / budget |
|---|---|---|---|
| Viewport culling (`lowerBoundX`/`upperBoundX`) | unchanged in `engine/data` | `render visits only the visible index range ±1` (M3b ledger; passes by M9a) | `line-pan-200k` ≤ 1.2× base |
| Ring physical segments, no materialisation | `RingColumnarStore` unchanged; the plugin host never passes data | `materializeCount === 0 over 100 appends` with a plugin (M8), then also with the legend and legend table (M12b) | `stream20hz-50k-{none,plugin,legendtable}`: ≤ 50 KB gross heap per append |
| Layered canvases and dirty flags | `render/surface` and `scheduler` | `cursor move dirties OVERLAY only`; `paint-class update never ingests` (M8, M11) | `hover-sweep-50k` |
| M4 during gestures **and at rest** | `marks/line`, per device-pixel column, cached per data version and viewport; hit tests use full data | `line draws ≤ 4 points per device column at rest` (M11) | `firstpaint-line-1m` ≤ 45 ms desktop / ≤ 150 ms mobile (GPU), against Chart.js at 34 ms (gap-competitive); `stream-50hz-idle` software p50 ≤ 33 ms |
| Scatter interaction sampling | sampling counts in-view points only, budget max(400, 1.5 × plot width) | fidelity `drawn ≥ 0.8·min(inView, budget)` during gestures (M11) | `scatter-pan-200k`, `pinch-zoom-50k`: fidelity ≥ 0.8 |
| Density cache | cached per data version, viewport bucket and bin size | `density cache hit on pan (0 rebins)` (M11) | `scatter-pan-200k` in density mode |
| `ColumnRangeIndex` lazy auto-range | unchanged | `pan frame does not scan the full column` (M10) | `line-pan-200k` with auto Y |
| Affine fast path | unchanged | existing affine tests | `line-pan-200k` |
| Hit testing: binary search for sorted data, grid index for unsorted | `engine/hit.ts`; the sorted-X flag set at ingest (M7) | `hover on 200k sorted scatter visits ≤ 64 points` (M12a) | `hover-sync-{line,scatter,unsorted}-200k` ≤ 0.2 ms per move on mobile (M12a) |
| Group cursor sync | the hot channel only for members with subscribers; offscreen members skip overlay paint until visible | `a 20-member group with 18 offscreen paints 2 overlays per move` (M11) | `hover-sync-group-20` |
| Layout cache, label-width cache, DOM label pool | `layout.ts`, `axes/ticks.ts`, `axes/labels.ts` | `unchanged labels are not re-measured`; `label nodes are reused (node identity)`; `render path reads no layout (spy on clientWidth/getBoundingClientRect = 0)` (M10, M11) | `line-pan-200k`, `time-pan-200k` ≤ 1.2× busy (p95 ≤ 1.5×) |
| Intl formatter reuse | `engine/format.ts` caches | `formatting 1,000 time labels constructs ≤ 4 Intl formatters` (M10) | `time-pan-200k` |
| Zero-copy typed columns | `public/ingest.ts`: implicit identity, one X pass | `columns ingest allocates no per-row JS arrays`; `X validated once per source per update` (M7) | `ingest-cols-1m` ≤ 40 ms desktop / ≤ 135 ms mobile (was 100 / 346) |
| Re-ingest avoidance | the diff classifier (M8) | `title, theme, format identity, callbacks, plugins by id → 0 ingests` (M8) | `reingest-rows-200k-title` ≤ 2 ms desktop / ≤ 8 ms mobile (was 54 / 220); `react-rerender-200k-inline` ≤ 3 ms per render |
| Group append | `setPlotInsets` instead of `setOptions` (M8) | `alignPlots append → 0 setOptions` (M8) | `group-append-3x20k-align` ≤ 0.5 ms mobile (was 6.5) |
| Offscreen charts | visibility gating (M11) | `offscreen chart paints 0 frames` (M11) | `offscreen-stream-24` busy ≤ 15% of the visible variant |
| Theme re-resolution | one coalesced observer per document (M11) | `100 body class mutations in one frame → ≤ 1 resolve per chart` (M11) | `theme-churn-24` |
| State notifications | coalesced per frame (M8) | `50 appends in one frame → 1 subscriber notification` (M8) | `stream20hz-50k-legendtable` |

**Gate.** `npm run bench:ab -- --base <ref> [--set M<N>]` (M4) runs both sides in the same job, as 3 interleaved pairs per profile.
- **Thresholds.** It passes when:
  - the busy-time median-of-medians ratio is ≤ 1.5 on the milestone's required set, or ≤ 1.2 for the move-only and deletion milestones (M2, M9a, M9b), with a 0.25 ms floor;
  - fidelity is ≥ 0.8, measured on the head only (absolute); refs older than `ovh-m1-done` report fidelity as n/a;
  - heap per operation is ≤ 1.5×;
  - each milestone's absolute budgets above are met.
- **Scope.** A merge-time run covers only that milestone's set from `bench/gate.json` (about 15 minutes). The full suite runs at M4's exit and in M14.
- **Noise.** M4's self-test must show ratios within ±0.07 on the required set; if it does not, the default becomes `--runs 5`. A run is marked noisy when the 1-minute load average exceeds half the core count, and is retried up to 3 times. After 3 noisy attempts the result is recorded as noisy in the handoff, the merge proceeds only if no required scenario exceeds 1.5×, and M14 re-runs that milestone's set.
- Absolute budgets are for the reference machine (this MacBook, an M2 Max, GPU raster, quiet), recorded in `bench/README.md`.

---

## 4. Public API

### 4.1 Vanilla

```ts
import { createChart, createChartGroup, createLegendTable } from 'snaplot';

// 1. First chart. Give the container a height (or pass `height`); a 0px host gets 300px and one warning.
const chart = createChart(document.getElementById('cpu')!, {
  data: rows,                       // [{ time: '2026-03-01T09:00:00Z', cpu: 41.2, mem: 63 }, …]  ISO strings → time axis; unsorted rows are sorted
  x: 'time',
  series: [{ y: 'cpu', label: 'CPU' }, { y: 'mem', label: 'Memory' }],   // 2 series → legend appears
  axes: { y: { title: 'Utilisation', format: { suffix: '%' } } },       // ticks "40%", tooltip "41.2%"
  ariaLabel: 'CPU and memory, last 24 hours',
});

// 2. Live data: typed columns, a fixed 10-minute follow window.
const live = createChart(el, {
  data: { columns: { t: new Float64Array(0), p99: new Float64Array(0) } },
  x: 't',
  series: [{ y: 'p99', label: 'p99' }],
  axes: { x: { type: 'time' }, y: { type: 'log', format: { style: 'unit', unit: 'millisecond' } } },
  streaming: { maxPoints: 36_000, followWindow: 600_000 },
  timeZone: 'UTC',
  onFollowingChange: (following) => { backToLive.hidden = following; },
});
socket.onmessage = (m) => live.appendData({ columns: decode(m.data) });
backToLive.onclick = () => live.resumeFollow();

// 3. Linked charts: cursor, highlight, X viewport and plot edges are shared; each Y stays independent.
const group = createChartGroup();
createChart(a, { ...latencyOptions, group });
createChart(b, { ...errorRateOptions, group });

// 4. Legends: built in by default (move it with legend: { position: 'bottom' }), or a table anywhere.
const table = createLegendTable(document.getElementById('runs')!, {
  chart,
  columns: ['swatch', 'name', 'value', { header: 'LR', value: (point) => String(point.row?.lr ?? '') }],
});

// 5. Viewport as state, e.g. persisted in the URL.
const c = createChart(el, { ...options, viewport: readViewportFromUrl(), onViewportChange: writeViewportToUrl });
lastHour.onclick = () => c.update({ viewport: { x: [Date.now() - 3_600_000, Date.now()] } });  // y stays automatic
reset.onclick = () => c.resetViewport();       // same as c.update({ viewport: {} }); emits {} once
```

No bundler:

```html
<div id="cpu" style="height: 280px"></div>
<script type="module">
  import { createChart } from 'https://cdn.jsdelivr.net/npm/snaplot@1.0.0-beta.0/+esm';   // version generated
  createChart(document.getElementById('cpu'), { data: rows, x: 'time', series: [{ y: 'cpu' }], ariaLabel: 'CPU' });
</script>
```

### 4.2 React (18.3 and 19)

```tsx
import { Chart, LegendTable, useChartState, useCursor, createChartGroup,
         type ChartHandle, type Viewport } from 'snaplot/react';

export function CpuChart({ rows }: { rows: Sample[] }) {
  return (
    <Chart data={rows} x="time" height={280}
      series={[{ y: 'cpu', label: 'CPU' }, { y: 'mem', label: 'Memory' }]}
      axes={{ y: { title: 'Utilisation', format: { suffix: '%' } } }}
      onPointClick={(p) => openRow(p.rowId)}       // inline is fine: latest-ref, never re-ingests
      ariaLabel="CPU and memory" />
  );
}

const initial: Bucket[] = [];                                         // stable identity; an inline [] is also safe
export function Latency({ feed }: { feed: Feed }) {
  const chart = useRef<ChartHandle<Bucket>>(null);                  // a plain useRef works with the hooks
  useEffect(() => feed.subscribe((batch) => chart.current?.appendData(batch)), [feed]);
  const following = useChartState(chart, (s) => s.following);      // re-renders only when it changes
  return (<>
    <Chart ref={chart} data={initial} x="t" height={240} timeZone="UTC"
      series={[{ y: 'p99', label: 'p99' }]} streaming={{ maxPoints: 36_000, followWindow: 600_000 }} />
    {!following && <button onClick={() => chart.current?.resumeFollow()}>Back to live</button>}
  </>);
}

const group = createChartGroup();      // module scope, or useState(() => createChartGroup())[0]
export function Linked() {
  const [viewport, setViewport] = useState<Viewport>({});
  const [highlight, setHighlight] = useState<string | null>(null);
  return (<>
    <Chart group={group} viewport={viewport} onViewportChange={setViewport}
      highlight={highlight} onHighlightChange={setHighlight} {...latency} />
    <Chart group={group} {...errors} />
    <EndpointTable onRowHover={setHighlight} />                      {/* table hover highlights the series */}
    <button onClick={() => setViewport({})}>Reset zoom</button>
  </>);
}

export function Runs({ steps, alpha }: { steps: Step[]; alpha: number }) {
  const chart = useRef<ChartHandle<Step>>(null);
  const smoothed = useMemo(() => ema(steps, alpha), [steps, alpha]);  // memoise derived data
  const cursor = useCursor(chart, { fallback: 'latest' });         // re-renders on cursor or data only
  return (<>
    <Chart ref={chart} data={smoothed} x="step" series={runs} legend={false} height={260} />
    <LegendTable chart={chart} columns={['swatch', 'name', 'value']} />
    <p>Step {cursor?.formattedX}</p>
  </>);
}
```

`<Chart>` notifies a WeakMap registry keyed by the ref object when it mounts and unmounts. The hooks and `<LegendTable>` subscribe to that registry, so a plain `useRef` works and no state-backed callback ref is needed (frameworks-14, research-05). The hooks also accept a `ChartHandle` directly.

### 4.3 Solid

```tsx
import { Chart, LegendTable, createChartState, createCursor, createChartGroup,
         type ChartHandle, type Viewport } from 'snaplot/solid';

const [chart, setChart] = createSignal<ChartHandle<Row>>();
const following = createChartState(chart, (s) => s.following);
const cursor = createCursor(chart, { fallback: 'latest' });
const [viewport, setViewport] = createSignal<Viewport>({});
const group = createChartGroup();                                   // the core function, no Solid wrapper

<Chart ref={setChart} data={rows()} x="time" height={280} group={group}
  series={[{ y: 'cpu' }, { y: 'mem' }]} viewport={viewport()} onViewportChange={setViewport} />
<LegendTable chart={chart} columns={['swatch', 'name', 'value']} />
<p>{cursor()?.points[0]?.formattedY}</p>
<Show when={!following()}><button onClick={() => chart()?.resumeFollow()}>Back to live</button></Show>
```

Companion primitives and `<LegendTable chart>` accept `Accessor<ChartHandle | undefined> | ChartHandle | undefined` (frameworks-09, conformance #22).

### 4.4 Option surface: renames, removals and additions

**Top level.**

| Current (`overhaul` baseline) | New | Note |
|---|---|---|
| `data`, `x`, `rowId`, `series`, `axes`, `streaming{maxPoints, followWindow}`, `referenceLines`, `referenceRegions`, `plugins`, `group`, `ariaLabel` | keep | `followWindow` is a fixed-width window `[latest − w, latest]` from the first sample (dxtrial-19); plugins are Row-agnostic (`NoInfer`) and reconciled by `id`; `group: undefined` leaves the group |
| `height` (engine number) | `height?: number │ string` | always sets the chart height when given (D26) |
| `width`, `autoResize`, `padding` | **removed** | CSS sizing; measured gutters |
| `interaction: 'timeseries' │ 'analytical' │ 'readonly'` | `interaction?: 'readonly' │ { zoom?: 'x' │ 'xy' │ 'none'; drag?: 'zoom' │ 'select' │ 'pan'; bounds?: 'data' │ 'none' }` | `'timeseries'` → the default; `'analytical'` → `{ zoom: 'xy' }`. The default zoom is `'x'`, or `'xy'` when every series is scatter. Shift+drag pans, Ctrl/⌘+wheel zooms, double-click resets. |
| `zoom.{enabled, x, y, axis, wheelStep, pinchMode, minRange, maxRange, bounds, onZoom}` | → `interaction.zoom`/`bounds`; the rest **removed** | `onZoom` was never called (arch-12); internal minimum span (D29) |
| `pan.{enabled, x, y, axis}`, `touch.{hitRadius, drag, selectionGesture, longPressMs}` | **removed** | pan follows the zoom axes; `drag: 'pan'` gives one-finger pan; long-press-drag selects when `drag: 'select'` |
| `cursor.{show, snap, xLine, yLine, indicators, color, dash, syncTooltip}` | `cursor?: boolean` | the Y line is automatic for `zoom: 'xy'`; colour = `accent` |
| `highlight.{enabled, dimOpacity, proximity}` | `highlight?: string │ null` (a state option) | legend hover dims other series to 0.2; the knobs are removed |
| `selection.{mode, dataChange}` | `interaction.drag: 'select'`; `selection` becomes a state option | a data change clears a selection that falls outside the new data and emits `selection:change` |
| `tooltip.{show, mode, offset, xFormat, yFormat, rangeFormat, render}` | `tooltip?: boolean │ { mode?: 'index' │ 'nearest'; render?(points): string │ Node }` | values come from `series.format` > `axes.<k>.format` > automatic; mode `'x'` removed (interact-19) |
| `performance.interactionSampling`, `debug.stats` | **removed** | internal; debug symbol (D31) |
| `theme: Partial<ThemeConfig>` (20 roles) | `theme?: 'auto' │ 'light' │ 'dark' │ ThemeTokens` | 10 tokens (D9) |
| `onPointClick`, `onSelect` | `onPointClick`, `onSelectionChange`, plus `onViewportChange`, `onHiddenSeriesChange`, `onHighlightChange`, `onFollowingChange`, `onCursorChange` | latest-ref; 1:1 with the events (D16) |
| React/Solid `viewport`/`defaultViewport`/`onViewportChange`, `selectionState`/`defaultSelection`/`onSelectionChange`, `hiddenSeries`/`defaultHiddenSeries`/`onHiddenSeriesChange`; engine `series.visible`, `setSeriesVisible` | `viewport?: Viewport`, `selection?: Selection │ null`, `hiddenSeries?: readonly string[]` as core options | D3. `Viewport = Partial<Record<axisKey, readonly [number │ Date, number │ Date]>>`; `Selection = { x: [a, b]; y?: [a, b] }` |
| — | **added** `legend?: boolean │ 'auto' │ { position?: 'top' │ 'bottom' }` | D6 |
| — | **added** `locale?: string`, `timeZone?: 'local' │ 'UTC'` | D7 |

**Axes** (19 leaves → 10).

| Current | New |
|---|---|
| `type`, `title`, `min`, `max`, `position`, `categories` | keep. `min`/`max` accept `Date`. An unpositioned second value axis goes right; a third unpositioned value axis on a taken side throws with a hint (dataapi-11, backlog-10). |
| `roundBounds` | → **`nice`** (the v0.12.0 name). Default `true` for value axes and `false` for the X of line, area and band. |
| `ticks` | keep as `ticks?: readonly (number │ Date)[]`: explicit values skip candidate generation, are clamped to the domain, gridlines follow them and `format` still applies |
| `rangePadding`, `auto`, `tickCount`, `tickMarks`, the `grid{…}` object | **removed**; `grid?: boolean` kept |
| `format(value: number │ string)` | `format?: NumberFormat │ DateFormat`, typed per axis kind. `NumberFormat = ((v: number) => string) │ (Intl.NumberFormatOptions & { prefix?: string; suffix?: string })`; `DateFormat = ((v: number) => string) │ Intl.DateTimeFormatOptions`. Not accepted on category axes, which is a type error with a runtime throw (docs-03, dxtrial-05). |

**Series.**

| Current | New |
|---|---|
| `stroke` | → **`color`** (identity colour for every mark and the legend swatch) |
| `fill` on area and band | keep (`null` = no fill) |
| `fill(value, rowIndex, row)` on bars and scatter | → `color: (value, row, index) => string` (latest-ref, applied at paint time) |
| `lineDash` | → **`dash`** (the same name as reference lines) |
| `id`, `label`, `type`, `data`, `x`, `y`, `rowId`, `xAxis`, `yAxis`, `lineWidth`, `opacity`, `pointRadius`, `interpolation`, `spanGaps`, `lower`, `upper`, `renderMode`, `colorBy{field, type, palette, domain, label, format}`, `sizeBy{field, range, label, format}`, `tooltipFields{field, label, format}`, `format` | keep. `series.format` applies to that series only (dataapi-09). Per-series `data` types its fields as `string │ ((row: any) => …)` (dataapi-08). |
| `fillGradient`, `barWidthRatio`, `pointShape`, `heatmapBinSize`, `heatmapGradient`, `colorBy.nullColor`, `sizeBy.scale`, `sizeBy.domain` | **removed**. `sizeBy` maps area proportionally to the value from zero (render-18). Density uses the theme's sequential ramp. |

**Annotations.**
- `ReferenceLine { axis, value, label, color, dash, lineWidth }` is kept.
- `ReferenceRegion { axis, from, to, label, color, opacity }`: `fill` → `color`; `edges`, `edgeColor` and `edgeDash` are removed; `from` and `to` accept `±Infinity` for open ends.

**Handle** (24 → 14 members):
- `container`
- `update(patch)` and `setOptions(full)` (now public)
- `appendData(data, { seriesId?, updateLast? })`
- `getState()`, which returns `{ revision, viewport, selection, hiddenSeries, highlight, following, series }`
- `subscribe(listener)` and `on(event, listener)`
- `getCursor({ fallback? })`, renamed from `getCursorSnapshot`
- `resetViewport()` and `resumeFollow()`
- `setCursor(x │ null)`
- `scale(key)` (new), which returns `{ type, horizontal, min, max, categories?, toPixel, fromPixel }`
- `redraw(layer?)`, which also re-resolves the theme
- `destroy()`

Removed members and their replacements:

| Removed | Replacement |
|---|---|
| `getOptions` | — |
| `getLegendItems` | `getState().series` |
| `getTheme` | — |
| `refreshTheme` | `redraw()` |
| `getLayout` | the plugin `plot` rect |
| `getStats` | debug symbol |
| `getAxis` | `scale` |
| `resize(w, h)` | — (gap-environments-03) |
| `setViewport`, `setSelection`, `setSeriesVisible`, `setHighlight` | `update({ viewport │ selection │ hiddenSeries │ highlight })` |

**Events** (13 → 7):
- `cursor:change`
- `viewport:change`
- `selection:change`: payload `{ x, y?, points } │ null`, emitted on settle
- `hiddenSeries:change`
- `highlight:change`
- `following:change` (was `follow:change`)
- `point:click`

Removed events and their replacements:

| Removed | Replacement |
|---|---|
| `state:change` | `subscribe` |
| `select` | merged into `selection:change` |
| `data:update`, `options:update`, `theme:update`, `resize` | — |

**Group.** `createChartGroup({ cursor = true, highlight = true, viewport = true, alignPlots = true, yRange = false })` returns `{ setCursor, setHighlight }`. A chart leaves on `destroy()` or `update({ group: undefined })`; an empty group is garbage. `yAxis`, `destroy`, `defaults`, link toggles and `options` are removed (D17).

**Exports.**
- `snaplot`: `createChart`, `createChartGroup`, `createLegendTable`, `histogram`, plus types.
- `snaplot/react`: `Chart`, `LegendTable`, `useChartState`, `useCursor`, plus re-exports of `createChartGroup` and `histogram` (the identical symbols), plus types.
- `snaplot/solid`: `Chart`, `LegendTable`, `createChartState`, `createCursor`, plus the same re-exports.
- **Removed:** `snaplot/core`, `snaplot/legend-table.css`, the 14 theme objects and 6 theme helpers, `CHART_CSS_VARS`, `SNAPLOT_THEME_CSS_VARS`, `createLegendPlugin`, `createLegendTablePlugin`, the column helpers (`nameColumn`, `valueColumn`, `swatchColumn`, `metricColumn`, `column`), `lttb`, `m4` (now internal), `lowerBound`, `upperBound`, `nearestIndex`, `viewportIndices`.
  - From React: `SeriesLegend`, `useChartGroup`, `useHighlight`, `useCursorSnapshot`, `onReady`.
  - From Solid: the `createChart` primitive, the `createChartGroup` wrapper, `createHighlight`, `createCursorSnapshot`, `SeriesLegend` and `columns.tsx`.

### 4.5 Naming rules

1. **One name per concept everywhere:** option `viewport` ↔ state `getState().viewport` ↔ event `viewport:change` ↔ callback option `onViewportChange`. Events are `<stateKey>:change` plus `point:click`, and every `on<Key>Change` option is a 1:1 alias of its event. Following is "follow window" and "following" everywhere (D30).
2. **No framework duplicates.** A framework entry never defines a name that core also defines. Re-exports are the identical symbol. Hooks share suffixes: React `useChartState`/`useCursor`, Solid `createChartState`/`createCursor`.
3. **No engine vocabulary** (`dataIndex`, `tickFormat`, `maxLen`, `syncKey`, `gutter`). Errors use public names (P16).
4. **Booleans are positive** (`grid`, `cursor`, `legend`, `tooltip`): `false` disables, an object configures.
5. **Readonly arrays** in public types. `Row` generics never infer from plugins (`NoInfer`).

---

## 5. Defaults and visual system

Values are exact where the audit supplied them. Every pixel-changing item lands as its own commit with a visual-ledger row file (P13).

### 5.1 Domains and ticks

| Case | Default |
|---|---|
| Value axes (Y of every mark) | Nice rounding to the tick step with **0% padding** (Chart.js `grace: 0`), in one pass; the 8-pass re-nice loop is deleted. One-signed data never crosses zero. Bar, histogram and area include 0 on linear axes (visuals-02/07, render-10, V9 revert). |
| Bars on a log value axis | Bars start at the domain minimum; 0 is not forced. |
| Constant series | ±10% of \|v\| (±1 when v = 0), then nice. This keeps the v0.12.0 fix (V12). |
| X of line, area and band | Tight to the data (`nice: false`); labels at nice ticks inside. |
| Scatter, both axes | Nice, plus a pixel inset of `pointRadius + 2` so edge points are not clipped. |
| Numeric bar X | `[first − ½ slot, last + ½ slot]`; labels inside only (visuals-08, backlog-13). |
| Category X | Slots `[−0.5, n − 0.5]`. Gridlines at slot boundaries, never through bar centres. Annotation regions span slot edges (gap-annotations-extensibility-01). |
| Histogram X | `[firstEdge, lastEdge]`, unpadded (render-27); ordinary linear nice ticks (render-08). |
| Log | The domain is padded to the nearest 1-2-5 sub-decade step; ticks at 1, 2, 5 × 10^k. If fewer than 2 fall in range, use linear nice ticks in log space (render-06). Values ≤ 0 are dropped with one warning. |
| Time | Calendar-aligned stepping in `local` or `UTC` using native getters, so DST and :45-offset zones stay aligned (render-12, gap-environments-09). Multi-scale labels: the first tick and each boundary tick carry the larger unit (`Jan 2026`, `Feb`, …). `hour: 'numeric'` (no leading zero in 12-hour locales); `fractionalSecondDigits`, never `AM.200` (render-11, visuals-24). A single Date point gets ±1 day if midnight-aligned, else ±1 hour. |
| Tick count | From pixels: about 80 px per X label and 40 px per Y label, clamped to 2–10. |
| Explicit `ticks` | Candidate generation is skipped; values outside the domain are dropped; gridlines follow them; `format` applies. |
| Collisions | Regenerate at the next coarser nice step until the measured label boxes fit, and also when formatted labels repeat (no two adjacent labels share text). Edge labels are clamped inside and re-checked. Never stride-thin numeric axes (visuals-09, render-13/14/19, V13). |
| Category labels | Keep every k-th label from the first, where k is the smallest value that fits by measured widths. Ellipsize to `k × slot − 8 px`; the full label goes in the tooltip. No rotation (render-02, backlog-03, DEF-03). |
| Axis titles | Ellipsized to the plot length, with the full text in a `title` attribute (DEF-01). |
| Label measurement | `measureText` with the label's digits mapped to `0` (tabular width), times the probe-span scale. Cached by (font, text). Re-measured on `document.fonts` `loadingdone` (render-26, gap-environments-07). |
| Gutters | Measured. Left = widest Y label + 4 (tick) + 4 (gap) + 8 (edge). Bottom = 4 + 4 + line height + 8 (+ a title line). Top = max(8, ½ line) plus any reserved chrome (the legend). Right = max(12, overhang of the last label). That is about 28/8/12/31 at 320×200. Below a 120×80 plot, titles drop first, then tick labels, keeping the plot ≥ 40% of the box (visuals-16, render-25). |
| Empty data | No ticks, no grid, no fake 0–1 domain. A centred muted "No data" in `fontSize`. The accessible name gets ", no data". `update({ data: [] })` resets the domains (visuals-23, backlog-11). |

### 5.2 Formatting (one module: `engine/format.ts`)

- **Ticks.** `Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: true })`, where d is the step's decimals. So the output is `0.2`, never `0.20`, and `1,500,000`.
  - Compact notation (`1.5M`) when max |tick| ≥ 1e6.
  - Scientific with 3 significant digits below 1e-6, or at 1e15 and above (render-07/21, visuals-11, backlog-18).
- **Readouts** (tooltip, legend table, cursor snapshot, annotation labels): `maximumFractionDigits = clamp(stepDecimals + 2, 0, 6)` with grouping. A non-zero value that would round to 0 uses `maximumSignificantDigits: 2`. So at an integer step 0.4567 reads `0.46`, 0.0004567 reads `0.00046`, 39.27 reads `39.27` and 1138371 reads `1,138,371` (visuals-01, dxtrial-02).
- **Precedence:** `series.format` (that series only) > `axes.<k>.format` (ticks **and** readouts: backlog-01, dxtrial-03, interact-02) > automatic.
  - An Intl options object merges over the step-derived defaults. When it gives no `maximumFractionDigits`, readouts use the readout rule above.
  - `prefix` and `suffix` wrap the result. `{ suffix: '%' }` is the documented way to show 0–100 data, because `style: 'percent'` multiplies by 100.
- **Categories** show their label, never an index. A time axis shows its readout at the data spacing's precision: seconds when any value has seconds, milliseconds when any has milliseconds.
- **Special rows:** a band row reads `50.2 (46.1 – 54.3)`; a histogram row reads `Range 95 – 99 · Count 167`.
- **Caching.** Formatters are cached `Intl` instances keyed by (locale, timeZone, options). One locale serves numbers and dates (gap-environments-06, gap-perf-gate-09).

### 5.3 Theme resolution and palette

- **Resolution:** D4 order. Tokens override CSS variables, and CSS variables override mode defaults.
- **CSS variables** (read from the container): `--chart-surface`, `--chart-text`, `--chart-muted`, `--chart-accent`, `--chart-font`, and `--chart-1` … `--chart-8` (the shadcn convention; a bare HSL triple such as `220 70% 50%` is wrapped in `hsl()`; research-04).
- **Re-derivation:** when only `surface` changes, every role is re-derived for the new mode (render-15).
- **Roles** (existing approved colours; changes marked):

| Role | Light | Dark |
|---|---|---|
| text (titles) | `#1a1d29` | `#e2e2e5` |
| muted (axis labels, legend text) | `#6b7181` (4.7:1) | `#8a8e9c` |
| axis labels when the user sets `text`/`--chart-text` but not `muted` | follow `text` (reverts V2's fallback; gap-overhaul-delta-01) | same |
| grid and frame | `#c3c6cf` at 0.5 | `#2a2d3a` at **1.0** (was 0.55; parity per visuals-25) |
| tick marks on grid-less axes | `muted` at full strength (reverts V6; gap-overhaul-delta-04) | same |
| accent (crosshair, focus ring, selection) | `#3b4254` | `#a0a5b8` |
| selection and brush | accent at 0.12 fill and 0.8 stroke (was hard-coded blue; interact-22) | same |
| tooltip surface / text / border | `#ffffff` / text / `#dadde3` | `rgba(20,23,32,0.96)` / `#e8e8eb` / `rgba(255,255,255,0.1)` |
| font | `fontFamily`: the container's computed family (**changed** from a fixed system stack; visuals-15). `fontSize` 11 for axes; tooltip, legend and annotations use `fontSize + 1`. Titles keep today's size and weight. | same |

- **Light categorical palette** (unchanged, Okabe–Ito order): `#0072B2 #009E73 #E69F00 #D55E00 #CC79A7 #56B4E9 #7F3C8D #666666`.
  - Three members are below 3:1 against white: `#E69F00` (2.17), `#56B4E9` (2.23) and `#CC79A7` (2.95). This is a recorded exception (visuals-13:light, §6): the order is the approved look, and the legend, the tooltip swatches and the mark shape carry series identity. `lineWidth` 2 is the recorded proposal that would compensate (D22).
- **Dark categorical palette:** candidate A, `#56a8f0 #2bc49a #f0b429 #ff7a45 #e58fc0 #9ad8ff #b48ae0 #a3a9b5`, in the same hue order (visuals-13:dark).
  - It is adopted only if `scripts/check-palettes.mjs` passes, under the Machado 2009 CVD simulation:
    - the first 3 colours have CIEDE2000 ≥ 10 under normal vision, deutan and protan;
    - the first 5 have ≥ 7 under deutan and protan;
    - all 8 have ≥ 3:1 contrast against `#14161f`.
  - `check-palettes` enforces these for the dark palette only. It prints the light palette's contrasts as information.
  - If candidate A fails, the agent adjusts lightness only, in 2% steps, keeping the hue order, and records the final values in that commit's visual-ledger row.
- **Sequential ramps:**
  - Light runs `#c6dbef → #08306b`; dark runs `#1d3a5f → #c6e2ff`.
  - Continuous `colorBy` and density skip any stop under 1.5:1 against the surface, so low values never vanish (render-09).
  - Density uses `theme.sequential` (never hard-coded viridis): dense is darkest on light surfaces and lightest on dark ones, with 2 CSS px bins (visuals-06). Several density series merge into one ramp (D38).

### 5.4 Marks

- **Line:** 1.5 px. An isolated finite point (a single observation, or a point between gaps) draws a marker of radius `lineWidth + 1` (render-05, backlog-04, DEF-04).
- **Area:**
  - Fills to y = 0, clamped to the plot.
  - Fill strength: one area gets a gradient from 0.24 to 0.04 alpha; two or more get a flat 0.10.
  - Honours `fill`, `fill: null`, `opacity` and `interpolation` for any CSS colour (render-03, visuals-17/18).
- **Band:** fill at 0.18 and honours `interpolation`.
- **Bar** (today's approved look):
  - The fill is `color` at 0.75 alpha (or `opacity`), translucent, so it adapts to any background.
  - A 1 px outline in `color` and a 2 px radius at the value end. Edges snap to device pixels. A bar with `color` but no explicit outline gets its outline from that same colour, never from the palette (demos-10).
  - Geometry is unchanged: 57.6% of the slot.
  - Negative bars get no positive headroom (render-22).
  - Hover adds a 1 px accent outline and 8% darkening, visible on light themes and log Y (render-24).
- **Histogram:** honours `color`, and the legend matches it (demos-06, backlog-12). One series is drawn at 0.75 alpha like bars; two or more overlaid get 0.5 alpha plus a 1 px opaque top outline.
- **Scatter:**
  - `r = clamp(1.5, 3, 3·√(1000/N))` and `alpha = clamp(0.25, 0.85, 0.85·√(2000/N))`, continuous in N (visuals-19).
  - `renderMode: 'auto'` switches to density above 200k in-view points.
  - `colorBy` palettes accept any CSS colour (arch-02, render-17).

### 5.5 Tooltip

- **Mode.** `index` is the default and snaps to the nearest X anywhere along X inside the plot. It hides only beyond the data's X extent ± half the sample spacing; the old 32 px Y gate is removed (interact-15, dxtrial-20, uisite-03). `nearest` is the default when every visible series is scatter: Euclidean distance in pixels, within 32 px for a mouse and 44 px for touch (visuals-05, dxtrial-07).
- **Content.**
  - One layout for 1…N rows. The header is the formatted X.
  - Each row is a mark-shaped swatch (line, dash, square or dot), the series label and the value, right-aligned in tabular figures. Rows keep series order, matching the legend.
  - Mixed bar and line charts list every series (interact-03).
  - A single-point tooltip uses the same layout, with the series name (interact-04, visuals-12).
  - Nearest-scatter rows use the axis titles ("Height 172 cm · Weight 68 kg"), then the colour category, then `tooltipFields` in order. Coincident points are all listed.
  - Rows cap at 12, then "+N more". The width caps at 320 px; labels ellipsize and values never hide (interact-16).
  - `render(points)` returns `string | Node`; strings are inserted as text unless the docs' XSS note is followed.
- **Placement.**
  - One `position: fixed` element per document root, mounted in the nearest open `<dialog>` or fullscreen element when the chart is inside one, else in `document.body` (interact-11).
  - Pointer coordinates are corrected for CSS transforms and `zoom` on ancestors (interact-12, gap-environments-10).
  - It flips to stay inside the viewport.
  - On touch it sits above the finger and persists after a tap.
  - It is hidden on `beforeprint`.

### 5.6 Legend and legend table

- **Legend.**
  - `'auto'` shows at 2 or more series, or for a categorical `colorBy` (static category items). It sits above the plot, left-aligned and wrapping, with a 12 px gap, in space reserved through `reserveChrome('top', px)`. Mark-shaped swatches.
  - Each item is a `<button aria-pressed>` with a fixed accessible name, the series label (interact-21). Click toggles `hiddenSeries`; hover or focus sets `highlight`, which dims the other series to 0.2. Hidden series show at 0.45 opacity with a strikethrough.
  - Text is `muted` with no stacked opacity, ≥ 4.5:1 (visuals-20).
  - Swatches use `forced-color-adjust: none`, and focus rings use `Highlight` in forced colours (gap-environments-05).
  - `update({ theme })` recolours the legend and legend table (gap-overhaul-delta-02).
- **Legend table.**
  - Default columns are swatch, name and value. The value comes from the cursor or, without a cursor, from the latest data (`fallback: 'latest'`), and refreshes on every data commit (frameworks-01).
  - The header is the X-axis title plus the formatted X. There is no "Step:" and there are no em-dash placeholders.
  - Updates are keyed rows, so focus is preserved (frameworks-08).
- **Colours** are assigned by series id across a group (frameworks-21).

### 5.7 Sizing and lifecycle

- **Sizing:** D26.
- **ResizeObserver.** The callback renders synchronously and skips no-op reallocations (same device size and DPR). A chart renders exactly once at mount (gap-scale-longevity-01/05).
- **Pixels.**
  - Backing stores are integer device pixels; the CSS size is the exact fractional box.
  - `crisp()` snaps every 1 px stroke (grid, frame, ticks, crosshair, brush) to device-pixel centres, at DPR 1, 1.25, 2 and 3 (render-16).
  - The DPR watcher acts only when `devicePixelRatio` actually changed (gap-environments-01).
- **Visibility.** Gating is on (D37). `beforeprint` paints every chart synchronously, and a print stylesheet sets `break-inside: avoid` and `max-width: 100%` (gap-environments-02:print-basics).
- **Memory.** The overlay canvas is created on first pointer entry, cursor sync or selection. Backing stores are released on destroy (gap-scale-longevity-04, gap-competitive-03).
- **Document-level resources.** One theme observer, one `matchMedia` listener and one DPR watcher per document, whatever the number of charts (gap-scale-longevity-09).
- **No canvas or ResizeObserver** (jsdom, SSR): the chart renders nothing, warns once and never throws (repo-04).
- **Container.** It gets `isolation: isolate` (gap-overhaul-delta-07). The render path never reads layout: sizes come from the ResizeObserver entry (gap-scale-longevity-08).

### 5.8 Accessibility defaults

D20 in full, plus these:
- The visually hidden summary named by `aria-describedby` reads, for example, "Time from 1 Mar 2026 to 31 Mar 2026. Utilisation from 0% to 100%."
- Text is ≥ 4.5:1. The dark palette's marks are ≥ 3:1. The light palette's exceptions are listed in ADR 0002 (visuals-13:light).
- An axe scan has 0 serious violations on every fixture page.

### 5.9 Validation and warnings (P1)

- **Throws** (`snaplot: …` with the fix):
  - an unknown series type;
  - a field missing from every row, with a "did you mean" suggestion;
  - unsorted typed `columns` or histogram edges ("columns must be sorted by x; pass rows to have them sorted");
  - an append that starts before the last retained X;
  - rows and columns mixed in one source;
  - duplicate or missing `rowId` on append;
  - an X kind mismatch on append (dataapi-12);
  - a non-finite viewport or selection (dataapi-16);
  - `format` on a category axis;
  - a third unpositioned value axis on a side that is already taken;
  - invalid histogram input;
  - a duplicate plugin `id`;
  - `appendData({ seriesId })` on a shared source.
- **Warns once per page per `(code, message)`:**
  - an unknown option key (arch-10);
  - a 0 px host (300 px fallback);
  - epoch-like numbers on an inferred linear X;
  - accessor churn, only for sources of ≥ 10,000 rows (D16);
  - more than 10 re-ingests per second, only for sources of ≥ 10,000 rows ("use appendData or memoise data");
  - data replaced on a streamed source, with the number of discarded rows (D16);
  - a plugin hook error (that plugin is disabled; gap-annotations-extensibility-11);
  - log-axis values ≤ 0 dropped;
  - more than 150 MB of canvas backing stores on the page;
  - no canvas or ResizeObserver.

---

## 6. Bug-fix program (grouped by root cause)

Each group names:
- the duplicated or missing structure that causes it;
- the single structure that replaces it;
- the findings that disappear with it;
- the regression tests that lock it;
- the owning milestones.

The milestone **Closes** lists in §12 are the source for `scripts/overhaul/trace-ids.json`. Where this table and a Closes list disagree, the Closes list wins; `node scripts/overhaul/trace-ids.mjs --render` prints the per-milestone and per-root-cause views from the JSON for the handoff.

**How the tests are written.**
- Every locking test has the finding id in its title, for example `it('[dataapi-01] peers with different Y units keep their own Y')`. Part-tagged ids keep their suffix, for example `[backlog-15:categorical]`. That makes `trace-check` mechanical.
- M3b records every still-open required defect first, as an `it.fails('[id] <expected behaviour>')` (unit) or a `test.fail(true, '[id]')` (browser), in a file named after the owning milestone (`test/ledger/m10-format.test.ts`, `test/browser/m12a-tooltip.spec.ts`). The owning milestone flips the marker in its fix commit, so the suite is green at every commit.
- A required id with no automatable test (docs, site and demo findings) has a *named gate lock* in `trace-ids.json` instead, such as `site smoke [uisite-06]` or `montage --check`.
- The ledger tests port the audit repros in `notes/overhaul-audit/evidence/repro/**`, which currently assert the defect, by inverting their assertions.

| RC | Root cause → replacement structure | Findings closed | Regression tests (file › title fragment) | Milestones |
|---|---|---|---|---|
| RC0 | **Criticals and black boxes, fixed early.** The group broadcasts the full viewport; readouts use the tick formatter; print is treated as a DPR change; the ResizeObserver callback clears an opaque canvas outside the frame. → Horizontal-only broadcast, a `formatValue` seed, a DPR guard, synchronous resize paint | **dataapi-01, dxtrial-01, frameworks-06, interact-01, dxtrial-02, visuals-01**, gap-environments-01, gap-scale-longevity-01 | `test/ledger/m1-group.test.ts` › `[dataapi-01]…[interact-01] peers with different Y units keep their own Y; a y2 peer keeps its own y2; a peer without x2 still syncs x; reset propagates {}`; `m1-readout.test.ts` › `[visuals-01] 0.4567 at an integer step reads 0.46`, `[dxtrial-02] cursor snapshot keeps value precision`; `m1-lifecycle.test.ts` › `[gap-environments-01] print with unchanged DPR keeps canvases`, `[gap-scale-longevity-01] resize paints synchronously` | M1; made structural in M8, M10 and M11 |
| RC1 | **Translation layer, re-prepare-everything and identity mirrors** → one Spec, intake copies, ingest with retained sources, diff classes, latest-ref callbacks, plugins reconciled by id | arch-01, 03, 04, 05, 10, 11, 13, 15, dataapi-02, 04, 10, 15, 21, 22, frameworks-02, gap-annotations-extensibility-05, 06, 07, 08, gap-perf-gate-04, 05, 06, research-01, 08, 12, dxtrial-11:callbacks, dxtrial-11:data, dxtrial-17, gap-competitive-01:ingest, repo-06 | `public/update-classes.test.ts` › title, ariaLabel, theme, referenceLines, format identity, callbacks → 0 ingests; accessor identity → 1 series re-extract; data identity → 1 source ingest; both-empty arrays → 0 ingests; `[gap-annotations-extensibility-06] in-place push then update({ referenceLines }) draws the new line`. `public/ingest.test.ts` › no per-row arrays for columns; X validated once; retained rows survive accessor change and update; mixed sources throw. `public/types.typecheck.ts` › `[gap-annotations-extensibility-08] ChartPlugin has no beforeDraw`. `public/plugins.test.ts` › an inline plugin with the same id is not reinstalled; 0 materialisations per append. `public/streaming.test.ts` › append then `update({ axes })` keeps appended rows; replacing a streamed source warns with the discarded count. Conformance #23 › `[dxtrial-11:data]`. | M7, M8, M13 |
| RC2 | **The viewport is copied as all axes, with per-axis guards and no single constraint** → viewport = pinned axes; one constraint function; X-only group sync; declarative state options | dxtrial-04, frameworks-04, 05, interact-13, 14, dataapi-14, 16, gap-annotations-extensibility-14, dxtrial-19 | `public/state-options.test.ts` › echo is a no-op; a re-rendered equal value does not repaint or pause follow; a reset emits `{}` once; Y stays automatic after echoing; `update({ viewport: {} })` resets even when created with `{}`; `[dataapi-14] replacing data outside a pinned X range unpins that axis`. `public/streaming.test.ts` › `[dxtrial-19] followWindow has a fixed width from the first sample; update({ viewport: { x } }) pauses following`. `public/group.test.ts` (the final model). `engine/viewport.test.ts` › box zoom respects bounds, y2, per-axis 4 px threshold, category snapping, minimum span; data-space anchor while streaming; an evicted window resumes follow; a pointer-down sets following false. | M8, M12a |
| RC3 | **Five notification channels; events dropped while mutating; no isolation; no revision** → one queued, isolated dispatcher; cold store with revision; lazy hot cursor; one hover model | backlog-02, gap-overhaul-delta-03, frameworks-01:state, frameworks-03, arch-07, arch-12, gap-perf-gate-03, gap-scale-longevity-07, interact-09 | `public/events.test.ts` › a throwing listener is isolated; a selection cleared by a data change emits `selection:change(null)`; revision bumps once per frame; listeners added during dispatch run from the next emit. `public/types.typecheck.ts` › `[arch-12] onZoom is not an option`. `engine/cursor.test.ts` › the cursor is recomputed after keyboard zoom, append and visibility change; hidden series are absent. `engine/render/scheduler.test.ts` › `[gap-scale-longevity-07] a 20-member group with 18 offscreen paints 2 overlays per move`. `react/hooks.test.ts` › a highlight selector renders once over 20 cursor moves. | M7, M8, M11, M12a, M13 |
| RC4 | **The tick formatter is reused for readouts; `toFixed` and `toLocale*` are called per call** → one format module | backlog-01, dxtrial-03, interact-02:format, dataapi-09, render-01, 07, 08, 11, 21, visuals-11, 24, backlog-18, dxtrial-10, gap-environments-06, gap-perf-gate-09 | `engine/format.test.ts` › the P9 precision property; grouping; series-scoped format; axis format drives tooltip, cursor and legend table; prefix/suffix; `10:00:00.200 AM` order; no duplicate seconds labels; one locale for digits; formatter cache count. `test/browser/m10-tooltip-format.spec.ts` › the dxtrial values `20%`, `-0.8`, `4.84%`, `718 ms`. | M10 (seeded in M1) |
| RC5 | **Explicit category ticks, stride thinning, an integer fast path, DOM labels measured differently from how they render, viewer-local-only time** → one tick pipeline over measured label boxes; consistent DOM label measurement; measured gutters; calendar stepping in `local` or `UTC` | render-02, 06, 12, 13, 14, 19, 20, 25, 26, backlog-03, 06:utc, 07, 08, 09, 10, visuals-09, 16, 21:def-01, 21:def-03, dxtrial-21, demos-07:utc, gap-environments-05:labels, 07, 09, gap-overhaul-delta-04, gap-annotations-extensibility-02, gap-scale-longevity-03:ticks | `engine/axes/ticks.test.ts` › 30 long categories do not overlap; log 50–200 gives ≥ 3 labels; a 1e-13 range gives distinct labels; prime interval counts keep ≥ 3 labels; 36–48 integers stay at or below the target; `[render-19] a rounding format produces no repeated adjacent labels`; explicit `ticks`; DST hour ticks; UTC ticks; Kathmandu 30-minute ticks on :00/:30 (under `TZ=Asia/Kathmandu`). `engine/layout.test.ts` › `[backlog-10] a second value axis defaults to the right`; a third unpositioned axis on a taken side throws. Geometry fixtures › no overlapping label boxes; no two adjacent labels with the same text; ≥ 2 labels per axis on a plot ≥ 120 px; no label outside the container, including at a 24 px minimum font size. | M10 |
| RC6 | **Pad-then-nice, an unanchored area, the bar slot plan, no degenerate policy** → one domain policy | visuals-02:domain, 07, 08, 23, render-10, 22, 27, backlog-11, 13, demos-16, gap-annotations-extensibility-01, 04 | `engine/ranging.test.ts` › max 100 → 0–100; data ≥ 0 is never negative; area includes 0; log bars start at the domain minimum; numeric bars ±½ slot; all-negative bars; empty → no ticks; single Date. `engine/annotations.test.ts` › slot-edge regions; a single-category region; log ≤ 0 clamp; ±Infinity; the newest streaming marker keeps its label. | M10 |
| RC7 | **Two colour parsers, `withAlpha` on raw strings, an OS-chosen base theme** → one colour module, surface-first resolution and tokens | arch-02, 16, render-09, 15, 17, backlog-17, 19, gap-annotations-extensibility-03, visuals-03, 04, 06, 13:dark, 14, 15, 25, gap-overhaul-delta-01, dxtrial-12, 15, research-03, 04, interact-22:colours | `engine/theme/color.test.ts` › named, `rgb()`, `hsl()`, `oklch()`, `var()` palettes and bare HSL triples match the browser's RGBA; `[gap-annotations-extensibility-03] withAlpha on var(), hsl() and named colours keeps opacity`. `engine/theme/resolve.test.ts` › a dark CSS surface gives the dark palette and grid on a light OS; a transparent page with light text resolves dark; the text token drives axis labels. `scripts/check-palettes.mjs` › `[visuals-13:dark]`. | M11 |
| RC8 | **About 48 per-type branches** → one Mark interface and registry | render-03, 05, 18, 23, 24, backlog-04, 12, demos-06, 10, visuals-02:fill, 10, 17, 18, 19, 21:def-04 | `engine/marks/*.test.ts` › area fill, `fill: null`, opacity and monotone; isolated-point marker (one arc for a point between NaNs); histogram colour equals the legend; bar outline equals the colour; overlap alphas; scatter at 9,990 vs 10,010 points is continuous; several density series share one ramp. Browser `m11-marks.spec.ts` › every finite datum has non-background pixels at its position. | M9b (registry), M11 |
| RC9 | **HitTester plus separate bar and histogram paths, Y-only gating, an anonymous single row, unordered scatter** → one hit pipeline with a spatial index and sorted-X detection | interact-02:hit, 03, 04, 11, 12, 15, 16, 19, visuals-05, 12, dxtrial-07, 20, uisite-03:library, arch-06, gap-perf-gate-01 | `engine/hit.test.ts` › bar+line and histogram+line list every series; index works anywhere along X; nearest for scatter; coincident points; rows keep series order; the crosshair point equals the tooltip point; a CSS `scale()` transform; `[gap-perf-gate-01:hover] hover on 200k sorted scatter visits ≤ 64 points`. `dom/tooltip.test.ts` › `[interact-11] the tooltip mounts inside an open modal dialog`. Bench fidelity counters. Browser sweep › a 12×8 probe grid inside the plot shows the tooltip at 96 of 96 points (ported from the audit's `uisite/herosweep.mjs`). | M7 (sorted X), M11 (sampling), M12a |
| RC10 | **Per-chart canvases, observers and rAF; `alpha: false`; unconditional reallocation; layout reads in render** → one surface and one scheduler with visibility gating | gap-scale-longevity-02, 04, 05, 06:visibility, 08, 09, gap-environments-02:print-basics, 03, 10, render-04, 16, gap-competitive-02, 03, gap-perf-gate-10, backlog-28:at-rest, repo-04, backlog-05, research-02, frameworks-15, dxtrial-09, gap-overhaul-delta-07, docs-05 | `engine/render/surface.test.ts` › no clear on a no-op resize; synchronous RO paint; the DPR watcher; jsdom no-op; zero-height fallback with exactly one warning; `height` wins inside a stretched flex item; changing height 280→400 resizes; `[gap-scale-longevity-05] a chart renders once at mount`; `[gap-overhaul-delta-07] the container has isolation: isolate`. `engine/render/scheduler.test.ts` › an offscreen chart paints nothing; `[gap-scale-longevity-09] 10 charts install 1 MutationObserver and 1 matchMedia listener`. `engine/render/crisp.test.ts` › `[render-16] 1 px strokes land on device-pixel centres at DPR 3 and 1.25` (canvas recorder). `public/update-classes.test.ts` › `[gap-environments-03] the handle has no resize member`. Browser `m11-lifecycle.spec.ts` › a 30-step resize screencast has no frame more than 5% black; print emulation shows ink and no tooltip. | M1 (seed), M8 (gap-environments-03), M11 |
| RC11 | **A gesture model without modality rules, and no a11y layer** → gestures, keyboard and live region | interact-05, 06, 07, 08, 10, 17, 18, 22:motion, 23, backlog-14, gap-environments-05:focus | `engine/interaction/gestures.test.ts` › a tap persists; pan-y; Ctrl+wheel passes through when zoom is none; a slow click fires `point:click`; `deltaMode`. `engine/selection.test.ts` › `[interact-10] Esc and click-outside clear; edges clamp to the plot`. `test/browser/m12a-touch.spec.ts` (CDP) › a vertical swipe scrolls the page; one-finger pan on an xy scatter; a tap keeps the tooltip; a pinch zooms. `test/browser/m12a-a11y.spec.ts` › the figure name is not tick text; focus ring visible; arrows announce; readonly is not tabbable; axe has 0 serious violations; `[interact-23] destroy restores the host's attributes`. | M12a |
| RC12 | **Four legends and four column-helper families** → one core list legend and one core legend table over cold state | arch-08, frameworks-01:table, 08, 11, 17, 20:labels, 21, dxtrial-06, 13:categorical, visuals-20, interact-21, demos-13, research-13, backlog-15:categorical, gap-overhaul-delta-02, gap-environments-05:swatches | `dom/legend.test.ts` › auto at ≥ 2 series and for categorical `colorBy`; static label + `aria-pressed`; styles injected once per root; computed styles without any CSS import (buttons have padding > 0, the swatch is 12 px, the text colour equals `muted`); forced colours; `[gap-overhaul-delta-02] update({ theme }) recolours the legend and legend table`. `dom/legendTable.test.ts` › values update after a data change in a fixed viewport; focus preserved across updates; `fallback: 'latest'`. Conformance › legend and legend-table `outerHTML` identical across runtimes. | M8 (deletes the old ones, interim views, group colours), M12b |
| RC13 | **Adapters on private APIs, state-backed refs, colliding names** → a shared bind over the public API only | frameworks-07, 09, 12, 13, 14, 16, 19, 20:ssr, dxtrial-22, research-05, 07, 14, arch-18, repo-15:ssr-dup, repo-19 | Conformance suite (§7) on four runtimes; `test/consumers/ssr.mjs` (one core copy in SSR) | M8 (deletions), M13 |
| RC14 | **Packaging and build config drift** → one build, rolled-up `.d.ts`, gates | frameworks-10, repo-01, 05, 07, 08, 09, 15:maps, 16, 18, 20, backlog-22, research-06, gap-competitive-06:budget, gap-environments-08 | `npm run check:package` (publint; attw with the `esm-only` profile; `check-consumers`: nodenext, node16, `require(esm)`, SSR, edge conditions, jsdom); size and api gates | M0 (TS flags), M5 (M14 ratchets the budgets) |
| RC15 | **Gaps in input inference and validation** → the normalize and ingest rules | dataapi-03, 05, 06, 07, 08, 12, 13, 17, 19, 20, dxtrial-05, 08, 14, docs-03:types, gap-annotations-extensibility-12, 13, backlog-27, gap-scale-longevity-03:ingest | `public/normalize.test.ts`; `public/warnings.test.ts` (page-level dedupe; the ≥ 10,000-row thresholds); `public/ingest.test.ts` › newest-first rows render in ascending X and rowIds still map; `public/histogram.test.ts` › bin cap 1,000; an outlier returns in < 5 ms; overflow; a value on an edge lands in the upper bin; shared thresholds. `engine/data/m4.test.ts` › `[dataapi-17] gappy input respects the output budget`. `public/types.typecheck.ts` › `.map()` series, `satisfies ChartOptions<Row>`, a generic plugin, `v => v.toFixed(1)` on value axes (rejected on category axes). | M7, M8 (duplicate plugin ids), M11 (m4) |
| RC16 | **Dead and duplicate code** | arch-09, 14, 19, backlog-24, dataapi-18, demos-11, demos-19, uisite-18, docs-15 | Metrics gate; `scripts/check-architecture.mjs` | M0, M2, M9a, M9b |
| RC17 | **Test and bench infrastructure that cannot see regressions** | gap-perf-gate-02, 07, 08, gap-competitive-05:harness, backlog-23, repo-02, 03, 10, 11, 12, gap-overhaul-delta-06, demos-17 | The gates themselves (self A/B, determinism run, ledger) | M0, M2, M3a, M4 |
| RC18 | **Docs and site** | docs-01, 02, 03:examples, 04, 05, 06–14, 16, 17, uisite-01, 02, 04–07, 12, 14–17, 19–21, research-09, 10:readme, dxtrial-16, frameworks-18, interact-20, backlog-21, 25, repo-13, 14, 17, gap-overhaul-delta-05, gap-competitive-04, gap-scale-longevity-10 | Starlight build; example tsc and smoke in all three tabs; the site smoke checks `[uisite-01/02/04/06/14/15]`; TypeDoc validation; style and copy lint; link check; migration coverage | M0, M6a, M15a, M15b, M17 |
| RC19 | **Demos and homepage** | demos-01, 02, 03, 04, 05, 08, 09, 12, 14, 15, 18, backlog-20, uisite-03:hero, 08, 09, 10, 11, 13, research-10:home, research-11 | Per-demo Playwright task specs; `answer.test.ts` with an independent oracle; the attribution test; `thumbs --montage --check` | M6b, M16a, M16b, M16c |

**Won't do in this overhaul.** This is the single won't-do list; `docs/backlog.md` and D36 reference it. Every item is medium or low, and each is recorded in `docs/backlog.md` with an acceptance test. The closed parts of the same findings are listed in the right column.

| Item | Finding (part) | Reason | Closed part |
|---|---|---|---|
| Colour-ramp and size legends | backlog-15:ramp, dxtrial-13:ramp | New surface; no remaining demo needs them. | `:categorical`, M12b |
| Datum-level linked focus | backlog-16 | New surface. A plugin recipe through `scale()` covers it. | — |
| Tidy (long) data `series.by` splitting | dxtrial-18 | New surface. The duplicate-category error names the pivot fix, and a 6-line recipe covers it. | — |
| IANA time zones | backlog-06:iana, demos-07:iana | D7. `'local' │ 'UTC'` closes the common case; the typed union allows a non-breaking later addition. | `:utc`, M10 |
| Print *mode* beyond the DPR guard, synchronous paint, hidden tooltip and `break-inside` | gap-environments-02:print-mode | Needs print-specific themes; no user asked. | `:print-basics`, M11 |
| A published competitive benchmark | gap-competitive-05:publication | Needs competitor dependencies and reference hardware. | `:harness`, M4 |
| Tree-shaking by mark type | gap-competitive-06:registry | Would need a registration ceremony. The size budget is enforced instead. | `:budget`, M5 |
| A shared cross-chart frame loop, if the M11 stretch gate fails | gap-scale-longevity-06:shared-loop | Visibility gating and the lazy overlay take most of the gain. If the stretch lands, M11 moves this part to closed in `trace-ids.json`. | `:visibility`, M11 |
| Remaining cold dense-scatter paint work | backlog-28:cold-scatter | Measured and recorded; at-rest decimation lands, deeper work waits for demand. | `:at-rest`, M11 |
| Removing the four-sided frame (boxed chrome) | visuals-26 | D22: the maintainer-approved Chart.js look is kept. Recorded as a proposal in ADR 0002. | — |
| Light palette members below 3:1 | visuals-13:light | D9 and D22: the Okabe–Ito order is the approved look; the legend, the tooltip swatches and mark shape carry series identity; `lineWidth` 2 is the recorded proposal. | `:dark`, M11 |
| PNG export | gap-environments-04, gap-annotations-extensibility-10 | D28: one text path; not asked for. | — |

No critical or high finding is won't-do.

---

## 7. Framework adapters

### 7.1 Shared binding (`src/adapters/bind.ts`, about 90 lines)

`bindChart(host, props)` returns `{ update(props), destroy() }`.

- **Prop split.** A static key list typed `satisfies readonly (keyof ChartOptions)[]`, with an exhaustiveness type test, separates option keys (including the `on*` callbacks, which *are* options) from host attributes. Everything else goes to the host element: `id`, `className`/`class`, `style`, `data-*`, `aria-*`, `tabIndex` and DOM event handlers (frameworks-16).
- **No diffing in the binding.** It always calls `chart.setOptions(options)`. The core owns all diffing, latest-ref callbacks and state-option semantics (D3, D16), so every adapter gets exactly vanilla's performance and behaviour.
- **Ref registry.** `registerRef(refObject, handle | null)` notifies subscribers in a WeakMap keyed by the ref object. Hooks and `LegendTable` resolve `RefObject | ChartHandle | null` through it.
- **Host attributes.** The adapters render `role="figure"` and the accessible name on the host themselves; core never overwrites or removes attributes the host had before mount (D20).

### 7.2 React (`snaplot/react`, about 150 lines; peers `react ^18.3.0 || ^19.0.0`)

- **Exports:**
  - `Chart`: `forwardRef`, generic via a cast. It renders `<div role="figure">` with the host attributes, its accessible name, and `style.height` when `height` is given (D26), so SSR emits the figure at its final size. It mounts in `useIsoLayoutEffect`, calls `bind.update` in a layout effect after every render, and destroys on unmount. StrictMode's double mount is balanced.
  - `LegendTable`: props `{ chart, columns?, fallback?, className?, style? }`. It mounts `createLegendTable` into its own div.
  - `useChartState(chart, selector, isEqual = Object.is)` via `useSyncExternalStore`.
  - `useCursor(chart, { fallback })`, which subscribes to the hot channel so only the consuming component re-renders.
  - Re-exports `createChartGroup`, `histogram` and all types.
- **`'use client'`** banner on `dist/react.js`; a test greps line 1.
- **Works under `<Activity>`** hide/show, because groups are never destroyed by an adapter (frameworks-07).

### 7.3 Solid (`snaplot/solid`, about 140 lines; peer `solid-js ^1.9.0`)

- **Exports:**
  - `Chart`: `onMount` creates, one `createEffect` reads the props and calls `bind.update`, `onCleanup` destroys. `ref` is typed `Ref<ChartHandle<Row>>`, and both function and variable refs work.
  - `LegendTable`.
  - `createChartState(chart, selector)` and `createCursor(chart, opts)`, accepting a value, an accessor or `undefined` (frameworks-09).
  - The same re-exports as React.
- **Builds:**
  - a hydratable DOM build;
  - a server build that imports `'snaplot'` rather than inlining the engine (frameworks-19, repo-15:ssr-dup);
  - a `solid` export condition with preserved JSX.

### 7.4 Vanilla parity and third-party adapters

Every adapter capability is a public core feature: `setOptions`, state options, `on*` callbacks, `getState`/`subscribe`, `on('cursor:change')`, `getCursor` and `createLegendTable`. The docs page "Annotations, plugins and adapters" contains a "Write an adapter (Vue, Svelte)" recipe of about 30 lines. `packages/snaplot/test/adapter-recipe.typecheck.ts` checks it against a minimal reactive-store type, with no Vue or Svelte dependency (research-08).

### 7.5 Conformance suite (`packages/snaplot/test/conformance/`)

- **Runtimes.** The same scenario table runs in real Chromium against four runtimes: `vanilla.html`, `react18.html` (built from the isolated `test/conformance/react18/` package, D2), `react19.html` and `solid.html`. Each page exposes `window.__host = { mount(opts), set(props), handle, events, unmount() }`.
- **Commands:** `npm run conformance:install` (packs the library into the React 18 fixture), then `npm run test:conformance` (part of `test:browser`).
- **Markers.** A scenario that depends on a W5 track that has not merged yet is `test.fail(true, '[id]')` with that track's id. M14's exit requires zero `test.fail` and zero skipped scenarios.

| # | Scenario | Assertion (identical across runtimes) |
|---|---|---|
| 1 | Mount | One live chart; host attributes passed through; `role=figure` named. React 18 runtime: `React.version` starts with `18.3`, one react-dom chunk |
| 2 | Paint-only change (`axes.y.title`) | `ingestCount` unchanged; title text updated |
| 3 | Inline handler identity ×30 re-renders, then a click | `ingestCount` unchanged; the latest handler is called once |
| 4 | New `data` array | `ingestCount + 1`; the tooltip shows new values |
| 5 | Removed prop (`legend` dropped) | Returns to the default (`'auto'`) |
| 6 | `viewport` set → echo → double-click | Applied; the echo is a no-op; one `{}` event; Y auto-fits after the X zoom and after the reset |
| 7 | Un-echoed inline `viewport={{}}` plus a user zoom plus an unrelated re-render | The zoom is kept (no snap-back) |
| 8 | Legend click | `hiddenSeries:change`; re-rendering with the same prop is a no-op |
| 9 | `drag: 'select'` | One `selection:change` with points |
| 10 | Append → pan → `resumeFollow` | `following` goes true → false → true |
| 11 | 20 cursor moves with a highlight selector | 0 extra renders |
| 12 | `useCursor`/`createCursor` with `fallback: 'latest'` after a data change; `LegendTable` | Both show the new values (frameworks-01) |
| 13 | Zero-height host; `height={280}` in a stretched flex item; height 280 → 400 | 300 px with exactly one warning; 280 px; resized to 400 px |
| 14 | Unmount ×20 | 0 canvases, 0 snaplot listeners (counted via CDP), group membership removed, heap within 1 MB after GC |
| 15 | Mixed group (React + vanilla) | Cursor and X sync; Y independent |
| 16 | `[frameworks-07]` StrictMode ×20 cycles; React 19 `<Activity>` hide/show of two grouped charts | Host attributes identical after 20 cycles; both charts alive; cursor and X sync still work; no throw |
| 17 | Inline plugin object with the same `id` ×30 renders | 0 reinstalls |
| 18 | Hover tooltip | Text identical across runtimes (string compare) |
| 19 | Legend and legend table DOM | `outerHTML` identical across runtimes (ids normalised) |
| 20 | Pixel equality | Within one run: SHA-256 of each canvas layer's `toDataURL()` and the label layer's ordered `(text, rounded rect)` list are equal across runtimes |
| 21 | SSR + hydrate (React `renderToString` on 18 and 19, Solid server build) | No hydration warnings, no `useLayoutEffect` server warning; one chart after hydrate |
| 22 | `[frameworks-09]` Solid `createChartState`, `createCursor` and `<LegendTable chart>` given a handle value, an accessor and `undefined` | Same output; no throw (Solid runtime only) |
| 23 | `[dxtrial-11:data]` Inline `data={[]}`, 30 appends, then an unrelated parent re-render | 30 rows remain; no warning |
| 24 | `highlight` set → echoed through `onHighlightChange` → legend hover | Applied; the echo is a no-op; one `highlight:change` per hover |

---

## 8. Docs

### 8.1 Information architecture (21 pages; every sample is a runnable file)

| Group | Page | Contents | Drafted in |
|---|---|---|---|
| Start | 1. Introduction | What snaplot is for (live data, one API for three runtimes; "dense" only if M14 met the first-paint budget) and not for (stacking, horizontal bars, animation, OHLC); install (generated, D1); entries; browser floor; generated bundle sizes | M15a, re-verified in M15b |
| | 2. Your first chart | Vanilla, React and Solid tabs; the sizing rule up front; "what you get by default" | M15a, re-verified in M15b |
| | 3. Sizing and layout | The height contract (D26), the 300 px fallback, CSS `aspect-ratio`, flex and grid pitfalls, DPR, print (docs-05, backlog-05) | M15b |
| Frameworks | 4. Vanilla JS | Lifecycle, `update` vs `setOptions`, events and `on*` options, groups, legend table, cleanup, and the no-build `<script type="module">` path (D39) | M15a |
| | 5. React | `<Chart>`, `useRef`, hooks with selectors, state options, `<LegendTable>`, streaming through the ref, `useMemo` for derived data, React 18 and 19, Next.js `'use client'`, testing in jsdom | M15a |
| | 6. Solid | `<Chart>`, `ref`, primitives with accessors, `<LegendTable>`, `createMemo` for derived data, SolidStart SSR, the `solid` condition | M15a |
| Guides | 7. Data | Rows vs columns, fields vs accessors, row sorting, axis inference (Date and ISO → time, string → category), gaps, per-series data, `rowId`, `histogram()`, pivoting long rows, memoising derived data per framework | M15a |
| | 8. Updating and live data | `update` / `setOptions` / `appendData`, `streaming`, the follow window, pausing follow with `update({ viewport })`, `resumeFollow`, `updateLast`, per-framework patterns | M15a |
| | 9. Axes and formatting | Types, `title`, `min`/`max`/`nice`, `ticks`, `format` (function, Intl, `prefix`/`suffix`), dual axes, `locale`, `timeZone`, tick vs value precision | M15b |
| | 10. Marks | Line, area, band, bar, histogram, scatter (density, `colorBy`, `sizeBy`), each with a minimal real-data example and its gotchas | M15b |
| | 11. Tooltips, cursor and legends | Modes, `render` (with an XSS note and a JSX-into-Node recipe), `legend`, `createLegendTable`/`<LegendTable>` columns, a custom-legend recipe with `useCursor`/`createCursor` | M15b |
| | 12. Zoom, pan and selection | `interaction`; true mouse, touch and keyboard tables; `viewport`/`selection`/`highlight` state | M15b |
| | 13. Linked charts | Groups: cursor, X viewport, highlight, `yRange`, `alignPlots`; leaving a group; the shared-options spread recipe | M15a |
| | 14. Annotations, plugins and adapters | Reference lines and regions; the plugin contract and draw order; worked text-label and error-bar recipes; "Write an adapter (Vue, Svelte)" | M15b |
| | 15. Theming | `'auto'`, tokens, CSS variables including `--chart-1…8`, dark mode, host `className`, two validated token recipes (warm paper, high contrast), CSP note | M15b |
| | 16. Accessibility | `ariaLabel`, the summary, keyboard, focus, live region, contrast (including the light-palette exception), forced colours, a data-table recipe, the minimum-font-size behaviour | M15b |
| | 17. Performance and limits | Typed columns, density, decimation, many charts, visibility gating, what is O(visible), memory and scale limits (gap-scale-longevity-10), and the scale promise (D38), with numbers only from M14's recorded A/B | M15b |
| Reference | 18. API reference | Generated | M15b |
| | 19. Glossary | `site/src/content/docs/reference/glossary.mdx`: the public terms (follow window, source, state option, …) and the banned engine words | M15b |
| Help | 20. Migrating from 0.12 | §8.5 | draft M15a, final M15b |
| | 21. Troubleshooting | Blank chart, field errors, a 1970 axis, literal widening and `satisfies`, `format` types, SSR, jsdom, data replaced on a streamed source | M15b |

**Panel.** Judges 1 and 3 favoured about 18–20 pages; judge 2 favoured about 27, with six per-mark gallery pages. This IA adds the dedicated Sizing and Vanilla pages that judge 2 asked for, and keeps all marks on one page with anchor links, which Starlight's TOC and Pagefind can target.

**Rules.**
- **Framework tabs on every executed example** (Starlight `<Tabs syncKey="framework">`, persisted).
  - Option-level examples are written once, as `<name>.options.ts` (`export default {…} satisfies ChartOptions<Row>`). Each tab shows that file followed by a fixed mount template of 3–5 lines: `createChart(el, options)`, or `<Chart {...options} height={280} />` for React and for Solid.
  - Integration examples, whose code differs by framework, are hand-written as three files: pages 2–8, 11–13 and 15–16, and the adapter recipe.
- **Example style guide**, applied verbatim:
  - runnable by default;
  - a sized container in every first example;
  - real field names (never `value1`, `Series A` or `Metric A`);
  - only the options being taught;
  - `satisfies ChartOptions<Row>` for separately declared options;
  - `ariaLabel` on every sample;
  - task-first prose;
  - one canonical page per topic;
  - glossary words (page 19), never engine words;
  - only claims verified by a running example on the same page.

### 8.2 Tooling: Astro + Starlight (D11)

- **Location:** `site/`, with `astro.config.mjs` set to `site: 'https://liamclarkza.github.io'` and `base: '/snaplot/'`.
- **Integrations:** Starlight, `@astrojs/react` (`include: ['**/*.react.tsx']`) and `@astrojs/solid-js` (`include: ['**/*.solid.tsx']`).
- **Built-in features:** Pagefind full-text search, a skip link, an on-page TOC, an accessible mobile drawer, and per-page titles and Open Graph tags.
- **Theme:** `ThemeProvider` and `ThemeSelect` overridden with the §9 three-state toggle (D11), recorded in ADR 0002.
- **Version pins:** exact versions at least 14 days old at install time (`npm view <pkg> time`).
- **Building against the package:** the site consumes `snaplot` through its package exports, so CI builds against `dist`. In dev, run `npm run dev:lib` (watch build) alongside. This makes the docs a packaging test, and one mechanism replaces today's 9 drifting source aliases (repo-16).
- **Spike gate.** The first 0.5 day of M6a must pass all of these, in both dev and the production build:
  1. one page renders one example in three tabs, each mounting a live chart island (vanilla, React, Solid);
  2. Pagefind finds `createChart`;
  3. a `starlight-typedoc` page builds for `snaplot`;
  4. `base: '/snaplot/'` works.
- **Spike fallbacks:**
  - If criterion 1 fails, use frame routes: `site/src/pages/frames/[...id].astro` as separate Vite entries, shown in lazy iframes, with "Open" links.
  - If criterion 2, 3 or 4 fails, switch to VitePress (same IA, same pipeline, React and Solid mounted in `onMounted`).
  - Record the outcome in `docs/handoff/m6a.md`; M14 folds it into ADR 0002.
- **Old links.** A ≤ 20-line inline script in `site/src/pages/index.astro` maps the old hash routes (`/snaplot/#/docs/...`) to the new paths with `location.replace`. Its table is generated from the old nav, `git show overhaul-baseline:site/src/pages/docs/nav.ts`.

### 8.3 Example pipeline (every sample compiled and executed in CI)

- **Files.**
  - `site/src/examples/<page>/<name>.options.ts` exports a default `ChartOptions` (option-level examples).
  - `site/src/examples/<page>/<name>.ts` exports `default (el: HTMLElement) => ChartHandle`; `<name>.react.tsx` and `<name>.solid.tsx` export a default component (integration examples).
  - Data comes from `site/src/examples/data/*.ts`: small real extracts of the demo datasets, at most 20 KB each, with a provenance comment.
- **Rendering.** `<Example name="data/rows" />` (Astro) shows the files verbatim via `?raw` through Expressive Code, in three tabs, and mounts the selected one `client:visible`. "Copy" copies the whole runnable file: for an option-level example, the options file concatenated with that tab's mount template.
- **Compiled.** `npm run check:examples` runs `astro check` and `tsc -p site/tsconfig.examples.json` (strict, `moduleResolution: bundler`), resolving `snaplot` to the built `dist/*.d.ts`. The generated per-tab files are type-checked too.
- **Executed.** `site/tests/smoke.spec.ts` (Playwright, against `astro preview`) visits every route and asserts:
  - HTTP 200;
  - no console errors or warnings, except those an example declares in a `// expect-warning: <code>` comment;
  - every `[data-example]` contains a canvas with painted pixels, **in each of its three tabs**;
  - copied text equals the source;
  - `[uisite-06]` axe reports 0 serious violations;
  - `[uisite-01]` with `addInitScript` making `localStorage` throw, the page still renders its content;
  - `[uisite-02]` under `emulateMedia({ colorScheme: 'light' })` the first paint has a light background (no dark flash);
  - `[uisite-04]` the first Tab focuses the skip link, and focus outlines are visible under forced colours;
  - `[uisite-14]` the search input has `role=combobox`, and its results are not covered by other elements (`elementFromPoint`);
  - `[uisite-15]` the mobile drawer traps focus.
- **No-build page.** `smoke.spec.ts` › "no-build page" loads a plain HTML file with an import map pointing `snaplot` at the local `dist` (D39).
- **Old links.** `smoke.spec.ts` › three old hash URLs land on their new pages.
- **README.** The quick starts are generated from `site/src/examples/start/first-chart.{ts,react.tsx,solid.tsx}` plus the no-build snippet by `scripts/sync-readme.mjs`, which also writes the install string (D1). CI runs `scripts/sync-readme.mjs --check`.
- **Search check.** Pagefind finds `createChart`, `useCursor`, `LegendTable`, `colorBy`, `height`, `dark`, `ssr` and `migrat`.
- **Copy lint.** `site/tests/lint-copy.test.ts`, over the text in `site/src/**/*.{astro,mdx,tsx}` and `README.md`, fails on:
  - the words seamless, effortless, blazing, lightning-fast, powerful, robust, supercharge, unlock, elevate, delve, stunning, beautiful, game-chang, and the phrase "live window";
  - `!` in headings, and Title Case h1/h2;
  - more than one em dash per 400 words.

### 8.4 API reference

- **Generator:** `starlight-typedoc` over `src/index.ts`, `src/react.ts` and `src/solid.ts`, into `/reference/`, with `excludeInternal: true`.
- **`validation.notDocumented`:** a warning from M6a; M7's JSDoc commit switches it to an error.
- **Fallback:** if the plugin fails, plain TypeDoc HTML at `/api/`.
- **Delete** `scripts/generate-api-docs.mjs`, `api.gen.json` and `ApiReference.tsx` (with the old site in M0).
- **JSDoc** (with `@defaultValue`, and an `@example` on the main entry points) is an exit criterion of M7, and every later addition must carry it (docs-02, repo-14, uisite-17).

### 8.5 Migration guide (`site/src/content/docs/migrate-0-12.mdx`)

- **Scope.** It goes straight from **v0.12.0 to 1.0**, because users never saw the intermediate overhaul. It is built from `notes/overhaul-audit/gap-overhaul-delta.md` §2 (the complete v0.12.0 → baseline delta) composed with the §4.4 tables.
- **"In 10 minutes":** the ten most common edits, as before/after pairs, with a three-framework tab where it differs:
  - `ChartCore`/`ColumnarData` → `createChart` with rows or columns;
  - Solid `<Chart config data>` → props;
  - `syncKey` → groups (and fleet `defaults` → a shared-options spread);
  - `tickFormat`/`label` → `format`/`title`;
  - `stroke`/`lineDash` → `color`/`dash`;
  - `visible` → `hiddenSeries`; `setHighlight` → the `highlight` option;
  - themes → tokens;
  - legend plugins → `legend` and `createLegendTable`;
  - event names and payloads;
  - `histogram()` counts.
- **Rename and removal tables** for exports, handle members, events and options, including `tickCount` → `ticks` or the defaults, and `aspectRatio` → CSS `aspect-ratio`.
- **"Behaviour changes you will notice"**, each with its one-line opt-out:

  | Change | Opt-out |
  |---|---|
  | The theme follows the page | `theme: 'light'` |
  | Transparent background | `theme: { surface: '#fff' }` |
  | Automatic legend | `legend: false` |
  | Domains without padding | `nice: false` or explicit `min`/`max` |
  | Touch scrolls the page on line charts | `interaction: { drag: 'pan' }` |
  | Tooltips at value precision | set `format` |
  | ←/→ move the cursor, Shift+←/→ pans | — |
  | Grouped charts no longer share Y | `yRange: true` |
  | The font is inherited | `theme: { fontFamily }` |
  | `height` always sets the chart height | omit it and size the container |
  | `histogram()` edge membership | — |

- **Recipe:** rebuilding a custom-column legend with `useCursor`/`createCursor`.
- **No codemod.** The tables are greppable.
- **CHANGELOG.** `[Unreleased]` gets Breaking, Removed, Renamed, Added, Changed (visual, with V-ids) and Fixed (with finding ids) sections and links to the guide. The nonexistent `chartFromRows` is removed from it (repo-13, docs-08).
- **Coverage check.** `scripts/overhaul/check-migration.mjs` fails if any name in `docs/decisions/removed-since-0.12.txt` (generated once in M8 from `git show v0.12.0:` declarations against the golden `api/*.d.ts`) is not mentioned in the guide.

---

## 9. Site and visual identity

**Homepage** (`site/src/pages/index.astro`, custom layout, no Starlight chrome), in order:

1. **One left-aligned sentence:** "Canvas charts for live data. One options object for vanilla JS, React and Solid." It becomes "live and dense data" only if ADR 0002 records that `firstpaint-line-1m` met ≤ 45 ms desktop and ≤ 150 ms mobile in M14; `lint-copy` enforces this by failing on "dense" when ADR 0002 marks the budget missed.
2. **The generated install string** (D1: `npm i snaplot@next` while the version is a prerelease) with a copy button. Prerelease builds show the beta banner.
3. **A code/chart pair** with persisted Vanilla, React and Solid tabs.
   - The code shown is the literal source (`?raw`) of the chart beside it: `site/src/examples/home/hero.{ts,react.tsx,solid.tsx}`, about 18 lines each.
   - It streams the deploy-#482 simulator's p50/p99 with `appendData` (the shared `site/src/demos/deploy-482/simulator.ts`), never rebuilding arrays.
   - It pauses offscreen, starts paused under `prefers-reduced-motion`, and has a visible pause button (uisite-13, demos-15).
4. **One fact line:** version · gzip size per entry (from `scripts/size.mjs --json`) · 0 dependencies · React 18/19 · Solid 1.9. There are **no performance adjectives or bench numbers** until the maintainer publishes a measured comparison (gap-competitive-04).
5. **The examples list:** six rows, each with its real Playwright thumbnail (`site/public/examples/<slug>.jpg`), the question, the framework and the dataset.
6. **Footer:** Docs · Examples · API · Changelog · GitHub · licence · version.

There is no gallery of feature tiles.

**Cut** (all of it goes with the old site in M0; uisite §4):
- the glow and grid hero background;
- the 62–78 px tight-tracked headline and "for SolidJS applications";
- the three-button hero and the floating panel;
- the KPI/stats strip and the gradient CTA card;
- the orbit graphic;
- every all-caps eyebrow;
- 01/02/03 numbered cards and fake browser chrome;
- the hub's hand-drawn previews;
- body-wide `tabular-nums` and "Soft UI" elevation tokens;
- every presentational inline style and every `!important`.

**Design system** (`site/src/styles/tokens.css`, mapped onto Starlight's `--sl-*` variables):

| Token | Light | Dark |
|---|---|---|
| background | `#FFFFFF` | `#111113` |
| surface (code blocks, the active nav item) | `#F6F7F9` | `#1A1A1D` |
| ink | `#1C1C1E` | `#ECEAE6` |
| secondary ink | `#55565E` (≥ 7:1) | `#A6A4AB` |
| rules | `#E3E4E8` | `#2C2C30` |
| accent (links, focus and current page only) | `#0072B2`, the library's first series colour (5.2:1) | `#56B4E9` (8.2:1) |

- **Type.** IBM Plex Sans (UI and body) and IBM Plex Mono (code), latin and latin-ext woff2 subsets via `@fontsource`.
  - Body 16/1.6 at a measure of 68ch or less; small text 14.
  - h1 40/600 at −0.01em; h2 24/600; h3 18/600.
  - Sentence case and left alignment everywhere.
  - `tabular-nums` only on `.num`, tables and code (uisite-07).
- **Layout.** One 72rem container with 24 px gutters, shared by nav, pages and footer (uisite-12). Hairline rules instead of cards. Radius ≤ 6 px. No shadows, glows, gradients, glass or hover lifts. Visible hover states on nav, sidebar, footer and buttons (uisite-05).
- **Focus.** `outline: 2px solid var(--accent); outline-offset: 2px`, and `Highlight` in forced colours (uisite-04).
- **Theme.** A three-state toggle (system, light, dark) that overrides Starlight's `ThemeProvider` and `ThemeSelect`, with a pre-paint script and `color-scheme`. The storage key is `snaplot-site-theme-v2`, and every storage access is in try/catch (uisite-01/02).
- **Charts on the site** use `theme: 'auto'` and never receive a theme object, so every page proves D4 and D5.
- **Style lint.** `site/tests/lint-styles.test.ts` fails on `style={{` or `!important` in `site/src`, outside an allow-list for chart host heights. It also fails on `text-transform: uppercase` combined with `letter-spacing` above 0.05em, and on `linear-gradient`, `radial-gradient` or `box-shadow` on the homepage (uisite-19). The copy lint is in §8.3.

---

## 10. Demos

### 10.1 Acceptance checklist (every demo)

1. **The question and its answer.** The title is the user's question. The page shows the answer as a number computed from the data, and `answer.test.ts` (vitest) verifies it. Where the answer sits follows the task: in the S1 clip-list panel, the S2 verdict banner, the R1 decision panel, the V1 readout under the brush. Only V2 and R2, which are journalism formats, use the question as the `h1`.
2. **An independent oracle.** Each `answer.test.ts` includes at least one check that does not import `answer.ts` (named per demo in §10.2), with the oracle values recorded in `SOURCE.md`. A wrong formula therefore fails its test instead of shipping a false headline (demos-03).
3. **Data and licence.** Data is real, under public domain, CC BY 4.0, MIT or BSD-3. Otherwise it comes from a seeded simulator whose model is documented in `SOURCE.md` and which the page labels "Simulated". No share-alike data and no health data.
4. **`SOURCE.md`** records: the URL, the licence and the evidence for it, the exact attribution line, the retrieval date (ISO), the regeneration command (`npm run demo-data -- <slug>`), row counts, the SHA-256 of each raw download, the oracle values, and the one real-world reference the design follows (item 8).
5. **Generator.** `scripts/demo-data/<slug>.mjs`: Node 22, no new dependencies (Playwright is already one), idempotent. Supports `--offline`, which rebuilds from the gitignored raw cache `scripts/demo-data/.cache/`. Only the processed extracts are committed.
6. **Size.** At most 1 MB gzipped of data per demo (S1 at most 2 MB of compressed audio), lazy-loaded. Enforced by `site/tests/data-size.test.ts`.
7. **Imports and source.** One owner framework. It imports only `snaplot`, `snaplot/react` or `snaplot/solid`, built against `dist`. The main module is under 300 lines, configured exactly as a consumer would. No faked categories, no manual padding, and legend colours come from the chart (`getState().series`), never CSS copies.
8. **Its own identity, from its domain's real conventions.** Each demo cites one real reference in `SOURCE.md` and designs from it (§10.2 names them). At most one non-system typeface per demo (V2 may use two). Decoration must be functional.
   - **Banned:** a shared shell, KPI tile rows, an eyebrow plus a slogan `h1`, an app switcher, letter logos, card grids with shadows, fake chrome, hard-coded deltas, invented metrics, themed costumes that do not come from the reference.
   - **Shared:** only a thin footer: "← Examples · Source · Data: <attribution line> (<licence>)".
9. **Tests:**
   - `site/tests/examples/<slug>.spec.ts` performs the task and checks the answer;
   - 390 px and 1280 px viewports, with no horizontal overflow and a working touch path at 390;
   - zero console errors;
   - axe with 0 serious violations;
   - the footer contains the `SOURCE.md` attribution line;
   - from the old backlog's demo corrections: threshold lines sit on the axis of the quantity they mark (the right axis for a percentage on a dual-axis chart); interaction help text matches the input modality (touch or mouse); data freshness stays visible at 390 px; no summary shows `NaN`, `Infinity` or an empty placeholder.
10. **Library defects found while building** go under "Requests for integrator" in the demo's handoff file, assigned to the owning W5 track (M10, M11, M12a or M12b) with a failing fixture; they are never patched in the demo. Only genuinely new surface goes to `docs/backlog.md`. A blocking defect pauses that demo until the owning track merges.

### 10.2 The set (six demos, two per framework)

| | V1 `ridgecrest-aftershocks` | V2 `central-park-summer` |
|---|---|---|
| **Question** | "How fast did the Ridgecrest aftershocks die down?" | "Was summer 2025 unusually hot in Central Park?" |
| **Framework** | vanilla | vanilla |
| **User / task** | A geoscience student or journalist: how quickly the daily rate fell, for the whole sequence or a brushed window | A local reader or reporter: how unusual each day was |
| **Data and licence** | USGS ComCat FDSN CSV: `https://earthquake.usgs.gov/fdsnws/event/1/query?format=csv&starttime=2019-07-01&endtime=2019-09-30&minlatitude=35.3&maxlatitude=36.2&minlongitude=-118.1&maxlongitude=-117.2` (39,218 events). The generator checks `/fdsnws/event/1/count` with the same parameters and halves time windows until each query is under 20,000 rows. Trimmed to `time, lat, lon, depth, mag, id` as columns, plus a computed `depthBand` field (`'0–5 km'`, `'5–10 km'`, `'>10 km'`) (about 0.6 MB gz). **US public domain**; credit "U.S. Geological Survey, ANSS ComCat". | NOAA NCEI GHCN-Daily `https://www.ncei.noaa.gov/data/global-historical-climatology-network-daily/access/USW00094728.csv` (about 18 MB raw; tenths of °C converted to °F). Precomputed per day of year: record high and low with their years (1869–2024), the 1991–2020 p10–p90 TMAX band and median, and 2025 Jun–Aug TMAX/TMIN (about 300 KB). **US Government work**; cite doi:10.7289/V5D21VHZ. |
| **Answer** | "Daily M≥2.5 count fell below 10% of its peak on <date>, N days after the M7.1; half of the 3-month total came in the first X days." The readout under the brush gives the same two numbers for the brushed window. | "N days between June and August 2025 had highs above the normal range; the mean high was X °F above the 1991–2020 median." |
| **Oracle** | Daily counts for 3 dates checked against USGS `/fdsnws/event/1/count` with M≥2.5 and that day's bounds (values recorded in `SOURCE.md`). | The 1991–2020 mean of daily TMAX for June, July and August is within ±1 °F of NCEI's monthly normals (`https://www.ncei.noaa.gov/data/normals-monthly/1991-2020/access/USW00094728.csv`, `MLY-TMAX-NORMAL`); 5 spot-checked record values equal the raw maxima. |
| **snaplot features** | Daily-count bars (log Y, starting at the domain minimum) as a brush (`interaction: { drag: 'select' }`) → `onSelectionChange` → peers `update({ viewport: { x } })`; a scatter of time × magnitude with `colorBy: { field: 'depthBand', type: 'categorical' }`, so the built-in categorical legend labels it, and `renderMode: 'auto'`; beside it, the seismologist's decay plot: daily rate against days since the M7.1 on log–log axes (outside the group, because its X differs); a group of the strip and the scatter (cursor, X); Date reference lines for M6.4 (2019-07-04 17:33 UTC) and M7.1 (2019-07-06 03:19 UTC); `onPointClick` opens `https://earthquake.usgs.gov/earthquakes/eventpage/<id>`; `timeZone: 'UTC'`. No `sizeBy`: magnitude is already the Y axis. | Two `band` series (record range, normal range); 2025 daily high–low marks drawn by a **~25-line plugin on the public `chart.scale()` contract** (dogfoods D21); record days as scatter (red/blue `color`); `interaction: 'readonly'` with tooltips; a print stylesheet |
| **Identity (reference)** | USGS event pages and helicorder plots. White `#FFFFFF`, black ink, thin grey rules; depth bands `#de4968` (0–5 km), `#8c2981` (5–10 km), `#3b0f70` (>10 km), all ≥ 3.9:1 on white. The system UI stack with tabular figures; no webfont. A full-width daily-count strip like a helicorder trace on top, then two chart columns at 1280 px: the scatter and the decay plot. | Tufte's reproduction of the 1980 *New York Times* weather chart. Newsprint cream `#FBF8F1`, greys plus one red `#C0392B` and one blue `#2E6DB4`. Libre Caslon Text for text and Libre Franklin for chart labels. One long chart with a one-line reading key and almost no UI. |
| **Acceptance** | The decay numbers equal an independent recount (unit test); brushing updates every pane in < 50 ms (performance marks); UTC labels with Playwright `timezoneId: 'Asia/Tokyo'`; a long-press brush at 390 px; data ≤ 1 MB gz | `answer.test.ts` recomputes from the raw cache (`--offline`) and matches the committed JSON; the oracle passes; print emulation shows a non-blank chart |

| | R1 `pick-a-checkpoint` | R2 `battery-payback` |
|---|---|---|
| **Question** | "Which checkpoint should we ship?" | "Would a 5 kWh battery have paid for itself in this house?" |
| **Framework** | React | React |
| **User / task** | An ML engineer comparing a baseline run with a regularised run: the best validation loss before overfitting | A homeowner with solar panels: the payback from real usage |
| **Data and licence** | **Real training logs** from `scripts/demo-data/train-digits.mjs`.<br>• Input: UCI "Optical Recognition of Handwritten Digits" (**CC BY 4.0**, 5,620 × 64) from `https://archive.ics.uci.edu/static/public/80/optical+recognition+of+handwritten+digits.zip`. It reads `optdigits.tra` and `optdigits.tes` through a 40-line zip reader over `node:zlib` `inflateRawSync`.<br>• Model: a seeded 64-32-10 MLP in plain JS, 2 configs × 60 epochs: (A) constant LR 0.05, no regularisation; (B) cosine LR 0.1 → 0, L2 1e-4, label smoothing 0.1.<br>• Logs: train loss every 20 steps, validation loss and accuracy per epoch. About 150 KB; runs in seconds. The output is MIT, with the dataset attribution in `SOURCE.md`.<br>• Fallback input: scikit-learn `digits.csv.gz` (BSD-3) from the scikit-learn GitHub repo. | Open Power System Data **Household Data**, version 2020-04-15, 60-minute single-index CSV (`https://data.open-power-system-data.org/household_data/2020-04-15/household_data_60min_singleindex.csv`; **CC BY 4.0**; the attribution text from the package page is copied verbatim into `SOURCE.md`).<br>• The `*_pv`, `*_grid_import` and `*_grid_export` columns are cumulative kWh meter readings with gaps (the generator verifies this). It differences consecutive readings, treats negative or NaN deltas as gaps, requires ≥ 98% hourly coverage for the chosen calendar year, and asserts that the sum of the deltas equals the last minus the first reading.<br>• It picks the first residential household with all three columns that meets the coverage rule, about 200 KB gz.<br>• The battery model is documented: 5 kWh usable, 90% round trip, 2.5 kW limit, charged only from PV surplus. Tariff assumptions are shown on the page (import €0.30/kWh, feed-in €0.08/kWh, installed €700/kWh). |
| **Answer** | Computed: "Ship run <R> at epoch N: validation loss X, accuracy Y%." Then, only if a run's validation loss rises ≥ 5% above its minimum: "Run <R> overfits after epoch M (+Z% from its minimum)"; otherwise "Neither run overfits within 60 epochs". | "A 5 kWh battery would have saved €X in <year>; at €Y installed it pays back in Z years." The headline states it. |
| **Oracle** | An independent argmin over the committed CSV. | A hand-computed 3-day load/PV profile with known savings; the yearly import sum equals the last-minus-first meter reading. |
| **snaplot features** | `<Chart>` ×3 in a group (log-Y train loss, validation loss, validation accuracy); per-epoch validation rows with gaps (per-series data); an EMA smoothing slider computed with `useMemo` (the viewport is kept); `viewport` state in the URL via `onViewportChange`; `onPointClick` pins a checkpoint as an X reference line; a `useCursor` decision panel; `<LegendTable>` for both runs | A battery-size slider recomputes derived `data` with `useMemo` (the viewport is kept); monthly import/export bars; cumulative savings lines with and without the battery; a typical-day p10–p90 band by hour; `format: { style: 'currency', currency: 'EUR' }`; the auto legend |
| **Identity (reference)** | TensorBoard and Weights & Biases run comparison. Cool-neutral tool chrome `#F1F3F5` with white chart panels; two run colours (`#1F4FB0`, `#D2492A`) used across charts, table and chips; charts take two-thirds and the decision panel one-third. Roboto. | An Our World in Data / Carbon Brief explainer. A white 640 px article column, a Source Serif 4 headline that states the answer, charts interleaved with short prose. |
| **Acceptance** | StrictMode leaves no duplicate canvases; a pinned epoch survives a reload; the slider keeps the viewport; the panel values equal the CSV (Playwright pins an epoch); component files < 250 lines | Totals reconcile with the generator to the cent; the oracle passes; the slider keeps the viewport (Playwright); keyboard-only operation works; single column at 390 px |
| **Fallback** | sklearn digits (above) | If OPSD is unreachable: "When is Britain's electricity cleanest this week?" on the NESO Carbon Intensity API (`https://api.carbonintensity.org.uk`, CC BY 4.0). The generator shifts timestamps to London wall-clock, the chart renders them with `timeZone: 'UTC'`, and `SOURCE.md` documents the shift. |

| | S1 `find-the-clipping` | S2 `deploy-482` |
|---|---|---|
| **Question** | "Where does this recording clip?" | "Did deploy #482 cause the p99 spike?" |
| **Framework** | Solid | Solid |
| **User / task** | A podcast editor: clipped spans and long silences before publishing | An on-call SRE paged at 03:12: roll back or not |
| **Data and licence** | One real public-domain recording, **bundled as-is** (no re-encoding, no ffmpeg), decoded in the browser with WebAudio `decodeAudioData`. Selection rule in `scripts/demo-data/find-the-clipping.mjs`:<br>• Query archive.org `advancedsearch` in this order: `collection:nasa AND mediatype:audio` (US government works), then `collection:librivoxaudio AND subject:poetry` (LibriVox public-domain dedication). Keep items with licence evidence (a public-domain `licenseurl`, or NASA as creator), a 64 kbps or similar MP3 of 60–240 s and ≤ 2 MB.<br>• Decode up to 20 candidates in Playwright's Chromium with `decodeAudioData` (Node has no MP3 decoder), and bundle the first with ≥ 3 clipped runs (≥ 3 consecutive samples at or above −0.1 dBFS) and ≥ 1 silence longer than 2 s.<br>• Record the identifier, title, licence evidence and SHA-256 in `SOURCE.md`.<br>• If none qualifies: a generated sine sweep with injected clipping, labelled "Synthetic".<br>Drop-your-own-file is supported and never uploaded. | A **seeded simulator** (`site/src/demos/deploy-482/simulator.ts`, also used by the homepage hero), documented in `SOURCE.md`: log-normal per-endpoint latency through an M/M/c queue with GC pauses. Deploy #482 at t0 + 18 min adds an N+1 query to `/search`. p50, p95 and p99 are true per-1 s-bucket percentiles. `?seed=` replays a run. Labelled "Simulated service". |
| **Answer** | In the clip-list panel: "N clipped runs (samples at or above −0.1 dBFS); the longest is X ms at mm:ss; M silences longer than 2 s." | In the verdict banner: "p99 on `/search` rose from X ms to Y ms within 2 min of #482; other endpoints are unchanged, so roll back #482." A Rollback button injects the rollback and the service recovers. |
| **Oracle** | The clip count equals a reference scan run in the same page on an `OfflineAudioContext` decode; for the bundled file `clippedRuns >= 3`. | Each tooltip p99 equals a brute-force sort of that bucket's simulated samples. |
| **snaplot features** | `Float64Array` columns of 2–8M samples with M4 at rest; overview and detail charts in `createChartGroup({ viewport: false })`, where `drag: 'select'` on the overview drives `onSelectionChange` → `detail.update({ viewport: { x } })`; clip marks as scatter; RMS dB on `y2`; a log-X spectrum of the selection (a 60-line FFT in the demo); a `setCursor` playhead at 60 fps during playback; keyboard shortcuts (space, ←/→) | `appendData` at 10 Hz; `streaming` with a 10-minute `followWindow`, `onFollowingChange` and `resumeFollow`; deploy reference lines added live (a paint-only update); log Y; a group of 3 charts (latency, error % on its own axis with the SLO threshold on that axis, requests/s) with cursor and X sync; before/after histograms with shared `thresholds`; a category bar chart "p99 change by endpoint"; `<LegendTable>` |
| **Identity (reference)** | An Audacity / iZotope RX waveform editor. Dark graphite `#1B1D1F`, a green waveform, amber clip marks, a compact toolbar with keycap hints. The system UI stack and system monospace timecodes; no webfont. | A Grafana incident dashboard. Dark `#111217` panels in a dense three-column grid, greys for p50 and p95, amber `#F2A33A` only for p99, red only for SLO breaches, an annotation strip for deploys across the top. Inter. |
| **Acceptance** | Overview first paint < 300 ms after decode (desktop GPU); the oracle passes (Playwright); no long task > 50 ms during playback (PerformanceObserver); audio ≤ 2 MB | 60 simulated minutes at ×10 add < 10 MB of heap; deploy markers align across the 3 charts (same x pixel ±1); the oracle passes; Playwright: pan → `following` false → "Back to live" → true |

**Framework spread.**
- Vanilla shows `createChart`, `on*` options, `update({ viewport })`, a plugin and the categorical legend.
- React shows hooks, state options in the URL, memoised derived data, `<LegendTable>` and StrictMode.
- Solid shows streaming, fine-grained reactivity, a 60 fps playhead and groups.

**Deleted** (with the old site in M0):
- `site/src/dogfood/*` (PulseOps, CohortLab, GridScope, DogfoodShell, `data.ts`, `dogfood.css`, `data.test.ts`);
- `Demos.tsx`, `demos-hub.css`, `HeroDashboard.tsx`, `FeatureDemos.tsx`, `ui/Card.tsx`, `LegendTableDemos.tsx`;
- `DOGFOOD_DEMOS.md`.

About 2,500 lines in total. Ideas carried forward: PulseOps becomes S2; CohortLab's frontier becomes R1.

### 10.3 Build, host and test

- **Pages.** Each demo is an Astro page `site/src/pages/examples/<slug>.astro` with its own layout and fonts (no Starlight chrome). It mounts `site/src/demos/<slug>/main.{ts,react.tsx,solid.tsx}` with `client:only` (or a module script for vanilla). It deploys with the site at `/snaplot/examples/<slug>/`.
- **Data** lives in `site/public/data/<slug>/` with its `SOURCE.md`.
- **Examples hub** (`site/src/pages/examples/index.astro`) is an index, not a landing page:
  - one introductory sentence: "Each example answers one question with real or documented data";
  - one row per demo: the question, who decides what, a Playwright-rendered thumbnail, the dataset with licence and row count, a framework badge, and Open and Source links;
  - no hero, statistics or CTA.
- **Thumbnails.** `npm run thumbs` writes JPEG thumbnails (Playwright cannot write WebP), at most 60 KB each, to `site/public/examples/<slug>.jpg` (committed). They are regenerated after M14.
- **Montage check.** `npm run thumbs -- --montage --check` renders the six side by side and, from `getComputedStyle`, fails if any two demos share:
  - the same background colour (CIEDE2000 < 2) **and** the same `body` font family;
  - the same background colour (CIEDE2000 < 2) **and** the same number of chart columns at 1280 px (distinct left edges of chart canvases in the main region);
  - an identical hash of the top three levels of their DOM skeleton.

  With the §10.2 identities only V1 and R2 share a colour (white), and they differ in font and in column count (2 against 1).

  It also runs the banned-pattern lint. A fresh-session agent review of what remains is a bonus, recorded in the M16a handoff if one is possible (demos-02, uisite-10).

---

## 11. Repo, packaging and quality gates

### 11.1 Branches, worktrees and protecting the work

- **Baseline.** `overhaul` at `6237289` is the integration branch.
  - M0 tags it `overhaul-baseline`.
  - M0 writes `git bundle create /Users/liam/Projects/snaplot-backups/overhaul-baseline.bundle --branches --tags` and checks it with `git bundle verify`. If that directory is not writable, M0 uses `/Users/liam/Projects/snaplot/.claude/backups/` and records it in the handoff.
  - M0 also writes `overhaul-audit.tar.gz` (all of `notes/overhaul-audit/`, which is gitignored and so not in any bundle) to the same directory. Every later bundle refresh rewrites it.
  - Every merge is tagged locally `ovh-<milestone>-done` and writes an incremental bundle, `git bundle create <backups>/overhaul-<milestone>.bundle <previous merge tag>..overhaul`.
  - `main`, `revamp/v1-prep` and the remotes are never touched.
  - **Nothing is ever pushed.**
- **One worktree per milestone,** inside the project so no session leaves it (`.claude/` is gitignored):

  ```
  git -C /Users/liam/Projects/snaplot worktree add /Users/liam/Projects/snaplot/.claude/worktrees/m<N> -b ovh/m<N>-<slug> overhaul
  cd /Users/liam/Projects/snaplot/.claude/worktrees/m<N> && npm ci
  ```

- **Merging** (the integrator, one merge at a time):
  1. `git -C <worktree> rebase overhaul`
  2. Re-run the gates in the worktree, including `git rebase -x` (§12.0).
  3. From the main checkout: `git merge --ff-only ovh/m<N>-<slug>`.
  4. Re-run `npm run verify` and the starred gates on `overhaul`.
  5. Tag, write the incremental bundle, refresh the tarball.
  6. `git worktree remove <path>` (never `--force` on a dirty worktree).

  History stays linear, so `git bisect` and `git revert <sha>` stay cheap.
- **Generated files are never hand-merged.**
  - `package-lock.json`: take `overhaul`'s copy, run `npm install`, commit `build: refresh lockfile`.
  - Golden `api/*.d.ts`: regenerate (`npm run api:update`) and review the diff.
  - Screenshots: regenerate and review the contact sheet (only M3a and M14 commit them).
- **Concurrency.** At most 4 agent sessions at once, the integrator included.
- **The bench lock** is `mkdir /Users/liam/Projects/snaplot/.claude/bench.lock`, shared by every worktree and counted as stale after 2 hours. `bench/ab.mjs` takes it and records `os.loadavg()`. Before starting Docker, Playwright or `npm ci`, every session checks for the lock and waits while it exists. The A/B extraction cache is `/Users/liam/Projects/snaplot/.claude/ab-cache/<sha>`, and the visual reference cache is `/Users/liam/Projects/snaplot/.claude/visual-cache/<sha>` (`SNAPLOT_SNAPSHOT_DIR`).
- **Forbidden commands** (in every session): `git push`; `git clean -x` or `-X`; `git reset --hard` on `overhaul`; `git branch -D`; `git tag -f` or `git tag -d` on `overhaul-baseline` or any `ovh-*` tag; `git gc --prune=now`; `git worktree remove --force` on a dirty worktree; `--no-verify`. M17 deletes branches only with `git branch -d`, after `git branch --merged overhaul` lists them.
- **Commits.**
  - Conventional Commits with scopes `api`, `engine`, `axes`, `format`, `marks`, `theme`, `interaction`, `legend`, `a11y`, `react`, `solid`, `build`, `ci`, `bench`, `test`, `docs`, `site`, `demos`, `repo`.
  - Breaking changes use `!` and a `BREAKING CHANGE:` footer.
  - Visual default changes add a `visual: V<n>` paragraph.
  - The author is `Liam <liam.james.clark@gmail.com>`, already set in the repo-local config; M0 verifies it.
  - No co-author or tool trailers.
  - The formatter commit's SHA goes in `.git-blame-ignore-revs`.

### 11.2 Packaging (`packages/snaplot/package.json`, end state)

```jsonc
{
  "version": "1.0.0-beta.0",
  "description": "Canvas charts for live data. One options object for vanilla JS, React and Solid.",
  "keywords": ["chart", "charts", "canvas", "time series", "streaming", "react", "solid", "plot"],
  "type": "module",
  "sideEffects": false,
  "exports": {
    ".":       { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "./react": { "types": "./dist/react.d.ts", "default": "./dist/react.js" },
    "./solid": { "types": "./dist/solid.d.ts", "solid": "./dist/solid.jsx",
                 "worker": "./dist/solid.server.js", "deno": "./dist/solid.server.js",
                 "node": "./dist/solid.server.js", "browser": "./dist/solid.js", "default": "./dist/solid.js" },
    "./package.json": "./package.json"
  },
  "peerDependencies": { "react": "^18.3.0 || ^19.0.0", "solid-js": "^1.9.0" },   // both optional
  "engines": { "node": ">=22.12" }
}
```

- **Module format.** ESM only (D39). `require('snaplot')` works through Node 22.12's `require(esm)`, which `check-consumers` asserts.
- **Adapters import `'snaplot'`,** marked external in their builds, so there is one copy of the core in SSR too (frameworks-19, repo-15:ssr-dup). M5 adds the external and an expected-failure check; M13 switches the imports.
- **React entry.** A `'use client'` banner on `react.js` (repo-08, research-06).
- **Build target.** `es2022` with the browser floor in D25; no polyfills.
- **Declarations.** Rolled up per entry (`vite-plugin-dts` `rollupTypes: true`; if multi-entry rollup fails, tsdown). No `declarationMap`. Sourcemaps without `sourcesContent` (repo-15:maps).
- **Golden API.** The rolled-up declarations are copied to `packages/snaplot/api/*.d.ts` and diffed by `npm run check:api`.
- **README and LICENSE** are copied in by a `prepack` script.
- **Source aliases.** One mechanism: the library's own vitest and tsconfig map `'snaplot'` → `src/index.ts`. The site, bench, conformance pages and demos consume the built package (repo-16).

### 11.3 Quality gates

`npm run verify` runs G1–G3 locally. `.github/workflows/ci.yml` runs the same commands as jobs, and `deploy.yml` and `publish.yml` both `needs: ci`. Every workflow has a `permissions:` block.

| # | Gate | Command | Blocking from |
|---|---|---|---|
| G1 | Lint and format | `npx biome ci .` (formatter on, lineWidth 100) | M0 |
| G2 | Types | `npm run typecheck`: every workspace (`--workspaces --if-present`). The library runs `tsc -p tsconfig.json` (strict plus `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`) **and** `tsc -p tsconfig.test.json` (rootDir `.`, `src` + `test`, noEmit) | M0 (test config from M1) |
| G3 | Unit | `npm test` (vitest over `src/**` and `test/**`, jsdom declared, v8 coverage reported with a ratchet at measured − 1% from M14) plus `node scripts/check-architecture.mjs` (warn mode until M14) | M0 |
| G4 | Ledger and traceability | `npm run ledger` (prints `[id]` expected failures); `node scripts/overhaul/trace-check.mjs --milestone M<N>` at every merge and without `--milestone` at M14 and M17; `node scripts/overhaul/check-visual-ledger.mjs` | M3b |
| G5 | Package | `npm run build && npm run check:package`: publint; `attw --pack --profile esm-only`; `check-consumers` (nodenext, node16, bundler; `require(esm)`; React and Solid SSR + hydrate, with one core copy, a `test.fails` until M13; esbuild `--conditions=workerd,worker` for Solid; jsdom render without canvas, a `test.fails` until M11; the `'use client'` banner) | M5 |
| G6 | Size | `npm run check:size`: `scripts/size.mjs` bundles and minifies each import with esbuild and gzips at level 9. Imports: `{ createChart }`, `{ Chart }` from react, `{ Chart }` from solid, `{ histogram }`, `{ createLegendTable }`. Budgets in `scripts/size-budgets.json`: measured + 2% at M5, ratcheted in M14 (target `createChart` ≤ 50 KB; a miss is explained with `size.mjs --json` per-module output) | M5 |
| G7 | API | `npm run check:api`: `dist/*.d.ts` equals `packages/snaplot/api/*.d.ts`, plus the P4 forbidden-name grep | M5 |
| G8 | Palettes | `npm run check:palettes` (dark palette enforced; light printed) | M5 advisory, blocking from M11 |
| G9 | Browser | `npm run test:browser`: Playwright in Chromium (conformance, interaction, touch via CDP, a11y with axe, geometry, lifecycle, tooltip text); a smoke subset in WebKit and Firefox inside Docker locally and in CI | M3b |
| G10 | Visual | See below | M3a |
| G11 | Docs | `npm run build:site`, `npm run check:examples`, the smoke spec, TypeDoc validation (warn until M7, then error), the internal link check (no links to untracked files), `sync-readme --check`, `check-migration` (from M15b), the style and copy lints | M6a |
| G12 | Perf | `npm run bench:ab -- --base <merge-base> --set M<N>` (§3.4). Required locally at the merge of any milestone touching `src/engine/**`, `src/core/**` or `src/public/**`. Advisory in CI (software raster), with results uploaded. | M4 |

**G10, the visual gate.**
- `npm run test:visual -- --against <ref>` builds `<ref>` (cached by SHA in `SNAPLOT_SNAPSHOT_DIR`, outside the tracked tree) and the head inside the pinned Docker image. Each side renders its own fixture app, so a fixture renamed by M7 or M8 compares like with like; refs older than M3a's merge have no fixture app and are not valid references. It writes Playwright's JSON report and never writes into the tracked `__screenshots__/`.
- `scripts/overhaul/check-visual-diffs.mjs` reads that report:
  - **M2, M9a and M9b:** zero changed fixtures, blocking.
  - **M7 to M14:** every changed fixture must be named in a visual-ledger row file added by the merging milestone, blocking. The diff images go to `notes/overhaul-audit/visual-diffs/<milestone>/`.
  - A fixture that exists only on the head is reported as added and needs no row.
- **Committed baselines:** M3a commits the initial set (row V0) and M14 the approved final set. CI's visual job compares against them; it is report-only until M14 and blocking after.
- **Platform.** `scripts/visual-docker.sh` runs `mcr.microsoft.com/playwright:v1.61.1-noble` with `--platform linux/amd64`, to match GitHub's x86_64 runners. It copies the worktree, excluding `node_modules` and `dist`, into a container volume, runs `npm ci && npm run build && npx playwright test --project visual` there, and copies the screenshots and report back, so host darwin `node_modules` are never clobbered. If the amd64 run fails or takes more than 3× the arm64 run, it uses arm64, CI's visual job stays advisory, and the handoff says "refresh Linux baselines with the `update-snapshots` workflow". If `docker info` fails, agents compare `-darwin` screenshots and record the same note.
- **Settings:** `maxDiffPixelRatio: 0.002`. Fixtures load IBM Plex Sans from `@fontsource`, set `fontFamily` explicitly, wait for `document.fonts.ready` and two idle frames, and use seeded data, reduced motion and a fixed viewport.
- **Size.** The fixture grid renders at DPR 1. About 20 crispness fixtures add DPR 2, and only theme fixtures render in both light and dark. Target ≤ 150 PNGs and ≤ 10 MB per committed set, recorded in ADR 0002.
- Geometry and tooltip-text specs are platform-independent and gate everywhere. Canvas hashes are compared only within a single run (across runtimes), never against committed values.

### 11.4 Repo layout and doc-sprawl cleanup

```
packages/snaplot/   src/, test/{fakes,ledger,visual,browser,conformance,consumers}, api/ (golden),
                    playwright.config.ts, tsconfig.test.json
site/               Astro + Starlight docs, homepage, examples hub, demo pages; tests/
bench/              perf harness v2 (ab.mjs, src/api/{v012,v1,v2}.ts, src/scenarios/<area>.ts, gate.json, README.md)
scripts/            size, check-architecture, check-palettes, sync-readme, ledger, thumbs, visual-docker.sh,
                    release.sh, demo-data/
scripts/overhaul/   metrics, trace-ids.json, trace-ids.mjs, trace-check, check-visual-ledger, check-visual-diffs,
                    check-migration (overhaul-only; M17 removes them from verify, CI and the root scripts)
docs/               architecture.md, backlog.md, decisions/0001-visual-reference.md, decisions/0002-overhaul.md,
                    decisions/visual-ledger/V<n>.md, decisions/removed-since-0.12.txt, handoff/m<N>.md
README.md  CHANGELOG.md  CONTRIBUTING.md  LICENSE  .git-blame-ignore-revs
```

**Deleted:**
- `experiments/` (its gitignored evidence is copied first);
- the old `site/` (its gitignored `screenshots/` are copied first);
- `scripts/generate-api-docs.mjs` and `scripts/bundle-report.mjs` (replaced by `scripts/size.mjs`);
- `SNAPLOT_IMPROVEMENT_BACKLOG.md`, `DOGFOOD_DEMOS.md` and `notes/dogfood-friction-log.md`;
- the `notes/` gitignore exceptions, so all of `notes/` is local.

**`docs/backlog.md`** takes the open rows of all 23 source documents reconciled in `backlog.md` §2.1–§2.7, one line each: id, title, source file, status (`open`, `planned:M<N>` or `wontdo`), acceptance test. That includes `notes/dx-audit.md` §2.4's six open items and the chart-lab `EVALUATION.md` follow-ups (the sizing recipe; the native-capabilities round). `notes/PERF.md`'s root causes go into the `bench/README.md` History section (M4). `notes/feature-proposal-1.0.md`'s non-goals reconcile with the README's "Not yet supported" list (M15a).

**Kept at the root:** only README, CHANGELOG, CONTRIBUTING, LICENSE and config files (repo-17, backlog-26).

**README:** a short landing page with what it is, the generated install string, a 15-line quick start per framework plus the no-build snippet (generated, with sizing), the browser floor, a "Not yet supported" list (D36) and absolute links. No working-tree notes and no links to untracked files (docs-09).

**CONTRIBUTING:**
- the script table, generated from `package.json`;
- the principles;
- the gates;
- the worktree protocol;
- how to add a docs page or example;
- how to review and approve visual baselines (docs-17).

---

## 12. Milestones

### 12.0 Protocol (applies to every milestone)

- **Read first.**
  - This plan, at `/Users/liam/Projects/snaplot/notes/overhaul-audit/plan.md` (copied in M0).
  - The audit reports and evidence in `/Users/liam/Projects/snaplot/notes/overhaul-audit/`. These are gitignored and exist only in the main checkout, so worktree sessions read them by absolute path.
  - Audit file:line evidence refers to `overhaul-baseline`. Read it with `git show overhaul-baseline:<path> | sed -n '<a>,<b>p'`, and find the current code by symbol.
- **Start.** Use the worktree commands in §11.1. Only the integrator writes to `overhaul`, and only by fast-forward merges.
- **Ownership.**
  - Edit only the paths your milestone owns.
  - During W5, `engine/Engine.ts` may receive wiring hunks of at most 20 lines per track.
  - From `ovh-api-frozen`, the integrator-owned files and the W5 contracts (§3.2) change only through one isolated `chore(<scope>): integrator request — <what>` commit of at most 30 lines per track, listed in the handoff.
  - Anything else you need goes under "Requests for integrator" in `docs/handoff/m<N>.md`; work around it meanwhile.
- **Tests first, suite always green.**
  - The first commit of each behaviour change adds or flips tests.
  - A defect test that does not pass yet is committed as `it.fails('[id] …')` or `test.fail(true, '[id]')`.
  - The fix commit flips it to a normal test.
  - Before asking to merge, prove every commit is green: in the worktree, run `git rebase -x 'git diff --quiet HEAD~1 -- package-lock.json || npm ci; npm test' <base>` (the base is `overhaul`, or the previous tag for serial milestones), and paste the tail of its output into the handoff. The lefthook pre-commit hook is never bypassed.
- **Before asking to merge:** the gates in "How to execute this plan" (after §0), plus the milestone's own exit commands. Paste the outputs into `docs/handoff/m<N>.md`.
- **Handoff file.** `docs/handoff/m<N>.md` has the sections Summary, Gates (pasted outputs), Visual-ledger rows, Requests for integrator, Known gaps, Data notes and Human steps. M17 concatenates them into `docs/overhaul-handoff.md`. Nobody edits another milestone's file. ADR 0002 is edited only by M0, M14 and M17.
- **Visual baselines.**
  - Only M3a (initial, row V0) and M14 (final) commit PNG baselines.
  - Other milestones run `npm run test:visual -- --against <merge-base>` and `check-visual-diffs` (§11.3 G10).
  - Each pixel-changing default is its own commit with its row file in `docs/decisions/visual-ledger/` (P13), from the milestone's reserved range: M7–M9b V17–V29, M10 V30–V49, M11 V50–V69, M12a V70–V79, M12b V80–V89. Reverting one later is `git revert <sha>`, then a fresh `test:visual` run and review.
- **Bench** runs only at merge points, under the lock, on the milestone's set (§3.4). Before starting Docker, Playwright or `npm ci`, every session checks the bench lock and waits while it exists (§11.1).
- **API freeze.** After M8 merges (tag `ovh-api-frozen`), public names are frozen. A later change to `packages/snaplot/api/*.d.ts` needs an integrator-request commit and a matching docs and CHANGELOG change.
- **Timebox.** A milestone that reaches 1.5× its estimate stops. It merges the longest prefix of its commits whose gates pass, leaves the rest as ledger entries and "Known gaps" in its handoff, and the integrator decides whether a follow-up track runs before M14.
- **Human-only actions** are recorded in the handoff: pushing, npm publish, creating GitHub issues or PRs, pinning Actions by SHA, Dependabot, enabling Pages, and real-device perf checks.
- **Stop line.** If the run must stop early:
  1. Finish the milestone in progress and merge it only if its gates pass.
  2. Write `docs/handoff/stop.md` with the stop point, what is missing (R21) and the next milestone.
  3. Do not start a W5 track unless M9b has merged.
  4. Always run M17's handoff steps, even if other milestones are skipped.

  Priority when time is short (dependencies still apply):
  - **mandatory:** M0, M1, M3a, M3b, M5;
  - **then:** M4, M2, M6a, M6b, M7, M8, M13, M15a, M16a/b/c, M9a, M9b, M12a, M12b, M10, M11, M14, M15b, M17.

### M0. Protect the baseline, harvest evidence, clean the repo (W0, serial, 1 day)

- **Goal.** Nothing can be lost; the evidence outlives `/private/tmp`; every later worktree branches from a clean, formatted baseline whose commits are all green.
- **Owns:**
  - git refs;
  - `notes/overhaul-audit/**` (gitignored);
  - root `package.json`, `package-lock.json`, `.gitignore`, `biome.json`, `lefthook.yml`, `.git-blame-ignore-revs`;
  - `packages/snaplot/tsconfig.json` (flags only) and `packages/snaplot/package.json` (devDependencies only);
  - `.github/workflows/*.yml` (only removing the site and lab steps);
  - `scripts/overhaul/metrics.mjs` and the initial `docs/**`;
  - the deletions listed below.
- **Scope:**
  1. **Preconditions.** `git status --porcelain` is empty; `HEAD` is `6237289` on `overhaul`; `git config user.email` is `liam.james.clark@gmail.com`; `mkdir -p /Users/liam/Projects/snaplot-backups && touch` succeeds there (else use `.claude/backups/`, §11.1).
  2. **Protect.** Run `git tag -a overhaul-baseline -m "API overhaul baseline" 6237289`. Write the bundle and verify it (§11.1).
  3. **Harvest the evidence.** From `/private/tmp/claude-501/-Users-liam-Projects-snaplot/76647906-acb8-4a29-8fd6-6a20ecda8e45/scratchpad/`, copy into `notes/overhaul-audit/evidence/` (skip `node_modules`, `dist`, `*.webm` and `*.mp4`, and skip `*.png` except where listed):
     - `repro/**`;
     - `play/**` (`*.html`, `*.ts`, `*.tsx`, `*.js`, `*.mjs`);
     - `gap-perf-gate/{ext/src/**,*.mjs,results/*.json}`;
     - `gap-overhaul-delta/{srv/**,*.mjs}`;
     - `gap-scale-longevity/*.mjs`;
     - `gap-competitive/{results/*.json,results/*.md,results/*.txt,bundle/sizes.json,*.mjs,*.sh}`;
     - `visuals/*.mjs`;
     - `repo/ssr/**`, `repo/vtconsumer/**` (if present);
     - `arch/*.{cjs,mjs,ts}`;
     - `docs/{snippets.json,tc/**,*.mjs}` (the 71-sample strict-TS harness behind docs-03);
     - `dxtrial/**` (the first-user task scripts and tsconfigs);
     - `backlog/*.{mjs,json}` (including `lab-cases.mjs` and the gri01 repro);
     - `uisite/*.mjs` (including `herosweep.mjs`, the hover sweep behind uisite-03);
     - `research/*.mjs`;
     - the `render/`, `interact/`, `dataapi/`, `frameworks/` and `gap-environments/` scripts.

     Then:
     - Render `notes/overhaul-audit/gap-competitive.md` (the only auditor whose report was never written) from the gap-competitive entries of `_results.json` plus `results/tables.md` and `results/scorecards.txt`.
     - Copy `design/plan-final.md` to `notes/overhaul-audit/plan.md`.
     - From the repo, copy `experiments/chart-lab/evidence/` (23 PNGs, never committed) to `evidence/lab/` and `site/screenshots/` (12 files, never committed) to `evidence/site-screenshots/`, and check the counts.
     - Check with `git check-ignore` that everything is ignored, and print the file counts into `docs/handoff/m0.md`. If the scratchpad is gone, record that and continue: the reports carry the numbers.
     - Write `<backups>/overhaul-audit.tar.gz`.
  4. **Record decisions before deleting.**
     - `docs/decisions/0001-visual-reference.md`: from `experiments/chart-lab/VISUAL_REFINEMENT.md`, plus the D22 rules and the baseline-approval checklist (M14).
     - `docs/decisions/0002-overhaul.md` with these sections:
       - Decisions: §1 condensed, with "revisit" notes and the "Auditor recommendations not adopted" table.
       - Pre-overhaul visual ledger: V1–V16 from `gap-overhaul-delta.md` §1.5. Approve V1, V3–V5, V7, V8, V10–V12, V14–V16. Mark V2 (fallback), V6 (grid-less axes), V9 and V13 "revert planned".
       - A pointer to `docs/decisions/visual-ledger/` for V0 and V17 onward.
       - Baseline metrics.
       - Approved baselines and Outcome (filled in M14 and M17).
     - `docs/decisions/visual-ledger/README.md` (the row format and the reserved ranges) and an empty `baseline-commits.txt`.
     - `docs/backlog.md` per §11.4: the open rows of all 23 sources, each tagged with its source file, plus the D36 items.
     - `docs/handoff/README.md` (the section template) and `docs/handoff/m0.md`.
     - `docs/architecture.md`: a one-page module map (updated in M9b).
  5. **Dependencies, before any deletion.** Use exact pins at least 14 days old, checked with `npm view <pkg> time`:
     - `jsdom@30.1.0` into `packages/snaplot` devDependencies (today it is installed only because the lab declares it, and 7 library test files need it);
     - `@vitest/coverage-v8@4.1.4` (matching vitest 4.1.4);
     - `@playwright/test@1.61.1` (matching the installed `playwright`);
     - `@axe-core/playwright`;
     - `esbuild`, `publint`, `@arethetypeswrong/cli`, `typedoc`;
     - `@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono`;
     - `@vitejs/plugin-react`; `vite-plugin-solid` if not already present.

     Then one `npm install`.
  6. **Delete, and route root scripts through workspaces.**
     - `git rm -r experiments site scripts/generate-api-docs.mjs` in the worktree. After the fast-forward, the integrator removes the ignored files those directories leave in the main checkout, by path and only after step 3's copies are verified: `rm -rf /Users/liam/Projects/snaplot/experiments /Users/liam/Projects/snaplot/site`. Never `git clean`.
     - In the same commit: remove `site` and `experiments/chart-lab` from `workspaces` (M6a re-adds `site`), and refresh the lockfile.
     - Rewrite the root scripts once. `typecheck` is `npm run typecheck --workspaces --if-present` and `test` is `npm test --workspaces --if-present`. `verify` is `biome ci . && npm run typecheck && npm test && npm run build`. Every later root script name is a one-line delegation to a workspace script or a `scripts/` file: `test:visual`, `test:browser`, `test:conformance`, `conformance:install`, `test:tz`, `ledger`, `trace-check`, `check:package`, `check:size`, `check:api`, `api:update`, `check:palettes`, `check:examples`, `build:site`, `dev`, `dev:lib`, `demo-data`, `thumbs`, `bench`, `bench:ab`, `metrics`. Until its milestone lands, a delegation fails with "missing script", which is expected. Later milestones edit only their own workspace's `package.json`.
     - Remove the site and lab steps from `quality.yml`, `deploy.yml` and `publish.yml`.
     - Add `test-results/` and `scripts/demo-data/.cache/` to `.gitignore`.
  7. **Consolidate the backlogs.** Delete `SNAPLOT_IMPROVEMENT_BACKLOG.md`, `DOGFOOD_DEMOS.md`, `notes/dogfood-friction-log.md` and the `notes/` exceptions in `.gitignore`.
  8. **Formatter.** Set `formatter.enabled: true` in `biome.json` and run `npx biome format --write .`. Commit that alone, then put its SHA in `.git-blame-ignore-revs`. Then enable the 4 zero-cost TS flags and fix what they flag.
  9. **Metrics.** `scripts/overhaul/metrics.mjs` prints JSON:
     - code and physical lines; file count; largest file;
     - runtime exports per entry (read from `dist`);
     - option leaves (a TS checker walk of `ChartOptions`, ported from `evidence/arch/option-tree.cjs`);
     - handle members and event count;
     - legend implementations (a grep count).
- **Commits:**
  1. `docs: record the visual reference, overhaul decisions and backlog`
  2. `build(deps): add test, packaging and docs tooling`
  3. `chore(repo)!: remove the chart lab and the legacy docs site`
  4. `chore(repo): consolidate backlogs into docs/backlog.md`
  5. `style: enable biome formatter and reformat`
  6. `chore(repo): ignore the formatting commit in blame`
  7. `build(ts): enable zero-cost strict flags`
  8. `chore(scripts): add the overhaul metrics report`
- **Exit:**
  - The tag exists, the bundle verifies and the tarball exists.
  - In the `m0` worktree, `git rebase -x 'git diff --quiet HEAD~1 -- package-lock.json || npm ci; npm test' overhaul-baseline` succeeds.
  - A clean `npm ci` passes, and `npm ls echarts recharts chart.js` is empty.
  - `npm run verify` is green with 483 library tests.
  - `npx biome format .` reports no changes.
  - The metrics JSON is saved in ADR 0002 (Baseline).
  - `git ls-files experiments site | wc -l` returns 0, and the evidence counts (lab 23, site screenshots 12) are in the handoff.
- **Closes:** repo-02, repo-03, repo-12, repo-17, repo-20, demos-11, demos-17, demos-19, docs-04, docs-15, uisite-18, backlog-26.
- **Depends:** none.

### M1. Critical fixes on the current code; test config; debug counters (W0, serial, 1.25 days)

- **Goal.** By day 2.25, no chart shows wrong data or a black box for the reasons the audit found, and each fix is locked by a public-API test that survives the later rewrites. Tests outside `src/` run and typecheck. The debug counters that the ledger and the bench need exist.
- **Owns** (by symbol, because M0 reformatted every file):
  - `packages/snaplot/vitest.config.ts` (include and environment), the new `packages/snaplot/tsconfig.test.json`, and the package `typecheck` script;
  - in `src/api/createChart.ts`: `broadcast`, the viewport branch of `Controller.bindEngine`, and attaching the debug symbol to the handle;
  - in `src/interaction/HitTester.ts`: the `formattedY` sites;
  - in `src/core/Chart.ts`: `ChartCore.getCursorSnapshot`, the tooltip-point builders (including bars and histograms), the ResizeObserver callback, and counter increments at the existing ingest and prepare points and in the draw loops;
  - in `src/core/CanvasManager.ts`: `watchDpr` and `resize`;
  - in `src/data/RingColumnarStore.ts`: a counter in `materialize`;
  - new: `src/engine/format.ts` (the seed), `packages/snaplot/test/fakes/**` (canvas 2D recorder, ResizeObserver, IntersectionObserver, matchMedia, computed-style stub, and a `debug(chart)` helper that reads the debug symbol), and `packages/snaplot/test/ledger/m1-{group,readout,lifecycle}.test.ts`.
- **Tests first** (committed as `it.fails`, flipped by each fix):
  - `[dataapi-01][dxtrial-01][frameworks-06][interact-01]`: two grouped charts with different Y units; after an X zoom on A, B's Y domain is unchanged and automatic. A peer with `y2` keeps its own `y2`. A peer without `x2` still syncs `x`. A reset propagates.
  - `[visuals-01][dxtrial-02]`: on an integer-step axis, a tooltip value of 0.4567 reads `0.46`; 0.0004567 reads `0.00046`; 39.27 reads `39.27`; 1138371 reads `1,138,371`. Checked through the tooltip DOM and `getCursorSnapshot`.
  - `[gap-environments-01]`: a print media change with an unchanged DPR does not clear the canvases.
  - `[gap-scale-longevity-01]`: the ResizeObserver callback paints synchronously, and a no-op resize does not reallocate.
- **Scope:**
  - **Test config.** The vitest include becomes `['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}']`; the environment stays `node`, and DOM tests carry `// @vitest-environment jsdom`. `tsconfig.test.json` extends the base with `rootDir: '.'`, `include: ['src', 'test']` and `noEmit`. The package `typecheck` script runs both configs.
  - **Debug counters** (instrumentation only, no behaviour change): `chart[Symbol.for('snaplot.debug')]` with the D31 fields, counted at the existing ingest and prepare points, the draw loops and `RingColumnarStore.materialize`. `getStats()` stays until M8.
  - Broadcast only horizontal axis keys that the peer has, and never mark a peer's Y as pinned.
  - `formatValue(value, { stepDecimals, locale })` with the P9 rule, grouping and a cached `Intl.NumberFormat`. Wire every readout through it; axis-`format` wiring waits for M10.
  - A DPR guard that returns early when `devicePixelRatio` has not changed.
  - A synchronous render in the RO callback, skipping same-size reallocations.
- **Commits:**
  1. `test: run and typecheck tests under test/`
  2. `test(core): expose debug counters`
  3. `test: add shared fakes and record the critical defects as expected failures`
  4. `fix(group): sync only horizontal viewports to peers that have them`
  5. `fix(format): show readouts at value precision`
  6. `fix(core): ignore print media changes that keep the device pixel ratio`
  7. `fix(core): paint synchronously on resize and skip no-op reallocations`
- **Exit:**
  - `npx vitest run test/ledger --reporter=verbose` lists the 4 `[id]` test groups, all passing, with no `it.fails` left for these ids.
  - The printed test total equals 483 plus the new tests.
  - A deliberate type error in a `test/` file (made locally, not committed) fails `npm run typecheck`.
  - `npm run verify` is green.
  - The legacy bench (`node bench/run.mjs --profile desktop` then `node bench/compare.mjs --max-ratio 1.5`) shows no regression beyond 1.5×. It is advisory; note the result in the handoff.
  - Tag `ovh-m1-done`, and add the handoff line "criticals fixed".
- **Closes:** dataapi-01, dxtrial-01, frameworks-06, interact-01, dxtrial-02, visuals-01, gap-environments-01, gap-scale-longevity-01.
- **Depends:** M0.

### M2. Delete dead and legacy engine code (W1, 1.5 days)

- **Goal.** Remove about 1,450 lines without changing behaviour.
- **Owns:**
  - `src/{core,plugins,renderers,scales,data}/**`, `src/types.ts`, and in `src/core.ts` only internal exports that are not in the golden API;
  - the three `Omit<…, 'syncKey'>` lines in `src/api/types.ts`;
  - the ported engine tests `packages/snaplot/test/engine-*.test.ts`.

  It touches `api/`, `react/` and `solid/` otherwise only for import fixes.
- **Tests first** (these two commits start at once):
  - Port `core/Chart.append.test.ts` (75 tests) onto a `test/fakes/engine.ts` builder that constructs the engine through `sources`, with no `data` constructor and no private-field access. Split it into `engine-<area>.test.ts`, keeping the test names.
  - Restore the assertions weakened during the overhaul (gap-overhaul-delta-06):
    - the inverted-axis bar-width probe;
    - the histogram default baseline;
    - the "while grouped" `alignPlots`/`yRange` assertions;
    - replace the endpoint-collapse assertion with `it.fails('[visuals-09] keeps ≥ 3 labels for prime interval counts')`.
  - Add `legacy-surface.test.ts`: an untyped `cursor.syncKey` does **not** link two charts.
- **Scope** (the deletion commit starts only after M3a has merged, rebased onto it). Delete:
  - `plugins/builtins/{legendPlugin,legendTablePlugin,legendTableColumns,tooltipPlugin,crosshairPlugin}.ts` (802 lines);
  - the single-buffer renderer wrappers, moving their tests to the `*Segments` functions;
  - `SyncGroup`, `syncKey`, `highlightSyncKey`, `zoomSyncKey`, `getKey` and key-based highlight;
  - `setData`, the legacy `appendData`/`getData`/`getCursorSnapshotInto`, the constructor `data` path and `this.store` (use `sourceStores` always);
  - the legacy `EventMap` entries and the never-dispatched hooks and events;
  - `ChartInstance` (replaced by a narrow internal `EngineHost`);
  - unused internal types.

  No public export is removed here: `lttb` and every other golden-API removal belong to M8.
- **Commits:**
  1. `test(engine): port integration tests onto source-based fakes`
  2. `test: restore assertions weakened during the API overhaul`
  3. `refactor(engine)!: remove legacy sync, the single-store path and dead plugins`
- **Exit:**
  - The test count is at least the M1 total minus the tests of deleted code, each listed in the commit body.
  - `rg -n "SyncGroup|syncKey|setStoreData|ChartInstance|legendTablePlugin" packages/snaplot/src` is empty.
  - Code lines drop by at least 1,000.
  - After rebasing onto M3a, `npm run test:visual -- --against <merge-base>` shows zero changed fixtures.
  - `npm run bench:ab -- --base ovh-m1-done --set M2` is within 1.2×.
- **Closes:** arch-09, arch-10, backlog-24, dataapi-18, repo-11, gap-overhaul-delta-06.
- **Depends:** M1. Merges after M3a and M4. **Parallel:** M3a, M3b, M4, M5, M6a, M6b.

### M3a. Visual and geometry harness (W1, 2 days)

- **Goal.** A deterministic pixel and geometry safety net, in place before any deletion or rendering change.
- **Owns:**
  - `packages/snaplot/test/visual/**` and `packages/snaplot/playwright.config.ts`;
  - `scripts/visual-docker.sh`, `scripts/overhaul/check-visual-diffs.mjs`, `scripts/overhaul/check-visual-ledger.mjs`;
  - the `test:visual` workspace scripts;
  - `docs/decisions/visual-ledger/V0.md` and `baseline-commits.txt`.
- **Scope:**
  1. **A Vite fixture app** at `test/visual/index.html?fixture=<id>`, with fixtures split by area (`axes.ts`, `marks.ts`, `theme.ts`, `layout.ts`, `overlay.ts`). Fixtures use only options that survive §4.4: no `padding`, `tickCount`, `rangePadding`, `heatmap*`, `fillGradient`, `pointShape` or legend plugins (legend fixtures arrive with M8). When M7 or M8 renames an option, that milestone updates the fixtures in the same commit. Port:
     - the 12 `#/visual` fixtures from `git show overhaul-baseline:site/src/components/VisualRegressionHarness.tsx`;
     - the 8 basic fixtures from `evidence/gap-overhaul-delta/srv/fixtures.js`;
     - the DEFAULTS_FINDINGS cases (long titles, long ticks, 30 long categories, single observation, constant), using `evidence/backlog/lab-cases.mjs`;
     - edge fixtures:
       - isolated points between gaps; empty data; all-negative bars; log under one decade;
       - a time axis spanning a few seconds; epoch-ms bars on a time axis; ISO strings;
       - bar+line hover; 3-series scatter hover; histogram `fill`; area with negatives;
       - a transparent background; a dark CSS-variable surface;
       - annotations at 390 px; a y2 dual axis; a 24 px minimum font size; explicit `ticks`;
     - the audit grid: 6 marks × {1, 3, 8} series × {320×200, 640×320, 1200×480} at DPR 1; about 20 crispness fixtures that also render at DPR 2; and theme fixtures (white, cream and dark cards × emulated OS light and dark).
  2. **Determinism.** IBM Plex Sans via `@fontsource`, an explicit `fontFamily`, `document.fonts.ready` plus two idle frames, seeded data, reduced motion and a fixed viewport.
  3. **`scripts/visual-docker.sh`** with `--against <ref>` and the platform rules of §11.3 G10.
  4. **Geometry specs** (platform-independent, blocking), using DOM label boxes (`getBoundingClientRect` on label spans):
     - no overlapping label boxes;
     - no two adjacent labels with the same text;
     - ≥ 2 labels per axis when the plot is ≥ 120 px;
     - every finite datum paints ≥ 1 pixel;
     - no label outside the container.

     A case that today's code fails is `test.fail(true, '[id]')` with the owning milestone's id.
  5. **Initial baselines.** Commit Linux baselines (≤ 150 PNGs, ≤ 10 MB) with row file `V0.md`, and list that commit in `baseline-commits.txt`.
  6. **`check-visual-diffs.mjs`** (G10) and **`check-visual-ledger.mjs`** (P13).
- **Commits:**
  1. `test(visual): deterministic fixture app and docker screenshot runner`
  2. `test(visual): geometry specs over DOM label boxes`
  3. `test(visual): initial Linux baselines`
  4. `chore(scripts): check screenshot diffs against the visual ledger`
- **Exit:**
  - `npm run test:visual -- --against HEAD` twice in a row shows zero diffs.
  - The committed baselines number ≤ 150 and total ≤ 10 MB (printed).
  - The geometry specs pass, or are `test.fail` with an `[id]`.
  - Self-test: a deliberately changed fixture (a local edit, not committed) fails `check-visual-diffs`; adding a row file that names it passes.
- **Closes:** repo-10.
- **Depends:** M1. **Parallel:** M2, M4, M5.

### M3b. Expected-failure ledger, browser specs and trace ids (W1, 2.5 days)

- **Goal.** Real-browser safety nets and a machine-readable record of every known defect, covering all 192 required findings.
- **Owns:**
  - `packages/snaplot/test/{ledger,browser}/**` (it extends M1's ledger files) and `packages/snaplot/test/perf-guards.test.ts`;
  - `scripts/ledger.mjs`, `scripts/overhaul/{trace-ids.json,trace-ids.mjs,trace-check.mjs}`;
  - the `ledger`, `test:browser` and `trace-check` workspace scripts.
- **Scope:**
  1. **Browser specs** written against today's behaviour, named by owning milestone, with `test.fail(true, '[id]')` wherever the audit reproduced a defect:
     - `m12a-interaction.spec.ts`, `m12a-touch.spec.ts` (CDP touch), `m12a-a11y.spec.ts` (axe), `m12a-tooltip-rows.spec.ts`;
     - `m12a-hover-sweep.spec.ts`: the 12×8 probe grid, ported from `evidence/uisite/herosweep.mjs`;
     - `m11-lifecycle.spec.ts` (resize screencast, print emulation), `m11-marks.spec.ts`;
     - `m10-tooltip-format.spec.ts` (the dxtrial values).
  2. **Unit ledger.** Port `evidence/repro/**` into `test/ledger/m<N>-<area>.test.ts` as `it.fails('[id] <expected behaviour>')`, using only `createChart` plus fakes plus the `debug()` helper, so the tests survive the rewrites. The owning milestone comes from `trace-ids.json`.
  3. **Perf guards.** `test/perf-guards.test.ts` holds every §3.4 call-count guard. A guard that today's code fails is an `it.fails('[perf:<guard>]')` owned by the milestone §3.4 names.
  4. **`scripts/overhaul/trace-ids.mjs`** generates `trace-ids.json` from `_results.json`, this plan's milestone Closes lists and the §6 won't-do table. Each id records severity, verdict, `required`, owners, parts, status and its lock (a test-title fragment, or a named gate such as `site smoke [uisite-06]`). `--render` prints the per-milestone and per-root-cause views.
  5. **`scripts/overhaul/trace-check.mjs`.** `--milestone M<N>` checks that milestone's ids; with no flag it checks all 192. Rules:
     - every required id whose owners have all merged has a passing test whose title contains `[id]` (or `[id:part]`), read from the vitest and Playwright JSON reporters, or its named gate lock passed in the latest handoff;
     - no closed id remains in the ledger;
     - at release, the ledger holds only §6 won't-do part-ids.

     `--coverage` prints any required id with neither a ledger entry, nor a lock, nor a closing milestone.
  6. **`scripts/ledger.mjs`** scans `packages/snaplot/{src,test}/**` and `site/tests/**` for `it.fails(` and `test.fail(` with an `[id]`, and prints id, file and title. `--json` gives machine output; `--allow <ids>` exits non-zero if any other ids remain.
- **Commits:**
  1. `test(browser): interaction, touch, a11y, lifecycle, marks and tooltip specs`
  2. `test: record known defects as expected failures with finding ids`
  3. `test(perf): call-count guards for the hot paths`
  4. `chore(scripts): ledger report and finding traceability`
- **Exit:**
  - `npm run test:browser` is green (with its markers).
  - The number of `it.fails`/`test.fail` that vitest and Playwright report as executed equals the length of `npm run ledger -- --json`, so no marker is silently skipped.
  - `trace-check --coverage` reports 0 of 192 uncovered: every required id not closed by M0–M2 is in the ledger or has a named gate lock.
  - `npm run ledger` prints at least 80 entries.
- **Closes:** none; it records the ledger every later milestone flips.
- **Depends:** M1. Merges after M2 (rebased). **Parallel:** M2, M4, M6a, M6b.

### M4. Perf gate v2 (W1, 2.5 days)

- **Goal.** A gate that sees what the audit found invisible: hover, ingest, re-render, group, fidelity and heap, against any ref back to v0.12.0.
- **Owns:** `bench/**` and the bench workspace scripts.
- **Scope:**
  - **`bench/ab.mjs --base <ref> [--head <ref>] [--profile desktop|mobile|both] [--runs 3] [--raster gpu|software] [--set M<N>] [--filter <group>] [--api v012|v1|v2]`.**
    - It extracts each ref with `git archive <ref> | tar -x -C /Users/liam/Projects/snaplot/.claude/ab-cache/<sha>` (cached by SHA; no worktree is registered), then runs `npm ci && npm run build -w packages/snaplot` on each side.
    - It builds the bench page against each side's `dist`, runs 3 interleaved pairs per profile, and compares the median of medians.
    - It takes the lock and records load (§11.1), and writes `bench/results/ab-<base>-<head>.md`.
  - **Metrics:**
    - main-thread busy time per frame (`performance.now` around step plus flush, plus long-animation-frame entries);
    - rAF p95 only as a jank signal;
    - a sync timer floor of 0.25 ms;
    - `--enable-precise-memory-info --js-flags=--expose-gc` for gross bytes per operation and retained bytes after GC;
    - fidelity from the debug symbol, on the head only (n/a for refs older than `ovh-m1-done`).
  - **GPU raster** by default (`channel: 'chromium'`, `--enable-gpu-rasterization --ignore-gpu-blocklist`; `--use-angle=metal` on macOS), plus a named `software` profile.
  - **API adapters** `bench/src/api/{v012,v1,v2}.ts`, porting `evidence/gap-perf-gate/ext/src/adapter-v012.ts`. The adapter is chosen from the module's shape before constructing: `'ChartCore' in mod && !('createChart' in mod)` → v012; otherwise construct and test `typeof handle.setOptions === 'function'` → v2, else v1. `--api` overrides. Every bench source imports only from `'snaplot'`, and the `snaplot/core` alias leaves `bench/vite.config.ts`. M8 finalises v2.
  - **Scenarios,** in `bench/src/scenarios/<area>.ts` (legacy, api, streaming, interaction, scale), ported from `evidence/gap-perf-gate/ext/src`:
    - the existing set;
    - `reingest-{rows,cols}-200k-{title,callback}`, `react-rerender-200k-{stable,inline}`;
    - `stream20hz-50k-{none,plugin,legendtable}`, `group-append-3x20k-align`;
    - `hover-sweep-50k`, `hover-sync-{line,scatter,unsorted}-200k`, `hover-sync-group-20`;
    - `ingest-cols-1m`, `firstpaint-line-1m`, `time-pan-200k`, `stream-50hz-idle`;
    - `mount-24-charts` (time and canvas bytes), `offscreen-stream-24`, `resize-storm-24`, `theme-churn-24`.
  - **`bench/gate.json`** holds the per-milestone required sets, the 1.5× and 1.2× ratios and the §3.4 absolute budgets. `compare.mjs` fails on unlisted current-only scenarios unless `--allow-new`.
  - **`bench/README.md`** documents the method and the reference machine, with a History section that takes `notes/PERF.md`'s root causes. `baselines/` becomes history only.
- **Commits:**
  1. `perf(bench): measure main-thread busy time on GPU raster`
  2. `perf(bench): same-run interleaved A/B with API adapters back to v0.12.0`
  3. `perf(bench): API-layer, streaming, group, hover, theme and scale scenarios`
  4. `docs(bench): method, reference machine and history`
- **Exit:**
  - The self-test `npm run bench:ab -- --base ovh-m1-done --head ovh-m1-done --profile desktop` keeps every required ratio within 1.0 ± 0.07. If it does not, `--runs 5` becomes the default and the self-test passes with it.
  - The gross heap per append is non-zero for `stream20hz-50k-legendtable`.
  - `npm run bench:ab -- --base v0.12.0 --head ovh-m1-done --filter legacy` completes, its table matches `gap-perf-gate.md`'s verdict (no scenario over 1.5×), and it is pasted into the handoff.
  - The full suite runs once on both profiles, and its duration is recorded in `bench/README.md`.
- **Closes:** gap-perf-gate-02, 07, 08, backlog-23, gap-competitive-05:harness.
- **Depends:** M1. **Parallel:** M2, M3a, M3b, M5.

### M5. Packaging, golden API, CI and release tooling (W1, 2 days)

- **Goal.** A correct, gated package from here on.
- **Owns:**
  - `packages/snaplot/{package.json (exports, files, scripts, peers, sideEffects, engines), vite.config.ts, vite.ssr.config.ts, scripts/check-consumers.mjs, api/**}`;
  - `packages/snaplot/vitest.config.ts` (the `snaplot` alias only);
  - `scripts/{size.mjs, size-budgets.json, check-architecture.mjs, check-palettes.mjs, release.sh}`, and the deletion of `scripts/bundle-report.mjs`;
  - `.github/workflows/**` (`ci.yml` replaces `quality.yml`; `deploy.yml`; `publish.yml`; `update-snapshots.yml`), `.nvmrc`, and the gates section of `CONTRIBUTING.md`.
- **Scope.** All of §11.2 and §11.3 except the docs job:
  - the exports map with `types` first, `default`, `./package.json` and the Solid conditions. Keep `./core` and `./legend-table.css` until M8 removes them;
  - rolled-up declarations and the golden `api/*.d.ts`, with `check:api` and `api:update`;
  - `'snaplot'` added to the rollup externals of the React and Solid builds, with the `check-consumers` assertion "one core copy in SSR" as `test.fails('[frameworks-19]')` (M13 switches the imports); the `solid` JSX condition; the `'use client'` banner;
  - target `es2022`; sourcemaps without `sourcesContent`; no `declarationMap`; a `prepack` copy of README and LICENSE;
  - publint, attw and the extended `check-consumers`. Port `evidence/repo/ssr/*` and `evidence/repo/vtconsumer`. The jsdom render is `test.fails('[repo-04]')` until M11;
  - size budgets at measured + 2%; `size.mjs` replaces `bundle-report.mjs` and the old `size` script;
  - `check-architecture.mjs` (P2 and P3 greps in warn mode; P3 to error in M13, everything to error in M14);
  - `check-palettes.mjs`, ported from `evidence/visuals/palette.mjs` and `palette-run.mjs` with the §5.3 thresholds (dark enforced, light printed). It fails on today's dark palette, so it runs advisory until M11;
  - the `test:tz` script: the time test files under `TZ=America/Los_Angeles`, `TZ=Asia/Kathmandu` and `TZ=UTC`;
  - `ci.yml`; `deploy.yml` (on `v*` tags and `workflow_dispatch`, `needs: ci`, building the library then the site, with the prerelease guard of D1; manual dispatch only until M6a enables the tag trigger); `publish.yml` (`-beta.N` → `npm publish --tag next`, `prerelease: true`, re-running G5–G7); each with a `permissions:` block;
  - `release.sh` accepting `^\d+\.\d+\.\d+(-beta\.\d+)?$` and a `--dry-run`;
  - an `update-snapshots` `workflow_dispatch` job for the maintainer.
- **Commits:**
  1. `build: roll up declarations per entry and complete the exports map`
  2. `test(build): golden public declarations and consumer checks`
  3. `build(size): budget minified per-import bundles`
  4. `ci: one gated workflow with package, size, api, browser and visual jobs`
  5. `build(release): prerelease channel support`
- **Exit:**
  - `npm run check:package` passes: attw (`esm-only` profile) reports no problems; `tsc` consumers under node16, nodenext and bundler resolve the types without `skipLibCheck`; the `require('snaplot')` smoke passes on Node 22.12+; the two expected failures are listed.
  - `npm run check:size` and `npm run check:api` pass.
  - `scripts/release.sh --dry-run 1.0.0-beta.0` prints the `next` plan.
  - The workflows parse (`node -e` with the `yaml` package if present, else `actionlint` if available).
- **Closes:** frameworks-10, repo-01, repo-05, repo-07, repo-08, repo-09, repo-15:maps, repo-16, repo-18, backlog-22, research-06, gap-environments-08, gap-competitive-06:budget.
- **Depends:** M1. **Parallel:** M2, M3a, M4.

### M6a. Docs site scaffold (W1, 1.5 days)

- **Goal.** The empty house with its pipeline and its locks.
- **Owns:**
  - `site/**` (new), except `site/src/demos/**`, `site/public/data/**` and `site/src/examples/data/**`;
  - the `site` entry in the root `workspaces`, and the tag trigger line in `deploy.yml`;
  - `site/package.json`: Astro, Starlight, `@astrojs/react`, `@astrojs/solid-js`, `starlight-typedoc`, and every demo font up front (`@fontsource/{libre-caslon-text,libre-franklin,roboto,source-serif-4,inter}`), with exact pins at least 14 days old.
- **Scope:**
  1. **Spike gate (at most 0.5 day)** with the four criteria and fallbacks in §8.2.
  2. **Scaffold:**
     - Starlight with the §9 tokens and fonts, the `ThemeProvider`/`ThemeSelect` override, `base: '/snaplot/'`, path routes and the old-hash redirect script;
     - `Example.astro` with tabs, options-file mount templates and whole-file Copy;
     - the 21 MDX pages as stubs with their IA headings;
     - homepage and examples-hub skeletons with custom layouts, and a 404 page;
     - `site/tsconfig.examples.json` and `site/vitest.config.ts` (covering `src/**` and `tests/**`);
     - `site/tests/{smoke.spec.ts, lint-styles.test.ts, lint-copy.test.ts, data-size.test.ts}`, including the `[uisite-*]` checks and the no-build page of §8.3.

     It ships one example that uses only `createChart(el, { data, x, series: [{ y }] })`, in three tabs, which is stable across M7 and M8.
  3. TypeDoc `notDocumented` as a warning (M7 makes it an error).
- **Commits:**
  1. `feat(site): astro starlight scaffold with React and Solid islands`
  2. `test(site): smoke, accessibility, style and copy checks`
- **Exit:**
  - `npm run build:site` is green, and the smoke spec passes on every stub route, including the six `[uisite-*]` checks and the no-build page.
  - Pagefind finds `createChart`.
  - The spike outcome is in `docs/handoff/m6a.md`.
- **Closes:** uisite-01, 02, 04, 05, 06, 07, 12, 14, 15, 16, 17, 19, 20, 21; docs-04, docs-11, docs-16; research-09.
- **Depends:** M5 merged. **Parallel:** M3b, M6b.

### M6b. Demo datasets, generators and answers (W1–W2, 3 days)

- **Goal.** Every dataset with its licence, a reproducible generator, and an answer that an independent oracle confirms.
- **Owns:** `scripts/demo-data/**`, `site/public/data/**`, `site/src/examples/data/**`, and `site/src/demos/<slug>/{answer.ts, answer.test.ts, simulator.ts, simulator.test.ts}` with each `SOURCE.md`.
- **Scope:**
  1. **Generators** `scripts/demo-data/{ridgecrest-aftershocks, central-park-summer, train-digits, battery-payback, find-the-clipping}.mjs`, with retries and backoff, SHA-256 of raw downloads, `--offline`, and `SOURCE.md` (§10.1 #4). The S1 generator decodes candidates in Playwright (§10.2).
  2. **Answers.** Each demo's `answer.ts` and `answer.test.ts`, including the oracle named in §10.2. The S2 simulator is `site/src/demos/deploy-482/simulator.ts`, with unit tests.
  3. **Docs data slices** in `site/src/examples/data/*.ts` (≤ 20 KB each).
  4. **Fallbacks.** If a URL fails 3 times, apply that demo's fallback (§10.2) and record a NOTE in `SOURCE.md` and in the handoff with the exact regeneration command.

  Until M6a merges, run its tests with `npx vitest run --dir site/src/demos` (vitest needs no config for this).
- **Commits:**
  1. `feat(demos): reproducible dataset generators and bundled extracts`
  2. `feat(demos): computed answers with independent oracles`
  3. `feat(demos): seeded deploy simulator`
- **Exit:**
  - Running every generator twice with `--offline` gives identical outputs (hash check).
  - Every `SOURCE.md` has all its fields; the demo tests pass, oracles included; data is within its caps.
- **Closes:** demos-05.
- **Depends:** M1. Merges after M6a. **Parallel:** M3b, M6a, M7.

### M7. One type system: public types, normalize, ingest (W2, serial, 5 days)

- **Goal.** The public contract of §4, hand-documented, with every option leaf landed. One validation layer. Zero-copy ingest with retained sources, stable row sorting and the sorted-X flag.
- **Depends:** M2, M3a, M3b, M4 and M5 merged. M6a and M6b may still be running.
- **Owns:**
  - `src/public/**` (new); `src/api/**` (deleted at the end);
  - `src/types.ts` → `src/engine/spec.ts`;
  - every engine option-read site (renames only); `src/index.ts`;
  - `test/ledger/**` and `test/visual` fixtures (option renames only), `bench/src/api/v2.ts`;
  - `packages/snaplot/api/*.d.ts` (golden update);
  - `src/react/**` and `src/solid/**`, `site/src/examples/**` and the site islands, for compile fixes only, plus the TypeDoc `notDocumented` switch to error.
- **Tests first:**
  - `public/types.typecheck.ts`:
    - typed rows with `.map()` series;
    - a separately declared `satisfies ChartOptions<Row>`;
    - a generic plugin assignable to `ChartOptions<Row>` (dataapi-08, gap-annotations-extensibility-12);
    - `format: v => v.toFixed(1)` compiles on value axes and is rejected on category axes;
    - `{ suffix: '%' }`; `ticks` accepts numbers and Dates;
    - per-series `data` typing;
    - `on*Change` payload types, including `onHighlightChange`;
    - `[arch-12] onZoom is not an option`.
  - `public/normalize.test.ts` and `public/warnings.test.ts`: the §5.9 list, page-level dedupe on `(code, message)`, the ≥ 10,000-row thresholds, ISO inference, the epoch warning, unknown keys, intake copies, public vocabulary (P16).
  - `public/ingest.test.ts`:
    - zero-copy columns, with one X pass counted by a validation counter;
    - newest-first rows render in ascending X, and rowIds still map;
    - sorted scatter stored in order, with the sorted-X flag set;
    - unsorted typed columns throw; an append that starts before the last retained X throws;
    - mixed rows and columns throw;
    - duplicate rowIds throw before any mutation;
    - categories are rebuilt on replacement, and stay bounded after 10 × `maxPoints` string-X appends.
  - `public/histogram.test.ts`.
- **Scope:**
  - `public/types.ts` with JSDoc and `@defaultValue` on every field, and `@example` on the main entries. Then switch TypeDoc `notDocumented` to an error.
  - `engine/spec.ts` with public names. Rename the engine read sites:

    | Engine name | Public name |
    |---|---|
    | `label` | `title` |
    | `tickFormat` | `format` |
    | `roundBounds` | `nice` |
    | `dataIndex`, `xDataIndex`, … | source columns |
    | `maxLen` | `maxPoints` |
    | `follow` | `followWindow` |
    | `xAxisKey` | `xAxis` |
    | `stroke` | `color` |
    | `lineDash` | `dash` |

  - `normalize.ts` with intake copies and `warnOnce` (always on). Delete `prepare.ts`, `validateConfig.ts` and `shouldValidateConfig`.
  - **Every option leaf of §4.4** lands in the public types and in `normalize`, as final Spec fields. Options whose behaviour lands later are accepted and normalised, and either honoured by today's engine or a no-op with an `it.fails` owned by that milestone: the `highlight` and `legend` behaviour (M8), `locale`, `timeZone` and Date `ticks` (M10), the `height` rule (M11), the `interaction` object's new gestures (M12a).
  - **Cut options** leave the public types and `normalize` only. Their engine code stays behind internal defaults and is deleted by the milestone that owns it: `padding` by M8 (with `setPlotInsets`); the zoom, pan, touch and cursor knobs by M12a; `heatmap*`, `fillGradient` and `pointShape` by M11.
  - `ingest.ts` (D23) and `histogram.ts` (bins capped at 1,000 automatic and 10,000 explicit; edge membership; nice thresholds; overflow guard; `thresholds` shared across datasets).
  - A temporary `public/chart.ts` keeps the facade working while still re-ingesting on change; the update path is M8.
- **Commits:**
  1. `test(api): contract, normalize and ingest tests for the 1.0 surface`
  2. `feat(api)!: self-contained documented public types`
  3. `refactor(engine)!: use public option names in the engine spec`
  4. `refactor(api)!: one normalize and validation layer with always-on warnings`
  5. `perf(data)!: zero-copy ingest with retained sources, stable row sorting and sorted-X detection`
  6. `refactor(api)!: remove cut options from the public surface`
  7. `fix(data): harden histogram binning`
- **Exit:**
  - `rg -n "prepareChart|validateChartConfig|shouldValidateConfig|Omit<Engine" packages/snaplot/src` is empty.
  - Option leaves are ≤ 110 (metrics).
  - TypeDoc `notDocumented` is an error and reports 0.
  - `npm run build:site` is green.
  - `bench:ab --set M7`: `ingest-cols-1m` is ≤ 0.5× base and ≤ 40/135 ms; no required scenario is over 1.5×.
  - `check-visual-diffs` passes; any changed fixture has a row in V17–V29.
- **Closes:** arch-05, arch-06:ingest, arch-11, arch-12, arch-15, dataapi-02, 03, 05, 06, 07, 08, 12, 13, 19, 20, 22, dxtrial-05, 08, 14, 17, docs-02, docs-03:types, repo-06, repo-14, research-12, gap-perf-gate-01:storage, gap-perf-gate-04, gap-scale-longevity-03:ingest, gap-annotations-extensibility-12, 13, gap-competitive-01:ingest.

### M8. One update path, the final public surface, interim legends (W3, serial, 5.5 days)

- **Goal.** Presentation changes never touch data; state, callbacks and events are one model; the public surface is final; and the branch never goes without a legend.
- **Depends:** M7.
- **Owns:**
  - `src/public/**`, `src/index.ts`, `src/core.ts` (deleted), `src/engine/plugins.ts`;
  - the engine's `padding`/`coordinatePadding` code (deleted) and `setPlotInsets`;
  - `src/data/downsampling/lttb.ts` (deleted);
  - `src/react/**` and `src/solid/**`, but only to compile and delete; M13 finalises them;
  - `bench/src/api/v2.ts`, `packages/snaplot/api/*.d.ts`, `packages/snaplot/package.json` (removing `./core` and `./legend-table.css`);
  - `test/visual/fixtures/legend.ts` (new fixtures);
  - `docs/decisions/removed-since-0.12.txt`;
  - site examples and islands, for compile fixes only.
- **Tests first:**
  - `public/update-classes.test.ts`, including `[gap-annotations-extensibility-06]`, `[gap-environments-03] the handle has no resize member` and "two empty data arrays → 0 ingests";
  - `public/state-options.test.ts` (D3 in full, including "`update({ viewport: {} })` resets a chart created with `{}`", "an un-echoed literal never snaps back", `highlight`, and `[dataapi-14]`);
  - `public/events.test.ts` (emit rules, isolation, queueing, revision, snapshot iteration);
  - `public/group.test.ts` (the final model; leaving with `update({ group: undefined })`; `[frameworks-21]` colours by id; M1's ledger tests kept);
  - `public/streaming.test.ts` (appended rows survive `update({ axes })`; `[dxtrial-19]`; the streamed-source replacement warning);
  - `public/plugins.test.ts` (reconcile by id, isolation, draw order after the built-in annotations, `scale().horizontal`) and `public/types.typecheck.ts` › `[gap-annotations-extensibility-08] ChartPlugin has no beforeDraw`.

  Also invert the repros `arch/{ring-materialize, option-update-cost, react-inline-callback, group-append}`, `dataapi/{group, live, stream, update}` and the frameworks group and viewport repros.
- **Scope:**
  - **The diff classifier** (D16). It sorts each option change into a class, and each class decides the work:
    - **data:** a `data` reference (two empty arrays count as equal), field strings, `x` or `rowId` → re-ingest that source only;
    - **accessor:** a new function identity → re-extract that series, with the churn warning;
    - **layout:** axes, legend, `height` → relayout;
    - **paint:** style, theme, `format` and render functions → repaint the affected layer;
    - **callbacks:** latest-ref, no work;
    - **plugins:** reconcile by `id`;
    - **state:** D3.

    `update(patch)` treats every key present as changed; `setOptions(full)` compares against the last applied value.
  - `setOptions` (public) and `update`, with their different state semantics; `resetViewport()`.
  - **One dispatcher,** queued and isolated, iterating a snapshot, with the cold and hot channels and `revision`. `on*` options are wired 1:1 to events.
  - **The plugin host** with the D21 contract and `chart.scale()`. There is no `onSetData` bridging, so 0 materialisations.
  - **Groups.** X-only (final). `setPlotInsets` is applied only when the gutter changes, and replaces `padding`. Colours are assigned by series id.
  - **The final surface.** Every handle member of §4.4 (`getCursor({ fallback })`, `scale`, `redraw` re-resolving the theme), every event and every export, with removed members deleted.
  - **Debug symbol** replaces `getStats` and `debug.stats`, which are deleted.
  - **Trim the exports** to the §4.4 list. Delete `core.ts`, the theme exports, the binary-search exports, `lttb`, the column helpers and `styles/legendTable.css` as an export.
  - **Interim legends.** `legend: 'auto'` and `createLegendTable` ship with their final public types, as thin internal wrappers over the existing `api/legend.ts` and legend-table DOM code. They subscribe to `revision` and to the cursor, so values refresh after data commits. The existing `legendTable.css` text is injected once per document through a `?inline` import. M12b replaces the internals.
  - **React and Solid** compile on `setOptions`. Delete:
    - the controlled and `default*` props;
    - `SeriesLegend` and the column helpers (the React and Solid `LegendTable` become minimal wrappers over `createLegendTable` until M13);
    - `useChartGroup`, `useHighlight`, `useCursorSnapshot` and `onReady`;
    - the Solid `createChart` and `createChartGroup` wrappers, `createHighlight` and `createCursorSnapshot`.
  - **`removed-since-0.12.txt`**, generated once from `git show v0.12.0:` declarations against the new golden.
  - **Bench v2 adapter.**
- **Commits:**
  1. `test(api): update-path, state, event, group and plugin contract tests`
  2. `perf(api): classify option changes, copy on intake and read callbacks through latest refs`
  3. `feat(api)!: declarative viewport, selection, hiddenSeries and highlight state options`
  4. `fix(api): queue and isolate listeners, add state revision and a cursor channel`
  5. `fix(group)!: final horizontal-only sync, plot insets and colours by series id`
  6. `feat(plugins)!: minimal plugin contract reconciled by id`
  7. `feat(legend)!: automatic legend and createLegendTable on the existing views`
  8. `refactor(api)!: final handle and exports; a debug symbol replaces getStats`
  9. `refactor(react,solid)!: drop controlled props, legend components and wrappers`
  10. `docs(decisions): list the names removed since 0.12`
- **Exit:**
  - `materializeCount === 0` over 100 appends with a plugin.
  - Metrics: runtime exports 4/≤6/≤6; handle members 14; events 7.
  - `bench:ab --set M8`:
    - `reingest-rows-200k-title` ≤ 2 ms desktop / ≤ 8 ms mobile;
    - `group-append-3x20k-align` ≤ 0.5 ms mobile;
    - `react-rerender-200k-inline` ≤ 3 ms per render;
    - `stream20hz-50k-plugin` ≤ 50 KB per append;
    - no required scenario over 1.5×.
  - A two-series fixture shows a styled legend: its buttons have non-zero size and the plot sits below them (geometry spec).
  - `npm run build:site` is green; `check-visual-diffs` passes (rows in V17–V29).
  - The golden `api/*.d.ts` is updated and reviewed. Tag `ovh-api-frozen` alongside `ovh-m8-done`.
- **Closes:**
  - arch-01, arch-03, arch-04, arch-07, arch-08, arch-10, arch-13, arch-17;
  - backlog-02, backlog-27;
  - dataapi-01, dataapi-02, dataapi-04, dataapi-09, dataapi-10, dataapi-14, dataapi-15, dataapi-16, dataapi-21;
  - dxtrial-01, dxtrial-04, dxtrial-11:callbacks, dxtrial-11:data, dxtrial-19;
  - frameworks-01, frameworks-02, frameworks-03, frameworks-04, frameworks-05, frameworks-06, frameworks-07, frameworks-11, frameworks-12, frameworks-13, frameworks-21;
  - interact-01;
  - gap-annotations-extensibility-05, 06, 07, 08, 09, 11;
  - gap-environments-03; gap-overhaul-delta-03;
  - gap-perf-gate-05, gap-perf-gate-06;
  - research-01, research-08, research-14; repo-19.

### M9a. Engine split: file moves only (W4, serial, 2 days)

- **Goal.** The §3.1 `engine/` layout, moved verbatim. No behaviour change.
- **Depends:** M8.
- **Owns:**
  - `src/core/**` → `src/engine/**`;
  - `src/{renderers,interaction,scales,config,data,plugins}/**` (moved);
  - `src/dom/tooltip.ts` (moved from `interaction/TooltipManager.ts`);
  - `scripts/check-architecture.mjs` (the file-size rule only).
- **Scope.** Extract and delegate, one module per commit, moving code verbatim with no logic edits, in this order:
  1. ranging
  2. viewport
  3. selection
  4. cursor and snapshot (both snapshot paths moved as they are)
  5. highlight
  6. hit
  7. axes: ticks, render, and labels with the DOM pool
  8. layout
  9. `Engine.ts` as the composition root

  Then move the tooltip to `dom/`.
- **Tests.** Existing tests move with their code. Flip `[perf:visible-range] render visits only the visible index range ±1` if it now passes by construction, and record it.
- **Commits:** one `refactor(engine): extract <module>` per module (about 10). Each passes `npm test`.
- **Exit:**
  - `npm run test:visual -- --against ovh-m8-done` shows **zero** changed fixtures.
  - The golden `.d.ts` is byte-identical.
  - The ledger count is unchanged, except the culling guard if it flipped.
  - No file is over 1,200 lines (M9b brings this to 900).
  - `bench:ab --set M9a` is within 1.2×.
- **Closes:** arch-14 (with M9b).

### M9b. Engine refactors and the W5 contracts (W4, serial, 2 days)

- **Goal.** Remove the remaining duplicated paths and give the W5 tracks disjoint files with fixed contracts.
- **Depends:** M9a.
- **Owns:** `src/engine/**` and `src/dom/**` (this milestone only), `test/visual/probe.spec.ts` and its snapshot, `docs/architecture.md`, and `scripts/check-architecture.mjs` (file-size rule to error mode, cap 900).
- **Scope:**
  1. **Probe snapshot first.** At `ovh-m9a-done`, record a JSON snapshot of hit results, cursor snapshots and `point:click` payloads on the 12×8 probe grid for every fixture (`test/visual/__probe__/m9a.json`, committed).
  2. Merge `fillSnapshot` and `fillIndependentSnapshot` into one path.
  3. **The marks registry:** one `Mark` interface and `marks/index.ts`, with `marks/<type>/draw.ts` and `marks/<type>/hit.ts` absorbing the type branches of `renderAllSeries`, `autoRange*`, `updateTooltipPoints`, `findBar`/`HistogramTooltipPoints`, `emitPointClick` and `drawPointIndicators`.
  4. `wireEvents` as an action table.
  5. **The contracts commit** (§3.2), each implemented over today's behaviour so pixels do not change:
     - `engine/format.ts`: `formatTick(axis, v)`, `formatReadout(series, v)`, `formatX(v)`;
     - `engine/axes/labels.ts`: the `LabelBox[]` layout type;
     - `engine/render/surface.ts`: `reserveChrome('top' | 'bottom', px)`, read by `layout.ts`;
     - `engine/render/crisp.ts`, with every 1 px stroke (grid, frame, ticks, crosshair, brush) routed through it;
     - `engine/theme/color.ts`: `parseColor(css) → RGBA` over today's parser;
     - `dom/styles.ts`: `adoptStyles(root, id, css)` with one `<style>` element per root; the interim legend CSS and the tooltip styles move onto it.
- **Commits:**
  1. `test(engine): record hit, cursor and click probes before the refactors`
  2. `refactor(engine): one cursor snapshot path`
  3. `refactor(engine): a mark registry replaces per-type branches`
  4. `refactor(engine): pointer and key handling as an action table`
  5. `refactor(engine): fixed contracts for the subsystem tracks`
- **Exit:**
  - `npm run test:visual -- --against ovh-m9a-done` shows **zero** changed fixtures.
  - The probe JSON is identical.
  - The golden `.d.ts` is byte-identical; the ledger count is unchanged.
  - No file is over 900 lines, and `Engine.ts` is ≤ 750.
  - `rg "series.type ===" src/engine | wc -l` is ≤ 6, all in `marks/index.ts`.
  - `bench:ab --set M9b` is within 1.2×.
  - `docs/architecture.md` matches the tree.
- **Closes:** arch-14, arch-19.

### M10. Axes, ticks, formatting, domains, time, annotations (W5, 4.5 days)

- **Owns:**
  - `engine/{scales/**, axes/**, format.ts, ranging.ts, layout.ts, annotations.ts}`;
  - `test/visual/fixtures/axes.ts`, `test/browser/m10-*.spec.ts`, `test/ledger/m10-*.test.ts`;
  - `Engine.ts` wiring hunks of at most 20 lines.

  It must not touch marks, theme, render, interaction or `dom/`.
- **Tests first:**
  - `engine/format.test.ts`, `engine/axes/ticks.test.ts` (including `[render-19]` and explicit `ticks`), `engine/ranging.test.ts` (including log bars), `engine/annotations.test.ts` and `engine/layout.test.ts` (including `[backlog-10]` and the third-axis throw) (RC4–RC6);
  - flip the M3b ledger and geometry `test.fail`s for these ids;
  - invert the repros `visuals/{ticks,thin}`, `render/scales`, `interact/tooltip-precision` and `gap-annotations-extensibility/*`;
  - `npm run test:tz`.
- **Scope:** §5.1 and §5.2 in full:
  - `formatReadout` and `formatTick` with the precedence rules; axis `format` drives readouts; `series.format` is scoped to its series; `prefix`/`suffix`; one locale;
  - calendar time stepping in `local` and `UTC` (`timeZone`);
  - the tick pipeline over measured label boxes, with explicit `ticks`;
  - DOM label measurement (tabular mapping, the probe-span scale, fonts `loadingdone`), an `aria-hidden` label layer, and forced-colours handling for labels;
  - category X gridlines at slot boundaries;
  - measured gutters that include reserved chrome, and the tiny-container policy;
  - y2 on the right, and the third-axis rule;
  - the empty state;
  - annotations on the public plugin context: slot edges, `±Infinity`, log clamping, label edge-flip, a collision pass, a 3 px surface halo, the theme font, pixel snapping through `crisp()`, and the newest streaming marker keeping its label.
- **Commits:**
  1. `test(axes): format, tick, domain, layout and annotation contracts`
  2. `feat(format)!: one Intl formatter for ticks and readouts`
  3. `fix(axes)!: measured label-box tick selection and category thinning`
  4. `fix(axes): DOM labels measured as rendered and hidden from assistive tech`
  5. `fix(axes)!: one domain policy without padding on nice bounds`
  6. `fix(time): calendar stepping in local and UTC time`
  7. `fix(annotations): slot edges, open regions and readable labels`

  Each pixel-changing one carries `visual:` and a row in V30–V49 (V9 revert, V13 replacement, gutters, category thinning, category gridlines).
- **Exit:**
  - The `axes.*` geometry fixtures are green, including the 24 px minimum-font fixture and the no-repeated-labels check.
  - `m10-tooltip-format.spec.ts` has no `test.fail`.
  - `bench:ab --set M10`: `line-pan-200k` and `time-pan-200k` busy ≤ 1.2× base (p95 ≤ 1.5×).
  - The formatter-construction-count test passes, and `test:tz` is green.
- **Closes:**
  - backlog-01, 03, 06:utc, 07, 08, 09, 10, 11, 13, 18;
  - dataapi-09, dataapi-11;
  - dxtrial-02, dxtrial-03, 10, 21;
  - interact-02:format;
  - render-01, 02, 06, 07, 08, 10, 11, 12, 13, 14, 19, 20, 21, 22, 25, 26, 27;
  - visuals-01, visuals-02:domain, 07, 08, 09, 11, 16, 21:def-01, 21:def-03, 22, 23, 24;
  - demos-07:utc, demos-16;
  - gap-annotations-extensibility-01, 02, 04;
  - gap-environments-05:labels, 06, 07, 09;
  - gap-overhaul-delta-04; gap-perf-gate-09; gap-scale-longevity-03:ticks.
- **Depends:** M9b. **Parallel:** M11, M12a, M12b.

### M11. Marks, colour, theme, surface, sizing, visibility (W5, 5 days)

- **Owns:**
  - `engine/{marks/index.ts, marks/*/draw.ts, theme/**, render/surface.ts, render/scheduler.ts, render/crisp.ts}`;
  - `engine/data/m4.ts`;
  - `test/visual/fixtures/{marks,theme,layout}.ts`, `test/browser/m11-*.spec.ts`, `test/ledger/m11-*.test.ts`;
  - `Engine.ts` wiring hunks of at most 20 lines.
- **Tests first:**
  - `engine/theme/{color,resolve}.test.ts` (including `[gap-annotations-extensibility-03]`), `engine/marks/*.test.ts`, `engine/data/m4.test.ts` (`[dataapi-17]`);
  - `engine/render/{surface,scheduler,crisp}.test.ts`, including `[gap-scale-longevity-05]`, `[gap-overhaul-delta-07]`, `[gap-scale-longevity-09]`, `[gap-scale-longevity-07]`, `[render-16]`, the D26 height cases and the theme-churn guard;
  - flip the ledger entries;
  - invert the repros `arch/color-parsers`, `render/theme`, `demos/histogram-fill`, `gap-scale-longevity/*` and `gap-environments/*`.
- **Scope:** §5.3, §5.4 and §5.7:
  - **Colour and theme:**
    - one colour module behind `parseColor` (every user colour resolved once to RGBA, `withAlpha` included);
    - tokens, the surface-first mode with the text-colour fallback, and CSS variables (D4, D5, D9);
    - one coalesced theme observer per document (D4);
    - delete the 12 themes;
    - the dark palette after `check-palettes` passes; switch `check:palettes` to blocking.
  - **Surface and lifecycle:**
    - `alpha: true` canvases, no radius, `isolation: isolate`;
    - the synchronous RO paint made structural; one render at mount;
    - the DPR fix and `crisp()` at fractional and high DPRs;
    - the jsdom no-op, and the D26 height rule (absolute inner wrapper, explicit height, 300 px fallback with its warning);
    - `reserveChrome`;
    - visibility gating, and one theme observer, one `matchMedia` listener and one DPR watcher per document;
    - group cursor sync: members not intersecting the viewport skip overlay paint until visible;
    - a lazy overlay and release on destroy;
    - `beforeprint` paint and the print CSS.
  - **Marks and performance:**
    - every mark semantic in §5.4, with today's translucent bars;
    - M4 at rest and its output budget on gappy data; scatter sampling within view; the density cache;
    - delete the `heatmap*`, `fillGradient` and `pointShape` engine code.
  - **Stretch:** the shared rAF loop, gated per D37. Record the outcome, and update `trace-ids.json` for `gap-scale-longevity-06:shared-loop`.
- **Commits:**
  1. `fix(theme)!: one colour parser and surface-first theme resolution`
  2. `feat(theme)!: tokens, auto mode and a colour-blind-safe dark palette`
  3. `fix(marks): uniform fill, opacity, interpolation and isolated points`
  4. `fix(marks): histograms honour colour; bar hover and scatter continuity`
  5. `fix(render)!: transparent alpha canvases, synchronous resize and DPR handling`
  6. `feat(render): an explicit height always wins, with a 300px fallback and one warning`
  7. `perf(render): skip painting charts that are not visible`
  8. `perf(render): allocate the overlay lazily and release canvases on destroy`
  9. `perf(marks): decimate lines at rest and sample scatter within view`
  10. `refactor(marks)!: remove the heatmap, gradient-fill and point-shape code`

  Pixel changes carry rows in V50–V69: P0-2, P0-3, P0-4, the inherited font, the dark grid, scatter continuity, the density ramp, the dark palette.
- **Exit:**
  - The `theme/*` fixtures are correct under both OS emulations: no light palette on a dark surface, no seam on white, cream or dark cards.
  - `check:palettes` passes, and the jsdom consumer test passes.
  - `bench:ab --set M11`:
    - `firstpaint-line-1m` ≤ 45 ms desktop / ≤ 150 ms mobile GPU, recorded as met or missed in the handoff (D34);
    - `stream-50hz-idle` software p50 ≤ 33 ms;
    - `offscreen-stream-24` busy ≤ 15% of the visible variant;
    - `mount-24-charts` offscreen paints = 0;
    - per-chart idle canvas memory at DPR 3 ≤ 5 MB (was 7.4);
    - scatter fidelity ≥ 0.8;
    - `hover-sync-group-20` and `theme-churn-24` within their guards.
  - The lifecycle spec shows 0 frames more than 5% black in the resize screencast.
- **Closes:**
  - arch-02, arch-16;
  - render-03, 04, 05, 09, 15, 16, 17, 18, 23, 24;
  - backlog-04, 05, 12, 17, 19, 28:at-rest;
  - dataapi-17; demos-06, demos-10; docs-05;
  - visuals-02:fill, 03, 04, 06, 10, 13:dark, 14, 15, 17, 18, 19, 21:def-04, 25;
  - gap-overhaul-delta-01, gap-overhaul-delta-07;
  - dxtrial-09, 12, 15;
  - research-02, research-03, research-04;
  - gap-environments-02:print-basics, gap-environments-10;
  - gap-scale-longevity-01, 02, 04, 05, 06:visibility, 07, 08, 09;
  - gap-competitive-01:paint, 02, 03;
  - gap-perf-gate-01:sampling, gap-perf-gate-10;
  - repo-04; gap-annotations-extensibility-03; frameworks-15; interact-22:colours.
- **Depends:** M9b. **Parallel:** M10, M12a, M12b.

### M12a. Hit test, hover, tooltip, viewport, selection, touch, keyboard (W5, 5 days)

- **Owns:**
  - `engine/{interaction/**, cursor.ts, hit.ts, viewport.ts, selection.ts, highlight.ts, render/overlay.ts, marks/*/hit.ts}`;
  - `dom/tooltip.ts`;
  - `test/browser/m12a-*.spec.ts`, `test/ledger/m12a-*.test.ts`, `test/visual/fixtures/overlay.ts`;
  - `Engine.ts` wiring hunks of at most 20 lines.
- **Tests first:**
  - `engine/{hit,cursor,viewport,selection}.test.ts` (including `[gap-perf-gate-01:hover]`, rows in series order, `[interact-10]`, and "a pointer-down sets following false"), `engine/interaction/gestures.test.ts`, `dom/tooltip.test.ts` (`[interact-11]`);
  - flip the M3b `test.fail` browser cases;
  - invert the `interact/gesture` repros.
- **Scope:** §5.5, D19 and D20:
  - **Hit and hover:**
    - one hit pipeline: `marks/*/hit.ts` contribute candidates and their readouts through `formatReadout`; index mode is gated on the X extent; nearest for scatter; a spatial grid for unsorted data; binary search for sorted data; coordinates are transform-aware;
    - one hover model, recomputed after any pointer, viewport, data or visibility change.
  - **Viewport and selection:**
    - one constraint function for box, wheel, pinch, keyboard, sync and follow, including the minimum span (D29);
    - the `drag: 'select'` brush (Esc and click-outside clear; clamped edges);
    - the touch rules, including one-finger pan under `zoom: 'xy'`; a slow click fires; modified keys pass through; `deltaMode`; reduced motion;
    - delete the cut zoom, pan, touch and cursor knob code.
  - **Accessibility:** keyboard navigation, the live region and the focus ring (CSS through `adoptStyles`); the D20 host-attribute rule.
  - **Tooltip:** portalled and fixed (§5.5).
- **Commits:**
  1. `fix(interaction)!: one hit-test pipeline and index tooltips anywhere along X`
  2. `fix(interaction): one hover model recomputed on every change`
  3. `fix(interaction): one viewport constraint for every gesture`
  4. `feat(interaction)!: select-without-zoom brush and page-friendly touch defaults`
  5. `fix(tooltip): portal to dialogs and fullscreen, transform-aware positioning`
  6. `feat(a11y): named figure, keyboard cursor, live region and focus ring`
  7. `refactor(interaction)!: remove the cut zoom, pan, touch and cursor knobs`
- **Exit:**
  - Every `m12a-*` spec passes, with no `test.fail` left.
  - The 12×8 hover sweep shows a tooltip at 96 of 96 points.
  - `bench:ab --set M12a`: `hover-sync-unsorted-200k` is ≤ 0.2 ms on mobile.
  - The overlay fixtures' geometry is green; `check-visual-diffs` passes (rows in V70–V79).
- **Closes:**
  - interact-02:hit, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 22:motion, 23;
  - visuals-05, 12;
  - dxtrial-07, 20;
  - uisite-03; backlog-14;
  - arch-06:cursor;
  - gap-perf-gate-01:hover, gap-perf-gate-03;
  - gap-environments-05:focus; gap-annotations-extensibility-14.
- **Depends:** M9b. **Parallel:** M10, M11, M12b.

### M12b. Legend, legend table, injected styles (W5, 3 days)

- **Owns:**
  - `dom/{legend.ts, legendTable.ts, styles.ts}`;
  - the deletion of the interim internals (`api/legend.ts` remnants, `styles/legendTable.css`);
  - `test/browser/m12b-*.spec.ts` (including the strict-CSP page), `test/ledger/m12b-*.test.ts`, `test/visual/fixtures/legend.ts`;
  - `Engine.ts` wiring hunks of at most 20 lines.
- **Tests first:** `dom/legend.test.ts` (including the computed-style assertions and `[gap-overhaul-delta-02]`), `dom/legendTable.test.ts`, `dom/styles.test.ts` (one sheet per root, `:where()` specificity), and the strict-CSP page test (D8).
- **Scope:** §5.6 and D8:
  - the built-in legend over cold state, including categorical `colorBy` items, in space from `reserveChrome`, with `aria-pressed`, `highlight` on hover and focus, and forced-colours handling;
  - the final `createLegendTable` (D27);
  - `adoptStyles` reimplemented with `adoptedStyleSheets` and `:where()`, plus the `snaplot/styles.css` fallback if the CSP test demands it;
  - the M8 interim internals replaced and deleted in the same commit that ships the new views.
- **Commits:**
  1. `feat(legend)!: built-in automatic legend with injected styles`
  2. `feat(legend): core legend table with data-only columns`
  3. `fix(legend): forced colours, contrast and theme updates`
- **Exit:**
  - The `m12b-*` specs and the CSP test pass (or the fallback is shipped and documented).
  - `materializeCount === 0` over 100 appends with the legend and the legend table.
  - `bench:ab --set M12b`: `stream20hz-50k-legendtable` ≤ 50 KB gross heap per append.
  - The injected stylesheet is ≤ 2.5 KB; `check-visual-diffs` passes (rows in V80–V89).
- **Closes:** arch-08, frameworks-01, frameworks-08, frameworks-17, frameworks-20, dxtrial-06, dxtrial-13:categorical, backlog-15:categorical, visuals-20, interact-21, demos-13, research-13, gap-overhaul-delta-02, gap-environments-05:swatches.
- **Depends:** M9b. **Parallel:** M10, M11, M12a.

### M13. React and Solid adapters and the conformance suite (W3–W4, 3.5 days)

- **Owns:**
  - `src/{adapters,react,solid}/**` (the export lists in `src/{react,solid}.ts` were fixed by M8 and are not changed);
  - `test/conformance/**` (including the React 18 fixture), `test/consumers/ssr.mjs`, `test/adapter-recipe.typecheck.ts`;
  - the P3 rule's switch to error mode in `scripts/check-architecture.mjs`.
- **Timing.** The harness (the runner, the React 18 fixture with its `npm pack` install, host pages on today's adapters, and the scenario table) may start during M7. The adapter rewrite starts at `ovh-api-frozen`. M13 merges when done, before or after M9a/M9b, because its files are disjoint.
- **Tests first:**
  - the 24 conformance scenarios (§7.5), with `test.fail(true, '[id]')` where they wait on a W5 track;
  - `react/hooks.test.ts` (render counts with selectors);
  - type tests for the `forwardRef` generics: a misspelled field is still rejected through JSX.
- **Scope:** §7 in full, including `useIsoLayoutEffect`, the host-attribute rule, and switching the adapters' imports to `'snaplot'` (which flips `[frameworks-19]` in `check-consumers`).
- **Commits:**
  1. `test(conformance): one scenario table across vanilla, React 18, React 19 and Solid`
  2. `feat(adapters): shared framework-neutral binding and ref registry`
  3. `feat(react)!: thin React 18/19 adapter with ref-aware hooks`
  4. `feat(solid)!: thin Solid adapter with accessor-friendly primitives`
  5. `build(adapters): import the core from 'snaplot'`
- **Exit:**
  - Conformance is green on all 4 runtimes, except scenarios marked `test.fail` with an id owned by a W5 track that has not merged (listed in the handoff).
  - `react.ts` + `react/` ≤ 150 code lines, and `solid.ts` + `solid/` ≤ 150.
  - `rg "from '\.\./(engine|public|dom)" packages/snaplot/src/react packages/snaplot/src/solid` is empty, and `check-architecture` P3 is in error mode.
  - The SSR consumer check passes, with one core copy.
- **Closes:** arch-04, arch-18, backlog-05, dxtrial-22, frameworks-01, frameworks-02, frameworks-03, frameworks-07, frameworks-09, frameworks-12, frameworks-13, frameworks-14, frameworks-16, frameworks-19, frameworks-20, repo-15:ssr-dup, research-02, research-05, research-07.
- **Depends:** M8 (M7 for the harness). **Parallel:** M9a, M9b, M15a, M16.

### M14. Integration: visual approval, perf A/B, ratchets (W6, serial, 2 days)

- **Goal.** One coherent `overhaul` tip with approved pixels and recorded numbers.
- **Depends:** M10, M11, M12a, M12b and M13 merged, each rebased on the previous in completion order.
- **Scope:**
  - Resolve the `Engine.ts` wiring conflicts.
  - Regenerate all visual baselines in Docker and review the contact sheets against this checklist:
    - no overlapping or clipped labels;
    - ≥ 2 labels per axis;
    - no seam on white, cream or dark cards;
    - the palette matches the mode;
    - tooltips readable;
    - frame, 1.5 px lines and translucent bars unchanged;
    - nothing outside D22 and the visual-ledger rows.

    Commit the baselines and list the commit in `baseline-commits.txt`. Fill ADR 0002's approved-baselines section and summarise rows V17 onward.
  - Fold the handoff decisions (the spike outcome, palette adjustments, the stretch outcome) into ADR 0002.
  - Run `bench:ab --base overhaul-baseline` (all scenarios) and `--base v0.12.0 --filter legacy` (adapter v012) on desktop and mobile, with GPU raster and nothing else running. Re-run any set recorded as noisy. Paste both tables into ADR 0002 and `bench/README.md`. Record whether `firstpaint-line-1m` met its budget (D34).
  - Ratchet the size budgets to measured + 2% (target `createChart` ≤ 50 KB, else a per-module table) and the coverage ratchet. Switch `check-architecture` to error mode and CI's visual job to blocking.
  - Write the final metrics into ADR 0002, explaining any missed target.
- **Commits:**
  1. `test(visual): approve 1.0 visual defaults`
  2. `ci: ratchet size and coverage budgets and enforce architecture rules`
  3. `docs(decisions): overhaul outcome, metrics and bench results`
- **Exit:**
  - Every §0 target is met, or its miss is explained in ADR 0002 with a backlog item.
  - Gates G1–G12 pass locally.
  - `npm run test:conformance` reports zero `test.fail` and zero skipped scenarios.
  - `trace-check` shows the ledger holding only §6 won't-do part-ids and ids owned by M15b or M16.

### M15a. Docs: framework, data, updating and linking pages; migration draft; README (W4 and W6, 3 days)

- **Owns:**
  - pages 1, 2, 4–8 and 13, and the page-20 draft, under `site/src/content/docs/**`, with their examples under `site/src/examples/{start,frameworks,data-guide,updating,linked}/**`;
  - `README.md` (via `sync-readme`) and `scripts/sync-readme.mjs`;
  - the `description` and `keywords` fields of `packages/snaplot/package.json`.
- **Timing.** Starts when M13 merges; pauses while W5 holds all four sessions; finishes in W6.
- **Scope:**
  - The pages to the style guide, each with three-tab executed examples on real data from `site/src/examples/data`.
  - The README landing page: the generated install string, the generated quick starts and no-build snippet, the browser floor, and a "Not yet supported" list reconciled with `notes/feature-proposal-1.0.md`'s non-goals.
  - `description`: "Canvas charts for live data. One options object for vanilla JS, React and Solid."; neutral `keywords` (§11.2).
  - The migration draft: the §8.5 structure, with the rename tables built from `removed-since-0.12.txt`.
- **Commits:**
  1. `docs(site): framework pages for vanilla, React and Solid`
  2. `docs(site): data, updating and linked-chart guides`
  3. `docs(readme): concise landing page generated from examples`
  4. `docs: migration guide draft from 0.12`
- **Exit:**
  - The smoke spec passes on these pages, in all three tabs.
  - `check:examples`, `sync-readme --check` and the copy lint are clean.
  - `rg -n "value1|Series A|Metric A|SolidJS applications|chartFromRows|legend-table.css|snaplot/core|High-performance|million-scale|live window" site README.md CHANGELOG.md packages/snaplot/package.json` is empty.
- **Closes:** docs-01, docs-09, dxtrial-16, frameworks-18, research-10.
- **Depends:** M13. **Parallel:** M9a, M9b, M16.

### M15b. Docs: remaining pages, API reference, final migration guide (W7, 4 days)

- **Owns:**
  - the remaining pages under `site/src/content/docs/**` and their examples (not home, demos or data);
  - `CHANGELOG.md`, `CONTRIBUTING.md`, `docs/architecture.md` (final);
  - `scripts/overhaul/check-migration.mjs`;
  - JSDoc wording fixes in `public/types.ts` (docs-only diffs, as an integrator-request commit).
- **Scope:**
  - Pages 3, 9–12, 14–19 and 21 to the style guide, each with at least one executed example in three tabs.
  - Re-verify pages 1, 2 and 20 against the final behaviour, and apply the D34 "dense" rule.
  - Troubleshooting; accessibility; performance and limits using M14 numbers only, with the D38 scale promise.
  - The adapter recipe; the TypeDoc reference with full JSDoc coverage; the glossary; the final migration guide (§8.5) with `check-migration`.
  - Fix every false statement listed in docs-06 and docs-07.
  - The CHANGELOG `[Unreleased]` sections; CONTRIBUTING.
  - Two parallel sessions are allowed, split by IA group (disjoint `site/src/content/docs/<group>/**`).
- **Commits:**
  - `docs(site): <group>` per page group
  - `docs: migration guide from 0.12 with a coverage check`
  - `docs(changelog): 1.0 breaking changes`
  - `docs(contributing): scripts, gates and the worktree protocol`
- **Exit:**
  - The smoke spec passes on all 21 pages, each with at least one executed example (except the reference), in all three tabs.
  - `check:examples` is clean, and TypeDoc validation shows zero warnings.
  - `sync-readme --check` and `check-migration` pass.
  - Pagefind finds the §8.3 terms.
  - The M15a `rg` is empty, and the copy lint (with the "dense" rule) is clean.
- **Closes:**
  - backlog-05, backlog-21, backlog-25;
  - docs-02, docs-03:examples, docs-04, docs-05, docs-06, docs-07, docs-08, docs-10, docs-12, docs-13, docs-14, docs-17;
  - dxtrial-05; interact-20;
  - repo-13, repo-14, repo-17;
  - research-09; uisite-17;
  - gap-overhaul-delta-05; gap-scale-longevity-10; gap-competitive-04.
- **Depends:** M14. **Parallel:** M16 finalisation.

### M16a/b/c. Demos, examples hub, homepage (W4 → W7, 9 agent-days in three worktrees)

- **Tracks:**
  - **M16a** (vanilla): V1, V2, the examples hub, the homepage, `thumbs` and the montage check (about 4.5 days).
  - **M16b** (React): R1, R2 (about 2.25 days).
  - **M16c** (Solid): S1, S2 (about 2.25 days).
- **Owns:**
  - M16a: `site/src/pages/{index.astro, examples/index.astro}`, `site/src/examples/home/**`, `scripts/thumbs.mjs`, `site/public/examples/*.jpg`, and its demos;
  - each track: `site/src/pages/examples/<slug>.astro`, `site/src/demos/<slug>/**` (except M6b's `answer*` and `simulator*`, which they may extend with tests), and `site/tests/examples/<slug>.spec.ts`.
- **Timing.** Pages, identity and task specs are built from `ovh-api-frozen`, in the W4 sessions. Library defects go to the owning W5 track as requests (§10.1 #10). Final screenshots, thumbnails and the montage check run after M14 (the M16 finalisation, in M16a).
- **Scope:** §9 homepage and §10 demos and hub. Each demo follows this order:
  1. confirm the data and `answer.test.ts` from M6b;
  2. the page;
  3. the identity CSS and its one typeface;
  4. the Playwright task spec;
  5. the attribution test;
  6. the thumbnail.
- **Commits:**
  - `feat(demos): <slug>` per demo
  - `feat(site): examples hub with rendered thumbnails`
  - `feat(site): homepage with an executed streaming hero`
  - `test(demos): montage check`
- **Exit (each track):** every demo passes §10.1 at 1280 and 390 px, with no console errors and axe clean; each main module is under 300 lines; data is within its caps.
- **Exit (M16a, after M14):**
  - The hub shows real thumbnails.
  - The homepage code tab equals the executed file (the test imports both), and the hero starts paused under reduced motion and pauses offscreen.
  - The style and copy lints are clean.
  - `npm run thumbs -- --montage --check` passes.

- **Depends:** M8 and M6b; the finalisation needs M14. **Parallel:** M9a, M9b, M13, M15a, M15b.

**Closes, by track:**

#### M16a
- **Closes:** demos-01, demos-02, demos-03, demos-05, demos-08, demos-12, demos-14, demos-15, backlog-20, uisite-03, uisite-08, uisite-09, uisite-10, uisite-11, uisite-13, research-10, research-11, gap-competitive-04.

#### M16b
- **Closes:** demos-09.

#### M16c
- **Closes:** demos-04, demos-18.


### M17. Release preparation and handoff (W8, serial, 1 day)

- **Scope:**
  1. `npm run verify && npm run test:browser && npm run test:conformance && npm run test:visual && npm run build:site`, run on a fresh worktree checkout with `npm ci`.
  2. `npm pack --dry-run` file-list check.
  3. `trace-check` over all 192 required ids: every closed id is locked, and the ledger holds only §6 won't-do part-ids.
  4. Set the version to `1.0.0-beta.0` (`npm version --no-git-tag-version`). Finalise the CHANGELOG as `[1.0.0-beta.0]`, and regenerate the README (the install string becomes `npm i snaplot@next`).
  5. Refresh the size report.
  6. Run the overhaul-only tools one last time (`trace-check`, `check-visual-ledger`, `check-visual-diffs`, `check-migration`, `metrics`), paste their outputs into ADR 0002, and remove them from `verify`, `ci.yml` and the root `package.json` scripts. The files stay in `scripts/overhaul/` as history.
  7. Write the final incremental bundle and the tarball.
  8. Write `docs/overhaul-handoff.md`: the `docs/handoff/m*.md` files concatenated, plus:
     - what changed (link ADR 0002), the decisions with revisit notes, the visual ledger with revert commands, known gaps and the stop point;
     - a draft PR description, including a summary of the lab's `API_OVERHAUL_VALIDATION.md` and `trials/RESULTS.md` (read with `git show overhaul-baseline:experiments/chart-lab/...`), the metrics and the bench tables;
     - **Human steps, in order:**
       1. review the visual ledger and revert anything disliked;
       2. push `overhaul` and watch the first CI run (refresh Linux baselines via `update-snapshots` if the amd64 run was unavailable);
       3. open a draft PR with the text above;
       4. `scripts/release.sh 1.0.0-beta.0` (publishes on `next`);
       5. only then deploy the docs (tag or dispatch; `deploy.yml` checks `snaplot@next`);
       6. pin Actions by SHA and add Dependabot;
       7. file `docs/backlog.md` items as issues if wanted;
       8. spot-check a low-end Android phone (`alpha: true` compositing, touch scroll) and iOS 16.4 Safari (24 charts);
       9. confirm the demo attribution lines;
       10. optionally delete `revamp/v1-prep`.
  9. Delete the merged `ovh/*` branches with `git branch -d`, after `git branch --merged overhaul` lists them.
- **Commit:** `chore(release): prepare 1.0.0-beta.0` (no tag push, no publish).
- **Exit:**
  - `trace-check` passes.
  - `git status` is clean, and nothing is pushed.
- **Closes:** docs-08, repo-13, backlog-25.

### 12.1 Parallelism and schedule (at most 4 sessions, the integrator included)

| Calendar day | Session 1 (integrator) | Session 2 | Session 3 | Session 4 |
|---|---|---|---|---|
| 0–1 | M0 | – | – | – |
| 1–2.25 | M1 | – | – | – |
| 2.25–4.5 | M5; merges M5, M3a | M3a | M4 (to 4.75) | M2 tests; deletion after M3a merges |
| 4.5–6.75 | M6a; merges M4, M2, M6a, M3b | M3b | M6b (to 7.75) | M2 (merged about 5.5) |
| 6.75–11.75 | M7; merges M6b | M13 harness (about 1.5 days) | M6b (finishing) | – |
| 11.75–17.25 | M8 | – | – | – |
| 17.25–21.25 | M9a, then M9b | M13 adapters (merge about 19.25), then M15a | M16b, then M16c | M16a |
| 21.25–26.25 | M12b, then the W5 merges in completion order | M10 | M11 | M12a |
| 26.25–28.25 | M14 | M15a (finishing) | M16c (finishing) | – |
| 28.25–32.25 | merges | M15b | M16 finalisation, then M15b help | M15b (second IA group) |
| 32.25–33.25 | M17 | – | – | – |

About 33 calendar days. Sessions 2–4 idle during M7 and M8, which are serial because they rewrite the public contract every other track depends on.

- **Serial choke points:** M0, M1, M7, M8, M9a, M9b, M14 and M17.
- **Disjoint ownership:**
  - W1 splits as: `src/` engine (M2), `test/visual` (M3a), `test/{ledger,browser}` (M3b), `bench/` (M4), build/CI (M5), `site/` (M6a), demo data (M6b).
  - W5 splits by `engine/` subtree and the mark draw/hit split, as listed in each brief.
  - M13 owns only the adapters and conformance; M15a/M15b split by docs pages; M16a/b/c split by demo.
- **Reformatting** happens once, in M0, before any branch exists.

---

## 13. Risks and mitigations

| # | Risk | Mitigation |
|---|---|---|
| R1 | Parallel tracks conflict in shared files: `Engine.ts`, `spec.ts`, the public layer, the lockfile, the golden files, the ledger, the ADR or the baselines | M7 and M8 land the whole public surface, then the public layer is integrator-owned (§3.2). M9b fixes the W5 contracts and splits marks into draw and hit files. W5 wiring hunks are capped at 20 lines. Ledger, spec, fixture, visual-ledger and handoff files are per milestone. Generated files are regenerated, never hand-merged (§11.1). At most 4 sessions run. |
| R2 | M7 and M8 make large edits to the 4,077-line `ChartCore` before the split | M7 is confined to the public types, `normalize`, `ingest` and mechanical renames; the engine code of cut options is deleted by the milestone that owns it. M8's logic lives in new `public/*.ts` files and adds only narrow engine hooks (invalidation classes, `setPlotInsets`, retained sources). The ledger and the visual gate run at each merge, and `git rebase -x` proves every commit green. |
| R3 | The split silently changes behaviour | M9a moves code verbatim (0 pixel diffs, a byte-identical golden `.d.ts`, an unchanged ledger count, bench within 1.2×). M9b's three refactors must also reproduce a JSON snapshot of hit results, cursor snapshots and click payloads on the probe grid. |
| R4 | DOM axis labels regress pan performance (the July 2026 revamp's jank came from forced layout and label rebuilds) | Pooled nodes with identity reuse, canvas `measureText` with a width cache, and no layout reads in the render path, each guarded by a call-count test (§3.4). `line-pan-200k` and `time-pan-200k` busy ≤ 1.2×. |
| R5 | The perf gate is fooled (fidelity loss read as a win) or drowned in noise from parallel agents | Busy time, not rAF deltas; GPU raster; interleaved same-run A/B; head-only fidelity ≥ 0.8; heap per operation; a self-test noise floor of ±0.07; a shared lock that every session respects before Docker, Playwright or `npm ci`; a noisy-run rule; merge-time runs limited to the milestone's set; M14 re-runs. |
| R6 | Agents approve visual changes the maintainer dislikes | D22 forbids taste changes; translucent bars stay, and opaque bars, frame removal and `lineWidth` 2 are proposals only. Geometry assertions are objective and blocking. Every changed fixture needs a visual-ledger row (`check-visual-diffs`), and every default change is a separate revertible commit. M14 applies a written checklist. |
| R7 | Screenshots differ between macOS, Linux arm64 and CI's x86_64 | Baselines come from the pinned Docker image on `linux/amd64`, with an arm64 fallback that leaves CI advisory and a maintainer-run `update-snapshots` workflow. Fonts are bundled. Geometry and tooltip-text specs gate on every platform, and canvas hashes are compared only within a run. |
| R8 | Astro mixes React and Solid JSX badly | The 0.5-day spike gate, `*.react.tsx`/`*.solid.tsx` include globs, frame routes as fallback 1 and VitePress as fallback 2. |
| R9 | Dataset URLs move or block (USGS 503s, the NOAA file updating, the OPSD host, archive.org) | SHA-256 values and committed processed extracts; `--offline` rebuilds; retries with backoff; named fallbacks per demo; a NOTE with the exact command in the handoff. |
| R10 | A demo states a false headline: OPSD meter columns are cumulative, the chosen recording has no clipping, run A does not overfit, or a formula is wrong | Every answer has an independent oracle (§10.1 #2). The R1 demo's overfitting sentence is computed. The R2 demo's generator differences meter readings and asserts their sum. S1 scans candidates for ≥ 3 clipped runs and falls back to a labelled synthetic file. |
| R11 | Licence ambiguity in bundled data | Only public domain, CC BY 4.0, MIT or BSD-3; licence evidence is recorded in `SOURCE.md`; S1 accepts only NASA (US government) or LibriVox items with a public-domain `licenseurl`. The attribution check is a test, and confirming the lines is a human step. |
| R12 | The controlled-state rules are subtle (the "last applied" versus "always apply" split) | One rule per call: `setOptions` compares, `update` applies. Conformance scenarios 6, 7, 23 and 24, plus `state-options.test.ts`, cover echo, un-echoed literal, reset, inline empty data and highlight. The docs show the two patterns side by side. |
| R13 | React 18 conformance silently runs on React 19 (two Reacts), or `forwardRef` loses generic inference | The fixture installs a packed tarball with `resolve.dedupe`, and scenario 1 asserts `React.version` and a single react-dom chunk. A cast pattern plus type tests show a misspelled field is still rejected. `<Activity>` scenarios run on 19 only. |
| R14 | Users lose features (12 themes, custom legend cells, `padding`, `tickCount`, controlled `default*` props, `minRange`, group `defaults`) | Migration-guide recipes and opt-outs, the beta channel (D1), explicit `ticks`, and `docs/backlog.md` items with acceptance tests for anything requested back. |
| R15 | Scope creep from auditor wishlists or demo needs | The P8 metrics gate, D36, and the "not adopted" table. Demo-found defects go to the owning W5 track; new surface goes to the backlog. A new option needs a finding id in its commit body. |
| R16 | Evidence is lost: the `/private/tmp` scratchpad, the gitignored lab PNGs and site screenshots, or `notes/overhaul-audit` itself | M0 copies all of it into `notes/overhaul-audit/evidence/`, renders the missing gap-competitive report, and tars `notes/overhaul-audit` next to every bundle. |
| R17 | Unattended agents make an irreversible or outward-facing change | The forbidden-command list (§11.1). Never push or publish. Tags plus incremental bundles at every merge. Branch deletion only with `git branch -d` after `--merged`. Human steps live in the handoff, ordered so docs deploy only after the beta is on npm. |
| R18 | The expected-failure ledger becomes noise (markers left behind, wrong ids, silently skipped) | `it.fails` goes red when the test passes. M3b checks that the executed marker count equals the ledger length. `trace-check` runs at every merge for that milestone's ids and at M14 and M17 for all 192. |
| R19 | `alpha: true` costs compositing time on low-end GPUs | Measured free on desktop GPU and SwiftShader (gap-perf-gate §4). `theme.surface` restores an opaque panel. A real-device spot check is a human step. |
| R20 | Constructable stylesheets are blocked by a strict CSP or behave oddly in shadow roots | Adopted per root node, with a strict-CSP browser test in M12b and the `snaplot/styles.css` fallback with a sentinel if needed (D8). |
| R21 | The run stops early or the estimate slips | The 1.5× timebox per milestone and the stop-line priority (§12.0). Every stop writes `docs/handoff/stop.md`. What each stop point leaves missing: **after M1**, the criticals are fixed and locked but there are no new gates and no local docs site (the published 0.12 docs on GitHub Pages are untouched, because docs deploy only from tags); **after W1**, the safety nets, packaging gates, a stub site and the demo data exist, and the library is otherwise unchanged; **after M8**, the final public API with interim legends and the update path exist, but the engine is unsplit and the docs are stubs; **after W4**, the adapters, the framework docs, the migration draft and demos on intermediate visuals exist, and the W5 defects remain in the ledger; **after M14**, every library fix and the approved visuals exist, and the remaining docs pages and the demo finalisation are missing. |

---

## 14. Traceability appendix

Every confirmed critical or high finding and every high-severity judgement finding in the audit index: 6 critical and 83 high, 89 in total. The other 103 required findings (confirmed medium and low) are traced the same way in `scripts/overhaul/trace-ids.json`, generated by M3b from the milestone Closes lists and the §6 won't-do table, and `trace-check` verifies all 192. **Lock** names the regression test (its title contains `[id]`) or the gate that keeps the finding closed. No critical or high finding is won't-do; the won't-do items in §6 are all medium or low.

| Finding | Sev / verdict | Title (short) | RC | Closed by | Lock |
|---|---|---|---|---|---|
| dataapi-01 | critical / confirmed | Group viewport sync copies Y to peers | RC0, RC2 | M1, M8 | `test/ledger/m1-group.test.ts` (with a y2 peer); `public/group.test.ts`; conformance #15 |
| dxtrial-01 | critical / confirmed | Group copies one chart's Y range into others | RC0 | M1, M8 | same |
| frameworks-06 | critical / confirmed | Group Y sync flattens peers with other units | RC0 | M1, M8 | same |
| interact-01 | critical / confirmed | Group broadcasts every axis including Y | RC0 | M1, M8 | same |
| dxtrial-02 | critical / confirmed | Tooltip and cursor rounded to tick precision | RC0, RC4 | M1, M10 | `test/ledger/m1-readout.test.ts`; `engine/format.test.ts`; `m10-tooltip-format.spec.ts` |
| visuals-01 | critical / confirmed | 0.4567 shows as 0 | RC0, RC4 | M1, M10 | `m1-readout.test.ts` › `[visuals-01] 0.4567 at an integer step reads 0.46`; the P9 property test |
| arch-02 | high / confirmed | Two colour parsers | RC7 | M11 | `engine/theme/color.test.ts` |
| arch-04 | high / confirmed | React inline callbacks re-ingest everything | RC1 | M8, M13 | `public/update-classes.test.ts`; conformance #3 |
| arch-08 | high / judgement | Four drifting legend implementations | RC12 | M8, M12b | metrics: legend implementations = 1 list + 1 table; `dom/legend.test.ts`; conformance #19 |
| arch-14 | high / judgement | `ChartCore` god object | RC16 | M9a, M9b | metrics: largest file ≤ 850 (cap 900); `check-architecture`; the M9b probe snapshot |
| render-01 | high / confirmed | Bars on a time axis show epoch ms | RC4 | M10 | `engine/axes/ticks.test.ts` › bars on a Date axis |
| render-02 | high / confirmed | Category axes never thin | RC5 | M10 | `ticks.test.ts` › 30 long categories; geometry fixtures |
| render-03 | high / confirmed | Area ignores `fill`, `fill: null`, `opacity` | RC8 | M11 | `engine/marks/area.test.ts` |
| render-05 | high / confirmed | Single and isolated points invisible | RC8 | M11 | `engine/marks/line.test.ts` › isolated point; `m11-marks.spec.ts` |
| render-06 | high / confirmed | Log axis under one decade has no labels | RC5 | M10 | `ticks.test.ts` › log 50–200 |
| render-08 | high / confirmed | Histogram X labels are raw `toFixed(1)` edges | RC4, RC6 | M10 | `ticks.test.ts` › histogram nice ticks |
| render-09 | high / confirmed | `colorBy` ramp starts at the background | RC7 | M11 | `check-palettes`; `engine/marks/scatter.test.ts` › ramp contrast |
| render-15 | high / confirmed | Dark surface keeps the light palette | RC7 | M11 | `engine/theme/resolve.test.ts` |
| interact-02 | high / confirmed | Tooltips ignore axis format and category labels | RC4, RC9 | M10, M12a | `m10-tooltip-format.spec.ts`; `engine/hit.test.ts` |
| interact-03 | high / confirmed | Mixed charts drop series from the tooltip | RC9 | M12a | `hit.test.ts` › bar+line lists all |
| interact-04 | high / judgement | Single-point tooltip has no series name | RC9 | M12a | `hit.test.ts` › single point names its series |
| interact-05 | high / confirmed | Tap tooltip dismissed on lift | RC11 | M12a | `m12a-touch.spec.ts` › tap persists |
| interact-06 | high / judgement | Charts trap page scroll on touch | RC11 | M12a | `m12a-touch.spec.ts` › vertical swipe scrolls the page; one-finger pan on an xy scatter |
| interact-07 | high / confirmed | Unnamed application, no keyboard data access | RC11 | M12a | `m12a-a11y.spec.ts` (the label layer is hidden by the axes track) |
| dataapi-02 | high / confirmed | Per-series data loses appended rows on update | RC1 | M7, M8 | `public/streaming.test.ts` |
| dataapi-03 | high / confirmed | `appendData` does not validate rowIds | RC15 | M7 | `public/ingest.test.ts` › duplicate rowIds throw before mutation |
| dataapi-05 | high / confirmed | Inferred categories never shrink | RC15 | M7 | `ingest.test.ts` › categories rebuilt on replace |
| dataapi-06 | high / confirmed | `histogram()` unbounded bins, overflow, NaN edges | RC15 | M7 | `public/histogram.test.ts` |
| dataapi-07 | high / judgement | ISO strings become a category axis | RC15 | M7 | `public/normalize.test.ts` › ISO → time |
| dataapi-08 | high / judgement | Per-series rows untypable; invariant handle/plugin types | RC15 | M7 | `public/types.typecheck.ts` |
| dataapi-09 | high / confirmed | One series' format breaks the others | RC4 | M8, M10 | `format.test.ts` › series-scoped format |
| dataapi-10 | high / confirmed | Any option change re-ingests everything | RC1 | M8 | `update-classes.test.ts`; bench `reingest-*` |
| frameworks-01 | high / confirmed | Legend tables stale after data updates | RC3, RC12 | M8, M12b, M13 | `public/events.test.ts`; `dom/legendTable.test.ts`; conformance #12 |
| frameworks-02 | high / confirmed | React reconcile re-prepares on function identity | RC1 | M8, M13 | `update-classes.test.ts`; conformance #3 |
| frameworks-03 | high / confirmed | React hooks without selectors re-render per move | RC3 | M8, M13 | `react/hooks.test.ts`; conformance #11 |
| frameworks-04 | high / confirmed | Controlled viewport reset does nothing in React | RC2 | M8 | `public/state-options.test.ts`; conformance #6 |
| frameworks-05 | high / confirmed | Controlled viewport pins Y and re-applies per render | RC2 | M8 | `state-options.test.ts`; conformance #6, #7 |
| frameworks-07 | high / confirmed | `useChartGroup` destroys the group (`<Activity>` crash) | RC13 | M8, M13 | conformance #16 › two grouped charts under `<Activity>` hide/show |
| frameworks-09 | high / judgement | Solid companions require accessor props | RC13 | M13 | conformance #22 › value, accessor and `undefined` |
| frameworks-10 | high / confirmed | Types unusable under node16/nodenext | RC14 | M5 | `check:package` (tsc consumers under node16 and nodenext; attw) |
| dxtrial-03 | high / confirmed | Axis `format` not applied to readouts | RC4 | M10 | `format.test.ts` › axis format drives readouts |
| dxtrial-04 | high / confirmed | React controlled viewport freezes Y | RC2 | M8 | `state-options.test.ts` › Y stays automatic after echo |
| dxtrial-05 | high / judgement | Documented TS patterns fail with typed rows | RC15, RC18 | M7, M15b | `types.typecheck.ts`; `check:examples` |
| dxtrial-06 | high / judgement | Legends unstyled without an undocumented CSS import | RC12 | M12b | `dom/legend.test.ts` › styles injected; computed-style assertions without any CSS import |
| dxtrial-07 | high / judgement | Scatter defaults to the index tooltip | RC9 | M12a | `hit.test.ts` › scatter defaults to nearest |
| dxtrial-08 | high / judgement | ISO strings silently become categories | RC15 | M7 | `normalize.test.ts` › ISO → time |
| dxtrial-16 | high / judgement | Docs give React users almost nothing | RC18 | M15a | React page smoke in three tabs; `rg` real-data check |
| docs-01 | high / judgement | React undocumented; site Solid-only | RC18 | M15a | IA pages 4–6 exist; smoke; tabs on every example |
| docs-02 | high / judgement | API reference empty | RC18 | M7, M15b | TypeDoc `notDocumented` as an error = 0 |
| docs-03 | high / confirmed | 9 of 71 docs samples fail strict TS | RC15, RC18 | M7, M15b | `check:examples` (every tab) |
| docs-04 | high / judgement | Live editor hides data; copied code blank | RC18 | M0, M6a, M15b | smoke › copied text equals the source and renders |
| docs-05 | high / judgement | Sizing contract missing | RC10, RC18 | M11, M15b | `surface.test.ts` height cases; page 3 smoke |
| uisite-03 | high / judgement | Hero crosshair blank over most of the plot | RC9, RC19 | M12a, M16a | hover sweep 96/96; homepage spec |
| uisite-08 | high / judgement | Templated hero and marketing patterns | RC19 | M16a | `lint-styles.test.ts`; `lint-copy.test.ts`; 390/1280 screenshots |
| uisite-09 | high / judgement | Hub uses fake previews | RC19 | M16a | hub spec › thumbnails are real files |
| uisite-10 | high / judgement | Demos share one template | RC19 | M16a | `thumbs --montage --check`; banned-pattern lint |
| uisite-11 | high / judgement | Home code does not match its chart | RC19 | M16a | homepage test › code tab equals the executed file |
| visuals-02 | high / confirmed | Area fills to the plot bottom; domain excludes 0 | RC6, RC8 | M10, M11 | `ranging.test.ts`; `marks/area.test.ts` |
| visuals-03 | high / confirmed | Mode follows the OS, not the page | RC7 | M11 | `resolve.test.ts`; `theme/*` fixtures under both OS modes |
| visuals-04 | high / judgement | `#fafbfc` panel seams on most pages | RC7 | M11 | `theme/*` fixtures on white, cream and dark cards |
| visuals-05 | high / confirmed | Multi-series scatter index tooltip | RC9 | M12a | `hit.test.ts` |
| visuals-06 | high / confirmed | Density ignores theme ramps | RC7 | M11 | density fixture; `marks/scatter.test.ts` |
| visuals-07 | high / judgement | 5% padding stacked on nice bounds | RC6 | M10 | `ranging.test.ts` › max 100 → 0–100 |
| visuals-09 | high / confirmed | Thinning collapses axes to two labels | RC5 | M10 | `ticks.test.ts` › prime interval counts (flips M2's `it.fails`) |
| visuals-21 | high / confirmed | DEF-01/03/04 still reproduce | RC5, RC8 | M10, M11 | DEFAULTS visual fixtures; geometry specs; `[visuals-21:def-01]`, `[visuals-21:def-03]`, `[visuals-21:def-04]` |
| demos-01 | high / judgement | No React or vanilla demo | RC19 | M16a | hub spec counts 2 demos per framework |
| demos-02 | high / judgement | Every demo uses the same template | RC19 | M16a | `thumbs --montage --check`; banned-pattern lint |
| demos-03 | high / judgement | Demo copy contradicts the data | RC19 | M16a | `answer.test.ts` with an independent oracle per demo; each task spec checks the shown answer |
| demos-05 | high / judgement | All demo data is synthetic | RC19 | M6b, M16a | `SOURCE.md` fields; `data-size.test.ts`; generator hash check |
| demos-06 | high / confirmed | Histogram ignores `fill` but the legend reports it | RC8 | M11 | `engine/marks/histogram.test.ts` |
| backlog-01 | high / confirmed | Axis format not used by readouts (PUL-10) | RC4 | M10 | `format.test.ts` |
| backlog-02 | high / confirmed | Brush cleared by data emits no event (GRI-01) | RC3 | M8 | `events.test.ts` › `selection:change(null)` |
| backlog-03 | high / confirmed | String categories never thin (DEF-03) | RC5 | M10 | `ticks.test.ts` |
| backlog-04 | high / confirmed | Single observation draws nothing (DEF-04) | RC8 | M11 | `marks/line.test.ts` |
| backlog-05 | high / judgement | 0 px hosts collapse silently | RC10, RC13 | M11, M13, M15b | `surface.test.ts`; conformance #13; page 3 |
| repo-01 | high / confirmed | Packaging broken for real consumers | RC14 | M5 | `check:package` |
| repo-02 | high / judgement | Uncommitted overhaul and lab coupling | RC17 | M0 | baseline tag, bundle and tarball; `git ls-files experiments` = 0; clean `npm ci` |
| repo-04 | high / judgement | jsdom and SSR consumers crash | RC10 | M11 | `check-consumers` jsdom render (the gate exists from M5); `surface.test.ts` |
| research-01 | high / judgement | Identity-based equality re-ingests in frameworks | RC1 | M8 | `update-classes.test.ts` › accessor identity re-extracts one series; churn warning only at ≥ 10,000 rows |
| research-02 | high / judgement | No sizing contract | RC10 | M11, M13 | `surface.test.ts`; conformance #13 |
| gap-perf-gate-01 | high / confirmed | Scatter sampling loses fidelity; hover O(n) | RC9 | M7, M11, M12a | bench fidelity ≥ 0.8; `hit.test.ts` › `[gap-perf-gate-01:hover]` visits ≤ 64 points |
| gap-perf-gate-02 | high / judgement | The perf gate cannot see regressions | RC17 | M4 | self A/B within 1.0 ± 0.07; `gate.json` required sets |
| gap-perf-gate-05 | high / confirmed | Re-render and re-ingest cost 150 ms+ on mobile | RC1 | M8 | bench `reingest-rows-200k-title`, `react-rerender-200k-inline` budgets |
| gap-overhaul-delta-01 | high / confirmed | Custom themes lose axis-label colour | RC7 | M11 | `resolve.test.ts` › the text token drives axis labels |
| gap-scale-longevity-01 | high / confirmed | Black frames on mount and resize | RC0, RC10 | M1, M11 | `test/ledger/m1-lifecycle.test.ts`; `m11-lifecycle.spec.ts` screencast |
| gap-environments-01 | high / confirmed | Charts print as black boxes | RC0 | M1 | `m1-lifecycle.test.ts` › print with unchanged DPR; print emulation spec |
| gap-annotations-extensibility-01 | high / confirmed | Category regions span slot centres | RC6 | M10 | `engine/annotations.test.ts` › slot edges, single category |
| gap-annotations-extensibility-02 | high / judgement | Annotation labels clipped, overlapping or dropped | RC5 | M10 | `annotations.test.ts`; `m10-axes.spec.ts` at 390 px |
| gap-annotations-extensibility-07 | high / confirmed | Inline plugins reinstall and re-ingest | RC1 | M8 | `public/plugins.test.ts`; conformance #17 |

---

## Appendix: Critique log

Three critics (coverage, feasibility, product) reviewed the merged plan. Every blocker and major issue is applied above, and so are the minor ones that improve the plan. This log records only where a critique was rejected or applied in a modified form, and where the final edit overruled a panel majority.

| Critique | Decision | Reason |
|---|---|---|
| Feasibility: split M13 into M13a (core scenarios) and M13b (`LegendTable` wrappers, after M12) | **Rejected.** M13 stays one milestone. | M8 now ships `legend: 'auto'` and `createLegendTable` with their final types over the existing views (the feasibility critic's own interim-legend fix), so every conformance scenario can run when M13 merges. Scenarios that wait on a W5 track carry that track's `test.fail` marker, and M14 requires zero markers and zero skips (the product critic's version). |
| Feasibility: from M7 to M14, diff screenshots against the committed M3a baselines | **Modified.** Each milestone diffs against a reference rendered from its own merge base, cached outside the tracked tree. | Diffs against M3a's baselines accumulate, so a later milestone would see an earlier one's intended changes and fail `check-visual-diffs`. Diffing against the merge base makes every changed fixture attributable to the milestone that merges it. |
| Feasibility: tracks file change requests and never touch integrator-owned files | **Modified.** One isolated `chore(<scope>): integrator request` commit of at most 30 lines per track, reviewed at merge. | Pure requests would stall unattended tracks waiting on the integrator. The cap and isolation keep conflicts reviewable. |
| Feasibility: `git rebase -x 'npm ci && npm test'` per commit | **Modified.** `npm ci` runs only when the commit changed the lockfile. | Same guarantee at a fraction of the time. |
| Feasibility: `toBlob` should fill the resolved surface | **Moot.** | `toBlob` is removed (product critique, D28). |
| Feasibility: M2 may regenerate the golden API as a removal-only diff | **Rejected** in favour of the critic's first option. | `lttb` and every other public removal move to M8, so only M7 and M8 change the golden by design. |
| Coverage: regenerate the plan's Closes lists and root-cause column with `trace-ids.mjs --render` | **Modified.** `trace-ids.json` is generated once from this plan in M3b and is authoritative afterwards; `--render` prints the views for the handoff. | The plan is a frozen input in `notes/`; regenerating it in place would create a second source. |
| Coverage: lock `gap-annotations-extensibility-03` in M10's `annotations.test.ts` | **Moved** to M11's `color.test.ts`. | The defect is `withAlpha` on raw strings, which the colour module (M11) owns; M10 never touches colour parsing. |
| Coverage: lock `dataapi-17` in M7 | **Moved** to M11's `m4.test.ts`. | M11 owns `m4.ts`, and the feasibility critic limited M7 to the public layer. |
| Coverage: lock `render-16` in M11's `axes/render.test.ts` | **Moved** to M11's `render/crisp.test.ts`. | `axes/render.ts` belongs to M10. M9b routes every 1 px stroke through `crisp.ts`, so M11 fixes snapping in one file. |
| Coverage: lock `gap-annotations-extensibility-08` in M7 | **Moved** to M8. | The plugin host and its contract are M8's. |
| Product: the montage fails on two demos with the same luminance class and font, or the same class and column count | **Modified** to "the same background colour (CIEDE2000 < 2)". | Four demos follow light domain conventions (USGS, newspaper, TensorBoard, OWID), so a luminance-class rule cannot pass without inventing dark themes. V1 gains a second chart column, the seismologist's log–log decay plot, which is also the most direct answer to its question. |
| Product: V2's oracle compares the median TMAX with NCEI daily normals within ±1 °F | **Modified** to monthly normals (`MLY-TMAX-NORMAL`) for June to August. | NCEI daily normals are smoothed means, not medians, and can differ from a raw daily median by more than 1 °F on single days; monthly means are a robust independent check. |
| Product: S1 candidates may include archive.org 78 rpm and radio transfers | **Rejected.** NASA audio (US government works) and LibriVox items with a public-domain `licenseurl` only. | The rights for 78 rpm and old-time-radio uploads vary item by item; an unattended agent cannot verify them. |
| Product: start M15a with pages 1–6; feasibility: draft only pages 4–8 and 13 early | **Merged.** M15a drafts pages 1, 2, 4–8 and 13 plus the migration draft; page 3 waits for M11's sizing rule; M15b re-verifies 1, 2 and 20. | Keeps a usable docs core at an early stop without drafting pages whose behaviour has not landed. |
| Feasibility: install the original demo fonts up front (Barlow Condensed, Overpass, Martian Mono, …) | **Replaced** by the fonts of the new identities (Libre Caslon Text, Libre Franklin, Roboto, Source Serif 4, Inter). | The product critique replaced costume typography with each domain's real conventions and one typeface per demo. |
| Product: plain white site surfaces | **Extended.** The accent also changes, from a muted teal to the library's own first series colour. | Warm paper, Plex and a muted teal were named together as a "tasteful default"; tying the accent to the chart palette gives the site a reason for its colour. |
| Panel majority on D28 (keep `toBlob`, judges 1 and 2) | **Overruled** by the product critique. | A second, canvas text path contradicts "one implementation per concept", and export was not asked for. |
| Panel majority on D22 (opaque pre-mixed bars, judges 1 and 3) | **Overruled** by the product critique. | It needs maintainer approval under the lab's rule, and a pre-mix gives wrong bar colours over images and gradients. |
| Panel majority on D26 (height applies only when the host measures 0) | **Overruled** by the product critique. | A stretched flex or grid cell silently overrode an explicit `height`, and the fallback fed back into the measurement. |
