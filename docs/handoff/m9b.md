# M9b — engine refactors and W5 contracts

Branch `ovh/m9b-engine-contracts`, merge base `9705b0f` (overhaul).

## What changed
- Probe record of hit, cursor and click results (`test/visual/__probe__/m9a.json`, project `probe`) taken before the refactors.
- One cursor snapshot path; a mark registry replaces per-type branches (`series.type ===` now only in `marks/index.ts`).
- Pointer and key handling as an action table; pan momentum moved out of the GestureManager.
- Contracts for the W5 tracks: format (ticks, readouts, X readout via `engine/format.ts`), labels, surface, crisp,
  color and styles (tooltip styles via `adoptStyles`).
- Sources, modes, axes setup and events moved out of `Engine.ts` (now 746 lines; largest engine/dom file is
  `gestures.ts` at 828).
- `check-architecture` reports source files over 900 lines as errors; the three integrator-owned files are frozen
  at their length.
- `docs/architecture.md` describes the module map and the contracts.

## Gates (on b0bbe39 + this handoff)
- `npm run verify`: pass.
- `npm run check:api`: golden `index.d.ts`, `react.d.ts`, `solid.d.ts` byte-identical.
- `npm run test:visual -- --against 9705b0f` + `check-visual-diffs`: 141 shots, 0 changed; 570 geometry checks pass.
- `npx playwright test --project probe`: 114/114, probe JSON reproduced.
- `npm run test:browser`: 74 passed (expected-failure markers unchanged).
- `check-architecture`: size 0 errors, P3 0 errors; P2 still warn mode.
- Browser look: legend/two-series and hover pages checked from the exact-match shots.

## Known gaps
- Files over 900 lines remain, all integrator-owned: `public/chart.ts` 1,191, `engine/spec.ts` 1,152,
  `public/ingest.ts` 1,073. arch-14 / arch-19 are co-owned by M14 (commit 6822707).
- P2 type branches remain in `public/append.ts`, `public/ingest.ts`, `public/normalize.ts` and `engine/sources.ts`
  (not `series.type ===` literals); P2 goes to error mode in M14.

## Integrator requests
- fc0a8a7: the interim legend's styles through `adoptStyles`.
- 6822707: arch-14 and arch-19 owners gain M14.
