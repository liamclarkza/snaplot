// Checks every demo page passes (plan §10.1 #9), for the M16a specs in this folder: at 1280 and
// 390 px the page loads with no console errors or warnings, passes axe with no serious violations,
// has no horizontal overflow, shows the help text of the input it was opened with, keeps its data
// freshness visible, shows no NaN, Infinity or empty summary, and its footer carries the
// attribution line of the demo's SOURCE.md.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { type BrowserContextOptions, expect, type Page, test } from '@playwright/test';

export const BASE = '/snaplot/';
const site = fileURLToPath(new URL('../..', import.meta.url));

/** A phone: 390 × 844 CSS px with touch, so `(pointer: coarse)` matches. */
export const PHONE: BrowserContextOptions = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
};
export const DESKTOP: BrowserContextOptions = { viewport: { width: 1280, height: 900 } };

/** The text under a `## <name>` heading of the demo's SOURCE.md (its first line by default). */
export function sourceField(slug: string, name: string, all = false): string {
  const text = readFileSync(join(site, 'public/data', slug, 'SOURCE.md'), 'utf8');
  const body = new RegExp(`^## ${name}\\n+([\\s\\S]*?)(?=\\n## |$)`, 'm').exec(text)?.[1] ?? '';
  return (all ? body : (body.split('\n')[0] ?? '')).trim();
}

/** A file of the demo's data, as text. */
export function dataFile(slug: string, file: string): string {
  return readFileSync(join(site, 'public/data', slug, file), 'utf8');
}

/** Console errors and warnings, uncaught errors and failed requests. */
export function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      problems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('response', (response) => {
    if (response.status() >= 400) problems.push(`HTTP ${response.status()} ${response.url()}`);
  });
  return problems;
}

export async function seriousViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map(
      (v) =>
        `${v.id}: ${v.nodes
          .map((n) => n.target.join(' '))
          .slice(0, 3)
          .join(', ')}`,
    );
}

/** The most painted pixels in any canvas under `selector`. */
export function paintedPixels(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    let most = 0;
    for (const canvas of document.querySelectorAll<HTMLCanvasElement>(`${sel} canvas`)) {
      const ctx = canvas.getContext('2d');
      if (!ctx || canvas.width === 0 || canvas.height === 0) continue;
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let painted = 0;
      for (let i = 3; i < data.length; i += 4) if ((data[i] ?? 0) > 0) painted++;
      most = Math.max(most, painted);
    }
    return most;
  }, selector);
}

export interface DemoPage {
  slug: string;
  /** Elements whose text is a computed summary: never empty, NaN or Infinity. */
  summaries: string[];
  /** An element that states when the data was retrieved or how fresh it is, if the page has one. */
  freshness?: string;
}

/** Opens the demo and waits until its script has mounted the charts (`window.demo`). */
export async function openDemo(page: Page, slug: string): Promise<void> {
  const response = await page.goto(`${BASE}examples/${slug}/`);
  expect(response?.status()).toBe(200);
  await page.waitForFunction(() => 'demo' in window, undefined, { timeout: 20_000 });
}

/** The §10.1 #9 checks, at 1280 and at 390 px. */
export function demoPageChecks(demo: DemoPage): void {
  // [visuals-03] M11 (D4): `theme: 'auto'` follows the page the chart sits on. Until then a dark
  // system scheme gives these light pages dark charts.
  test.fixme("[visuals-03] a dark system scheme leaves the light page's charts light", async ({
    browser,
  }) => {
    const context = await browser.newContext({ ...DESKTOP, colorScheme: 'dark' });
    const page = await context.newPage();
    await openDemo(page, demo.slug);
    const ink = await page
      .locator('main [role="application"] span')
      .first()
      .evaluate((label) => getComputedStyle(label).color);
    const [r = 0, g = 0, b = 0] = (ink.match(/[\d.]+/g) ?? []).map(Number);
    expect((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255).toBeLessThan(0.5);
    await context.close();
  });

  for (const [name, device] of [
    ['1280 px', DESKTOP],
    ['390 px with touch', PHONE],
  ] as const) {
    test.describe(`at ${name}`, () => {
      test.use(device);

      test('loads cleanly, passes axe and has no horizontal overflow', async ({ page }) => {
        const problems = watch(page);
        await openDemo(page, demo.slug);
        await expect(page).toHaveTitle(/snaplot/);
        await expect.poll(() => paintedPixels(page, 'main')).toBeGreaterThan(1000);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
        expect(await seriousViolations(page)).toEqual([]);
        expect(problems).toEqual([]);
      });

      test('the footer carries the SOURCE.md attribution line and the licence', async ({
        page,
      }) => {
        test.fail(true, '[backlog-20] the footer reads "· <licence>", not "(<licence>)"');
        await openDemo(page, demo.slug);
        const footer = page.locator('footer');
        // §10.1 #8: "← Examples · Source · Data: <attribution line> (<licence>)".
        await expect(footer).toContainText(
          `Data: ${sourceField(demo.slug, 'Attribution')} (${sourceField(demo.slug, 'Licence')})`,
        );
        await expect(footer.getByRole('link', { name: '← Examples' })).toHaveAttribute(
          'href',
          `${BASE}examples/`,
        );
        await expect(footer.getByRole('link', { name: 'Source' })).toHaveAttribute(
          'href',
          new RegExp(`/site/src/demos/${demo.slug}$`),
        );
      });

      test('no summary is empty or shows NaN, Infinity or undefined', async ({ page }) => {
        await openDemo(page, demo.slug);
        for (const selector of demo.summaries) {
          const text = (await page.locator(selector).innerText()).trim();
          expect(text, selector).not.toBe('');
          expect(text, selector).not.toMatch(/NaN|Infinity|undefined|null|Loading/);
        }
        if (demo.freshness) await expect(page.locator(demo.freshness)).toBeVisible();
      });

      test('the help text matches the input', async ({ page }) => {
        await openDemo(page, demo.slug);
        const touch = name.includes('touch');
        for (const hint of await page.locator('.hint-touch').all()) {
          await expect(hint).toBeVisible({ visible: touch });
        }
        for (const hint of await page.locator('.hint-mouse').all()) {
          await expect(hint).toBeVisible({ visible: !touch });
        }
        const text = await page.locator('main').innerText();
        if (touch) expect(text).not.toMatch(/\b(click|hover|drag across|scroll wheel)\b/i);
        else expect(text).not.toMatch(/\b(tap|touch and hold|pinch)\b/i);
      });
    });
  }
}
