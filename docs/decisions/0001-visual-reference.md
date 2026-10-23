# ADR 0001: Chart.js is the visual reference

- **Status:** accepted (rule set by the maintainer during the chart-lab comparison; recorded in overhaul M0).
- **Source:** `experiments/chart-lab/VISUAL_REFINEMENT.md`, deleted from the tree in M0. Read it with
  `git show overhaul-baseline:experiments/chart-lab/VISUAL_REFINEMENT.md`. The lab's comparison screenshots
  (never committed) are kept locally in `notes/overhaul-audit/evidence/lab/` (gitignored).
- **Related:** [ADR 0002](0002-overhaul.md) (D22 and the pre-overhaul visual ledger V1–V16), the
  [visual ledger](visual-ledger/README.md) (V0 and V17 onward), plan §5 and §11.3 G10.

## Context

The chart lab rendered the same UAV, F1, ML, airport and biology dashboards with snaplot, Chart.js, ECharts
and Recharts. The maintainer preferred the Chart.js renderings: straight plot edges, restrained bars, and one
quiet colour for titles, labels, grid and ticks. Those preferences apply to snaplot's library defaults, not
only to that dashboard.

## Decision

1. **Chart.js is the visual reference.** Recharts and ECharts remain API references only.
2. **Visual changes need approval.** Implement only the visual adjustments the maintainer identifies. Any
   further visual refinement needs the maintainer's approval first. During the unattended overhaul,
   "approval" means the rules in "Process" below: a change outside them is recorded as a proposal, never
   applied.
3. **The approved look** (as shipped at `overhaul-baseline`, 6237289):
   - square plot clips and a square four-sided frame, aligned to the tick endpoints;
   - muted axis titles and tick labels in one colour, with no second title-only opacity;
   - grid, frame and tick strokes of equal strength, composited against the chart background before
     painting at full opacity, so crossings do not brighten through alpha accumulation; `gridOpacity` is
     applied directly (the undocumented ×0.55 is gone);
   - bars at 0.75 opacity with a 1 px outline in their stroke colour and a 2 px radius at the value end;
     the zero-baseline end stays square for positive and negative values;
   - 1.5 px lines and a vertical grid on a continuous X axis (D22).

   The comparison adapter gave Chart.js bars a 0.75-opacity fill, a 1 px outline and a 2 px radius. Those
   details are a design reference, not proof that an unconfigured Chart.js chart looks like the dashboard.
4. **Regular ticks define automatic numeric bounds.** A nice interval is chosen, automatic bounds are
   rounded outward, and the first and last generated ticks become the bounds (Chart.js `bounds: 'ticks'`;
   ECharts and Recharts nice their extents the same way). Never append an arbitrary endpoint tick that
   creates a short final interval. Explicit bounds are intentional constraints and may keep a short final
   interval. When an aligned sequence must be thinned, the result must still be a regular sequence that
   reaches both ends. (The overhaul corrects how this was implemented: no padding stacked on nice bounds
   (V9), and re-ticking at a coarser nice step instead of stride thinning (V13). See ADR 0002.)
5. **Bar axes use one centre/grid plan.** On automatic linear bar axes, labels sit at slot centres, the
   mapped range extends half a tick interval at each end, and gridlines sit on slot boundaries, including
   the boundary after the last slot (Chart.js `offset` and `grid.offset`). Values keep their real numeric X
   positions. Explicit bounds or ticks, `roundBounds: false` (`nice: false` again after D30), histogram bin
   geometry and zoomed viewports keep their
   own behaviour. The overhaul adds the one reference-following change in D22 (category X gridlines on slot
   boundaries too) and removes the phantom empty slots this plan produced (backlog-13).
6. **Floating-point edges.** Decimal boundary indices compensate for division error, so an aligned final
   tick such as 0.6 on a 0.2 interval is kept without admitting out-of-range ticks.

## D22: what the overhaul keeps, changes and only proposes

- **Keep:** the square four-sided frame (V1); 1.5 px lines; translucent bars (0.75 alpha, 1 px outline in
  the series colour, 2 px value-end radius); the vertical grid on continuous X.
- **Change only defects and regressions** (exact values in plan §5): readout precision; area to zero; theme
  from the page; transparent surface; nearest tooltip for scatter; revert V9, V6 and V2's label-colour
  fallback; replace V13 stride thinning; category thinning; isolated-point markers; density ramp from the
  theme; scatter style continuous in N; no phantom bar slots; CVD-safe dark palette; dark grid parity;
  inherited font family; measured gutters.
- **One reference-following change:** category X gridlines sit at slot boundaries, as Chart.js and the
  numeric-bar plan (V11) already do.
- **Recorded as proposals, not applied:** removing the top and right frame (visuals-26); `lineWidth` 2;
  automatic axis titles from field names; opaque bars pre-mixed at 0.75 over the surface. Applying any of
  them needs the maintainer.

## Process

- Every pixel-changing default lands as its own commit with a `visual: V<n>` paragraph and a row file
  `docs/decisions/visual-ledger/V<n>.md` (P13), so `git revert <sha>` undoes it.
- `scripts/overhaul/check-visual-ledger.mjs` (M3a) fails a commit that touches screenshots, or has a
  `visual:` paragraph, without its row file. `check-visual-diffs.mjs` (G10) fails a merge whose screenshot
  diff names a fixture that no row file of that milestone lists.
- Only M3a (initial set, V0) and M14 (approved final set) commit PNG baselines. Both commits are listed in
  `visual-ledger/baseline-commits.txt`.

## Baseline approval checklist (M14)

M14 regenerates every baseline and reviews the contact sheets against this list. Every item must hold:

- [ ] no overlapping or clipped labels;
- [ ] at least 2 labels per axis;
- [ ] no seam on white, cream or dark cards;
- [ ] the palette matches the mode (light or dark);
- [ ] tooltips are readable;
- [ ] the frame, the 1.5 px lines and the translucent bars are unchanged;
- [ ] nothing changed outside D22 and the visual-ledger rows.

The approved set, its commit and a summary of rows V17 onward go into ADR 0002, "Approved baselines".

## Consequences

- Defaults move only through ledger rows; a reviewer can list and revert each visual change on its own.
- Taste changes the auditors proposed but the maintainer did not ask for stay out of 1.0.
- The lab itself is deleted (D10); its rule lives here and its DEFAULTS_FINDINGS cases become visual
  fixtures in M3a.
