// R1 "ML experiment tracker" (plan §10.1, §10.2): a chart per metric in one group, the run list
// showing, hiding and highlighting runs, the values at the cursor, the NaN marker of the run that
// diverged, and the shared checks (no overflow at 390 and 1280 px, no console errors,
// axe). Run against the built site: `npm run build && npm run build:site`, then
// `npx playwright test examples/experiment-tracker`.
import { expect, type Page, test } from '@playwright/test';
import { DIVERGED_AT, METRICS, RUNS } from '../../src/demos/experiment-tracker/runs';
import { BASE, DESKTOP, PHONE, seriousViolations, watch } from './page-checks';

const ROUTE = `${BASE}examples/experiment-tracker/`;

async function open(page: Page) {
  await page.goto(ROUTE);
  await page.locator('html[data-demo-ready]').waitFor({ timeout: 20_000 });
}

/** A chart's public state, read through the page's exposed handles. */
const state = (page: Page, metric: string) =>
  page.evaluate((m) => (globalThis as any).snaplotDemo.charts[m].getState(), metric);

test.describe('experiment-tracker', () => {
  test.use(DESKTOP);

  test('draws a chart per metric, each with every run, and no console problems', async ({
    page,
  }) => {
    const problems = watch(page);
    await open(page);
    await expect(page).toHaveTitle('ML experiment tracker · snaplot examples');
    await expect(page.locator('.xt-chart')).toHaveCount(METRICS.length);
    await expect(page.locator('.xt-run')).toHaveCount(RUNS.length);
    for (const metric of METRICS) {
      const { series } = await state(page, metric);
      expect(series.map((s: { id: string }) => s.id)).toEqual(RUNS.map((run) => run.id));
    }
    expect(problems).toEqual([]);
  });

  test('reads NaN for the run that diverged, from the step it did', async ({ page }) => {
    await open(page);
    // The latest values: every run's last step, NaN for the hot run.
    const row = page.locator('.xt-chart[data-metric="train/loss"] .xt-legend tbody tr', {
      hasText: 'lr-6e-4',
    });
    await expect(row).toContainText('NaN');
    const values = await page.evaluate((step) => {
      const chart = (globalThis as any).snaplotDemo.charts['train/loss'];
      chart.setCursor(step - 10);
      const before = chart.getCursor().points.find((p: any) => p.seriesId === 'lr-6e-4')?.y;
      chart.setCursor(step + 50);
      const after = chart.getCursor().points.find((p: any) => p.seriesId === 'lr-6e-4')?.y;
      return { before, after };
    }, DIVERGED_AT);
    expect(Number.isFinite(values.before)).toBe(true);
    expect(values.after).toBeNaN();
  });

  test('hovering a run highlights it in every chart; its eye hides it', async ({ page }) => {
    await open(page);
    await page.locator('.xt-run', { hasText: 'batch-2x' }).hover();
    for (const metric of METRICS) expect((await state(page, metric)).highlight).toBe('batch-2x');
    await page.locator('.xt-run', { hasText: 'batch-2x' }).click();
    const { series } = await state(page, 'eval/loss');
    expect(series.map((s: { id: string }) => s.id)).not.toContain('batch-2x');
  });

  test('a card shows each run’s value at the cursor, and the cursor is shared', async ({
    page,
  }) => {
    await open(page);
    const card = page.locator('.xt-chart[data-metric="eval/loss"]');
    const box = (await card.locator('canvas').first().boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(card.locator('.xt-step')).toContainText(/Step: \d/);
    await expect(card.locator('.xt-legend tbody tr')).toHaveCount(RUNS.length);
    const x = await page.evaluate(
      () => (globalThis as any).snaplotDemo.charts['train/loss'].getCursor().x,
    );
    expect(x).not.toBeNull();
  });

  test('passes axe and does not overflow at 1280 px', async ({ page }) => {
    await open(page);
    expect(await seriousViolations(page)).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('experiment-tracker on a phone', () => {
  test.use(PHONE);

  test('stacks the run list over one chart a row, without overflow', async ({ page }) => {
    await open(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const lefts = await page
      .locator('.xt-chart')
      .evaluateAll(
        (cards) => new Set(cards.map((c) => Math.round(c.getBoundingClientRect().left))).size,
      );
    expect(lefts).toBe(1);
  });
});
