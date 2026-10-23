// Tooltip rows (plan §5.5, RC9). Owned by M12a: a known defect is marked
// `test.fail(true, '[id]')`; M12a flips it in its fix commit.
import { expect, hoverData, test, tooltipText } from './fixtures';

test.describe('tooltip rows', () => {
  test('[interact-03] a bar and line chart lists every series', async ({ harnessPage: page }) => {
    test.fail(true, '[interact-03]');
    await page.evaluate(() => {
      window.harness.mount({
        data: [
          { m: 'Jan', sales: 120, margin: 12 },
          { m: 'Feb', sales: 150, margin: 9 },
          { m: 'Mar', sales: 90, margin: 14 },
        ],
        x: 'm',
        series: [
          { type: 'bar', y: 'sales', label: 'Sales' },
          { y: 'margin', label: 'Margin', yAxis: 'y2' },
        ],
        axes: { y2: { position: 'right' } },
      });
    });
    await hoverData(page, 'chart-0', 1, 150);
    const text = await tooltipText(page);
    expect(text).toContain('Sales');
    expect(text).toContain('Margin');
  });

  test('[interact-03] a histogram with a fitted line lists the line', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[interact-03]');
    await page.evaluate(() => {
      const { histogram } = window.harness;
      const values = Array.from({ length: 400 }, (_, i) => 5 + Math.sin(i * 12.9898) * 3);
      const bins = histogram(values, { bins: 10 });
      const fit = Array.from(bins.edges.slice(0, -1), (edge, i) => ({
        x: (edge + bins.edges[i + 1]) / 2,
        y: bins.counts[i],
      }));
      window.harness.mount({
        x: 'x',
        series: [
          { type: 'histogram', id: 'counts', label: 'Counts', data: bins },
          { id: 'fit', label: 'Fit', data: fit, x: 'x', y: 'y' },
        ],
      });
    });
    const domain = await page.evaluate(() => window.harness.domain('chart-0', 'x'));
    const mid = ((domain?.min ?? 0) + (domain?.max ?? 10)) / 2;
    await hoverData(page, 'chart-0', mid, 10);
    const text = await tooltipText(page);
    expect(text).toContain('Counts');
    expect(text).toContain('Fit');
  });

  test('[interact-04] a single-series tooltip names its series', async ({ harnessPage: page }) => {
    test.fail(true, '[interact-04]');
    await page.evaluate(() => {
      window.harness.mount({
        data: Array.from({ length: 20 }, (_, t) => ({ t, cpu: 40 + (t % 5) * 3 })),
        x: 't',
        series: [{ y: 'cpu', label: 'CPU' }],
      });
    });
    await hoverData(page, 'chart-0', 10, 40);
    const text = await tooltipText(page);
    expect(text).not.toBeNull();
    expect(text).toContain('CPU');
  });

  test('[interact-04] two coincident points in nearest mode list both series', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[interact-04]');
    await page.evaluate(() => {
      window.harness.mount({
        x: 'x',
        series: [
          { id: 'a', label: 'Alpha', type: 'scatter', data: [{ x: 5, y: 5 }], x: 'x', y: 'y' },
          { id: 'b', label: 'Beta', type: 'scatter', data: [{ x: 5, y: 5 }], x: 'x', y: 'y' },
        ],
        axes: { x: { min: 0, max: 10 }, y: { min: 0, max: 10 } },
        tooltip: { mode: 'nearest' },
      });
    });
    await hoverData(page, 'chart-0', 5, 5);
    const text = await tooltipText(page);
    expect(text).toContain('Alpha');
    expect(text).toContain('Beta');
  });

  test('[visuals-05] a multi-series scatter shows only the point under the pointer', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[visuals-05]');
    await page.evaluate(() => {
      const group = (shift: number) =>
        Array.from({ length: 30 }, (_, i) => ({ h: 150 + i, w: 40 + shift + ((i * 7) % 11) }));
      window.harness.mount({
        x: 'h',
        series: [
          { id: 'a', label: 'Group A', type: 'scatter', data: group(0), x: 'h', y: 'w' },
          { id: 'b', label: 'Group B', type: 'scatter', data: group(30), x: 'h', y: 'w' },
          { id: 'c', label: 'Group C', type: 'scatter', data: group(60), x: 'h', y: 'w' },
        ],
      });
    });
    // Group B's point at h = 163 (index 13): w = 40 + 30 + (91 % 11) = 73.
    await hoverData(page, 'chart-0', 163, 73);
    const text = await tooltipText(page);
    expect(text).toContain('Group B');
    expect(text).not.toContain('Group A');
    expect(text).not.toContain('Group C');
  });

  test('[dxtrial-07] a scatter tooltip shows its colour category and tooltipFields in order', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[dxtrial-07]');
    await page.evaluate(() => {
      const makers = ['Tesla', 'Ford', 'Kia'];
      window.harness.mount({
        data: Array.from({ length: 24 }, (_, i) => ({
          year: 2030 + i,
          range: 300 + ((i * 37) % 200),
          maker: makers[i % 3],
          model: `M${i}`,
          price: 30_000 + i * 2_000,
        })),
        x: 'year',
        series: [
          {
            type: 'scatter',
            y: 'range',
            label: 'Range',
            colorBy: 'maker',
            tooltipFields: ['model', 'price'],
          },
        ],
      });
    });
    // Row 4: year 2034, range 300 + 148 = 448, maker Ford, price 38,000.
    await hoverData(page, 'chart-0', 2034, 448);
    const text = await tooltipText(page);
    expect(text).toContain('Ford');
    expect(text).toContain('M4');
    expect(text).toContain('38,000');
    expect(text?.indexOf('M4')).toBeLessThan(text?.indexOf('38,000') ?? -1);
  });

  test('[interact-02:hit] a category X tooltip header shows the category label', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[interact-02:hit]');
    await page.evaluate(() => {
      window.harness.mount({
        data: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'].map((m, i) => ({
          m,
          revenue: 180_000 + i * 12_000,
        })),
        x: 'm',
        series: [{ y: 'revenue', label: 'Revenue' }],
      });
    });
    await hoverData(page, 'chart-0', 2, 204_000);
    const text = await tooltipText(page);
    expect(text).not.toBeNull();
    expect(text?.split('\n')[0]?.trim()).toBe('Mar');
  });
});
