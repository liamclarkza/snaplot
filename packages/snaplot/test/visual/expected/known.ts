/**
 * Finding ids attached to geometry checks (plan M3a scope 4, P12).
 *
 * - `fails(...)`: today's code fails the check. Its test runs as `test.fail(true, '[<id>] …')`
 *   with `[<id>]` in the title, so an unexpected pass turns the run red.
 * - `fixed(...)`: the fix landed. The fixing commit flips `fails(` to `fixed(` on the same line,
 *   so the now-passing test keeps `[<id>]` in its title as the finding's lock (trace-check).
 *
 * One file per owning milestone, so parallel tracks never edit the same file: `m7.ts`, `m10.ts`
 * (axes, ticks, domains, time, annotations), `m11.ts` (marks, theme, surface, sizing), `m12a.ts`
 * (hit test, hover, tooltip). Every entry is one call on one line,
 * `fails('<owner>', '<fixture id>', '<check>', '<finding id>')`, so `scripts/ledger.mjs` can list
 * the expected failures without running Playwright.
 */
import type { GeometryCheck } from '../fixtures/types';

export interface KnownFinding {
  owner: string;
  fixture: string;
  check: GeometryCheck;
  /** Finding id, or `<id>:<part>` for a part-tagged finding. */
  id: string;
  /** True while today's code still fails the check. */
  failing: boolean;
}

export function fails(
  owner: string,
  fixture: string,
  check: GeometryCheck,
  id: string,
): KnownFinding {
  return { owner, fixture, check, id, failing: true };
}

export function fixed(
  owner: string,
  fixture: string,
  check: GeometryCheck,
  id: string,
): KnownFinding {
  return { owner, fixture, check, id, failing: false };
}
