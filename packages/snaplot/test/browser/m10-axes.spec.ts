// Axis labels measured as rendered (plan §5.1 "Label measurement", RC5):
// tabular digits, a large minimum font size and forced colours. Owned by M10.
import type { Page } from '@playwright/test';
import { expect, settle, test } from './fixtures';

/** Client rectangles of the chart's text labels (leaf nodes with text). */
function labelRects(page: Page, id = 'chart-0') {
  return page.evaluate((chartId) => {
    const host = document.getElementById(chartId);
    if (!host) return { host: null, labels: [] };
    const labels = [...host.querySelectorAll<HTMLElement>('*')]
      .filter((element) => element.childElementCount === 0 && element.textContent?.trim())
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          text: element.textContent?.trim() ?? '',
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
        };
      });
    const box = host.getBoundingClientRect();
    return {
      host: { left: box.left, right: box.right, top: box.top, bottom: box.bottom },
      labels,
    };
  }, id);
}

test.describe('axis label measurement', () => {
  test('[render-26] tabular-digit Y labels keep the 8 px edge margin', async ({
    harnessPage: page,
  }) => {
    await page.evaluate(() => {
      window.harness.mount({
        data: [1_111_111_111, 1_111_111_115, 1_111_111_119].map((v, t) => ({ t, v })),
        x: 't',
        series: [{ y: 'v' }],
        axes: { y: { format: (v) => String(Math.round(Number(v))) } },
      });
    });
    await settle(page);
    const { host, labels } = await labelRects(page);
    const yLabels = labels.filter((label) => /^1{4,}/.test(label.text));
    expect(yLabels.length).toBeGreaterThan(0);
    for (const label of yLabels) expect(label.left - (host?.left ?? 0)).toBeGreaterThanOrEqual(6);
  });

  test('[gap-environments-07] a 24 px minimum label font keeps every label inside the container', async ({
    harnessPage: page,
  }) => {
    await page.addStyleTag({ content: '#chart-0 * { font-size: 24px !important; }' });
    await page.evaluate(() => {
      window.harness.mount({
        data: [1_000_000, 1_150_000, 1_300_000].map((v, t) => ({ t: t * 25_000, v })),
        x: 't',
        series: [{ y: 'v' }],
      });
    });
    await settle(page);
    const { host, labels } = await labelRects(page);
    expect(labels.length).toBeGreaterThan(0);
    const outside = labels.filter(
      (label) =>
        label.left < (host?.left ?? 0) - 0.5 ||
        label.right > (host?.right ?? 0) + 0.5 ||
        label.top < (host?.top ?? 0) - 0.5 ||
        label.bottom > (host?.bottom ?? 0) + 0.5,
    );
    expect(outside.map((label) => label.text)).toEqual([]);
  });

  test('[gap-environments-05:labels] axis labels opt out of forced-colour backplates over the canvas', async ({
    harnessPage: page,
  }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await page.evaluate(() => {
      window.harness.mount({
        data: [1, 2, 3].map((t) => ({ t, v: t })),
        x: 't',
        series: [{ y: 'v' }],
      });
    });
    await settle(page);
    const adjust = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('#chart-0 *')]
        .filter(
          (element) => element.childElementCount === 0 && /^\d/.test(element.textContent ?? ''),
        )
        .map((element) => getComputedStyle(element).forcedColorAdjust),
    );
    expect(adjust.length).toBeGreaterThan(0);
    for (const value of adjust) expect(value).toBe('none');
  });
});
