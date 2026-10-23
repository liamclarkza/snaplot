# ADR 0002: The snaplot 1.0 API overhaul

- **Status:** accepted; being executed. Edited only by milestones M0, M14 and M17.
- **Plan of record:** [`docs/overhaul-plan.md`](../overhaul-plan.md) (the plan) and
  [`docs/overhaul-execution.md`](../overhaul-execution.md) (process rules that win where they conflict).
- **Baseline:** tag `overhaul-baseline` = `6237289` on the local branch `overhaul`. Audit file:line references
  point at it: `git show overhaul-baseline:<path>`.
- **Evidence:** a 19-auditor review (336 findings; 192 required) in `notes/overhaul-audit/` (gitignored, local
  only; backed up as `.claude/backups/overhaul-audit.tar.gz`). Finding ids such as `dataapi-01` refer to its
  `_index.md`.

## 1. Decisions

Each decision is applied as recommended by the plan (§1). **Revisit** says what moves if the maintainer
changes it. Panel dissent is recorded in the plan.

### Required decisions

- **D1. Version target: `1.0.0-beta.0` on the `next` dist-tag.** Install strings are generated from the package
  version (`npm i snaplot@next` while a prerelease). Prerelease docs show a "1.0 beta docs" banner, and
  `deploy.yml` refuses to deploy until `snaplot@next` matches the version. Publishing is a human step.
  *Revisit:* 0.13.0 changes the version, CHANGELOG heading and banner only; 1.0.0 drops the `next` workflow and
  the banner.
- **D2. React `^18.3.0 || ^19.0.0`.** `forwardRef` with a generic cast, `useSyncExternalStore`, an isomorphic
  layout effect; no React-19-only API. React 18 runs as an isolated conformance fixture installed from
  `npm pack`. *Revisit:* React 19 only deletes the fixture and uses ref-as-prop.
- **D3. Declarative state options, identical in vanilla, React and Solid.** `viewport`, `selection`,
  `hiddenSeries` and `highlight` are ordinary options. `setOptions(full)` applies a state value only if it
  differs from the last value applied from options; `update(patch)` always applies. `<key>:change` and
  `on<Key>Change` fire for every change not caused by the caller's own option value; one action emits one event.
  Deletes `setControls`, guard hooks, `default*` props, `selectionState` and the handle's `setHighlight`.
  *Revisit:* veto semantics need the guard layer back (about 150 lines).
- **D4. `theme: 'auto'` follows the page** (tokens → container CSS variables → first opaque ancestor background
  → luminance of the computed text colour → white); dark below relative luminance 0.4; one coalesced
  document observer re-resolves. *Revisit:* add `theme: 'system'`; nothing else moves.
- **D5. Transparent default background.** All canvases `alpha: true`; no container radius; the resolved surface
  still drives mode, halos and ramp contrast. *Revisit:* an opaque default keeps `alpha: false` and M1's
  synchronous-fill fix.
- **D6. `legend: 'auto'`:** shown from 2 series, or one scatter series with categorical `colorBy`; above the
  plot, left-aligned; click toggles, hover/focus highlights; rendered by core. *Revisit:* default `false` and
  the first multi-series example adds `legend: true`.
- **D7. `timeZone?: 'local' | 'UTC'` and `locale?: string` at the top level,** applied by the single formatter
  and by calendar tick stepping. IANA zones go to the backlog. *Revisit:* IANA support is a separate ~3-day
  milestone after M10.
- **D8. Auto-injected legend styles, no CSS import:** one adopted stylesheet per document or shadow root,
  selectors in `:where()`; the `./legend-table.css` export is removed (interim `?inline` injection from M8 to
  M12b; a strict-CSP fallback file if needed). *Revisit:* ship `snaplot/styles.css` and import it in every
  first example.
- **D9. Themes: `'auto' | 'light' | 'dark'` or a 10-token object** (`mode`, `surface`, `text`, `muted`,
  `accent`, `categorical`, `sequential`, `diverging`, `fontFamily`, `fontSize`). The 12 decorative themes and
  the theme helpers are deleted; the dark palette becomes colour-blind-safe candidate A once
  `check-palettes` passes; the light Okabe–Ito palette stays. *Revisit:* a `snaplot/themes` subpath brings back
  about 470 lines and a fourth entry point.
- **D10. Delete `experiments/` (the chart lab).** Its gitignored evidence is copied first; its rule becomes
  [ADR 0001](0001-visual-reference.md); its DEFAULTS_FINDINGS cases become visual fixtures. *Revisit:* move it
  outside the workspaces with its own lockfile, consuming `snaplot` via `npm pack`.
- **D11. Docs on Astro + Starlight** with React and Solid islands, Pagefind, path routes, `starlight-typedoc`,
  static output under `/snaplot/`; gated by a 0.5-day spike in M6a (fallbacks: frame routes, then VitePress).
  *Revisit:* keeping the custom Solid site means re-implementing routes, search, a11y and theming (~2 weeks).
- **D12. One package `snaplot` with entries `.`, `./react`, `./solid`.** *Revisit:* `@snaplot/react` and
  `@snaplot/solid` workspaces plus changesets (mechanical after M13).
- **D13. Remove `snaplot/core`.** *Revisit:* add `./core` back as a documented alias.

### Further decisions

- **D14. Sequencing:** protect the baseline → fix the criticals in the current code (M1) → safety nets (W1)
  → types (M7) → update path and final surface (M8) → split (M9a/M9b) → parallel subsystem tracks (W5).
  Remaining defects are recorded first as expected failures and fixed once, by the owning milestone.
  *Revisit:* the delivery-lens order reaches "all wrong data fixed" ~5 days earlier but rewrites the controller
  and hit paths twice.
- **D15. Axis text stays DOM** (pooled labels), measured with canvas `measureText` on digit-normalised text,
  scaled by a probe span, re-measured on font load, `aria-hidden`, forced-colours aware, no layout reads in the
  render path. *Revisit:* canvas axis text deletes the pool but loses tabular figures and minimum font size,
  and needs approval under ADR 0001.
- **D16. Change detection:** intake copies arrays and objects; `update(patch)` applies every key present;
  `setOptions(full)` compares presentation deeply, state as D3, `data` by reference (two empty arrays are
  equal) and accessors by identity; callbacks and function-valued render options are latest-ref. Accessor churn
  and re-ingest-rate warnings apply only to sources of ≥ 10,000 rows; replacing a streamed source warns with
  the discarded count. *Revisit:* event-only callbacks in vanilla make the docs tabs diverge.
- **D17. Group sync:** `viewport: true` syncs horizontal axes only, and only axes the peer has; `yRange: true`
  is the only way to share Y; colours by series id across the group; no group `defaults`, link toggles or
  `unlink` (a spread recipe replaces fleet defaults).
- **D18. ISO date strings infer a time axis** when every non-null X matches the ISO pattern; `type: 'time'`
  accepts them; epoch-like numbers on an inferred linear X warn once.
- **D19. Touch:** `touch-action: pan-y` for zoom `'x' | 'none' | 'readonly'`; `none` for `'xy'` or
  `drag: 'pan'`; a tap tooltip persists; long-press then drag selects; momentum respects reduced motion.
- **D20. Accessibility:** host `role="figure"` named by `ariaLabel` or an automatic summary; canvases and the
  label layer `aria-hidden`; an inner `role="application"` focus target for interactive charts with the
  documented keys; a throttled polite live region; a 2 px accent focus ring; core never overwrites or removes
  host attributes it did not add. A data-table alternative is a docs recipe.
- **D21. Minimal plugin contract** `{ id, install?(chart) → cleanup?, drawBelow?, drawAbove?, drawOverlay? }`,
  `chart.scale(key)`, `chart.redraw(layer)`; reconciled by id; per-hook error isolation; `beforeDraw`,
  `onDataUpdate` and `onOptionsUpdate` removed; reference lines and regions built on the same contract.
- **D22. Visual taste:** keep the maintainer-approved Chart.js-like look; change only defects and regressions;
  one reference-following change (category gridlines on slot boundaries); four items recorded as proposals,
  not applied. Full text in [ADR 0001](0001-visual-reference.md).
- **D23. Data model:** a source is rows or columns, never both; rows are stably sorted by X; typed columns
  and histogram edges must already be sorted; appends are sorted and must not start before the last retained
  X; `rowId` unique in the retained window; categories rebuilt on replace and evicted with the ring; replaced
  data outside a pinned X range unpins it.
- **D24. Always-on `warnOnce(code, message)`** in a single build, deduplicated per page; invalid input throws
  at the call that caused it; no `development` condition, `__DEV__` or `NODE_ENV`.
- **D25. Browser floor:** Chrome/Edge 111+, Firefox 115+, Safari/iOS 16.4+; target `es2022`; no polyfills;
  WebKit and Firefox smoke tests in CI.
- **D26. Sizing:** fills the container's width; an explicit `height` always wins; without it the chart fills
  the container's height; a 0 px container gets an in-flow 300 px fallback and one warning. `width`,
  `autoResize`, `aspectRatio` and `resize(w, h)` are removed. *Revisit:* with no `height` option, CSS is the
  only sizing mechanism.
- **D27. One legend table:** core `createLegendTable(el, { chart, columns, fallback })` with data-only columns
  and keyed updates; thin React and Solid `<LegendTable>` wrappers; no framework `<Legend>`. *Revisit:*
  deleting it removes ~260 lines and the wrappers.
- **D28. No PNG export in 1.0** (it would need a second text path); "PNG and SVG export" is in the backlog.
  *Revisit:* `toBlob({ pixelRatio? })` compositing the layers and painting labels from `LabelBox[]`.
- **D29. Option cuts per plan §4.4:** `tickCount`, `interaction.minRange`/`maxRange`, `pointShape`,
  `heatmap*`, `fillGradient`, `barWidthRatio`, `padding` and about 30 interaction knobs; `ticks` is kept;
  zooming keeps an internal minimum span; the `'readonly'` preset keeps its name.
- **D30. Names:** `roundBounds` → `nice`; series `stroke` → `color`, `lineDash` → `dash`;
  `follow:change` → `following:change`; `getCursorSnapshot` → `getCursor`; "follow window" vocabulary
  ("live window" is banned in docs and messages).
- **D31. Remove `getStats()` and `debug.stats`;** tests and the bench read the untyped
  `chart[Symbol.for('snaplot.debug')]` (lands in M1).
- **D32. Docs deploy on `v*` tags and manual dispatch only,** gated on CI; a prerelease deploys only once
  `snaplot@next` matches.
- **D33. Six demos, two per framework,** on public-domain, CC BY 4.0, MIT or BSD data or a labelled seeded
  simulator; no share-alike or health data, no IANA-zone demos.
- **D34. Homepage:** one sentence, the generated install string, a streaming hero from the deploy-#482
  simulator, a fact line of generated bundle sizes only, the examples list with real thumbnails, a footer; no
  performance adjectives until a measured comparison is published.
- **D35. Site typography and colour:** IBM Plex Sans and Mono via `@fontsource`; plain `#FFFFFF` / `#111113`
  surfaces; accent = the library's first series colour. *Revisit:* the system stack is the one-line fallback.
- **D36. Deferred features** go to [`docs/backlog.md`](../backlog.md) §D36 with acceptance criteria.
- **D37. Frame scheduling:** visibility gating is required (IntersectionObserver with a 200 px margin plus
  `visibilitychange`; print forces a paint); a shared rAF loop is an M11 stretch goal; grid and data canvases
  stay separate.
- **D38. Remaining auditor questions** are answered in the plan's §1 table; each lands as a test or a backlog
  line.
- **D39. ESM only;** the no-bundler path is `<script type="module">` importing from jsDelivr `+esm`.
  *Revisit:* add an IIFE build (~1 hour) and a `<script src>` example.

### Auditor recommendations not adopted

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

Adopted from the same review: `horizontal` on `scale()`; plugin draw hooks after the built-in annotations
(D21); a §3.4 guard for density-cache hits on pan; a geometry assertion that no two adjacent labels repeat
(M3a); a y2 peer in `[dataapi-01]`; the four backlog demo checklist items (plan §10.1 #9); and a glossary page.

The single won't-do list for findings is plan §6 ("Won't do in this overhaul"); `docs/backlog.md` lists each
item with its acceptance test.

## 2. Pre-overhaul visual ledger (V1–V16)

What the uncommitted overhaul (`aef1584..6237289`) changed visually against v0.12.0, from
`notes/overhaul-audit/gap-overhaul-delta.md` §1.5. Class: (i) intended and documented; (ii) intended but
undocumented; (iii) unintended regression. Rows V0 and V17 onward are files in
[`visual-ledger/`](visual-ledger/README.md).

| # | Change | Class | Decision | Owner |
|---|---|---|---|---|
| V1 | Plot frame and every clip go from `roundRect(…, 4)` to a square `rect`. | (i) | **Approved.** The outer container's 6 px radius is removed by D5 (visuals-04). | — (D5 in M11) |
| V2 | Tick labels use `axisLabelColor` (muted `tickColor`) instead of `textColor`; light contrast 16.2:1 → 4.7:1 (still AA). | (i) | **Default approved; revert planned for the fallback:** custom `textColor` and `--chart-text` must drive axis text again. | gap-overhaul-delta-01, M11 |
| V3 | Axis titles lose `opacity: 0.75; letter-spacing: 0.02em` and share the label colour. | (i) | **Approved.** | — |
| V4 | Gridlines: the undocumented ×0.55 alpha is removed (+82% ink) and the colour is pre-composited to opaque. | (i) | **Approved.** | — |
| V5 | Frame pre-composited; dark-theme `borderOpacity` lowered (0.65–0.7 → 0.45–0.55 per theme). | (i)/(ii) | **Approved.** The decorative themes are deleted by D9. | — |
| V6 | Tick marks: `tickColor` at alpha 1 → `axisLineColor` at `gridOpacity` (contrast 4.7–6.4 → 1.09–1.26). | (i); (iii) for `grid: false` | **Revert planned for grid-less axes** (the 0.12.0 tick-mark purpose). | gap-overhaul-delta-04, M10 |
| V7 | Bars: opacity 0.85 → 0.75, 1 px outline in `stroke ?? colour`, 2 px value-end radius, square baseline. | (i) | **Approved.** The outline-on-fill colour is demos-10 (M11). | — |
| V8 | Linear auto-domains are niced by default on X and Y (was opt-in). | (i) | **Approved,** together with the V9 revert. | — |
| V9 | The 5% padding and the up-to-8-pass re-nice are kept on top of V8: data fill 91% → 60–80%; non-negative data gets negative axes. | **(iii)** | **Revert planned:** no padding stacked on nice bounds (Chart.js grace 0). | visuals-07, render-10, M10 |
| V10 | Bar and histogram value axes: no sub-zero padding; bars sit on the frame. | (ii) | **Approved;** document it. | — |
| V11 | Numeric bar X axes: regular centre labels, gridlines and tick marks on slot boundaries. | (i) | **Approved.** Phantom slots are fixed separately (backlog-13, M10). | — |
| V12 | A constant series gets a ±10% span instead of a degenerate axis. | (i) | **Approved** (a fix). | — |
| V13 | `thinTicks(…, preserveEnds)` picks a stride that divides the interval count and can collapse an axis to its two endpoints. | (i); side effect (iii) | **Revert planned:** replace stride thinning with re-ticking at a coarser nice step. | visuals-09, M10 |
| V14 | A mouse click no longer draws the grey tap-feedback ring (touch and pen only). | (ii) | **Approved;** document it. | — |
| V15 | `colorBy` category with more than 12 categories: every category gets a palette slot; stable `categoryValues` order. | (ii) | **Approved;** document it. | — |
| V16 | Tooltip, crosshair, hover dots, highlight dimming, legend-table DOM and theme swatches unchanged apart from position. | — | **No action.** | — |

## 3. Visual ledger from V0 on

Row V0 (M3a's initial baselines) and every row from V17 on live as one file each in
[`docs/decisions/visual-ledger/`](visual-ledger/README.md), with the reserved ranges listed there. The commits
that may change committed screenshots without a row are listed in `visual-ledger/baseline-commits.txt`.

## 4. Baseline metrics

Measured by `node scripts/overhaul/metrics.mjs` (added in M0 commit 8). Filled in by M0 commit 8.

## 5. Approved baselines

Filled in by M14: the approved screenshot set, its commit, its size, and a summary of rows V17 onward.

## 6. Outcome

Filled in by M14 (final metrics against the plan §0 targets, with a per-module table for any missed target,
and the bench A/B tables) and M17 (release status and handoff).
