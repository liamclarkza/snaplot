// The 12×8 hover sweep (plan RC9, §5.5), ported from the audit's
// `evidence/uisite/herosweep.mjs`: an index tooltip must show anywhere along X
// inside the plot, not only within 32 px of a line. Owned by M12a.
import { expect, settle, test } from './fixtures';

test.describe('hover sweep', () => {
  test('[uisite-03] a 12×8 probe grid inside the plot shows the tooltip at 96 of 96 points', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[uisite-03]');
    // The home hero's shape: four CPU cores between 15% and 40% on a 0–100% axis.
    await page.evaluate(() => {
      const start = Date.UTC(2026, 2, 1, 9);
      window.harness.mount(
        {
          data: Array.from({ length: 120 }, (_, i) => ({
            t: start + i * 1000,
            c0: 20 + 5 * Math.sin(i / 9),
            c1: 25 + 5 * Math.sin(i / 7 + 1),
            c2: 30 + 6 * Math.sin(i / 11 + 2),
            c3: 35 + 4 * Math.sin(i / 5 + 3),
          })),
          x: 't',
          series: [
            { y: 'c0', label: 'Core 0' },
            { y: 'c1', label: 'Core 1' },
            { y: 'c2', label: 'Core 2' },
            { y: 'c3', label: 'Core 3' },
          ],
          axes: { x: { type: 'time' }, y: { min: 0, max: 100 } },
          tooltip: { mode: 'index' },
        },
        { width: 900, height: 360 },
      );
    });
    const plot = await page.evaluate(() => window.harness.plotRect('chart-0'));
    const misses: string[] = [];
    for (let row = 0; row < 8; row++) {
      for (let column = 0; column < 12; column++) {
        const x = plot.left + ((column + 0.5) / 12) * plot.width;
        const y = plot.top + ((row + 0.5) / 8) * plot.height;
        await page.mouse.move(x, y);
        await settle(page, 1);
        const text = await page.evaluate(() => window.harness.tooltip());
        if (!text) misses.push(`${column},${row}`);
      }
    }
    expect(misses, `no tooltip at ${misses.length} of 96 probes`).toEqual([]);
  });
});
