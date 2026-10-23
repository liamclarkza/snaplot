// Touch gestures with real CDP touch input (plan RC11, §4.4 interaction rules).
// Owned by M12a. Touch input goes through Chromium's input pipeline, so page
// scrolling, touch-action and pointer capture behave as on a phone.
import { type CDPSession, devices, type Page } from '@playwright/test';
import { expect, plotRect, settle, test, tooltipText } from './fixtures';

const { defaultBrowserType: _browser, ...pixel } = devices['Pixel 7'];
test.use({ ...pixel, contextOptions: { reducedMotion: 'reduce' } });

type Point = { x: number; y: number };

async function touch(page: Page): Promise<CDPSession> {
  return page.context().newCDPSession(page);
}

/** A one-finger drag from `from` to `to` in `steps` moves. */
async function swipe(cdp: CDPSession, from: Point, to: Point, steps = 12): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: from.x, y: from.y, id: 1 }],
  });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        {
          x: from.x + ((to.x - from.x) * i) / steps,
          y: from.y + ((to.y - from.y) * i) / steps,
          id: 1,
        },
      ],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** Two fingers moving apart horizontally around `centre`. */
async function pinchOut(cdp: CDPSession, centre: Point, from: number, to: number): Promise<void> {
  const points = (gap: number) => [
    { x: centre.x - gap / 2, y: centre.y, id: 1 },
    { x: centre.x + gap / 2, y: centre.y, id: 2 },
  ];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(from) });
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: points(from + ((to - from) * i) / 10),
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function mountLine(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.body.style.minHeight = '3000px';
    window.harness.mount(
      {
        data: Array.from({ length: 60 }, (_, t) => ({ t, cpu: 40 + 20 * Math.sin(t / 6) })),
        x: 't',
        series: [{ y: 'cpu', label: 'CPU' }],
        axes: { y: { min: 0, max: 100 } },
      },
      { width: 360, height: 280 },
    );
  });
  await settle(page);
}

test.describe('touch', () => {
  test('[interact-05] a tap keeps the tooltip after the finger lifts', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[interact-05]');
    await mountLine(page);
    const plot = await plotRect(page);
    await page.touchscreen.tap(plot.left + plot.width / 2, plot.top + plot.height / 2);
    await page.waitForTimeout(700);
    await settle(page);
    expect(await tooltipText(page)).toContain('CPU');
  });

  test('[interact-06] a vertical swipe on a line chart scrolls the page', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[interact-06]');
    await mountLine(page);
    const plot = await plotRect(page);
    const cdp = await touch(page);
    const x = plot.left + plot.width / 2;
    await swipe(cdp, { x, y: plot.bottom - 10 }, { x, y: plot.top + 10 });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  });

  test('a swipe beside the chart scrolls the page (control)', async ({ harnessPage: page }) => {
    await mountLine(page);
    const plot = await plotRect(page);
    const cdp = await touch(page);
    const y = plot.bottom + 200;
    await swipe(cdp, { x: 200, y }, { x: 200, y: y - 240 });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  });

  test('[interact-06] a one-finger drag pans an xy scatter', async ({ harnessPage: page }) => {
    test.fail(true, '[interact-06]');
    await page.evaluate(() => {
      window.harness.mount(
        {
          data: Array.from({ length: 200 }, (_, i) => ({
            x: (i * 37) % 100,
            y: (i * 53) % 100,
          })),
          x: 'x',
          series: [{ type: 'scatter', y: 'y', label: 'Samples' }],
        },
        { width: 360, height: 280 },
      );
    });
    await settle(page);
    const before = await page.evaluate(() => window.harness.domain('chart-0', 'x'));
    const plot = await plotRect(page);
    const cdp = await touch(page);
    const y = plot.top + plot.height / 2;
    await swipe(
      cdp,
      { x: plot.left + plot.width * 0.7, y },
      { x: plot.left + plot.width * 0.3, y },
    );
    await settle(page);
    const after = await page.evaluate(() => window.harness.domain('chart-0', 'x'));
    expect(after?.min).toBeGreaterThan((before?.min ?? 0) + 5);
    expect((after?.max ?? 0) - (after?.min ?? 0)).toBeCloseTo(
      (before?.max ?? 0) - (before?.min ?? 0),
      0,
    );
  });

  test('a two-finger pinch zooms X', async ({ harnessPage: page }) => {
    await mountLine(page);
    const before = await page.evaluate(() => window.harness.domain('chart-0', 'x'));
    const plot = await plotRect(page);
    const cdp = await touch(page);
    await pinchOut(cdp, { x: plot.left + plot.width / 2, y: plot.top + plot.height / 2 }, 60, 240);
    await settle(page);
    const after = await page.evaluate(() => window.harness.domain('chart-0', 'x'));
    expect((after?.max ?? 0) - (after?.min ?? 0)).toBeLessThan(
      ((before?.max ?? 0) - (before?.min ?? 0)) * 0.8,
    );
  });
});
