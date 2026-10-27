// "When does the rocket hit Max-Q?" (max-q): the task, done in the page. Build first (`npm run
// build && npm run build:site`). The expected numbers are recounted here from the flight model's
// frames, without answer.ts.
import { expect, type Page, test } from '@playwright/test';
import { fly } from '../../src/demos/max-q/flight';
import { BASE, DESKTOP, demoPageChecks, openDemo, PHONE, watch } from './page-checks';

const SLUG = 'max-q';
const flight = fly();
const maxQ = flight.frames.reduce((best, f) => (f.q > best.q ? f : best));
const seco = flight.events.find((e) => e.id === 'seco')!.t;
const mmss = (t: number) =>
  `T+${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

type Demo = {
  charts: Record<'ascent' | 'pressure' | 'accel' | 'trajectory', { container: HTMLElement }>;
  replay: { time: number; skip(): void; restart(): void; pause(): void };
};
const replayTime = (page: Page) =>
  page.evaluate(() => (window as unknown as { demo: Demo }).demo.replay.time);

test.describe(`[demos-03] ${SLUG}`, () => {
  demoPageChecks({
    slug: SLUG,
    summaries: ['[data-part="answer"]', '[data-part="highlights"]', '[data-part="tile-speed"]'],
    freshness: '.mission-badge',
  });

  test.describe('the task', () => {
    test.use(DESKTOP);

    test('the answer states Max-Q as a scan of the flight finds it', async ({ page }) => {
      await openDemo(page, SLUG);
      const answer = page.locator('[data-part="answer"]');
      await expect(answer).toContainText(`Max-Q comes at ${mmss(maxQ.t)}`);
      await expect(answer).toContainText(`${maxQ.altitude.toFixed(1)} km up`);
      await expect(answer).toContainText(`${maxQ.q.toFixed(1)} kPa`);
    });

    test('the replay streams the flight in and stops at SECO', async ({ page }) => {
      const problems = watch(page);
      await openDemo(page, SLUG);
      await expect(page.locator('main')).toHaveAttribute('data-state', 'playing');
      await page.getByRole('button', { name: '50×' }).click();
      await expect.poll(() => replayTime(page), { timeout: 20_000 }).toBeGreaterThan(60);
      await page.getByRole('button', { name: 'Skip to orbit' }).click();
      await expect(page.locator('main')).toHaveAttribute('data-state', 'done');
      expect(await replayTime(page)).toBeCloseTo(seco, 1);
      await expect(page.locator('[data-part="clock"]')).toHaveText(mmss(seco));
      await expect(page.locator('[data-part="stage"]')).toHaveText('In orbit');
      // Every event chip has lit and can be picked.
      for (const chip of await page.locator('[data-event]').all()) {
        await expect(chip).toHaveAttribute('data-state', 'passed');
        await expect(chip).toBeEnabled();
      }
      expect(problems).toEqual([]);
    });

    test('pointing at a chart reads every instrument at that moment', async ({ page }) => {
      await page.goto(`${BASE}examples/${SLUG}/?t=end`);
      await page.waitForFunction(() => 'demo' in window);
      const box = await page.locator('[data-part="pressure"]').boundingBox();
      if (!box) throw new Error('no pressure chart');
      await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
      await expect(page.locator('main')).toHaveAttribute('data-readout', 'cursor');
      await expect(page.locator('[data-part="readout-note"]')).toContainText('At T+');
      await page.mouse.move(0, 0);
      await expect(page.locator('main')).toHaveAttribute('data-readout', 'live');
    });

    test('an event chip zooms the time charts to the minute around it', async ({ page }) => {
      await page.goto(`${BASE}examples/${SLUG}/?t=end`);
      await page.waitForFunction(() => 'demo' in window);
      await page.locator('[data-event="meco"]').click();
      const meco = flight.events.find((e) => e.id === 'meco')!.t;
      const range = await page.evaluate(() => {
        const demo = (
          window as unknown as {
            demo: { charts: { accel: { scale(k: string): { min: number; max: number } } } };
          }
        ).demo;
        const x = demo.charts.accel.scale('x');
        return [x.min, x.max];
      });
      expect(range[0]).toBeCloseTo(meco - 30, 0);
      expect(range[1]).toBeCloseTo(meco + 30, 0);
      await page.getByRole('button', { name: 'Whole flight' }).click();
    });
  });

  test.describe('on a phone', () => {
    test.use(PHONE);

    test('the readings fit two to a row and the clock stays in the bar', async ({ page }) => {
      await page.goto(`${BASE}examples/${SLUG}/?t=end`);
      await page.waitForFunction(() => 'demo' in window);
      const rows = await page
        .locator('.reading')
        .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
      expect(new Set(rows).size).toBe(3);
      await expect(page.locator('[data-part="clock"]')).toBeInViewport();
    });
  });
});
