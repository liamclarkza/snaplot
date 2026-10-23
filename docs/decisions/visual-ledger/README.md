# Visual ledger

One file per deliberate change to a visual default (plan P13, [ADR 0001](../0001-visual-reference.md)).
Rows V1–V16 (what the pre-overhaul work changed against v0.12.0) are a table in
[ADR 0002](../0002-overhaul.md) §2. Every other row is a file here: `V<n>.md`.

## When a row is required

- A commit changes how any chart renders by default (a pixel-changing default). It lands **alone**, with a
  `visual: V<n>` paragraph in its commit body and its row file added in the same commit, so
  `git revert <sha>` undoes exactly that change.
- `scripts/overhaul/check-visual-ledger.mjs` (M3a) fails if a commit in `overhaul-baseline..HEAD` touches
  `**/__screenshots__/**`, or has a `visual:` paragraph, without adding or editing its row file. The only
  exceptions are the commits listed in [`baseline-commits.txt`](baseline-commits.txt).
- `scripts/overhaul/check-visual-diffs.mjs` (plan §11.3 G10) fails a merge whose screenshot diff names a
  fixture that no row file added by that milestone lists. Fixtures that exist only on the head are reported
  as added and need no row.

## Row format

File `V<n>.md`:

```md
# V<n>: <one-line change>

- **Commit:** `<type>(<scope>): <subject>` (the exact subject of the commit that adds this file)
- **Milestone:** M<N>
- **Fixtures:** `<fixture-id>`, `<fixture-id>`, … (every fixture whose screenshot changes)
- **Before → after:** <what a reviewer sees, with values, e.g. "Y domain 0–200 → 0–160; 1 px tick marks at
  4.7:1 instead of 1.2:1">
- **Finding:** `<finding-id>` (or `D22` for the one reference-following change)
- **Revert:** `git revert <sha>` (filled in after the commit exists, or "revert the commit with the subject
  above"), then `npm run test:visual` and review
```

Keep one change per row. A follow-up adjustment to the same default is a new row that names the earlier one.

## Reserved ranges

| Range | Owner |
|---|---|
| V0 | M3a (the initial committed baselines; not a default change) |
| V1–V16 | pre-overhaul changes, recorded in ADR 0002 §2 |
| V17–V29 | M7, M8, M9a, M9b |
| V30–V49 | M10 (axes, ticks, formatting, domains, time, annotations) |
| V50–V69 | M11 (marks, colour, theme, surface, sizing, visibility) |
| V70–V79 | M12a (hit test, hover, tooltip, viewport, selection, touch, keyboard) |
| V80–V89 | M12b (legend, legend table, injected styles) |
| V90+ | unassigned; the integrator allocates |

## `baseline-commits.txt`

One full commit SHA per line, for the commits that may change committed screenshots without a row: M3a's
initial baselines (row V0) and M14's approved set. It starts empty in M0. Only M3a and M14 add lines.
