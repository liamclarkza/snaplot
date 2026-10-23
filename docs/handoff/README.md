# Milestone handoffs

Every overhaul milestone writes exactly one file here, `m<N>.md` (lowercase id: `m0`, `m3a`, `m16b`), before it
asks the integrator to merge. Nobody edits another milestone's file. M17 concatenates them into
`docs/overhaul-handoff.md`. A run that stops early writes `stop.md` (plan §12.0, "Stop line").

Copy the template below. Keep every heading, even when its section is "None".

```md
# M<N>: <milestone title>

- **Branch:** `ovh/m<N>-<slug>` · **Worktree:** `.claude/worktrees/m<N>` · **Base:** `<sha>` (`overhaul` at start)
- **Status:** complete | partial | blocked

## Summary

What changed and why, in a few bullets. List the commits (short SHA and subject, oldest first) and the
finding ids this milestone closes.

## Gates

Each gate command the plan requires for this milestone, with the tail of its real output pasted in a code
block (not a paraphrase): `npm run verify`, `git rebase -x … <base>`, `node scripts/overhaul/metrics.mjs`, and
the milestone's own exit commands. Mark a noisy or skipped gate as such, with the reason (EXECUTION.md rule 3).

## Visual-ledger rows

The `V<n>` rows this milestone added, one line each (id, commit subject, fixtures), or "None".

## Requests for integrator

Changes needed outside this milestone's owned paths, merge-order notes, and any isolated
`chore(<scope>): integrator request — <what>` commits. "None" if there are none.

## Known gaps

What is not done, with the ledger `it.fails` / `test.fail` ids that track it, and the milestone that should
pick it up. "None" if complete.

## Data notes

Demo data, datasets, downloads, caches and anything regenerated (with commands), or "None".

## Human steps

Actions only a person can take (pushing, publishing, creating issues or PRs, pinning Actions, enabling Pages,
real-device checks, approving visual changes), or "None".
```
