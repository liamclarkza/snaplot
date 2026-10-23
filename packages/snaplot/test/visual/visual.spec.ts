/**
 * The visual gate (plan §11.3 G10): one screenshot per fixture shot, compared exactly against a
 * reference rendered from another ref (`npm run test:visual -- --against <ref>`), or at
 * `threshold: 0`, `maxDiffPixelRatio: 0.002` against the committed `-<platform>` baselines
 * (record.mjs).
 *
 * Each test carries two annotations that `scripts/overhaul/check-visual-diffs.mjs` reads from the
 * JSON report: `screenshot` (the shot name) and `fixture` (its fixture id).
 */
import { expect, test } from '@playwright/test';
import { SHOTS } from './fixtures';
import { openFixture, withFixturePage } from './helpers';

for (const shot of SHOTS) {
  test.describe(shot.name, () => {
    test.use({ deviceScaleFactor: shot.dpr, colorScheme: shot.scheme });

    test('matches its reference', async ({ page, playwright }, testInfo) => {
      testInfo.annotations.push(
        { type: 'screenshot', description: shot.name },
        { type: 'fixture', description: shot.fixture.id },
      );
      await withFixturePage(shot.fixture, shot, { page, playwright }, testInfo, async (p) => {
        const target = await openFixture(p, shot.fixture);
        await expect(target).toHaveScreenshot(shot.path);
      });
    });
  });
}
