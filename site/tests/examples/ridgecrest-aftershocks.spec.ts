// V1 "How fast did the Ridgecrest aftershocks die down?" (plan §10.2): the task, done in the page.
// Build first (`npm run build && npm run build:site`); `npm run test:smoke -w site` runs this with
// the smoke spec. The expected numbers are recounted here from events.csv, without answer.ts.
import { expect, type Page, test } from '@playwright/test';
import {
  BASE,
  DESKTOP,
  darkSchemeInk,
  dataFile,
  demoPageChecks,
  openDemo,
  PHONE,
  watch,
} from './page-checks';

const SLUG = 'ridgecrest-aftershocks';
const DAY = 86_400_000;
const START = Date.UTC(2019, 6, 1);
const END = Date.UTC(2019, 8, 30);
const M71 = { id: 'ci38457511', time: Date.UTC(2019, 6, 6, 3, 19, 53, 40) };

/** M≥2.5 origin times from events.csv, sorted. */
const times = dataFile(SLUG, 'events.csv')
  .trim()
  .split('\n')
  .slice(1)
  .map((line) => line.split(','))
  .filter((cols) => Number(cols[4]) >= 2.5)
  .map((cols) => Number(cols[0]))
  .sort((a, b) => a - b);

/** An independent recount of the decay numbers for the window [from, to). */
function recount(from: number, to: number) {
  const inside = times.filter((t) => t >= from && t < to);
  const days = new Map<number, number>();
  for (let d = Math.floor(from / DAY) * DAY; d < to; d += DAY) days.set(d, 0);
  for (const t of inside) {
    const d = Math.floor(t / DAY) * DAY;
    days.set(d, (days.get(d) ?? 0) + 1);
  }
  const [peakDay, peak] = [...days].reduce((best, day) => (day[1] > best[1] ? day : best));
  const below = [...days].find(([day, count]) => day > peakDay && count * 10 < peak)?.[0];
  const half = inside[Math.ceil(inside.length / 2) - 1] ?? Number.NaN;
  return {
    total: inside.length,
    peak,
    peakDay,
    below,
    daysAfter: below === undefined ? undefined : Math.round((below - peakDay) / DAY),
    halfDays: (half - (inside[0] ?? Number.NaN)) / DAY,
  };
}

const longDate = (t: number) =>
  new Date(t).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long' });

type Demo = {
  strip: {
    getState(): { selection: { x: [number, number] } | null };
    container: HTMLElement;
    scale(key: string): { toPixel(v: number): number } | undefined;
  };
  scatter: {
    container: HTMLElement;
    scale(key: string): { min: number; max: number; toPixel(v: number): number } | undefined;
    getCursor(): { formattedX: string };
  };
};

async function brushWithMouse(page: Page, fromShare: number, toShare: number) {
  const box = await page.locator('[data-part="strip"]').boundingBox();
  if (!box) throw new Error('no strip');
  const y = box.y + box.height * 0.5;
  await page.mouse.move(box.x + box.width * fromShare, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * ((fromShare + toShare) / 2), y, { steps: 6 });
  await page.mouse.move(box.x + box.width * toShare, y, { steps: 6 });
  await page.mouse.up();
}

const answer = (page: Page) => page.locator('[data-part="answer"]');

test.describe(`[demos-03] ${SLUG}`, () => {
  demoPageChecks({
    slug: SLUG,
    summaries: ['[data-part="answer"]', '[data-part="window"]', '.event-meta'],
    freshness: '.event-meta',
  });

  test.describe('the task', () => {
    test.use(DESKTOP);

    test('the readout states the decay numbers of an independent recount', async ({ page }) => {
      await openDemo(page, SLUG);
      const expected = recount(START, END);
      // The plan's oracle: USGS /count gave 1,239 M≥2.5 events on 6 July (oracle.json).
      const oracle = JSON.parse(dataFile(SLUG, 'oracle.json')) as {
        days: { day: string; count: number }[];
      };
      expect(expected.peak).toBe(oracle.days.find((d) => d.day === '2019-07-06')?.count);
      await expect(answer(page)).toHaveText(
        `Daily M≥2.5 count fell below 10% of its peak (${expected.peak}) on ${longDate(
          expected.below ?? 0,
        )}, ${expected.daysAfter} days after the M7.1; half of the 3-month total came in the first ${expected.halfDays.toFixed(1)} days.`,
      );
    });

    test('brushing the strip moves the scatter to the window and recounts it in under 50 ms', async ({
      page,
    }) => {
      const problems = watch(page);
      await openDemo(page, SLUG);
      await brushWithMouse(page, 0.3, 0.6);
      await expect(page.locator('[data-part="whole"]')).toBeVisible();
      const from = Number(await answer(page).getAttribute('data-from'));
      const to = Number(await answer(page).getAttribute('data-to'));
      expect(to - from).toBeGreaterThan(10 * DAY);
      const selection = await page.evaluate(
        () => (window as unknown as { demo: Demo }).demo.strip.getState().selection,
      );
      expect(selection?.x.map(Number)).toEqual([from, to]);
      // The scatter shows exactly the window.
      await expect
        .poll(() =>
          page.evaluate(() => {
            const x = (window as unknown as { demo: Demo }).demo.scatter.scale('x');
            return x ? [x.min, x.max] : null;
          }),
        )
        .toEqual([from, to]);
      // The readout gives the same two numbers for the window, recounted here.
      const expected = recount(from, to);
      const text = await answer(page).innerText();
      expect(text).toContain(`(${expected.peak})`);
      if (expected.below !== undefined) expect(text).toContain(longDate(expected.below));
      expect(text).toContain(`window's ${expected.total} events`);
      if (expected.halfDays >= 1) expect(text).toContain(`${expected.halfDays.toFixed(1)} days`);
      // Every pane updated within one frame budget: the measure ends after the charts' paint.
      const durations = await page.evaluate(() =>
        performance.getEntriesByName('ridgecrest:brush', 'measure').map((m) => m.duration),
      );
      expect(durations.length).toBeGreaterThanOrEqual(2);
      expect(durations.at(-1)).toBeLessThan(50);
      // Back to the whole sequence.
      await page.locator('[data-part="whole"]').click();
      await expect(answer(page)).toContainText('3-month total');
      await expect(page.locator('[data-part="whole"]')).toBeHidden();
      expect(problems).toEqual([]);
    });

    test('clicking a point opens its USGS event page', async ({ page }) => {
      await page.addInitScript(() => {
        const opened: string[] = [];
        Object.assign(window, { opened });
        window.open = (url?: string | URL) => {
          opened.push(String(url));
          return null;
        };
      });
      await openDemo(page, SLUG);
      // The M7.1 stands alone at the top of the scatter.
      const at = await page.evaluate((m71) => {
        const { scatter } = (window as unknown as { demo: Demo }).demo;
        const box = scatter.container.getBoundingClientRect();
        return {
          x: box.left + (scatter.scale('x')?.toPixel(m71.time) ?? 0),
          y: box.top + (scatter.scale('y')?.toPixel(7.1) ?? 0),
        };
      }, M71);
      await page.mouse.click(at.x, at.y);
      expect(await page.evaluate(() => (window as unknown as { opened: string[] }).opened)).toEqual(
        [`https://earthquake.usgs.gov/earthquakes/eventpage/${M71.id}`],
      );
    });

    test('[demos-07] times read in UTC whatever the viewer’s zone (Asia/Tokyo)', async ({
      browser,
    }) => {
      const context = await browser.newContext({ ...DESKTOP, timezoneId: 'Asia/Tokyo' });
      const page = await context.newPage();
      await openDemo(page, SLUG);
      const at = await page.evaluate((m71) => {
        const { scatter } = (window as unknown as { demo: Demo }).demo;
        const box = scatter.container.getBoundingClientRect();
        return {
          x: box.left + (scatter.scale('x')?.toPixel(m71.time) ?? 0),
          y: box.top + (scatter.scale('y')?.toPixel(7.1) ?? 0),
        };
      }, M71);
      await page.mouse.move(at.x, at.y);
      const formatted = await page.evaluate(
        () => (window as unknown as { demo: Demo }).demo.scatter.getCursor().formattedX,
      );
      // 03:19 UTC on 6 July 2019, whatever the locale's hour style.
      expect(formatted).toMatch(/Jul 6, 2019.*\b0?3:19\b/);
      await context.close();
    });

    // M12b gives a categorical colorBy static legend items; flip this when it merges.
    test('[dxtrial-13:categorical] the built-in legend names the three depth bands', async ({
      page,
    }) => {
      test.fail(true, '[dxtrial-13:categorical][backlog-15:categorical] M12b: no legend items');
      await openDemo(page, SLUG);
      const legend = page.locator('[data-part="scatter"]');
      for (const band of ['0–5 km', '5–10 km', '>10 km']) await expect(legend).toContainText(band);
    });
  });

  // M11 (D4): `theme: 'auto'` follows the page the chart sits on; flip this when it merges.
  test("[visuals-03] a dark system scheme leaves the light page's charts light", async ({
    browser,
  }) => {
    test.fail(true, '[visuals-03] M11: theme auto follows the system, not the page');
    expect(await darkSchemeInk(browser, SLUG)).toBeLessThan(0.5);
  });

  test.describe('on a phone', () => {
    test.use(PHONE);

    test('a touch brush selects a window at 390 px', async ({ page }) => {
      await openDemo(page, SLUG);
      const box = await page.locator('[data-part="strip"]').boundingBox();
      if (!box) throw new Error('no strip');
      const cdp = await page.context().newCDPSession(page);
      const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number) =>
        cdp.send('Input.dispatchTouchEvent', {
          type,
          touchPoints: type === 'touchEnd' ? [] : [{ x, y: box.y + box.height / 2 }],
        });
      const [from, to] = [box.x + box.width * 0.35, box.x + box.width * 0.7];
      const drag = async () => {
        for (let i = 1; i <= 8; i++) await touch('touchMove', from + ((to - from) * i) / 8);
        await touch('touchEnd', to);
      };
      const selected = () =>
        page.evaluate(
          () => (window as unknown as { demo: Demo }).demo.strip.getState().selection !== null,
        );
      // D19: touch and hold, then drag (the help text says so).
      await touch('touchStart', from);
      await page.waitForTimeout(700);
      await drag();
      if (!(await selected())) {
        // Until M12a lands D19 the library selects with a double tap and drag.
        test.info().annotations.push({
          type: 'pending M12a (D19)',
          description: 'long-press did not select; double-tap-drag did',
        });
        await touch('touchStart', from);
        await touch('touchEnd', from);
        await touch('touchStart', from);
        await drag();
      }
      expect(await selected()).toBe(true);
      await expect(page.locator('[data-part="whole"]')).toBeVisible();
      await expect(answer(page)).toContainText("the window's");
    });

    test('tapping a point opens its USGS event page, as the touch help text says', async ({
      page,
    }) => {
      await page.addInitScript(() => {
        const opened: string[] = [];
        Object.assign(window, { opened });
        window.open = (url?: string | URL) => {
          opened.push(String(url));
          return null;
        };
      });
      await openDemo(page, SLUG);
      await expect(page.locator('.hint-touch').filter({ hasText: 'Tap a point' })).toBeVisible();
      const scatter = page.locator('[data-part="scatter"]');
      await scatter.scrollIntoViewIfNeeded();
      const at = await page.evaluate((m71) => {
        const { scatter } = (window as unknown as { demo: Demo }).demo;
        const box = scatter.container.getBoundingClientRect();
        return {
          x: box.left + (scatter.scale('x')?.toPixel(m71.time) ?? 0),
          y: box.top + (scatter.scale('y')?.toPixel(7.1) ?? 0),
        };
      }, M71);
      await page.touchscreen.tap(at.x, at.y);
      await expect
        .poll(() => page.evaluate(() => (window as unknown as { opened: string[] }).opened))
        .toEqual([`https://earthquake.usgs.gov/earthquakes/eventpage/${M71.id}`]);
    });

    test('the catalogue date stays visible', async ({ page }) => {
      await openDemo(page, SLUG);
      await expect(page.locator('.event-meta')).toContainText('catalogue retrieved');
      await expect(page.locator('.event-meta')).toBeInViewport();
    });
  });

  test('the events are lazy-loaded data, under 1 MB gzipped', async ({ request }) => {
    const response = await request.get(`${BASE}data/${SLUG}/events.csv`, {
      headers: { 'Accept-Encoding': 'gzip' },
    });
    expect(response.ok()).toBe(true);
    const { gzipSync } = await import('node:zlib');
    expect(gzipSync(await response.body()).length).toBeLessThan(1024 * 1024);
  });
});
