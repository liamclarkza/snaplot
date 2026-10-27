// The built-in legend in a real browser (plan §12 M8 exit, §5.6): two series show a styled
// legend whose buttons have a size, and the plot sits below it.
import { expect, settle, test } from './fixtures';

test.describe('legend', () => {
  test('[frameworks-11] two series show a styled legend above the plot, with sized buttons', async ({
    harnessPage: page,
  }) => {
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
        { width: 480, height: 260 },
      );
    });
    await settle(page);
    const geometry = await page.evaluate(() => {
      const host = document.getElementById('chart-0')!;
      const buttons = [...host.querySelectorAll<HTMLElement>('button[aria-pressed]')].map(
        (button) => {
          const box = button.getBoundingClientRect();
          const style = getComputedStyle(button);
          return {
            text: button.textContent?.trim(),
            width: box.width,
            height: box.height,
            bottom: box.bottom,
            // The injected stylesheet: no native button border, side padding.
            styled: style.borderTopWidth === '0px' && Number.parseFloat(style.paddingLeft) >= 6,
          };
        },
      );
      return {
        buttons,
        plotTop: window.harness.plotRect('chart-0').top,
        hostBottom: host.getBoundingClientRect().bottom,
        plotBottom: window.harness.plotRect('chart-0').bottom,
      };
    });
    expect(geometry.buttons.map((button) => button.text)).toEqual(['CPU', 'Memory']);
    for (const button of geometry.buttons) {
      expect(button.width).toBeGreaterThan(0);
      expect(button.height).toBeGreaterThan(0);
      expect(button.styled).toBe(true);
      expect(geometry.plotTop).toBeGreaterThanOrEqual(button.bottom);
    }
    expect(geometry.plotBottom).toBeLessThanOrEqual(geometry.hostBottom);
  });
});
