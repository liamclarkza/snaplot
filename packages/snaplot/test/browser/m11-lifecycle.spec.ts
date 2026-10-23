// Surface lifecycle in a real compositor (plan §5.7, RC10): no black frames on
// mount or resize, ink in print, no tooltip in print. Owned by M11.
import type { Page } from '@playwright/test';
import { expect, hoverData, settle, test } from './fixtures';

/** Fraction of near-black pixels in a screenshot of an element. */
async function blackFraction(page: Page, selector: string): Promise<number> {
  const png = await page.locator(selector).screenshot({ animations: 'disabled' });
  return page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    if (!context) return 1;
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    let black = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 24 && data[i + 1] < 24 && data[i + 2] < 24) black++;
    }
    return black / (data.length / 4);
  }, png.toString('base64'));
}

/** Fraction of pixels that differ from the page background (white). */
async function inkFraction(page: Page, selector: string): Promise<number> {
  const png = await page.locator(selector).screenshot();
  return page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    if (!context) return 0;
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    let ink = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 200 || data[i + 1] < 200 || data[i + 2] < 200) ink++;
    }
    return ink / (data.length / 4);
  }, png.toString('base64'));
}

async function mountLine(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.harness.mount(
      {
        data: Array.from({ length: 200 }, (_, t) => ({ t, v: 50 + 30 * Math.sin(t / 15) })),
        x: 't',
        series: [{ y: 'v', label: 'Signal', lineWidth: 3 }],
      },
      { width: 600, height: 300 },
    );
  });
  await settle(page);
}

test.describe('lifecycle', () => {
  test('[gap-scale-longevity-01] a 30-step resize screencast has no frame more than 5% black', async ({
    harnessPage: page,
  }) => {
    await mountLine(page);
    const fractions: number[] = [];
    for (let step = 0; step < 30; step++) {
      await page.evaluate(
        (width) => {
          const host = document.getElementById('chart-0');
          if (host) host.style.width = `${width}px`;
        },
        600 - step * 7.3,
      );
      fractions.push(await blackFraction(page, '#chart-0'));
    }
    expect(Math.max(...fractions)).toBeLessThanOrEqual(0.05);
  });

  test('[gap-scale-longevity-01] the first composited frame after mount is not black', async ({
    harnessPage: page,
  }) => {
    await page.evaluate(() => {
      window.harness.mount(
        {
          data: Array.from({ length: 50 }, (_, t) => ({ t, v: t })),
          x: 't',
          series: [{ y: 'v' }],
        },
        { width: 433.5, height: 211.25 },
      );
    });
    expect(await blackFraction(page, '#chart-0')).toBeLessThanOrEqual(0.05);
  });

  test('[gap-environments-01] print emulation keeps the chart ink', async ({
    harnessPage: page,
  }) => {
    await mountLine(page);
    const screen = await inkFraction(page, '#chart-0');
    await page.emulateMedia({ media: 'print' });
    await settle(page);
    const print = await inkFraction(page, '#chart-0');
    expect(print).toBeGreaterThan(screen * 0.5);
    expect(await blackFraction(page, '#chart-0')).toBeLessThanOrEqual(0.05);
  });

  test('[gap-environments-02:print-basics] printing hides the tooltip', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[gap-environments-02:print-basics]');
    await mountLine(page);
    await hoverData(page, 'chart-0', 100, 50);
    expect(await page.evaluate(() => window.harness.tooltip())).not.toBeNull();
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await settle(page);
    expect(await page.evaluate(() => window.harness.tooltip())).toBeNull();
  });

  test('[gap-environments-02:print-basics] a printed chart does not split across pages', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[gap-environments-02:print-basics]');
    await mountLine(page);
    await page.emulateMedia({ media: 'print' });
    const breaks = await page.evaluate(() => {
      const host = document.getElementById('chart-0');
      const inner = host?.firstElementChild;
      return [host, inner].map((element) =>
        element ? getComputedStyle(element).breakInside : 'missing',
      );
    });
    expect(breaks).toContain('avoid');
  });
});
