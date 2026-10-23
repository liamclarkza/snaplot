// The built-in legend in a real browser (plan §5.6, RC12): an automatic legend
// for two series, styled without any CSS import, its text in the `muted` token
// that axis labels also use (plan §5.3). Owned by M12b.
import { expect, settle, test } from './fixtures';

test.describe('legend', () => {
  test('[dxtrial-06] two series show padded legend buttons in the axis-label colour, with no CSS import', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[dxtrial-06]');
    await page.evaluate(() => {
      window.harness.mount(
        {
          data: Array.from({ length: 30 }, (_, t) => ({ t, cpu: 40 + (t % 7), mem: 60 })),
          x: 't',
          series: [
            { y: 'cpu', label: 'CPU' },
            { y: 'mem', label: 'Memory' },
          ],
        },
        { width: 640, height: 320 },
      );
    });
    await settle(page);
    const legend = await page.evaluate(() => {
      const host = document.getElementById('chart-0');
      if (!host) throw new Error('no #chart-0');
      const leaves = (root: Element) =>
        [...root.querySelectorAll<HTMLElement>('*')].filter((node) => node.childElementCount === 0);
      const buttons = [...host.querySelectorAll<HTMLElement>('button[aria-pressed]')];
      // A Y tick label: a leaf with numeric text outside the legend.
      const tick = leaves(host).find(
        (node) => !node.closest('button') && /^\d+$/.test(node.textContent?.trim() ?? ''),
      );
      return {
        names: buttons.map((button) => button.textContent?.trim()),
        padding: buttons.map((button) => {
          const style = getComputedStyle(button);
          return Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
        }),
        // The colour of the element that holds the series name.
        text: buttons.map((button) => {
          const label = leaves(button).find((node) => node.textContent?.trim()) ?? button;
          return getComputedStyle(label).color;
        }),
        swatch: buttons.map((button) =>
          [...button.querySelectorAll<HTMLElement>('*')].some(
            (node) => Math.round(node.getBoundingClientRect().width) === 12,
          ),
        ),
        tick: tick ? getComputedStyle(tick).color : null,
      };
    });
    expect(legend.names).toEqual(['CPU', 'Memory']);
    for (const padding of legend.padding) expect(padding).toBeGreaterThan(0);
    expect(legend.swatch).toEqual([true, true]);
    expect(legend.tick, 'an axis tick label').not.toBeNull();
    expect(legend.text).toEqual([legend.tick, legend.tick]);
  });
});
