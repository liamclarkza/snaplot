// S2 "Did deploy #482 cause the p99 spike?" (plan §10.1, §10.2): the verdict, the tooltip
// oracle, the stream continuing the history, deploy markers aligned across the three panels and
// added as a paint-only update, the SLO on the error axis, following and Back to live, the
// rollback and recovery, heap over 60 simulated minutes, and the shared checks. Run against the
// built site: `npm run build && npm run build:site`, then `npx playwright test examples/deploy-482`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { type Bucket, createSimulator } from '../../src/demos/deploy-482/simulator';

const ROUTE = '/snaplot/examples/deploy-482/';
const source = readFileSync(
  fileURLToPath(new URL('../../public/data/deploy-482/SOURCE.md', import.meta.url)),
  'utf8',
);
const attribution = /^## Attribution\n+(.+)$/m.exec(source)?.[1]?.trim() ?? '';
const at = (h: number, m: number, s = 0) => Date.UTC(2025, 2, 14, h, m, s);

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
  await page.locator('html[data-demo-ready]').waitFor({ timeout: 20_000 });
}

/** The /search bucket that starts at `time`, simulated here with the page's seed (482). */
function searchBucket(time: number): Bucket {
  const sim = createSimulator({ keepSamples: true });
  for (;;) {
    const bucket = sim.step().find((b) => b.endpoint === '/search');
    if (bucket && bucket.time === time) return bucket;
    if (sim.now > time + 1000) throw new Error(`no bucket at ${time}`);
  }
}

/** The visible tooltip's text: a fixed, opaque element that lists p99. */
const tooltipText = (page: Page) =>
  page.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const style = getComputedStyle(el);
      if (style.position === 'fixed' && Number(style.opacity) > 0.5 && /p99/.test(el.innerText))
        return el.innerText;
    }
    return '';
  });

/** Viewport-relative pixel of a value on a chart axis, through its public scale. */
const pixel = (page: Page, chart: string, axis: string, value: number) =>
  page.evaluate(
    ([name, key, v]) => {
      const c = (globalThis as any).snaplotDemo.charts[name];
      const box = c.container.getBoundingClientRect();
      const p = c.scale(key).toPixel(v);
      return c.scale(key).horizontal ? box.left + p : box.top + p;
    },
    [chart, axis, value] as const,
  );

/**
 * The most pixels of a colour in any one row or column of a chart's canvases, within a pixel
 * either side of `line` (an antialiased line spreads over two).
 */
const colourRun = (page: Page, chart: string, hex: string, line: { x?: number; y?: number }) =>
  page.evaluate(
    ([name, colour, where]) => {
      const c = (globalThis as any).snaplotDemo.charts[name];
      const box = c.container.getBoundingClientRect();
      const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(colour.slice(i, i + 2), 16));
      let best = 0;
      for (const canvas of c.container.querySelectorAll('canvas')) {
        const ratio = canvas.width / canvas.getBoundingClientRect().width;
        const ctx = canvas.getContext('2d');
        if (!ctx || canvas.width === 0) continue;
        for (const d of [-1, 0, 1]) {
          const strip =
            where.x !== undefined
              ? ctx.getImageData(Math.floor((where.x - box.left) * ratio) + d, 0, 1, canvas.height)
              : ctx.getImageData(
                  0,
                  Math.floor(((where.y ?? 0) - box.top) * ratio) + d,
                  canvas.width,
                  1,
                );
          let count = 0;
          for (let i = 0; i < strip.data.length; i += 4) {
            const p = strip.data;
            if (
              Math.abs(p[i] - r) < 10 &&
              Math.abs(p[i + 1] - g) < 10 &&
              Math.abs(p[i + 2] - b) < 10 &&
              p[i + 3] > 60
            )
              count++;
          }
          best = Math.max(best, count);
        }
      }
      return best;
    },
    [chart, hex, line] as const,
  );

test.describe('deploy-482', () => {
  test('the verdict banner answers the question and offers the rollback', async ({ page }) => {
    const problems = watch(page);
    await open(page, '?paused');
    await expect(page.locator('[data-answer]')).toHaveText(
      'p99 on /search rose from 103 ms to 234 ms within 2 min of #482; other endpoints are unchanged, so roll back #482.',
    );
    await expect(page.getByRole('button', { name: 'Roll back #482' })).toBeVisible();
    await expect(page.locator('.tag')).toContainText('Simulated service');
    const texts = await page.locator('.topbar, .verdict, .deploys').allInnerTexts();
    for (const text of texts) expect(text).not.toMatch(/NaN|Infinity|undefined/);
    expect(problems).toEqual([]);
  });

  test('oracle: tooltip p99 equals a brute-force sort of the bucket, through the seam', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    // Stream past the page time, so the last check reads a second simulated after the history.
    await open(page);
    await expect(page.locator('.clock')).toHaveText(/^03:12:0[2-9]/);
    await page.getByRole('button', { name: 'Pause' }).click();
    for (const time of [at(3, 5, 10), at(3, 9, 30), at(3, 12, 1)]) {
      const samples = [...(searchBucket(time).samples ?? [])].sort((a, b) => a - b);
      const truth = samples[Math.ceil(0.99 * samples.length) - 1];
      await page.mouse.move(
        await pixel(page, 'latency', 'x', time + 200),
        await pixel(page, 'latency', 'y', truth),
      );
      await expect.poll(() => tooltipText(page)).toMatch(/p99/);
      const text = await tooltipText(page);
      const shown = /p99\s+([\d,.]+)/.exec(text)?.[1] ?? '';
      const decimals = shown.split('.')[1]?.length ?? 0;
      expect(
        Math.abs(Number(shown.replace(/,/g, '')) - truth),
        `${new Date(time).toISOString()}: shown ${shown}, sorted ${truth}`,
      ).toBeLessThanOrEqual(0.5 * 10 ** -decimals + 1e-9);
      const cursor = await page.evaluate(
        () => (globalThis as any).snaplotDemo.charts.latency.getCursor().x,
      );
      expect(cursor).toBe(time);
    }
  });

  test('deploy markers line up across the three panels, and a new one is paint-only', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await open(page, '?paused');
    const panels = ['latency', 'errors', 'traffic'];
    const xs = await Promise.all(panels.map((c) => pixel(page, c, 'x', at(3, 8))));
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(1);
    for (const [i, c] of panels.entries()) {
      expect(await colourRun(page, c, '#8AB8FF', { x: xs[i] }), c).toBeGreaterThan(20);
    }
    const ingests = () =>
      page.evaluate(
        ([names, key]) =>
          names.map((n) => (globalThis as any).snaplotDemo.charts[n][Symbol.for(key)].ingestCount),
        [panels, 'snaplot.debug'] as const,
      );
    const before = await ingests();
    await page.getByRole('button', { name: 'Roll back #482' }).click();
    await expect(page.locator('.deploys li')).toHaveCount(3);
    await expect(page.locator('[data-recovery]')).toContainText(
      '#483 rolled back #482 at 03:12:00 UTC.',
    );
    // The new marker changed no data: no panel re-read its rows.
    expect(await ingests()).toEqual(before);
    // Once the stream passes it, the rollback marker sits at one x in every panel.
    await page.getByRole('button', { name: 'Resume' }).click();
    await expect(page.locator('.clock')).toHaveText(/^03:12:0[3-9]/);
    await page.getByRole('button', { name: 'Pause' }).click();
    const rx = await Promise.all(panels.map((c) => pixel(page, c, 'x', at(3, 12))));
    expect(Math.max(...rx) - Math.min(...rx)).toBeLessThanOrEqual(1);
    for (const [i, c] of panels.entries()) {
      expect(await colourRun(page, c, '#8AB8FF', { x: rx[i] }), c).toBeGreaterThan(20);
    }
  });

  test('the SLO threshold sits on the error panel’s percentage axis', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await open(page, '?paused');
    const y = await pixel(page, 'errors', 'y', 1);
    // A dashed line across the plot: well over a third of its width in the SLO red.
    expect(await colourRun(page, 'errors', '#F2495C', { y })).toBeGreaterThan(300);
  });

  test('[M12a] a pan stops following; Back to live resumes it', async ({ page }) => {
    // Shift-drag does not pan a chart that is following its stream yet (docs/handoff/m16c.md,
    // a request to M12a). Flip this when M12a merges.
    test.fail(true, 'M12a: panning from the follow window');
    await page.setViewportSize({ width: 1280, height: 1000 });
    await open(page);
    const box = await page.locator('[data-chart="latency"]').boundingBox();
    if (!box) throw new Error('no latency panel');
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 0.5, y);
    await page.keyboard.down('Shift');
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.7, y, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await expect(page.getByRole('button', { name: 'Back to live' })).toBeVisible({
      timeout: 2_000,
    });
  });

  test('zooming stops following in every panel; Back to live resumes it', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await open(page);
    const following = () =>
      page.evaluate(() =>
        ['latency', 'errors', 'traffic'].map(
          (n) => (globalThis as any).snaplotDemo.charts[n].getState().following,
        ),
      );
    expect(await following()).toEqual([true, true, true]);
    await expect(page.locator('[data-following]')).toBeVisible();
    const box = await page.locator('[data-chart="latency"]').boundingBox();
    if (!box) throw new Error('no latency panel');
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 0.4, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, y, { steps: 6 });
    await page.mouse.up();
    await expect(page.getByRole('button', { name: 'Back to live' })).toBeVisible();
    expect(await following()).toEqual([false, false, false]);
    await page.getByRole('button', { name: 'Back to live' }).click();
    await expect(page.locator('[data-following]')).toBeVisible();
    expect(await following()).toEqual([true, true, true]);
  });

  test('the rollback recovers /search, and the side panels follow the stream', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await open(page, '?speed=60');
    await page.getByRole('button', { name: 'Roll back #482' }).click();
    await page.locator('.deploys button', { hasText: '#483' }).click();
    await expect(page.locator('#change-title')).toHaveText('p99 change by endpoint, #483');
    const ingest = () =>
      page.evaluate(
        () =>
          (globalThis as any).snaplotDemo.charts.distribution[Symbol.for('snaplot.debug')]
            .ingestCount,
      );
    const first = await ingest();
    await expect.poll(ingest).toBeGreaterThan(first + 3);
    await expect(page.locator('[data-recovery]')).toHaveText(
      /^#483 rolled back #482 at \d\d:\d\d:\d\d UTC\. p99 on \/search fell from \d+ ms to \d+ ms within 2 min of #483; other endpoints are unchanged\.$/,
      { timeout: 10_000 },
    );
    await expect(page.locator('.area-table')).toContainText('Median 5 min before #483');
  });

  test('the endpoint variable switches the latency and error panels', async ({ page }) => {
    await open(page, '?paused');
    await page
      .locator('label', { hasText: 'Endpoint' })
      .locator('select')
      .selectOption('/checkout');
    await expect(page.locator('#latency-title')).toHaveText('Latency, /checkout');
    await expect(page.locator('#errors-title')).toHaveText('Errors, /checkout');
    const p50 = await page.evaluate(
      () =>
        (globalThis as any).snaplotDemo.charts.latency
          .getCursor({ fallback: 'latest' })
          .points.find((p: { seriesId: string }) => p.seriesId === 'p50').y,
    );
    // /checkout's service time has a median of 110 ms; /search's is 38 ms.
    expect(p50).toBeGreaterThan(80);
  });

  test('60 simulated minutes add less than 10 MB of heap', async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: 1280, height: 1000 });
    const cdp = await page.context().newCDPSession(page);
    const heap = async () => {
      await cdp.send('HeapProfiler.collectGarbage');
      return (await cdp.send('Runtime.getHeapUsage')).usedSize;
    };
    await open(page, '?speed=60');
    const start = await heap();
    await expect(page.locator('.clock')).toHaveText(/^04:1[2-9]/, { timeout: 120_000 });
    const added = (await heap()) - start;
    expect(added).toBeLessThan(10 * 1024 * 1024);
  });

  for (const width of [1280, 390]) {
    test(`${width}px: no overflow, no console errors, axe clean, attributed`, async ({ page }) => {
      const problems = watch(page);
      await page.setViewportSize({ width, height: 900 });
      await open(page);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(0);
      await expect(page).toHaveTitle('Did deploy #482 cause the p99 spike? · snaplot examples');
      await expect(page.locator('footer [data-attribution]')).toHaveText(attribution);
      await expect(page.locator('footer')).toContainText(`Data: ${attribution}`);
      // The data's freshness stays on screen while reading the panels further down.
      await page.locator('.area-table').scrollIntoViewIfNeeded();
      await expect(page.locator('.clock')).toBeInViewport();
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(
        violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
      ).toEqual([]);
      expect(problems).toEqual([]);
    });
  }
});

test.describe('deploy-482 on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the help speaks touch, and the rollback works by tapping', async ({ page }) => {
    await open(page, '?speed=60');
    await expect(page.locator('.hint')).toContainText('Touch a panel');
    await expect(page.locator('.hint')).not.toContainText('Shift');
    await page.getByRole('button', { name: 'Roll back #482' }).tap();
    await expect(page.locator('[data-recovery]')).toContainText('fell from', { timeout: 10_000 });
    await page.locator('.deploys button', { hasText: '#481' }).tap();
    await expect(page.locator('#change-title')).toHaveText('p99 change by endpoint, #481');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
  });
});
