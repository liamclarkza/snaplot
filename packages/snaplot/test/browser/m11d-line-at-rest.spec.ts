// A line of millions of points paints at rest (M11d). Chromium draws nothing for one canvas path
// of about 2M vertices or more, so a 103 s, 44.1 kHz waveform (4.5M samples) vanished at rest and
// after a reset to the full view (site demo find-the-clipping).
import type { Page } from '@playwright/test';
import { expect, settle, test } from './fixtures';

const N = 4_500_000;

async function mountWaveform(page: Page, type: 'line' | 'area'): Promise<void> {
  await page.evaluate(
    ([n, kind]) => {
      const x = new Float64Array(n);
      const y = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        x[i] = i / 44_100;
        y[i] = 0.6 * Math.sin(i / 700) + 0.3 * Math.sin(i * 1.7);
      }
      window.harness.mount({
        data: { columns: { t: x, v: y } },
        x: 't',
        series: [{ y: 'v', label: 'Wave', type: kind }],
        axes: { y: { min: -1, max: 1 } },
      });
    },
    [N, type] as const,
  );
  await settle(page, 4);
}

/** Pixels of the data layer with any ink. */
function ink(page: Page): Promise<number> {
  return page.evaluate(() => {
    const snapshot = (window.harness.chart('chart-0') as never as Record<symbol, any>)[
      Symbol.for('snaplot.debug')
    ];
    const canvas = snapshot.layers.data as HTMLCanvasElement;
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) count++;
    return count;
  });
}

/** Zoom in with the wheel over the plot, let the gesture settle, then reset to the full view. */
async function zoomThenReset(page: Page): Promise<void> {
  const plot = await page.evaluate(() => window.harness.plotRect('chart-0'));
  await page.mouse.move(plot.left + plot.width / 2, plot.top + plot.height / 2);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(400);
  await settle(page, 4);
  await page.evaluate(() => window.harness.chart('chart-0').resetViewport());
  await page.waitForTimeout(400);
  await settle(page, 4);
}

for (const type of ['line', 'area'] as const) {
  test(`[perf:line-at-rest][gap-perf-gate-10] a 4.5M-point ${type} paints at rest`, async ({
    harnessPage: page,
  }) => {
    test.setTimeout(60_000);
    await mountWaveform(page, type);
    const plot = await page.evaluate(() => window.harness.plotRect('chart-0'));
    // A dense waveform covers most of its plot.
    expect(await ink(page)).toBeGreaterThan(plot.width * plot.height * 0.3);
  });

  test(`[perf:line-at-rest][gap-perf-gate-10] a 4.5M-point ${type} paints after zoom and reset`, async ({
    harnessPage: page,
  }) => {
    test.setTimeout(60_000);
    await mountWaveform(page, type);
    await zoomThenReset(page);
    const domain = await page.evaluate(() => window.harness.domain('chart-0', 'x'));
    expect(domain?.max).toBeGreaterThan(100);
    const plot = await page.evaluate(() => window.harness.plotRect('chart-0'));
    expect(await ink(page)).toBeGreaterThan(plot.width * plot.height * 0.3);
  });
}
