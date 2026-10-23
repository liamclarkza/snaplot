/**
 * Geometry specs over DOM label boxes (plan M3a scope 4). Platform-independent and blocking:
 * every fixture, at DPR 1 under the light scheme, runs the five checks of `checks.ts`.
 *
 * A check that today's code fails is listed in `expected/m<N>.ts` for its owning milestone as
 * `fails(...)`: its test carries `[<finding id>]` in the title and runs as `test.fail`. The fix
 * flips the entry to `fixed(...)`, and the passing test keeps the id as the finding's lock.
 */
import { expect, test } from '@playwright/test';
import { CHECK_ORDER, CHECKS, violations } from './checks';
import { knownFinding } from './expected';
import { FIXTURES, type Fixture } from './fixtures';
import { openFixture, withFixturePage } from './helpers';
import type { GeometryReport } from './page-api';

/** One page load per fixture and worker; the five checks of a fixture share it. */
const reports = new Map<string, Promise<GeometryReport>>();

function reportFor(
  fixture: Fixture,
  args: Parameters<typeof withFixturePage>[2],
  testInfo: Parameters<typeof withFixturePage>[3],
): Promise<GeometryReport> {
  let report = reports.get(fixture.id);
  if (!report) {
    report = withFixturePage(fixture, { dpr: 1, scheme: 'light' }, args, testInfo, async (p) => {
      await openFixture(p, fixture);
      return p.evaluate(() => window.__snaplotFixture!.geometry());
    });
    reports.set(fixture.id, report);
  }
  return report;
}

for (const fixture of FIXTURES) {
  test.describe(`${fixture.id} geometry`, () => {
    // Keep a fixture's checks in one worker so they share one page load.
    test.describe.configure({ mode: 'default' });

    for (const check of CHECK_ORDER) {
      const finding = knownFinding(fixture.id, check);
      const title = finding ? `${CHECKS[check]} [${finding.id}]` : CHECKS[check];

      test(title, async ({ page, playwright }, testInfo) => {
        const reason = fixture.skip?.[check];
        test.skip(reason !== undefined, reason);
        if (finding?.failing) test.fail(true, `[${finding.id}] owned by ${finding.owner}`);
        testInfo.annotations.push(
          { type: 'fixture', description: fixture.id },
          { type: 'check', description: check },
        );
        const report = await reportFor(fixture, { page, playwright }, testInfo);
        expect(violations(report, check), `${fixture.id}: ${CHECKS[check]}`).toEqual([]);
      });
    }
  });
}
