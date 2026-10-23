// Pointer, wheel and keyboard interaction in a real browser (plan RC2, RC9,
// RC11, §5.5). Owned by M12a.
import type { Page } from '@playwright/test';
import { expect, hoverData, plotRect, settle, test, tooltipText } from './fixtures';

/** A 0..60 line chart with three series, unclamped zoom. */
async function mountLines(page: Page, extra: Record<string, unknown> = {}): Promise<void> {
  await page.evaluate((options) => {
    window.harness.mount({
      data: Array.from({ length: 61 }, (_, t) => ({ t, a: 20 + (t % 5), b: 40 + (t % 3), c: 60 })),
      x: 't',
      series: [
        { y: 'a', label: 'A' },
        { y: 'b', label: 'B' },
        { y: 'c', label: 'C' },
      ],
      axes: { y: { min: 0, max: 100 } },
      ...options,
    });
  }, extra);
  await settle(page);
}

async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  holdMs = 0,
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  if (holdMs) await page.waitForTimeout(holdMs);
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  await settle(page);
}

const domain = (page: Page, axis = 'x', id = 'chart-0') =>
  page.evaluate(([chartId, key]) => window.harness.domain(chartId, key), [id, axis] as const);

test.describe('hover model', () => {
  test('[interact-09] the cursor is recomputed under a still pointer after a viewport change', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[interact-09]');
    await mountLines(page);
    await hoverData(page, 'chart-0', 13, 50);
    await page.evaluate(() =>
      window.harness.chart('chart-0').setViewport({ x: { min: 15, max: 44 } }),
    );
    await settle(page);
    const cursor = await page.evaluate(() => window.harness.chart('chart-0').getState().cursor.x);
    expect(cursor).not.toBe(13);
    expect(Number(cursor)).toBeGreaterThanOrEqual(15);
  });

  test('[interact-09] hiding every series empties the tooltip', async ({ harnessPage: page }) => {
    test.fail(true, '[interact-09]');
    await mountLines(page);
    await hoverData(page, 'chart-0', 30, 50);
    expect(await tooltipText(page)).toContain('A');
    await page.evaluate(() => {
      const chart = window.harness.chart('chart-0');
      for (const id of ['a', 'b', 'c']) chart.setSeriesVisible(id, false);
    });
    await settle(page);
    expect(await tooltipText(page)).toBeNull();
  });
});

test.describe('brush selection', () => {
  const brush = { interaction: { drag: 'select' } };

  async function select(page: Page): Promise<void> {
    const plot = await plotRect(page);
    const y = plot.top + plot.height / 2;
    await drag(
      page,
      { x: plot.left + plot.width * (40 / 60), y },
      { x: plot.left + plot.width * (50 / 60), y },
    );
  }

  test('[interact-10] Escape clears a brush selection', async ({ harnessPage: page }) => {
    test.fail(true, '[interact-10]');
    await mountLines(page, brush);
    await select(page);
    expect(
      await page.evaluate(() => window.harness.chart('chart-0').getState().selection),
    ).not.toBeNull();
    await page.keyboard.press('Escape');
    await settle(page);
    expect(
      await page.evaluate(() => window.harness.chart('chart-0').getState().selection),
    ).toBeNull();
  });

  test('[interact-10] a click outside the brush clears it', async ({ harnessPage: page }) => {
    test.fail(true, '[interact-10]');
    await mountLines(page, brush);
    await select(page);
    const plot = await plotRect(page);
    await page.mouse.click(plot.left + plot.width * 0.1, plot.top + plot.height / 2);
    await settle(page);
    expect(
      await page.evaluate(() => window.harness.chart('chart-0').getState().selection),
    ).toBeNull();
  });

  test('[interact-10] a brush dragged past the plot edge is clamped to the domain', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[interact-10]');
    await mountLines(page, brush);
    const plot = await plotRect(page);
    const y = plot.top + plot.height / 2;
    await drag(page, { x: plot.left + plot.width * 0.5, y }, { x: plot.left - 60, y });
    const selection = await page.evaluate(
      () => window.harness.chart('chart-0').getState().selection,
    );
    expect(selection?.x?.min).toBeGreaterThanOrEqual(0);
  });
});

test.describe('box zoom', () => {
  test('[interact-13] a box zoom respects the minimum span', async ({ harnessPage: page }) => {
    test.fail(true, '[interact-13]');
    // zoom.minRange left the public options in M7; M12a restates this test against the internal
    // minimum span (D29).
    await mountLines(page);
    const plot = await plotRect(page);
    const y = plot.top + plot.height / 2;
    await drag(
      page,
      { x: plot.left + plot.width * (30 / 60), y },
      { x: plot.left + plot.width * (35 / 60), y },
    );
    const x = await domain(page);
    expect((x?.max ?? 0) - (x?.min ?? 0)).toBeGreaterThanOrEqual(19.9);
  });

  test('[interact-13] a 2 px wide vertical drag does not zoom', async ({ harnessPage: page }) => {
    test.fail(true, '[interact-13]');
    await mountLines(page);
    const before = await domain(page);
    const plot = await plotRect(page);
    const x = plot.left + plot.width / 2;
    await drag(page, { x, y: plot.top + 10 }, { x: x + 2, y: plot.bottom - 10 });
    expect(await domain(page)).toEqual(before);
  });

  test('[interact-13] a box zoom on a category axis keeps whole categories', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[interact-13]');
    await page.evaluate(() => {
      window.harness.mount({
        data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => ({ d, v: 3 + i })),
        x: 'd',
        series: [{ type: 'bar', y: 'v', label: 'Visits' }],
      });
    });
    await settle(page);
    const plot = await plotRect(page);
    const y = plot.top + plot.height / 2;
    await drag(
      page,
      { x: plot.left + plot.width * 0.3, y },
      { x: plot.left + plot.width * 0.55, y },
    );
    const x = await domain(page);
    // Whole slots: both edges sit on a slot boundary (k − 0.5).
    expect(Math.abs(((x?.min ?? 0) + 0.5) % 1)).toBeLessThan(1e-6);
    expect(Math.abs(((x?.max ?? 0) + 0.5) % 1)).toBeLessThan(1e-6);
  });

  test('[interact-14] a box zoom while following selects the range under the pointer at press time', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[interact-14]');
    await page.evaluate(() => {
      window.harness.mount({
        data: Array.from({ length: 200 }, (_, t) => ({ t, v: 10 + (t % 9) })),
        x: 't',
        series: [{ y: 'v', label: 'V' }],
        streaming: { maxPoints: 300, followWindow: 100 },
      });
    });
    await settle(page);
    const plot = await plotRect(page);
    const y = plot.top + plot.height / 2;
    const pressX = plot.left + plot.width * 0.25;
    const pressData = await page.evaluate(
      ([px, left, width]) => {
        const range = window.harness.domain('chart-0', 'x');
        return range ? range.min + ((px - left) / width) * (range.max - range.min) : 0;
      },
      [pressX, plot.left, plot.width] as const,
    );
    await page.mouse.move(pressX, y);
    await page.mouse.down();
    await page.mouse.move(pressX + 30, y, { steps: 3 });
    await page.evaluate(() =>
      window.harness
        .chart('chart-0')
        .appendData(Array.from({ length: 40 }, (_, i) => ({ t: 200 + i, v: 10 + (i % 9) }))),
    );
    await page.mouse.move(plot.left + plot.width * 0.5, y, { steps: 3 });
    await page.mouse.up();
    await settle(page);
    const x = await domain(page);
    expect(Math.abs((x?.min ?? 0) - pressData)).toBeLessThan(3);
  });
});

test.describe('clicks, wheel and keys', () => {
  test('[interact-17] a click held for 600 ms still fires point:click', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[interact-17]');
    await mountLines(page);
    await page.evaluate(() => window.harness.record('chart-0', 'point:click'));
    const point = await page.evaluate(() => window.harness.toClient('chart-0', 30, 20));
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.up();
    await settle(page);
    const clicks = await page.evaluate(
      () => window.harness.events.filter((event) => event.name === 'point:click').length,
    );
    expect(clicks).toBe(1);
  });

  test('a quick click fires point:click (control)', async ({ harnessPage: page }) => {
    await mountLines(page);
    await page.evaluate(() => window.harness.record('chart-0', 'point:click'));
    const point = await page.evaluate(() => window.harness.toClient('chart-0', 30, 20));
    await page.mouse.click(point.x, point.y);
    await settle(page);
    const clicks = await page.evaluate(
      () => window.harness.events.filter((event) => event.name === 'point:click').length,
    );
    expect(clicks).toBe(1);
  });

  test('[interact-18] Ctrl+wheel reaches the page when zoom is disabled', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[interact-18]');
    await mountLines(page, { interaction: { zoom: 'none' } });
    await page.evaluate(() => {
      (window as unknown as { wheelPrevented: boolean[] }).wheelPrevented = [];
      window.addEventListener('wheel', (event) => {
        (window as unknown as { wheelPrevented: boolean[] }).wheelPrevented.push(
          event.defaultPrevented,
        );
      });
    });
    const plot = await plotRect(page);
    await page.mouse.move(plot.left + plot.width / 2, plot.top + plot.height / 2);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -100);
    await page.keyboard.up('Control');
    await settle(page);
    const prevented = await page.evaluate(
      () => (window as unknown as { wheelPrevented: boolean[] }).wheelPrevented,
    );
    expect(prevented.length).toBeGreaterThan(0);
    expect(prevented.every((value) => !value)).toBe(true);
  });

  test('[interact-18] a line-mode wheel notch zooms as much as a pixel-mode notch', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[interact-18]');
    await mountLines(page);
    const zoomBy = async (deltaMode: number, deltaY: number) => {
      await page.evaluate(() => window.harness.chart('chart-0').resetViewport());
      await settle(page);
      const plot = await plotRect(page);
      await page.evaluate(
        ([x, y, mode, dy]) => {
          const target = document.elementFromPoint(x, y);
          target?.dispatchEvent(
            new WheelEvent('wheel', {
              clientX: x,
              clientY: y,
              deltaY: dy,
              deltaMode: mode,
              ctrlKey: true,
              bubbles: true,
              cancelable: true,
            }),
          );
        },
        [plot.left + plot.width / 2, plot.top + plot.height / 2, deltaMode, deltaY] as const,
      );
      await settle(page);
      const x = await domain(page);
      return (x?.max ?? 0) - (x?.min ?? 0);
    };
    const pixel = await zoomBy(0, -100);
    const line = await zoomBy(1, -3);
    expect(line).toBeCloseTo(pixel, 0);
  });

  test('[interact-18] Home passes through to the page when zoom and pan are disabled', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[interact-18]');
    await mountLines(page, { interaction: { zoom: 'none' } });
    const prevented = await page.evaluate(() => {
      const target = document.querySelector('#chart-0 [tabindex]') as HTMLElement | null;
      target?.focus();
      const event = new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true });
      (target ?? document.body).dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(prevented).toBe(false);
  });
});

test.describe('containers', () => {
  test('[interact-11] the tooltip shows on top inside a modal dialog', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[interact-11]');
    await page.evaluate(() => {
      const dialog = document.createElement('dialog');
      dialog.id = 'dialog';
      dialog.innerHTML = '<div id="slot"></div>';
      document.body.append(dialog);
      dialog.showModal();
      window.harness.mount(
        {
          data: Array.from({ length: 61 }, (_, t) => ({ t, a: 20 + (t % 5) })),
          x: 't',
          series: [{ y: 'a', label: 'Alpha' }],
          axes: { y: { min: 0, max: 100 } },
        },
        { parentId: 'slot', width: 500, height: 260 },
      );
    });
    await settle(page);
    await hoverData(page, 'chart-0', 30, 20);
    const onTop = await page.evaluate(() => {
      const host = document.getElementById('chart-0');
      for (const element of document.querySelectorAll<HTMLElement>('body *')) {
        const style = getComputedStyle(element);
        if (style.position !== 'fixed' || Number(style.opacity) < 0.5 || !element.textContent)
          continue;
        if (element.contains(host)) continue; // the modal dialog itself
        // The tooltip ignores the pointer; make it hit-testable for the probe.
        element.style.pointerEvents = 'auto';
        const box = element.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        element.style.pointerEvents = '';
        return hit && (hit === element || element.contains(hit)) ? 'on top' : 'occluded';
      }
      return 'no tooltip';
    });
    expect(onTop).toBe('on top');
  });

  test('[interact-12] hit testing is correct inside a transform: scale(0.5) wrapper', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[interact-12]');
    await page.evaluate(() => {
      const wrapper = document.createElement('div');
      wrapper.id = 'wrapper';
      wrapper.style.cssText = 'transform: scale(0.5); transform-origin: 0 0;';
      document.body.append(wrapper);
      window.harness.mount(
        {
          data: Array.from({ length: 61 }, (_, t) => ({ t, a: 50 })),
          x: 't',
          series: [{ y: 'a', label: 'Alpha' }],
          axes: { y: { min: 0, max: 100 } },
        },
        { parentId: 'wrapper' },
      );
    });
    await settle(page);
    // The visible plot is the canvas' on-screen rectangle (already scaled).
    const visible = await page.evaluate(() => {
      const canvas = window.harness.canvases('chart-0')[1];
      const chart = window.harness.chart('chart-0');
      const { plot, width } = chart.getLayout();
      const rect = canvas.getBoundingClientRect();
      const scale = rect.width / width;
      return {
        left: rect.left + plot.left * scale,
        top: rect.top + plot.top * scale,
        width: plot.width * scale,
        height: plot.height * scale,
      };
    });
    await page.mouse.move(visible.left + visible.width * 0.75, visible.top + visible.height / 2);
    await settle(page);
    const cursor = await page.evaluate(() => window.harness.chart('chart-0').getState().cursor.x);
    expect(Number(cursor)).toBeGreaterThanOrEqual(44);
    expect(Number(cursor)).toBeLessThanOrEqual(46);
  });
});
