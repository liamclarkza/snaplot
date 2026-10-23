/**
 * Spec-side helpers: open a fixture page, wait until it reports ready, and apply its pointer
 * position. Fixtures with `minFontSize` run in a persistent Chromium profile, because the
 * minimum font size is a profile preference with no CDP or launch-flag equivalent.
 */
import type { Locator, Page, PlaywrightWorkerArgs, TestInfo } from '@playwright/test';
import type { ColorScheme, Fixture } from './fixtures';
import { writeMinFontProfile } from './node-profile.mjs';
import './page-api';

export interface PageOptions {
  dpr: 1 | 2;
  scheme: ColorScheme;
}

/** Navigates to the fixture and resolves with its box once the app reports ready. */
export async function openFixture(page: Page, fixture: Fixture): Promise<Locator> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/index.html?fixture=${encodeURIComponent(fixture.id)}`);
  await page.waitForFunction(() => window.__snaplotFixture?.status !== 'loading', null, {
    timeout: 30_000,
  });
  const state = await page.evaluate(() => ({
    status: window.__snaplotFixture?.status,
    error: window.__snaplotFixture?.error,
  }));
  if (state.status !== 'ready') throw new Error(`${fixture.id} did not render: ${state.error}`);
  if (fixture.hover) {
    const { x, y } = fixture.hover;
    const point = await page.evaluate(([fx, fy]) => window.__snaplotFixture!.plotPoint(fx, fy), [
      x,
      y,
    ] as const);
    await page.mouse.move(point.x - 12, point.y);
    await page.mouse.move(point.x, point.y, { steps: 4 });
    await page.evaluate(() => window.__snaplotFixture!.frames(3));
  }
  if (errors.length > 0) throw new Error(`${fixture.id} threw: ${errors.join('\n')}`);
  return page.locator('#fixture');
}

/**
 * Runs `body` with a page for the fixture: the test's own page, or for `minFontSize` fixtures a
 * page in a fresh persistent profile with the same context options.
 */
export async function withFixturePage<T>(
  fixture: Fixture,
  options: PageOptions,
  args: { page: Page; playwright: PlaywrightWorkerArgs['playwright'] },
  testInfo: TestInfo,
  body: (page: Page) => Promise<T>,
): Promise<T> {
  if (!fixture.minFontSize) return body(args.page);
  const use = testInfo.project.use;
  const dir = testInfo.outputPath('profile');
  writeMinFontProfile(dir, fixture.minFontSize);
  // The headless shell ignores profile font preferences; full Chromium (new headless) honours them.
  const context = await args.playwright.chromium.launchPersistentContext(dir, {
    channel: 'chromium',
    headless: true,
    baseURL: use.baseURL,
    viewport: use.viewport ?? { width: 1280, height: 800 },
    deviceScaleFactor: options.dpr,
    colorScheme: options.scheme,
    reducedMotion: use.contextOptions?.reducedMotion ?? 'reduce',
    locale: use.locale,
    timezoneId: use.timezoneId,
  });
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    return await body(page);
  } finally {
    await context.close();
  }
}
