// V2 "Was summer 2025 unusually hot in Central Park?" (plan §10.2): the task, done in the page.
// Build first (`npm run build && npm run build:site`). The expected numbers are recomputed here
// from summer.json, without answer.ts.
import { expect, type Page, test } from '@playwright/test';
import {
  DESKTOP,
  darkSchemeInk,
  dataFile,
  demoPageChecks,
  openDemo,
  PHONE,
  paintedPixels,
} from './page-checks';

const SLUG = 'central-park-summer';

interface Climate {
  day: string;
  recordHigh: number;
  recordLow: number;
  normalP10: number;
  normalMedian: number;
  normalP90: number;
}
const data = JSON.parse(dataFile(SLUG, 'summer.json')) as {
  climatology: Climate[];
  summer2025: { date: string; high: number; low: number }[];
};
const climate = new Map(data.climatology.map((c) => [c.day, c]));
const days = data.summer2025.map((d) => ({ ...d, c: climate.get(d.date.slice(5)) as Climate }));

type Demo = {
  container: HTMLElement;
  scale(key: string): { toPixel(v: string | number): number } | undefined;
  getState(): { viewport: object; series: { id: string; color: string; fill: string | null }[] };
};
const demo = (page: Page) =>
  page.evaluate(() => {
    const chart = (window as unknown as { demo: Demo }).demo;
    return { viewport: chart.getState().viewport, series: chart.getState().series };
  });

/** The client position of a day at a temperature. */
function at(page: Page, date: string, temperature: number) {
  return page.evaluate(
    ([d, t]) => {
      const chart = (window as unknown as { demo: Demo }).demo;
      const box = chart.container.getBoundingClientRect();
      return {
        x: box.left + (chart.scale('x')?.toPixel(d as string) ?? 0),
        y: box.top + (chart.scale('y')?.toPixel(t as number) ?? 0),
      };
    },
    [date, temperature] as const,
  );
}

test.describe(`[demos-03] ${SLUG}`, () => {
  demoPageChecks({
    slug: SLUG,
    summaries: ['[data-part="answer"]', '[data-part="records"]', '[data-part="key"]', '.byline'],
    freshness: '.byline',
  });

  // M11 (D4): `theme: 'auto'` follows the page the chart sits on; flip this when it merges.
  test("[visuals-03] a dark system scheme leaves the light page's charts light", async ({
    browser,
  }) => {
    expect(await darkSchemeInk(browser, SLUG)).toBeLessThan(0.5);
  });

  test.describe('the task', () => {
    test.use(DESKTOP);

    test('the headline question is answered with numbers recomputed from the data', async ({
      page,
    }) => {
      await openDemo(page, SLUG);
      await expect(page.locator('h1')).toHaveText('Was summer 2025 unusually hot in Central Park?');
      const above = days.filter((d) => d.high > d.c.normalP90).length;
      const anomaly = days.reduce((sum, d) => sum + d.high - d.c.normalMedian, 0) / days.length;
      const side = anomaly >= 0 ? 'above' : 'below';
      await expect(page.locator('[data-part="answer"]')).toHaveText(
        `${above} days between June and August 2025 had highs above the normal range; the mean high was ${Math.abs(anomaly).toFixed(1)} °F ${side} the 1991–2020 median.`,
      );
      // Every day at or over its 1869–2024 record high is named.
      const records = days.filter((d) => d.high >= d.c.recordHigh);
      expect(records.length).toBeGreaterThan(0);
      for (const d of records) {
        const when = new Date(`${d.date}T00:00:00Z`).toLocaleDateString('en-US', {
          timeZone: 'UTC',
          month: 'long',
          day: 'numeric',
        });
        await expect(page.locator('[data-part="records"]')).toContainText(when);
      }
    });

    test('the plugin draws each day from its low to its high on the public scale', async ({
      page,
    }) => {
      await openDemo(page, SLUG);
      // The data canvas is opaque where the bar is: sample the middle of three bars.
      for (const d of [days[1], days[45], days[90]]) {
        if (!d) continue;
        const mid = await at(page, d.date, (d.high + d.low) / 2);
        const colour = await page.evaluate(({ x, y }) => {
          const chart = (window as unknown as { demo: Demo }).demo;
          const box = chart.container.getBoundingClientRect();
          let darkest = 255;
          for (const canvas of chart.container.querySelectorAll('canvas')) {
            const scale = canvas.width / canvas.getBoundingClientRect().width;
            const ctx = canvas.getContext('2d');
            if (!ctx) continue;
            const [r = 255, g = 255, b = 255, a = 0] = ctx.getImageData(
              Math.round((x - box.left) * scale),
              Math.round((y - box.top) * scale),
              1,
              1,
            ).data;
            if (a > 200) darkest = Math.min(darkest, (r + g + b) / 3);
          }
          return darkest;
        }, mid);
        expect(colour, d.date).toBeLessThan(110);
      }
    });

    test('the reading key takes its colours from the chart', async ({ page }) => {
      await openDemo(page, SLUG);
      const { series } = await demo(page);
      for (const s of series) {
        const item = page.locator(`[data-part="key"] [data-series="${s.id}"]`);
        if ((await item.count()) === 0) continue;
        const swatch = await item
          .locator('.key-swatch')
          .evaluate((el) => getComputedStyle(el).getPropertyValue('--swatch').trim());
        expect(swatch, s.id).toBe(s.fill ?? s.color);
      }
      await expect(page.locator('[data-part="key"] [data-series="record-high"]')).toHaveCount(1);
    });

    test('the palette is greys plus one red and one blue (§10.2)', async ({ page }) => {
      await openDemo(page, SLUG);
      const { series } = await demo(page);
      const channels = (css: string) =>
        css.startsWith('#')
          ? [1, 3, 5].map((i) => Number.parseInt(css.slice(i, i + 2), 16))
          : (css.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
      const colour = (id: string) => series.find((s) => s.id === id)?.color.toLowerCase();
      for (const s of series.filter((s) => !s.id.startsWith('record-'))) {
        // A grey: its channels differ by no more than the page's own warm greys do.
        const [r = 0, g = 0, b = 0] = channels(s.fill ?? s.color);
        expect(Math.max(r, g, b) - Math.min(r, g, b), s.id).toBeLessThanOrEqual(16);
      }
      expect(colour('record-high')).toBe('#c0392b');
      expect(colour('record-low')).toBe('#2e6db4');
    });

    test('a day reads like a weather table, and the chart stays read-only', async ({ page }) => {
      await openDemo(page, SLUG);
      const june24 = days.find((d) => d.date === '2025-06-24');
      if (!june24) throw new Error('no June 24');
      // At the day's normal median, where the tooltip shows today and anywhere along X after M12a.
      const point = await at(page, june24.date, june24.c.normalMedian);
      await page.mouse.move(point.x, point.y);
      const tip = page.locator('.weather-tip');
      await expect(tip).toBeVisible();
      await expect(tip).toContainText('Tue, June 24');
      await expect(tip).toContainText(`High ${june24.high} °F, low ${june24.low} °F`);
      await expect(tip).toContainText('A new record high');
      // Read-only: a drag neither zooms nor selects.
      await page.mouse.down();
      await page.mouse.move(point.x + 200, point.y + 40, { steps: 5 });
      await page.mouse.up();
      expect((await demo(page)).viewport).toEqual({});
    });

    test('printing shows the chart', async ({ page }) => {
      await openDemo(page, SLUG);
      await page.emulateMedia({ media: 'print' });
      await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
      await expect.poll(() => paintedPixels(page, '[data-part="chart"]')).toBeGreaterThan(50_000);
      const pdf = await page.pdf({ format: 'Letter', landscape: true });
      expect(pdf.length).toBeGreaterThan(20_000);
    });
  });

  test.describe('on a phone', () => {
    test.use(PHONE);

    test('tapping a day reads its numbers, as the touch help text says', async ({ page }) => {
      await openDemo(page, SLUG);
      await expect(page.locator('.hint-touch')).toHaveText('Tap a day to read its numbers.');
      await expect(page.locator('.hint-touch')).toBeVisible();
      const june24 = days.find((d) => d.date === '2025-06-24');
      if (!june24) throw new Error('no June 24');
      await page.locator('[data-part="chart"]').scrollIntoViewIfNeeded();
      const point = await at(page, june24.date, june24.c.normalMedian);
      // A finger rests on the glass for a moment. Playwright's tap lifts at once, and a contact
      // that short shows no reading (one of 50 ms or more does, and keeps it after the lift).
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await page.waitForTimeout(80);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      // The reading stays after the finger lifts.
      await page.waitForTimeout(300);
      await expect(page.locator('.weather-tip')).toBeVisible();
      await expect(page.locator('.weather-tip')).toContainText('June 24');
    });
  });
});
