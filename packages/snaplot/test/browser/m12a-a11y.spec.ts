// Accessibility (plan D20, RC11): a named figure, keyboard access, a live
// region, a visible focus ring and host attributes left as found. Owned by
// M12a. axe runs through @axe-core/playwright.
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, settle, test } from './fixtures';

async function mountCpu(page: Page, extra: Record<string, unknown> = {}): Promise<void> {
  await page.evaluate((options) => {
    const before = document.createElement('button');
    before.id = 'before';
    before.textContent = 'Before';
    const after = document.createElement('button');
    after.id = 'after';
    after.textContent = 'After';
    document.body.append(before);
    window.harness.mount({
      data: Array.from({ length: 30 }, (_, t) => ({ t, cpu: 30 + (t % 7) * 5 })),
      x: 't',
      series: [{ y: 'cpu', label: 'CPU' }],
      ariaLabel: 'CPU load',
      ...options,
    });
    document.body.append(after);
  }, extra);
  await settle(page);
}

test.describe('accessibility', () => {
  test('[interact-07] the host is a figure named by ariaLabel', async ({ harnessPage: page }) => {
    test.fail(true, '[interact-07]');
    await mountCpu(page);
    await expect(page.getByRole('figure', { name: 'CPU load' })).toHaveCount(1, { timeout: 1000 });
  });

  test('[interact-07] the interactive element is named by the chart, not by its tick text', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[interact-07]');
    await mountCpu(page);
    const application = page.getByRole('application');
    await expect(application).toHaveCount(1);
    await expect(application).toHaveAccessibleName(/CPU load/, { timeout: 1000 });
    await expect(application).toHaveAttribute('aria-keyshortcuts', /.+/, { timeout: 1000 });
  });

  test('[interact-07] tick labels and canvases are hidden from assistive tech', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[interact-07]');
    await mountCpu(page);
    const tree = await page.locator('#chart-0').ariaSnapshot();
    expect(tree).not.toMatch(/\b(0|10|20|30)\b.*\b(10|20|30|40)\b/);
  });

  test('[interact-07] arrow keys move the cursor and a polite live region reads it', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[interact-07]');
    await mountCpu(page);
    await page.locator('#before').focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    await settle(page);
    const cursor = await page.evaluate(() => window.harness.chart('chart-0').getCursor().x);
    expect(cursor).not.toBeNull();
    const live = await page.evaluate(() =>
      [...document.querySelectorAll('[aria-live="polite"]')].map((node) => node.textContent ?? ''),
    );
    expect(live.join(' ')).toMatch(/CPU/);
  });

  test('[interact-07] a readonly chart is not a tab stop', async ({ harnessPage: page }) => {
    test.fail(true, '[interact-07]');
    await mountCpu(page, { interaction: 'readonly' });
    await page.locator('#before').focus();
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('after');
  });

  test('[interact-08] a pointer down on the plot focuses the chart', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[interact-08]');
    await mountCpu(page);
    const plot = await page.evaluate(() => window.harness.plotRect('chart-0'));
    await page.mouse.click(plot.left + plot.width / 2, plot.top + plot.height / 2);
    expect(
      await page.evaluate(() =>
        document.getElementById('chart-0')?.contains(document.activeElement),
      ),
    ).toBe(true);
  });

  test('[interact-08][backlog-14] keyboard focus shows a visible focus ring', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[backlog-14]');
    await mountCpu(page);
    await page.locator('#before').focus();
    await page.keyboard.press('Tab');
    const ring = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element || !document.getElementById('chart-0')?.contains(element)) return null;
      const style = getComputedStyle(element);
      return { outline: style.outlineStyle, width: style.outlineWidth, shadow: style.boxShadow };
    });
    expect(ring).not.toBeNull();
    expect(ring?.outline !== 'none' || ring?.shadow !== 'none').toBe(true);
  });

  test('[gap-environments-05:focus] the focus ring stays visible in forced colours', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[gap-environments-05:focus]');
    await page.emulateMedia({ forcedColors: 'active' });
    await mountCpu(page);
    await page.locator('#before').focus();
    await page.keyboard.press('Tab');
    const outline = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element || !document.getElementById('chart-0')?.contains(element)) return 'not focused';
      return getComputedStyle(element).outlineStyle;
    });
    expect(outline).not.toBe('none');
    expect(outline).not.toBe('not focused');
  });

  test('[interact-23] createChart and destroy leave the host attributes as they were', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[interact-23]');
    const result = await page.evaluate(() => {
      const host = document.createElement('div');
      host.id = 'own';
      host.setAttribute('aria-label', 'My own label');
      host.style.cssText = 'width:400px;height:200px;';
      document.body.append(host);
      const snapshot = () =>
        Object.fromEntries(
          [...host.attributes].map((attribute) => [attribute.name, attribute.value]),
        );
      const before = snapshot();
      const chart = window.harness.createChart(host, {
        data: [
          { t: 0, y: 1 },
          { t: 1, y: 2 },
        ],
        x: 't',
        series: [{ y: 'y' }],
      });
      const mounted = host.getAttribute('aria-label');
      chart.destroy();
      return { before, mounted, after: snapshot() };
    });
    expect(result.mounted).toBe('My own label');
    expect(result.after).toEqual(result.before);
  });

  test('axe finds no serious or critical violations on a chart page', async ({
    harnessPage: page,
  }) => {
    await mountCpu(page);
    await page.evaluate(() => {
      window.harness.mount(
        {
          data: [
            { q: 'Q1', a: 3, b: 4 },
            { q: 'Q2', a: 5, b: 2 },
          ],
          x: 'q',
          series: [
            { type: 'bar', y: 'a', label: 'A' },
            { type: 'bar', y: 'b', label: 'B' },
          ],
          ariaLabel: 'Quarterly totals',
        },
        { id: 'bars' },
      );
    });
    await settle(page);
    const results = await new AxeBuilder({ page }).include('#chart-0').include('#bars').analyze();
    const serious = results.violations
      .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
      .map((violation) => `${violation.id}: ${violation.help}`);
    expect(serious).toEqual([]);
  });
});
