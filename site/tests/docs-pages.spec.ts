// The framework pages in the browser (docs-01, dxtrial-16): every example on them shows each
// framework's own code in its tab and paints a chart there. The smoke spec checks every route's
// examples paint and copy; this spec checks that the tabs teach the right framework, and that the
// pages' companions (a hook readout, a legend table) render beside their charts.
import { expect, type Page, test } from '@playwright/test';

const BASE = '/snaplot/';
const IMPORTS = {
  vanilla: "from 'snaplot'",
  react: "from 'snaplot/react'",
  solid: "from 'snaplot/solid'",
} as const;

async function tabCode(page: Page, index: number, framework: keyof typeof IMPORTS) {
  const example = page.locator('[data-example]').nth(index);
  await example.scrollIntoViewIfNeeded();
  await example.locator(`[role="tab"][data-framework="${framework}"]`).click();
  const panel = example.locator(`[role="tabpanel"][data-framework="${framework}"]`);
  await expect(panel).toBeVisible();
  return panel.locator('[data-example-code]').innerText();
}

test('[docs-01] each framework page shows vanilla, React and Solid code in its tabs', async ({
  page,
}) => {
  for (const slug of ['vanilla', 'react', 'solid']) {
    await page.goto(`${BASE}frameworks/${slug}/`);
    const count = await page.locator('[data-example]').count();
    expect(count, slug).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < count; i++) {
      for (const framework of ['vanilla', 'react', 'solid'] as const) {
        expect(await tabCode(page, i, framework), `${slug} #${i} ${framework}`).toContain(
          IMPORTS[framework],
        );
      }
    }
  }
});

test('[dxtrial-16] the React page runs its hooks and legend table beside the chart', async ({
  page,
}) => {
  await page.goto(`${BASE}frameworks/react/`);
  await page.locator('[data-example] [role="tab"][data-framework="react"]').first().click();
  const table = page.locator('[role="tabpanel"][data-framework="react"]:visible table').first();
  await table.scrollIntoViewIfNeeded();
  await expect(table).toBeVisible({ timeout: 10_000 });
  await expect(table.locator('tbody tr')).toHaveCount(2);
});
