// "Was 2024 the hottest year on record?" (hottest-year): the task, done in the page. Build first
// (`npm run build && npm run build:site`). The expected numbers are recounted here from daily.json,
// without answer.ts, and checked against the figures C3S published (oracle.json).
import { expect, test } from '@playwright/test';
import { BASE, DESKTOP, dataFile, demoPageChecks, openDemo, PHONE, watch } from './page-checks';

const SLUG = 'hottest-year';
const file = JSON.parse(dataFile(SLUG, 'daily.json')) as {
  start: string;
  temps: number[];
};
const oracle = JSON.parse(dataFile(SLUG, 'oracle.json')) as {
  year2024: { mean: number; anomaly: number };
  warmestDay: { date: string; temp: number };
};
const DAY = 86_400_000;
const start = Date.parse(`${file.start}T00:00:00Z`);
const dates = file.temps.map((_, i) => new Date(start + i * DAY).toISOString().slice(0, 10));
/** Each year's mean, recounted. */
const means = new Map<number, { sum: number; n: number }>();
file.temps.forEach((t, i) => {
  const year = Number(dates[i].slice(0, 4));
  const m = means.get(year) ?? { sum: 0, n: 0 };
  m.sum += t;
  m.n++;
  means.set(year, m);
});
const complete = [...means].filter(([, m]) => m.n >= 365);
const [warmestYear, warmestMean] = complete
  .map(([year, m]) => [year, m.sum / m.n] as const)
  .reduce((best, y) => (y[1] > best[1] ? y : best));
const hottest = file.temps.reduce((best, t, i) => (t > file.temps[best] ? i : best), 0);

test.describe(`[demos-03] ${SLUG}`, () => {
  demoPageChecks({
    slug: SLUG,
    summaries: ['[data-part="answer"]', '[data-part="detail"]', '[data-part="chosen"]'],
    freshness: '.through',
  });

  test.describe('the task', () => {
    test.use(DESKTOP);

    test('the answer matches a recount and the published figures', async ({ page }) => {
      await openDemo(page, SLUG);
      // The recount agrees with C3S: 2024, 15.10 °C; the warmest day 22 July 2024, 17.16 °C.
      expect(warmestYear).toBe(2024);
      expect(warmestMean.toFixed(2)).toBe(oracle.year2024.mean.toFixed(2));
      expect(dates[hottest]).toBe(oracle.warmestDay.date);
      expect(file.temps[hottest].toFixed(2)).toBe(oracle.warmestDay.temp.toFixed(2));
      await expect(page.locator('[data-part="answer"]')).toHaveText(
        `Yes. 2024 averaged 15.10 °C, ${oracle.year2024.anomaly.toFixed(2)} °C above the 1991–2020 average, the warmest of the ${complete.length} complete years since 1940.`,
      );
      await expect(page.locator('[data-part="stat-day-date"]')).toHaveText('22 July 2024');
    });

    test('a click on a stripe follows that year on the lines', async ({ page }) => {
      const problems = watch(page);
      await openDemo(page, SLUG);
      await expect(page.locator('main')).toHaveAttribute('data-chosen', '2024');
      // 1960 sits a fifth of the way along the stripes' 1939.5–(last + 0.5) axis.
      const x = await page.evaluate(() => {
        const demo = (
          window as unknown as {
            demo: { stripes: { scale(k: string): { toPixel(v: number): number } } };
          }
        ).demo;
        return demo.stripes.scale('x').toPixel(1960);
      });
      const box = await page.locator('[data-part="stripes"]').boundingBox();
      if (!box) throw new Error('no stripes');
      await page.mouse.click(box.x + x, box.y + box.height * 0.5);
      await expect(page.locator('main')).toHaveAttribute('data-chosen', /^19(59|60|61)$/);
      await expect(page.locator('[data-part="year"]')).toHaveValue(/^19(59|60|61)$/);
      const highlight = await page.evaluate(() => {
        const demo = (
          window as unknown as {
            demo: { lines: { getState(): { highlight: string | null } } };
          }
        ).demo;
        return demo.lines.getState().highlight;
      });
      expect(highlight).toMatch(/^y19(59|60|61)$/);
      expect(problems).toEqual([]);
    });

    test('the year menu lists every year, newest first', async ({ page }) => {
      await openDemo(page, SLUG);
      const options = page.locator('[data-part="year"] option');
      await expect(options).toHaveCount(means.size);
      await expect(options.last()).toHaveText('1940');
      await page.locator('[data-part="year"]').selectOption('2016');
      await expect(page.locator('main')).toHaveAttribute('data-chosen', '2016');
    });
  });

  test.describe('on a phone', () => {
    test.use(PHONE);

    test('the four figures sit two to a row', async ({ page }) => {
      await page.goto(`${BASE}examples/${SLUG}/`);
      await page.waitForFunction(() => 'demo' in window);
      const rows = await page
        .locator('.stat')
        .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
      expect(new Set(rows).size).toBe(2);
    });
  });
});
