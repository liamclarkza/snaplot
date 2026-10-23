// Readout formatting in the real tooltip (plan §5.2, RC4), with the values of
// the audit's first-user trial (dxtrial). Owned by M10: its exit requires this
// file to have no `test.fail` left.
import { expect, hoverData, test, tooltipText } from './fixtures';

test.describe('tooltip formatting', () => {
  test('[dxtrial-03] the Y axis format drives the tooltip values', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[dxtrial-03]');
    await page.evaluate(() => {
      window.harness.mount({
        data: [
          { t: 0, cpu: 18, mem: 40 },
          { t: 1, cpu: 20.4, mem: 45.25 },
          { t: 2, cpu: 31, mem: 52 },
        ],
        x: 't',
        series: [
          { y: 'cpu', label: 'CPU' },
          { y: 'mem', label: 'Memory' },
        ],
        axes: { y: { min: 0, max: 100, format: (v) => `${v}%` } },
      });
    });
    await hoverData(page, 'chart-0', 1, 20.4);
    const text = await tooltipText(page);
    expect(text).toContain('20.4%');
    expect(text).toContain('45.25%');
  });

  test('[dxtrial-03] a dual-axis chart reads 4.84% and 718 ms', async ({ harnessPage: page }) => {
    test.fail(true, '[dxtrial-03]');
    await page.evaluate(() => {
      window.harness.mount({
        data: [
          { t: 0, errors: 1.2, latency: 640 },
          { t: 1, errors: 4.84, latency: 718 },
          { t: 2, errors: 2.5, latency: 702 },
        ],
        x: 't',
        series: [
          { y: 'errors', label: 'Errors' },
          { y: 'latency', label: 'Latency', yAxis: 'y2' },
        ],
        axes: {
          y: { format: (v) => `${v}%` },
          y2: { position: 'right', format: (v) => `${v} ms` },
        },
      });
    });
    await hoverData(page, 'chart-0', 1, 4.84);
    const text = await tooltipText(page);
    expect(text).toContain('4.84%');
    expect(text).toContain('718 ms');
  });

  test('[dxtrial-02] grouped bars read -0.8 at an integer step', async ({ harnessPage: page }) => {
    await page.evaluate(() => {
      window.harness.mount({
        data: [
          { q: 'Q1', emea: -2.5, apac: 1 },
          { q: 'Q2', emea: -0.8, apac: 2.2 },
          { q: 'Q3', emea: 1.2, apac: 0.6 },
          { q: 'Q4', emea: 2.7, apac: -1.3 },
        ],
        x: 'q',
        series: [
          { type: 'bar', y: 'emea', label: 'EMEA' },
          { type: 'bar', y: 'apac', label: 'APAC' },
        ],
      });
    });
    await hoverData(page, 'chart-0', 1, -0.8);
    const text = await tooltipText(page);
    expect(text).toContain('-0.8');
    expect(text).toContain('2.2');
  });

  test('[backlog-01] the X axis format drives the tooltip header', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[backlog-01]');
    await page.evaluate(() => {
      window.harness.mount({
        data: Array.from({ length: 40 }, (_, t) => ({ t, p95: 100 + (t % 7) * 5 })),
        x: 't',
        series: [{ y: 'p95', label: 'p95 latency' }],
        axes: { x: { format: (v) => `T+${v}s` }, y: { format: (v) => `${v} ms` } },
      });
    });
    await hoverData(page, 'chart-0', 20, 130);
    const text = await tooltipText(page);
    expect(text).toContain('T+20s');
    expect(text).toContain('130 ms');
  });

  test('[interact-02:format] a currency axis format reads $206k in the tooltip', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[interact-02:format]');
    await page.evaluate(() => {
      window.harness.mount({
        data: Array.from({ length: 6 }, (_, i) => ({ i, revenue: 180_000 + i * 13_000 })),
        x: 'i',
        series: [{ y: 'revenue', label: 'Revenue' }],
        axes: { y: { format: (v) => `$${Math.round(Number(v) / 1000)}k` } },
      });
    });
    await hoverData(page, 'chart-0', 2, 206_000);
    expect(await tooltipText(page)).toContain('$206k');
  });
});
