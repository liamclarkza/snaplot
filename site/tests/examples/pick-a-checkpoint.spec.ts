// R1 "Which checkpoint should we ship?" (plan §10.1, §10.2), against `astro preview` of the
// built site: `npm run build && npm run build:site`, then
// `PORT=5376 npx playwright test tests/examples/pick-a-checkpoint.spec.ts` in site/.
//
// The task: read the decision panel, switch the criterion, pin a checkpoint by clicking its
// validation point and compare the panel with val.csv, zoom, smooth, reload. The expected values
// come from val.csv on disk, never from the demo's own answer.ts.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const ROUTE = '/snaplot/examples/pick-a-checkpoint/';
const DATA = fileURLToPath(new URL('../../public/data/pick-a-checkpoint/', import.meta.url));

interface Row {
  run: string;
  epoch: number;
  valLoss: number;
  valAcc: number;
}
const VAL: Row[] = readFileSync(`${DATA}val.csv`, 'utf8')
  .trim()
  .split('\n')
  .slice(1)
  .map((line) => {
    const [run = '', epoch, , valLoss, valAcc] = line.split(',');
    return { run, epoch: Number(epoch), valLoss: Number(valLoss), valAcc: Number(valAcc) };
  });
const row = (run: string, epoch: number) => {
  const found = VAL.find((r) => r.run === run && r.epoch === epoch);
  if (!found) throw new Error(`no ${run} ${epoch} in val.csv`);
  return found;
};
/** The first row with the lowest (or highest) value; ties keep the earlier epoch. */
const argBest = (key: 'valLoss' | 'valAcc', sign: 1 | -1) =>
  [...VAL].sort((a, b) => sign * (a[key] - b[key]) || a.epoch - b.epoch)[0] as Row;
const sentence = (r: Row) =>
  `Ship run ${r.run} at epoch ${r.epoch}: validation loss ${r.valLoss.toFixed(4)}, accuracy ${(r.valAcc * 100).toFixed(1)}%.`;

function attribution(): { line: string; licence: string } {
  const md = readFileSync(`${DATA}SOURCE.md`, 'utf8');
  const after = (heading: string) =>
    (md.split(`## ${heading}\n\n`)[1] ?? '').split('\n')[0]?.trim() ?? '';
  return { line: after('Attribution'), licence: after('Licence') };
}

/** Console errors and warnings, uncaught errors and failed requests. */
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

async function open(page: Page, query = '') {
  await page.goto(ROUTE + query);
  await expect(page.locator('html')).toHaveAttribute('data-demo-ready', '');
}

type ChartKey = 'train' | 'validation' | 'accuracy';

/** Clicks the validation point of `run` at `epoch` through the chart's own scales. */
async function clickPoint(page: Page, chart: ChartKey, run: string, epoch: number) {
  const r = row(run, epoch);
  const value = chart === 'accuracy' ? r.valAcc : r.valLoss;
  await page.evaluate((chart) => {
    const box = window.charts?.[chart]?.container.getBoundingClientRect();
    if (box && (box.top < 0 || box.bottom > innerHeight)) scrollBy(0, box.top - 80);
  }, chart);
  const at = await page.evaluate(
    ({ chart, epoch, value }) => {
      const handle = window.charts?.[chart];
      const box = handle?.container.getBoundingClientRect();
      const x = handle?.scale('x')?.toPixel(epoch);
      const y = handle?.scale('y')?.toPixel(value);
      if (!box || x === undefined || y === undefined) throw new Error(`no ${chart} chart`);
      return { x: box.left + x, y: box.top + y };
    },
    { chart, epoch, value },
  );
  return at;
}

const viewportOf = (page: Page, chart: ChartKey) =>
  page.evaluate((chart) => window.charts?.[chart]?.getState().viewport.x ?? null, chart);

test.describe('desktop, 1280 px', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('[demos-09] the decision panel answers the question from the logs', async ({ page }) => {
    const problems = watch(page);
    await open(page);
    await expect(page).toHaveTitle('Which checkpoint should we ship? · snaplot examples');
    const panel = page.getByRole('complementary', { name: 'Which checkpoint should we ship?' });
    const answer = panel.getByRole('status');
    await expect(answer).toContainText(sentence(argBest('valLoss', 1)));
    // Run A's validation loss at epoch 60 is ≥ 5% over its minimum, so the panel says so.
    const a = VAL.filter((r) => r.run === 'A');
    const aBest = a.reduce((m, r) => (r.valLoss < m.valLoss ? r : m));
    const rise = (a[a.length - 1] as Row).valLoss / aBest.valLoss - 1;
    expect(rise).toBeGreaterThanOrEqual(0.05);
    await expect(answer).toContainText(
      `Run A overfits after epoch ${aBest.epoch} (+${(rise * 100).toFixed(1)}% from its minimum).`,
    );
    // The two criteria disagree here, and the panel names the other pick.
    const byAcc = argBest('valAcc', -1);
    await expect(panel).toContainText(`run ${byAcc.run} at epoch ${byAcc.epoch}`);

    // Rank by accuracy instead: the answer and the URL follow.
    await panel.getByRole('radio', { name: 'Highest accuracy' }).check();
    await expect(answer).toContainText(sentence(byAcc));
    await expect(page).toHaveURL(/[?&]by=accuracy\b/);
    await page.reload();
    await expect(page.getByRole('radio', { name: 'Highest accuracy' })).toBeChecked();
    expect(problems).toEqual([]);
  });

  test('clicking a validation point pins it; the panel equals val.csv; a reload keeps it', async ({
    page,
  }) => {
    const problems = watch(page);
    await open(page, '?pins=');
    const pins = page.getByRole('table', { name: 'Pinned checkpoints' });
    await expect(pins).toHaveCount(0);
    await expect(page.locator('.r1-decision')).toContainText('None yet.');
    const at = await clickPoint(page, 'validation', 'B', 18);
    await page.mouse.click(at.x, at.y);
    const pinned = pins.locator('tr[data-pin="B-18"]');
    await expect(pinned).toBeVisible();
    const b18 = row('B', 18);
    await expect(pinned.getByRole('cell').nth(1)).toHaveText('18');
    await expect(pinned.getByRole('cell').nth(2)).toHaveText(b18.valLoss.toFixed(4));
    await expect(pinned.getByRole('cell').nth(3)).toHaveText(`${(b18.valAcc * 100).toFixed(1)}%`);
    await expect(page).toHaveURL(/[?&]pins=B-18\b/);
    // Clicking the accuracy point of another epoch adds a second pin.
    const acc = await clickPoint(page, 'accuracy', 'A', 30);
    await page.mouse.click(acc.x, acc.y);
    await expect(pins.locator('tr[data-pin="A-30"]')).toBeVisible();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-demo-ready', '');
    await expect(pins.locator('tr[data-pin="B-18"]')).toBeVisible();
    await expect(pins.locator('tr[data-pin="A-30"]')).toBeVisible();
    // Unpin from the table.
    await pins.getByRole('button', { name: 'Unpin run B, epoch 18' }).click();
    await expect(pins.locator('tr[data-pin="B-18"]')).toHaveCount(0);
    await expect(page).toHaveURL(/[?&]pins=A-30\b/);
    expect(problems).toEqual([]);
  });

  test('the cursor panel and the legend table read the hovered epoch', async ({ page }) => {
    await open(page);
    const panel = page.getByRole('complementary', { name: 'Which checkpoint should we ship?' });
    await expect(panel).toContainText('Point at a chart to read both runs at one epoch.');
    await expect(panel.locator('.r1-legend table')).toBeHidden();
    const at = await clickPoint(page, 'validation', 'A', 23);
    await page.mouse.move(at.x, at.y);
    await expect(panel.locator('.r1-legend')).toContainText('Epoch 23');
    const table = panel.locator('.r1-legend table');
    await expect(table).toContainText(row('A', 23).valLoss.toFixed(4));
    await expect(table).toContainText(row('B', 23).valLoss.toFixed(4));
    await expect(table).toContainText(`${(row('B', 23).valAcc * 100).toFixed(1)}%`);
    // The sentence compares correct digits, read from val.csv's valCorrect column.
    const correct = readFileSync(`${DATA}val.csv`, 'utf8')
      .split('\n')
      .filter((line) => /^[AB],23,/.test(line))
      .map((line) => ({ run: line[0], n: Number(line.split(',')[5]) }))
      .sort((a, b) => b.n - a.n);
    const [first, second] = correct as [{ run: string; n: number }, { run: string; n: number }];
    await expect(panel).toContainText(
      `At epoch 23, run ${first.run} gets ${first.n.toLocaleString('en')} of 1,797 digits right, ${first.n - second.n} more than run ${second.run}.`,
    );
    // The legend table is readable too (contrast), while it shows.
    await expectAxeClean(page);
    await page.mouse.move(5, 5);
    await expect(panel).toContainText('Point at a chart to read both runs at one epoch.');
  });

  test('keyboard: the pin form, the criterion and the run toggles work without a pointer', async ({
    page,
  }) => {
    await open(page, '?pins=');
    const panel = page.getByRole('complementary', { name: 'Which checkpoint should we ship?' });
    await panel.getByRole('combobox', { name: 'Run' }).selectOption('B');
    await panel.getByRole('spinbutton', { name: 'Epoch' }).fill('42');
    await panel.getByRole('spinbutton', { name: 'Epoch' }).press('Enter');
    const pinned = panel.locator('tr[data-pin="B-42"]');
    await expect(pinned.getByRole('cell').nth(2)).toHaveText(row('B', 42).valLoss.toFixed(4));
    await expect(panel.getByRole('button', { name: 'Pinned' })).toBeDisabled();
    // Hiding run B hides it on every chart.
    await page.getByRole('checkbox', { name: /^B regularised/ }).press('Space');
    for (const chart of ['train', 'validation', 'accuracy'] as const) {
      const hidden = await page.evaluate(
        (chart) => window.charts?.[chart]?.getState().hiddenSeries ?? [],
        chart,
      );
      expect(hidden, chart).toContain('B');
    }
  });

  test('a zoom goes into the URL, survives a reload, and the smoothing slider keeps it', async ({
    page,
  }) => {
    const problems = watch(page);
    await open(page);
    // Drag across the validation chart: the default drag zooms X, and the group follows.
    const from = await clickPoint(page, 'validation', 'A', 12);
    const to = await clickPoint(page, 'validation', 'A', 36);
    await page.mouse.move(from.x, from.y - 40);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y - 40, { steps: 8 });
    await page.mouse.up();
    await expect(page).toHaveURL(/[?&]epochs=\d+(\.\d+)?-\d+(\.\d+)?\b/);
    const zoomed = await viewportOf(page, 'validation');
    expect(zoomed).not.toBeNull();
    const [lo, hi] = zoomed as [number, number];
    expect(lo).toBeGreaterThan(10);
    expect(hi).toBeLessThan(38);
    expect(await viewportOf(page, 'train')).toEqual(zoomed);
    expect(await viewportOf(page, 'accuracy')).toEqual(zoomed);

    // The slider recomputes the smoothed training loss and leaves the zoom alone.
    const url = new URL(page.url());
    const slider = page.getByRole('slider', { name: 'Smoothing' });
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(/[?&]smoothing=0\.92\b/);
    expect(new URL(page.url()).searchParams.get('epochs')).toBe(url.searchParams.get('epochs'));
    for (const chart of ['train', 'validation', 'accuracy'] as const) {
      expect(await viewportOf(page, chart), chart).toEqual(zoomed);
    }

    // A reload restores the zoom from the URL (rounded to 2 decimals there).
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-demo-ready', '');
    const restored = (await viewportOf(page, 'train')) as [number, number];
    expect(restored[0]).toBeCloseTo(lo, 1);
    expect(restored[1]).toBeCloseTo(hi, 1);
    await expect(slider).toHaveValue('0.92');
    // Double-click resets every chart and clears the URL.
    await page.mouse.dblclick(from.x, from.y - 40);
    await expect(page).not.toHaveURL(/[?&]epochs=/);
    expect(await viewportOf(page, 'accuracy')).toBeNull();
    expect(problems).toEqual([]);
  });

  // StrictMode mounts, unmounts and mounts every component again in development only, so this
  // test means most against `astro dev` (start it on PORT first; the config reuses it). Against
  // the production build it checks the single mount.
  test('StrictMode leaves one set of canvases per chart', async ({ page }) => {
    await open(page);
    const counts = await page.evaluate(() =>
      [...document.querySelectorAll('.r1-chart')].map((host) => ({
        canvases: host.querySelectorAll('canvas').length,
        charts: host.querySelectorAll('[aria-roledescription="interactive chart"]').length,
      })),
    );
    expect(counts).toHaveLength(3);
    for (const c of counts) expect(c.charts).toBe(1);
    expect(new Set(counts.map((c) => c.canvases)).size).toBe(1);
    const total = await page.locator('canvas').count();
    expect(total).toBe((counts[0]?.canvases ?? 0) * 3);
  });

  test('layout: charts two-thirds, the panel one-third; no overflow; axe; the footer', async ({
    page,
  }) => {
    await open(page);
    const charts = await page.locator('.r1-charts').boundingBox();
    const panel = await page.locator('.r1-decision').boundingBox();
    if (!charts || !panel) throw new Error('no layout');
    expect(panel.x).toBeGreaterThan(charts.x + charts.width - 1);
    expect(charts.width / (charts.width + panel.width)).toBeGreaterThan(0.6);
    expect(charts.width / (charts.width + panel.width)).toBeLessThan(0.72);
    await expectNoOverflow(page);
    await expectAxeClean(page);
    await expectFooter(page);
    // Interaction help is written for a mouse here.
    await expect(page.locator('.r1-help')).toContainText('Click a validation point');
    await expectNoBrokenNumbers(page);
  });

  test('thumbnail hook: data-demo-ready marks a painted first screen', async ({
    page,
  }, testInfo) => {
    await open(page);
    const painted = await page.evaluate(() =>
      [...document.querySelectorAll('.r1-chart canvas')].some((canvas) => {
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
      path: testInfo.outputPath('pick-a-checkpoint.jpg'),
    });
    expect(shot.byteLength).toBeLessThan(200_000);
  });
});

test.describe('phone, 390 px with touch', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('one column, no overflow, touch help, a tap pins a point, axe, the footer', async ({
    page,
  }) => {
    const problems = watch(page);
    await open(page, '?pins=');
    const charts = await page.locator('.r1-charts').boundingBox();
    const panel = await page.locator('.r1-decision').boundingBox();
    if (!charts || !panel) throw new Error('no layout');
    // One column, the answer first.
    expect(panel.y + panel.height).toBeLessThanOrEqual(charts.y + 1);
    expect(Math.abs(panel.x - charts.x)).toBeLessThan(1);
    await expectNoOverflow(page);
    await expect(page.locator('.r1-help')).toContainText('Tap a validation point');
    await expect(
      page
        .getByRole('complementary', { name: 'Which checkpoint should we ship?' })
        .getByRole('status'),
    ).toContainText(sentence(argBest('valLoss', 1)));
    // The data's provenance stays on screen at 390 px.
    await expect(page.locator('.r1-meta')).toBeVisible();
    const at = await clickPoint(page, 'validation', 'A', 11);
    await page.touchscreen.tap(at.x, at.y);
    await expect(page.locator('tr[data-pin="A-11"]')).toBeVisible();
    await expectAxeClean(page);
    await expectFooter(page);
    await expectNoBrokenNumbers(page);
    expect(problems).toEqual([]);
  });
});

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
  await expect(footer).toContainText(`Data: ${line}`);
  await expect(footer).toContainText(licence.replace(/[()]/g, ''));
  await expect(footer.getByRole('link', { name: '← Examples' })).toHaveAttribute(
    'href',
    '/snaplot/examples/',
  );
  await expect(footer.getByRole('link', { name: 'Source' })).toHaveAttribute(
    'href',
    /github\.com\/liamclarkza\/snaplot\/tree\/main\/site\/src\/demos\/pick-a-checkpoint$/,
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
