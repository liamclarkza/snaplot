/**
 * Shared Playwright fixtures for the browser specs: every test starts on the
 * harness page with an empty body. Geometry helpers run in the page through
 * `window.harness` (see harness.ts), so specs stay on the public API.
 */
import { test as base, expect, type Page } from '@playwright/test';
import type {} from './harness';

export const test = base.extend<{ harnessPage: Page }>({
  harnessPage: async ({ page }, use) => {
    await page.goto('/');
    await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
    await use(page);
  },
});

export { expect };

/** Move the mouse to a data point of a chart and let the frame land. */
export async function hoverData(
  page: Page,
  id: string,
  x: number,
  y: number,
  axes?: { x?: string; y?: string },
): Promise<{ x: number; y: number }> {
  const point = await page.evaluate(
    ([chartId, px, py, a]) => window.harness.toClient(chartId, px, py, a),
    [id, x, y, axes ?? {}] as const,
  );
  await page.mouse.move(point.x, point.y);
  await settle(page);
  return point;
}

/** Wait for two animation frames in the page. */
export async function settle(page: Page, frames = 2): Promise<void> {
  await page.evaluate((count) => window.harness.frames(count), frames);
}

/** The visible tooltip text, or null. */
export function tooltipText(page: Page): Promise<string | null> {
  return page.evaluate(() => window.harness.tooltip());
}

/** The plot rectangle of a chart in client coordinates. */
export function plotRect(page: Page, id = 'chart-0') {
  return page.evaluate((chartId) => window.harness.plotRect(chartId), id);
}
