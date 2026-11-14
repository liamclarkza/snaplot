// A heatmap's slice in a real browser: the panel's pixels follow the row under the pointer, and
// the tooltip's picture opens on the pointer's side away from the panel.
import { expect, hoverData, plotRect, settle, test } from './fixtures';

/** Ten rows along X; every cell of row `t` holds `10 × t`, so a row's profile is `t / 9` long. */
function mountRows(page: import('@playwright/test').Page, slice: unknown) {
  return page.evaluate((option) => {
    window.harness.mount(
      {
        data: Array.from({ length: 10 }, (_, t) => ({ t, v: [10 * t, 10 * t, 10 * t, 10 * t] })),
        x: 't',
        series: [
          {
            type: 'heatmap',
            id: 'cells',
            values: 'v',
            bins: { start: 0.5, step: 1, count: 4 },
            slice: option as never,
          },
        ],
      },
      { width: 640, height: 320 },
    );
  }, slice);
}

/** How dark the panel is 60% of the way along a full bar, at height `y` (0 is the page). */
async function panelInk(page: import('@playwright/test').Page, y: number): Promise<number> {
  const plot = await plotRect(page);
  // The baseline is 12 px from the plot and a full bar reaches the panel's far edge (120 px).
  const x = plot.right + 12 + 0.6 * (120 - 13);
  const [r, g, b] = await page.evaluate(([px, py]) => window.harness.pixel('chart-0', px, py), [
    x,
    y,
  ] as const);
  return 255 - (r + g + b) / 3;
}

test.describe('heatmap slice', () => {
  test('the panel shows the newest row, then the row under the pointer with its cell filled', async ({
    harnessPage: page,
  }) => {
    await mountRows(page, { panel: { mean: false } });
    await settle(page);
    const plot = await plotRect(page);
    const middle = plot.top + plot.height / 2 + 10;
    // Away from the chart: the newest row (t = 9), a full bar, faintly filled.
    const idle = await panelInk(page, middle);
    expect(idle).toBeGreaterThan(10);
    expect(idle).toBeLessThan(80);

    // Over row 2 the bar stops short of the probe.
    const short = await hoverData(page, 'chart-0', 2, 3.5);
    expect(await panelInk(page, middle)).toBe(0);

    // Over row 8 it passes the probe, and the bin under the pointer is filled solid.
    const long = await hoverData(page, 'chart-0', 8, 3.5);
    expect(await panelInk(page, middle)).toBeGreaterThan(10);
    expect(await panelInk(page, long.y)).toBeGreaterThan(150);
    expect(short.y).toBe(long.y);
  });

  test('a click pins a row through update({ series }): a mark on the plot, an outline in the panel', async ({
    harnessPage: page,
  }) => {
    await mountRows(page, { panel: { mean: false }, pins: [] });
    await page.evaluate(() => {
      const chart = window.harness.chart('chart-0');
      const pins = new Set<number>();
      chart.on('point:click', (point) => {
        const at = point.x as number;
        if (!pins.delete(at)) pins.add(at);
        chart.update({
          series: [
            {
              type: 'heatmap',
              id: 'cells',
              values: 'v',
              bins: { start: 0.5, step: 1, count: 4 },
              slice: { panel: { mean: false }, pins: [...pins] },
            },
          ],
        });
      });
    });
    const at = await page.evaluate(() => window.harness.toClient('chart-0', 7, 1.5));
    const pixel = () =>
      page.evaluate(([x, y]) => window.harness.pixel('chart-0', x, y), [at.x, at.y] as const);
    const cell = await pixel();
    await page.mouse.click(at.x, at.y);
    await page.mouse.move(0, 0);
    await settle(page);
    const marked = await pixel();
    expect(marked).not.toEqual(cell);
    expect(await page.evaluate(() => window.harness.counters().ingestCount)).toBe(1);
    // A second click on the row lets it go (after a pause: two quick clicks are a double-click).
    await page.waitForTimeout(600);
    await page.mouse.click(at.x, at.y);
    await page.mouse.move(0, 0);
    await settle(page);
    expect(await pixel()).toEqual(cell);
  });

  test('the tooltip draws the row and opens left of the pointer, clear of the panel', async ({
    harnessPage: page,
  }) => {
    await mountRows(page, true);
    await settle(page);
    const pointer = await hoverData(page, 'chart-0', 6, 1.5);
    const picture = page.locator('.snaplot-tooltip .snaplot-tooltip-slice');
    await expect(picture).toBeVisible();
    const box = await page.locator('.snaplot-tooltip').boundingBox();
    expect(box!.x + box!.width).toBeLessThan(pointer.x);
    // Every cell of the row holds the same value: one bar, as tall as the picture.
    expect(await picture.locator('path').first().getAttribute('d')).toBe('M0 44V1H168V44Z');
  });
});
