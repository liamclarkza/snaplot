// Every finite datum paints at least one pixel (plan §5.4, RC8), read back
// from the real canvases. Owned by M11.
import type { Page } from '@playwright/test';
import { expect, settle, test } from './fixtures';

type Datum = { t: number; v: number | null };

/** Data points (finite only) whose 7×7 neighbourhood has no series-blue pixel. */
async function unpainted(page: Page, data: Datum[]): Promise<number[]> {
  return page.evaluate((rows) => {
    const missing: number[] = [];
    for (const row of rows) {
      if (row.v === null || !Number.isFinite(row.v)) continue;
      const centre = window.harness.toClient('chart-0', row.t, row.v);
      let painted = false;
      for (let dx = -3; dx <= 3 && !painted; dx++) {
        for (let dy = -3; dy <= 3 && !painted; dy++) {
          const [r, g, b, a] = window.harness.pixel('chart-0', centre.x + dx, centre.y + dy);
          // The first palette colour is #0072B2: blue clearly above red.
          if (a > 0 && b > r + 60 && b > g + 20) painted = true;
        }
      }
      if (!painted) missing.push(row.t);
    }
    return missing;
  }, data);
}

async function mount(page: Page, data: Datum[], type: 'line' | 'area' = 'line'): Promise<void> {
  await page.evaluate(
    ([rows, kind]) => {
      window.harness.mount({
        data: rows,
        x: 't',
        series: [{ y: 'v', label: 'Value', type: kind }],
        axes: { x: { min: -1, max: 7 }, y: { min: 0, max: 10 } },
      });
    },
    [data, type] as const,
  );
  await settle(page);
}

test.describe('marks paint every finite datum', () => {
  test('every point of a dense line paints (control)', async ({ harnessPage: page }) => {
    const data = [0, 1, 2, 3, 4, 5, 6].map((t) => ({ t, v: 2 + (t % 3) * 2 }));
    await mount(page, data);
    expect(await unpainted(page, data)).toEqual([]);
  });

  test('[render-05] an isolated point between gaps paints on a line', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[render-05]');
    const data: Datum[] = [
      { t: 0, v: 2 },
      { t: 1, v: 3 },
      { t: 2, v: null },
      { t: 3, v: 6 },
      { t: 4, v: null },
      { t: 5, v: 4 },
      { t: 6, v: 5 },
    ];
    await mount(page, data);
    expect(await unpainted(page, data)).toEqual([]);
  });

  test('[render-05] an isolated point between gaps paints on an area', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[render-05]');
    const data: Datum[] = [
      { t: 0, v: 2 },
      { t: 1, v: null },
      { t: 2, v: 7 },
      { t: 3, v: null },
      { t: 4, v: 3 },
      { t: 5, v: 4 },
    ];
    await mount(page, data, 'area');
    expect(await unpainted(page, data)).toEqual([]);
  });

  test('[backlog-04][visuals-21:def-04] a single observation paints a marker', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[backlog-04]');
    const data: Datum[] = [{ t: 3, v: 5 }];
    await mount(page, data);
    expect(await unpainted(page, data)).toEqual([]);
  });
});
