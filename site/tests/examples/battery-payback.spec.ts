// R2 "Would a 5 kWh battery have paid for itself in this house?" (plan §10.1, §10.2), against
// `astro preview` of the built site: `npm run build && npm run build:site`, then
// `PORT=5376 npx playwright test tests/examples/battery-payback.spec.ts` in site/.
//
// The task: read the answer in the headline, check it against the generator's own totals
// (meta.json, computed by scripts/demo-data/battery-payback.mjs, not by the page's answer.ts),
// try other battery sizes without losing a zoom, and do it all from the keyboard.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { type Browser, expect, type Page, test } from '@playwright/test';

const ROUTE = '/snaplot/examples/battery-payback/';
const DATA = fileURLToPath(new URL('../../public/data/battery-payback/', import.meta.url));
const QUESTION = 'Would a 5 kWh battery have paid for itself in this house?';

const META = JSON.parse(readFileSync(`${DATA}meta.json`, 'utf8')) as {
  year: number;
  totals: { pv: number; import: number; export: number };
  model: { installedEurPerKWh: number };
  answer: { savingsEur: number; installedEur: number; paybackYears: number };
};
const eur = (value: number, digits = 0) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
const kwh = (value: number) => Math.round(value).toLocaleString('en');

function attribution(): { line: string; licence: string } {
  const md = readFileSync(`${DATA}SOURCE.md`, 'utf8');
  const after = (heading: string) =>
    (md.split(`## ${heading}\n\n`)[1] ?? '').split('\n')[0]?.trim() ?? '';
  return { line: after('Attribution'), licence: after('Licence') };
}

/** Hourly rows of hourly.csv, read here without the page's parser. */
const HOURS = readFileSync(`${DATA}hourly.csv`, 'utf8')
  .trim()
  .split('\n')
  .slice(1)
  .map((line) => {
    const [, local = '', pv, imp, exp] = line.split(',');
    return {
      hour: Number(local.slice(11, 13)),
      pv: Number(pv),
      imp: Number(imp),
      exp: Number(exp),
    };
  });

function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url()}`);
  });
  return problems;
}

async function open(page: Page) {
  await page.goto(ROUTE);
  await expect(page.locator('html')).toHaveAttribute('data-demo-ready', '');
}

type ChartKey = 'day' | 'bought' | 'sold' | 'cost';
const viewportOf = (page: Page, chart: ChartKey) =>
  page.evaluate((chart) => window.charts?.[chart]?.getState().viewport.x ?? null, chart);

/** Drags across the cost chart from one date to another (the default drag zooms X). */
async function zoomCost(page: Page, from: string, to: string) {
  await page.locator('.r2-chart--cost').scrollIntoViewIfNeeded();
  const at = await page.evaluate(
    ({ from, to }) => {
      const chart = window.charts?.cost;
      const box = chart?.container.getBoundingClientRect();
      const x = chart?.scale('x');
      if (!box || !x) throw new Error('no cost chart');
      return { a: box.left + x.toPixel(from), b: box.left + x.toPixel(to), y: box.top + 80 };
    },
    { from, to },
  );
  await page.mouse.move(at.a, at.y);
  await page.mouse.down();
  await page.mouse.move(at.b, at.y, { steps: 8 });
  await page.mouse.up();
}

test.describe('desktop, 1280 px', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('the headline states the answer, and the numbers reconcile with the generator', async ({
    page,
  }) => {
    const problems = watch(page);
    await open(page);
    await expect(page).toHaveTitle(`${QUESTION} · snaplot examples`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(QUESTION);
    const { answer, year } = { answer: META.answer, year: META.year };
    await expect(page.locator('.r2-standfirst')).toHaveText(
      `A 5 kWh battery would have saved ${eur(answer.savingsEur)} in ${year}; at ${eur(answer.installedEur)} installed it pays back in ${answer.paybackYears.toFixed(1)} years.`,
    );
    // The year in meter readings: the generator's totals, which equal last minus first reading.
    const facts = page.locator('.r2-facts');
    await expect(facts).toContainText(`${kwh(META.totals.pv)} kWh`);
    await expect(facts).toContainText(`${kwh(META.totals.import)} kWh`);
    await expect(facts).toContainText(`${kwh(META.totals.export)} kWh`);
    // To the cent, in the payback arithmetic under the cost chart.
    await expect(page.locator('.r2-payback')).toContainText(
      `${eur(answer.installedEur)} ÷ ${eur(answer.savingsEur, 2)} a year = ${answer.paybackYears.toFixed(1)} years`,
    );
    expect(problems).toEqual([]);
  });

  test('the typical day reads the median of each hour from the readings', async ({ page }) => {
    await open(page);
    const median = (values: number[]) => {
      const s = [...values].sort((a, b) => a - b);
      const h = (s.length - 1) / 2;
      const lo = Math.floor(h);
      return (s[lo] ?? 0) + (h - lo) * ((s[Math.min(lo + 1, s.length - 1)] ?? 0) - (s[lo] ?? 0));
    };
    const at13 = HOURS.filter((h) => h.hour === 13);
    const pv = median(at13.map((h) => h.pv));
    const use = median(at13.map((h) => h.imp + h.pv - h.exp));
    const points = await page.evaluate(() => {
      window.charts?.day?.setCursor(13);
      return window.charts?.day?.getCursor().points.map((p) => ({ id: p.seriesId, y: p.y }));
    });
    expect(points?.find((p) => p.id === 'pv')?.y).toBeCloseTo(pv, 6);
    expect(points?.find((p) => p.id === 'use')?.y).toBeCloseTo(use, 6);
  });

  test('the size slider recomputes the year and keeps the zoom', async ({ page }) => {
    const problems = watch(page);
    await open(page);
    await zoomCost(page, '2017-03-01', '2017-06-30');
    const zoomed = await viewportOf(page, 'cost');
    expect(zoomed).not.toBeNull();
    const caption = page.locator('.r2-zoom');
    await expect(caption).toContainText('Showing');
    const shown = await caption.innerText();

    const slider = page.getByRole('slider', { name: 'Battery size' });
    await expect(slider).toHaveValue('5');
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveValue('6');
    const live = page.locator('.r2-live');
    await expect(live).toContainText('A 6 kWh battery would have saved €');
    await expect(live).toContainText('at €4,200 installed');
    // The new size is in the legends, the zoom is untouched, and the headline still answers
    // the question about 5 kWh.
    await expect(page.locator('.r2-chart--cost')).toContainText('With a 6 kWh battery');
    expect(await viewportOf(page, 'cost')).toEqual(zoomed);
    await expect(caption).toHaveText(shown);
    await expect(page.locator('.r2-standfirst')).toContainText('A 5 kWh battery');
    // Back to the whole year.
    await caption.getByRole('button', { name: 'Show the whole year' }).click();
    expect(await viewportOf(page, 'cost')).toBeNull();
    await expect(caption).toBeHidden();
    expect(problems).toEqual([]);
  });

  test('keyboard only: the slider, its extremes and the links', async ({ page }) => {
    await open(page);
    // Tab from the top of the page until the slider has focus.
    let reached = false;
    for (let i = 0; i < 20 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(
        () => (document.activeElement as HTMLInputElement | null)?.type === 'range',
      );
    }
    expect(reached).toBe(true);
    const outline = await page.evaluate(
      () => getComputedStyle(document.activeElement as Element).outlineStyle,
    );
    expect(outline).not.toBe('none');
    await page.keyboard.press('End');
    await expect(page.locator('.r2-live')).toContainText('A 15 kWh battery');
    await page.keyboard.press('Home');
    await expect(page.locator('.r2-live')).toContainText('A 1 kWh battery');
    await expect(page.getByRole('slider', { name: 'Battery size' })).toHaveAttribute(
      'aria-valuetext',
      '1 kWh',
    );
  });

  // The cost chart reads its dates as UTC days (`timeZone: 'UTC'`), so every reader should see
  // the same day. The data is right in every zone; the readout is not. Library defects, handoff
  // requests to M10: it is written in the reader's zone (demos-07:utc) and at the tick step
  // (interact-02:format).
  const firstDay = async (browser: Browser, timezoneId: string) => {
    const context = await browser.newContext({
      timezoneId,
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    await open(page);
    const read = await page.evaluate(() => {
      const chart = window.charts?.cost;
      chart?.setCursor('2017-01-01');
      return { min: chart?.scale('x')?.min, text: chart?.getCursor().formattedX };
    });
    await context.close();
    return read;
  };

  test('the first day is 1 January for a reader in Los Angeles', async ({ browser }) => {
    const { min, text } = await firstDay(browser, 'America/Los_Angeles');
    expect(min).toBe(Date.UTC(2017, 0, 1));
    expect(text).not.toMatch(/Dec/);
  });

  test("a day's readout names the day, not only its month", async ({ browser }) => {
    const { min, text } = await firstDay(browser, 'UTC');
    expect(min).toBe(Date.UTC(2017, 0, 1));
    expect(text).toMatch(/Jan[a-z]* 1\b|\b1 Jan/);
  });

  test('layout: a 640 px article column; no overflow; axe; the footer', async ({ page }) => {
    await open(page);
    const column = await page.locator('.r2-article').boundingBox();
    if (!column) throw new Error('no column');
    expect(column.width).toBeLessThanOrEqual(640);
    expect(Math.abs(column.x + column.width / 2 - 640)).toBeLessThan(2);
    await expectNoOverflow(page);
    await expectAxeClean(page);
    await expectFooter(page);
    await expect(page.locator('.r2-help')).toContainText('Drag across the chart');
    await expectNoBrokenNumbers(page);
  });

  test('thumbnail hook: data-demo-ready marks a painted first screen', async ({
    page,
  }, testInfo) => {
    await open(page);
    await expect(page.locator('.r2-standfirst')).toBeVisible();
    const painted = await page.evaluate(() =>
      [...document.querySelectorAll('.r2-chart canvas')].some((canvas) => {
        const c = canvas as HTMLCanvasElement;
        const ctx = c.getContext('2d');
        if (!ctx || c.width === 0) return false;
        const { data } = ctx.getImageData(0, 0, c.width, c.height);
        for (let i = 3; i < data.length; i += 4) if ((data[i] ?? 0) > 0) return true;
        return false;
      }),
    );
    expect(painted).toBe(true);
    const shot = await page.screenshot({
      type: 'jpeg',
      quality: 70,
      path: testInfo.outputPath('battery-payback.jpg'),
    });
    expect(shot.byteLength).toBeLessThan(200_000);
  });
});

test.describe('phone, 390 px with touch', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('one column, no overflow, touch help, axe, the footer', async ({ page }) => {
    const problems = watch(page);
    await open(page);
    const widths = await page.evaluate(() =>
      [...document.querySelectorAll('.r2-chart')].map((c) => {
        const box = c.getBoundingClientRect();
        return { left: Math.round(box.left), right: Math.round(box.right) };
      }),
    );
    // Every chart is full column width, one under another.
    expect(new Set(widths.map((w) => `${w.left}-${w.right}`)).size).toBe(1);
    await expectNoOverflow(page);
    await expect(page.locator('.r2-help')).toContainText('Pinch');
    await expect(page.locator('.r2-byline')).toBeVisible();
    // A tap on the slider's track still sets a size.
    const slider = page.getByRole('slider', { name: 'Battery size' });
    await slider.scrollIntoViewIfNeeded();
    const box = await slider.boundingBox();
    if (!box) throw new Error('no slider');
    await page.touchscreen.tap(box.x + box.width * 0.95, box.y + box.height / 2);
    await expect(page.locator('.r2-live')).not.toContainText('A 5 kWh battery');
    await expectAxeClean(page);
    await expectFooter(page);
    await expectNoBrokenNumbers(page);
    expect(problems).toEqual([]);
  });

  test('a swipe over a read-only chart scrolls the article', async ({ page }) => {
    await open(page);
    expect(await swipeUpOn(page, '.r2-chart--day')).toBeGreaterThan(100);
  });

  // The cost chart zooms, so the library sets `touch-action: none` on it and a reader who
  // starts a swipe on it cannot scroll the article: M12a (interact-06, D19), handoff request.
  test('a swipe over the zoomable cost chart scrolls the article', async ({ page }) => {
    await open(page);
    expect(await swipeUpOn(page, '.r2-chart--cost')).toBeGreaterThan(100);
  });
});

/** A one-finger upward swipe that starts on `selector`; returns how far the page scrolled. */
async function swipeUpOn(page: Page, selector: string): Promise<number> {
  await page.locator(selector).scrollIntoViewIfNeeded();
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`no ${selector}`);
  const before = await page.evaluate(() => scrollY);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.synthesizeScrollGesture', {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
    yDistance: -200,
    gestureSourceType: 'touch',
    speed: 800,
  });
  await page.waitForTimeout(300);
  return (await page.evaluate(() => scrollY)) - before;
}

async function expectNoOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function expectAxeClean(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  expect(serious).toEqual([]);
}

async function expectFooter(page: Page) {
  const { line, licence } = attribution();
  expect(line.length).toBeGreaterThan(20);
  const footer = page.getByRole('contentinfo');
  await expect(footer).toContainText(`Data: ${line} (${licence})`);
  await expect(footer.getByRole('link', { name: '← Examples' })).toHaveAttribute(
    'href',
    '/snaplot/examples/',
  );
  await expect(footer.getByRole('link', { name: 'Source' })).toHaveAttribute(
    'href',
    /github\.com\/liamclarkza\/snaplot\/tree\/main\/site\/src\/demos\/battery-payback$/,
  );
}

async function expectNoBrokenNumbers(page: Page) {
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/\bNaN\b|Infinity|undefined|\bnull\b/);
}

declare global {
  interface Window {
    /** The demo's chart handles (each demo puts its own on `window.charts`). */
    charts?: Record<string, import('snaplot').ChartHandle | undefined>;
  }
}
