> **M0 snapshot, not the working copy.** Overhaul milestone M0 copied this file verbatim (everything below
> this note) from the local, gitignored `notes/overhaul-audit/EXECUTION.md`. That working copy is the one
> agents read, and the orchestrator may amend it; this snapshot is not kept in sync. "`plan.md` in this
> folder" below means `notes/overhaul-audit/plan.md`, snapshotted as [`overhaul-plan.md`](overhaul-plan.md).
> M17 decides whether this file stays, is refreshed or is removed (ADR 0002).

# Execution addendum (read with plan.md; this file wins where they conflict)

The overhaul plan (`plan.md` in this folder) is executed by Claude Code workflow agents. The maintainer asked:
"implement all the changes you would recommend taking in a local branch (don't push)". There is no human in the loop
until the end. These rules simplify the plan's *process* without changing its *product* decisions (§1–§10).

## Roles and paths

- **Main checkout:** `/Users/liam/Projects/snaplot`, branch `overhaul`. Only the integrator writes to `overhaul`, by
  fast-forward merges and tags. Nobody edits files in the main checkout directly except the integrator during a merge.
- **A "session" in the plan = one agent.** Each milestone is implemented by one agent in its own worktree, then checked
  by an independent reviewer agent, then fixed, then merged by an integrator agent.
- **Worktree:** `/Users/liam/Projects/snaplot/.claude/worktrees/m<N>` on branch `ovh/m<N>-<slug>` (lowercase milestone
  id, e.g. `m3a`, `m16b`), created from the current `overhaul` tip:
  `git -C /Users/liam/Projects/snaplot worktree add /Users/liam/Projects/snaplot/.claude/worktrees/m<N> -b ovh/m<N>-<slug> overhaul`
  then `cd` there and `npm ci` (or `npm install` if the lockfile is being changed by your milestone).
- **Plan and evidence:** `/Users/liam/Projects/snaplot/notes/overhaul-audit/` (gitignored, main checkout only — read by
  absolute path from worktrees). Audit file:line references point at tag `overhaul-baseline` (= 6237289); read them with
  `git show overhaul-baseline:<path>` and find current code by symbol.
- **Scratchpad of the planning session** (may disappear; M0 harvests it):
  `/private/tmp/claude-501/-Users-liam-Projects-snaplot/76647906-acb8-4a29-8fd6-6a20ecda8e45/scratchpad/`.

## Resumability (important)

Runs can be interrupted by usage limits and restarted with the same brief. So:
- If your worktree already exists, do NOT recreate it. Inspect `git -C <wt> log --oneline overhaul..HEAD`,
  `git status`, and `docs/handoff/m<N>.md`, and continue from where the previous attempt stopped.
- Commit at every plan commit boundary (and more often for long commits), so a restart loses little.
- Uncommitted work found on restart: review it, keep what is correct, finish it.

## Process simplifications (override the plan)

1. **Visual gate platform: local macOS Chromium** through `@playwright/test`. No Docker. Baselines are the `-darwin`
   variants. `scripts/visual-docker.sh` may exist for CI/Linux, but agents never need to run it. CI's visual job stays
   advisory; the final handoff tells the maintainer to refresh Linux baselines with the `update-snapshots` workflow.
2. **Backups:** `/Users/liam/Projects/snaplot/.claude/backups/` (gitignored), not a sibling directory.
3. **Bench under contention:** other agents run in parallel, so timings are noisy. Run the A/B the plan asks for under
   the bench lock. If a ratio fails, re-run once. If it still fails and your milestone did not touch that hot path,
   record "noisy — recheck at M14" in the handoff instead of blocking. Absolute budgets are recorded (met/missed), and
   only become blocking in M14's quiet run (the orchestrator runs M14 with nothing else running). Call-count guards
   (debug counters) are deterministic and ARE blocking.
4. **`git rebase -x` per-commit proof:** run it for serial milestones and for any milestone with more than 6 commits;
   otherwise running the full gates at the tip is enough. Never bypass the pre-commit hook.
5. **Timebox / context:** if you are running low on context or the milestone is far larger than estimated, stop at a
   green prefix, commit, record the rest under "Known gaps" in the handoff (with ledger `it.fails` entries where
   relevant), and return status `partial`. The orchestrator schedules a follow-up.
6. **Ports:** if you start a dev/preview server, use port `5300 + n` where n is your milestone number (M0=0 … M17=17;
   a/b/c add 30/60/90, e.g. M16b = 5376, M3a = 5333), bind `127.0.0.1`, and kill it before you return.
   Playwright `webServer` configs must honour `PORT` env so parallel worktrees do not collide.
7. **Taste:** never apply the D22 "proposals, not applied" (frame removal, lineWidth 2, opaque bars, auto axis titles).

## Hard rules

- Never: `git push`, `npm publish`, `git clean -x`/`-X`, `git reset --hard` on `overhaul`, `git branch -D`,
  `git tag -f`/`-d` on `overhaul-baseline` or `ovh-*` tags, `git gc --prune=now`, `git worktree remove --force` on a
  dirty worktree, `--no-verify`. Never touch `main`, `revamp/v1-prep` or remotes.
- Never `rm -rf` untracked or ignored files outside your own worktree (this overrides plan M0 step 6). Leftover
  directories in the main checkout are moved aside reversibly into `/Users/liam/Projects/snaplot/.claude/backups/leftovers/`.
  Tracked files are deleted with `git rm` in your worktree as the plan says.
- Commit identity is the repo-local `Liam <liam.james.clark@gmail.com>`; verify with `git config user.email` in your
  worktree. Conventional Commits with the plan's scopes. No co-author or tool trailers.
- Installing npm packages: exact versions at least 14 days old (`npm view <pkg> time`), only when your milestone owns
  the package.json you change. Do not download anything else except demo datasets listed in the plan.
- `docs/handoff/m<N>.md` is required (Summary, Gates with pasted output tails, Visual-ledger rows, Requests for
  integrator, Known gaps, Data notes, Human steps).
- Edit only paths your milestone owns (plan §12). If you must touch something else to stay green, keep it minimal and
  list it under "Requests for integrator".

## What to return

Your final message is parsed by the orchestrator. Return the structured result you are asked for, with the branch,
worktree path, commit list, gate results, status (`complete` | `partial` | `blocked`) and the handoff path.
