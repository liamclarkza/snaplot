// Colour, theme and mark-fill semantics read back from real canvases (plan
// §5.3, §5.4, RC7, RC8). Owned by M11.
import type { Page } from '@playwright/test';
import { expect, settle, test } from './fixtures';

type RGBA = [number, number, number, number];

/** Composite pixel of a chart at a data point. */
function pixelAt(page: Page, id: string, x: number, y: number): Promise<RGBA> {
  return page.evaluate(
    ([chartId, px, py]) => {
      const point = window.harness.toClient(chartId, px, py);
      return window.harness.pixel(chartId, point.x, point.y);
    },
    [id, x, y] as const,
  );
}

/** The topmost pixel of a canvas stack at client coordinates. */
function pixelClient(page: Page, id: string, x: number, y: number): Promise<RGBA> {
  return page.evaluate(([chartId, px, py]) => window.harness.pixel(chartId, px, py), [
    id,
    x,
    y,
  ] as const);
}

const distance = (a: RGBA, b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Relative luminance contrast of two sRGB colours. */
function contrast(a: number[], b: number[]): number {
  const lum = ([r, g, bl]: number[]) => {
    const channel = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(bl);
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test.describe('colour parsing', () => {
  test('[arch-02][backlog-17][render-17] a named continuous colorBy palette renders like its hex twin', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[arch-02]');
    await page.evaluate(() => {
      const data = [0, 5, 10].map((i) => ({ x: i, y: 5, c: i }));
      for (const [id, palette] of [
        ['named', ['red', 'blue']],
        ['hex', ['#ff0000', '#0000ff']],
      ] as const) {
        window.harness.mount(
          {
            data,
            x: 'x',
            series: [
              {
                type: 'scatter',
                y: 'y',
                pointRadius: 6,
                colorBy: { field: 'c', type: 'continuous', palette: [...palette] },
              },
            ],
            axes: { x: { min: -1, max: 11 }, y: { min: 0, max: 10 } },
          },
          { id, width: 400, height: 200 },
        );
      }
    });
    await settle(page);
    for (const x of [0, 10]) {
      const named = await pixelAt(page, 'named', x, 5);
      const hex = await pixelAt(page, 'hex', x, 5);
      expect(distance(named, hex), `x = ${x}: ${named} vs ${hex}`).toBeLessThan(30);
    }
  });

  test('[gap-annotations-extensibility-03] a named region fill keeps its opacity', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[gap-annotations-extensibility-03]');
    await page.evaluate(() => {
      const chart = window.harness.mount({
        data: [0, 10].map((t) => ({ t, v: 1 })),
        x: 't',
        series: [{ y: 'v' }],
        axes: { y: { min: 0, max: 10 } },
        referenceRegions: [{ axis: 'x', from: 2, to: 8, color: 'orange', opacity: 0.1 }],
      });
      chart.redraw();
    });
    await settle(page);
    const inside = await pixelAt(page, 'chart-0', 5, 6);
    // Orange at 10% over a near-white surface stays near white.
    expect(inside[2]).toBeGreaterThan(200);
  });

  test('[gap-annotations-extensibility-03] a var() region fill resolves its own colour', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[gap-annotations-extensibility-03]');
    await page.evaluate(() => {
      document.body.style.setProperty('--accent', '#ff00ff');
      const chart = window.harness.mount({
        data: [0, 10].map((t) => ({ t, v: 1 })),
        x: 't',
        series: [{ y: 'v' }],
        axes: { y: { min: 0, max: 10 } },
        referenceRegions: [
          { axis: 'x', from: 1, to: 3, color: 'hsl(200 80% 50%)', opacity: 0.5 },
          { axis: 'x', from: 6, to: 9, color: 'var(--accent)', opacity: 0.5 },
        ],
      });
      chart.redraw();
    });
    await settle(page);
    const [r, g, b] = await pixelAt(page, 'chart-0', 7.5, 6);
    // Magenta at 50%: red and blue high, green clearly lower.
    expect(r).toBeGreaterThan(200);
    expect(b).toBeGreaterThan(200);
    expect(g).toBeLessThan(180);
  });
});

test.describe('mark fills', () => {
  async function mountArea(page: Page, series: Record<string, unknown>): Promise<void> {
    await page.evaluate((extra) => {
      window.harness.mount({
        data: Array.from({ length: 11 }, (_, t) => ({ t, v: 8 })),
        x: 't',
        series: [{ type: 'area', y: 'v', ...extra }],
        axes: { y: { min: 0, max: 10 } },
      });
    }, series);
    await settle(page);
  }

  test('[render-03] an area honours fill: null', async ({ harnessPage: page }) => {
    test.fail(true, '[render-03]');
    await mountArea(page, { fill: null });
    const body = await pixelAt(page, 'chart-0', 5, 3);
    const outside = await pixelAt(page, 'chart-0', 5, 9.5);
    expect(distance(body, outside)).toBeLessThan(6);
  });

  test('[render-03] an area honours opacity', async ({ harnessPage: page }) => {
    test.fail(true, '[render-03]');
    await mountArea(page, {});
    const normal = await pixelAt(page, 'chart-0', 5, 3);
    await page.evaluate(() => window.harness.reset());
    await mountArea(page, { opacity: 0.3 });
    const faint = await pixelAt(page, 'chart-0', 5, 3);
    expect(distance(normal, faint)).toBeGreaterThan(8);
  });

  test('[render-03] a named-colour area fills translucently', async ({ harnessPage: page }) => {
    test.fail(true, '[render-03]');
    await mountArea(page, { color: 'steelblue' });
    const body = await pixelAt(page, 'chart-0', 5, 3);
    // Opaque steelblue is (70, 130, 180); a translucent fill is much lighter.
    expect(body[0]).toBeGreaterThan(150);
  });

  test('[visuals-02:fill] an area fills to zero, not to the plot bottom', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[visuals-02:fill]');
    await page.evaluate(() => {
      window.harness.mount({
        data: Array.from({ length: 11 }, (_, t) => ({ t, v: -20 })),
        x: 't',
        series: [{ type: 'area', y: 'v' }],
        axes: { y: { min: -30, max: 40 } },
      });
    });
    await settle(page);
    const between = await pixelAt(page, 'chart-0', 5, -10); // between the curve and 0
    const below = await pixelAt(page, 'chart-0', 5, -27); // between the curve and the bottom
    // The fill belongs between the curve and zero: that pixel is tinted, the one below is not.
    expect(between[2] - between[0]).toBeGreaterThan(below[2] - below[0] + 4);
  });

  test('[demos-06][backlog-12] a histogram honours its colour', async ({ harnessPage: page }) => {
    // 1.0 (M7): a histogram takes `color`, the colour of every mark, and paints its bars with it.
    await page.evaluate(() => {
      const bins = window.harness.histogram(
        Array.from({ length: 200 }, (_, i) => (i % 10) + 0.5),
        { binCount: 10 },
      );
      window.harness.mount({
        series: [{ type: 'histogram', id: 'h', data: bins, color: '#ff0000' }],
      });
    });
    await settle(page);
    const plot = await page.evaluate(() => window.harness.plotRect('chart-0'));
    const [r, g, b] = await pixelClient(
      page,
      'chart-0',
      plot.left + plot.width / 2,
      plot.bottom - plot.height * 0.2,
    );
    expect(r).toBeGreaterThan(b + 60);
    expect(r).toBeGreaterThan(g + 60);
  });

  test('[demos-10] a bar given one colour gets an outline in the same colour', async ({
    harnessPage: page,
  }) => {
    // 1.0 (M7): a bar has one `color` for its fill and outline; 0.12's separate fill is gone.
    await page.evaluate(() => {
      window.harness.mount({
        data: [{ q: 'A', v: 8 }],
        x: 'q',
        series: [{ type: 'bar', y: 'v', color: '#ff0000' }],
        axes: { y: { min: 0, max: 10 } },
      });
    });
    await settle(page);
    // Scan across the bar's mid-height for the outline pixels at its edges.
    const plot = await page.evaluate(() => window.harness.plotRect('chart-0'));
    const y = plot.top + plot.height * 0.6;
    let blueEdge = false;
    for (let x = plot.left; x < plot.right; x++) {
      const [r, , b] = await pixelClient(page, 'chart-0', x, y);
      if (b > r + 60) blueEdge = true;
    }
    expect(blueEdge).toBe(false);
  });
});

test.describe('ramps and surfaces', () => {
  test('[render-09] the lowest continuous colorBy values contrast with the surface', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[render-09]');
    await page.evaluate(() => {
      window.harness.mount({
        data: Array.from({ length: 12 }, (_, i) => ({ x: i, y: 5, c: i })),
        x: 'x',
        series: [
          { type: 'scatter', y: 'y', pointRadius: 5, colorBy: { field: 'c', type: 'continuous' } },
        ],
        axes: { x: { min: -1, max: 12 }, y: { min: 0, max: 10 } },
      });
    });
    await settle(page);
    const surface = await pixelAt(page, 'chart-0', 5, 9);
    const lowest = await pixelAt(page, 'chart-0', 0, 5);
    expect(contrast(lowest, surface)).toBeGreaterThanOrEqual(1.5);
  });

  test('[visuals-06] density is darkest where dense on a light surface', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[visuals-06]');
    await page.evaluate(() => {
      const data: Array<{ x: number; y: number }> = [];
      for (let i = 0; i < 4000; i++)
        data.push({ x: 2 + (i % 20) * 0.01, y: 2 + Math.floor(i / 20) * 0.01 });
      for (let i = 0; i < 40; i++)
        data.push({ x: 8 + (i % 5) * 0.2, y: 8 + Math.floor(i / 5) * 0.2 });
      window.harness.mount({
        data,
        x: 'x',
        series: [{ type: 'scatter', y: 'y', renderMode: 'density' }],
        axes: { x: { min: 0, max: 10 }, y: { min: 0, max: 10 } },
      });
    });
    await settle(page);
    const dense = await pixelAt(page, 'chart-0', 2.1, 2.9);
    const sparse = await pixelAt(page, 'chart-0', 8.4, 8.6);
    const luminance = ([r, g, b]: number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    expect(luminance(dense)).toBeLessThan(luminance(sparse));
  });

  test('[render-15][visuals-03] a dark CSS surface gets the dark palette', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[render-15]');
    await page.evaluate(() => {
      const card = document.createElement('div');
      card.id = 'card';
      card.style.cssText =
        'background:#14161f;color:#e2e2e5;padding:8px;--chart-surface:#14161f;--chart-bg:#14161f;--chart-text:#e2e2e5;';
      document.body.append(card);
      window.harness.mount(
        {
          data: Array.from({ length: 11 }, (_, t) => ({ t, v: 5 })),
          x: 't',
          series: [{ y: 'v', lineWidth: 6 }],
          axes: { y: { min: 0, max: 10 } },
        },
        { parentId: 'card' },
      );
    });
    await settle(page);
    const line = await pixelAt(page, 'chart-0', 5, 5);
    // The light palette's first colour is #0072B2 (0, 114, 178).
    expect(distance(line, [0, 114, 178])).toBeGreaterThan(40);
  });

  test('[visuals-03] a light page under a dark OS keeps a light chart', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[visuals-03]');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate(() => {
      window.harness.mount({
        data: Array.from({ length: 11 }, (_, t) => ({ t, v: 5 })),
        x: 't',
        series: [{ y: 'v' }],
        axes: { y: { min: 0, max: 10 } },
      });
    });
    await settle(page);
    const surface = await pixelAt(page, 'chart-0', 2, 8);
    expect(surface[0] + surface[1] + surface[2]).toBeGreaterThan(600);
  });

  test('[visuals-04] the plot surface is transparent over a cream card', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[visuals-04]');
    await page.evaluate(() => {
      const card = document.createElement('div');
      card.id = 'cream';
      card.style.cssText = 'background:#f6f1e7;padding:8px;';
      document.body.append(card);
      window.harness.mount(
        {
          data: Array.from({ length: 11 }, (_, t) => ({ t, v: 5 })),
          x: 't',
          series: [{ y: 'v' }],
          axes: { y: { min: 0, max: 10 } },
        },
        { parentId: 'cream' },
      );
    });
    await settle(page);
    const plot = await page.evaluate(() => window.harness.plotRect('chart-0'));
    // A probe between gridlines: the page shows through (no #fafbfc panel).
    const probe = await page.evaluate(
      ([x, y]) => {
        const canvases = window.harness.canvases('chart-0');
        return canvases.map((canvas) => {
          const rect = canvas.getBoundingClientRect();
          const context = canvas.getContext('2d');
          const px = Math.floor(((x - rect.left) / rect.width) * canvas.width);
          const py = Math.floor(((y - rect.top) / rect.height) * canvas.height);
          return context ? [...context.getImageData(px, py, 1, 1).data] : [];
        });
      },
      [plot.left + 7, plot.top + 7] as const,
    );
    // Every layer is transparent at that point.
    for (const rgba of probe) expect(rgba[3] ?? 0).toBe(0);
  });

  test('[render-04] a transparent theme background shows the page', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[render-04]');
    await page.evaluate(() => {
      const card = document.createElement('div');
      card.id = 'blue';
      card.style.cssText = 'background:#cfe3ff;padding:8px;';
      document.body.append(card);
      window.harness.mount(
        {
          data: Array.from({ length: 11 }, (_, t) => ({ t, v: 5 })),
          x: 't',
          series: [{ y: 'v' }],
          axes: { y: { min: 0, max: 10 } },
          theme: { surface: 'transparent' },
        },
        { parentId: 'blue' },
      );
    });
    await settle(page);
    const plot = await page.evaluate(() => window.harness.plotRect('chart-0'));
    const probe = await page.evaluate(
      ([x, y]) => {
        const grid = window.harness.canvases('chart-0')[0];
        const rect = grid.getBoundingClientRect();
        const px = Math.floor(((x - rect.left) / rect.width) * grid.width);
        const py = Math.floor(((y - rect.top) / rect.height) * grid.height);
        return [...(grid.getContext('2d')?.getImageData(px, py, 1, 1).data ?? [])];
      },
      [plot.left + 7, plot.top + 7] as const,
    );
    // Transparent (alpha 0), never opaque black.
    expect(probe[3]).toBe(0);
  });

  test('[gap-overhaul-delta-01] --chart-text drives the axis label colour', async ({
    harnessPage: page,
  }) => {
    test.fail(true, '[gap-overhaul-delta-01]');
    await page.evaluate(() => {
      const card = document.createElement('div');
      card.id = 'text';
      card.style.cssText = '--chart-text:#ff0000;';
      document.body.append(card);
      window.harness.mount(
        {
          data: Array.from({ length: 11 }, (_, t) => ({ t, v: t })),
          x: 't',
          series: [{ y: 'v' }],
        },
        { parentId: 'text' },
      );
    });
    await settle(page);
    const colours = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('#chart-0 span, #chart-0 div')]
        .filter((element) => /^\d+$/.test(element.textContent?.trim() ?? ''))
        .map((element) => getComputedStyle(element).color),
    );
    expect(colours.length).toBeGreaterThan(0);
    for (const colour of colours) expect(colour).toBe('rgb(255, 0, 0)');
  });
});
