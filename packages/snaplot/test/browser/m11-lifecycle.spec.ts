// Surface lifecycle in a real compositor (plan §5.7, RC10): no black frames on
// mount or resize, ink in print, no tooltip in print. Owned by M11.
//
// The black frames of gap-scale-longevity-01 exist only between a canvas
// reallocation and the next paint, so a screenshot (which forces a fresh
// frame) never sees them. These specs read what the compositor actually
// showed, through a CDP screencast, as the audit did
// (evidence/gap-scale-longevity/flicker3.mjs, flicker-mount.mjs). Print
// (gap-environments-01) is read from `page.pdf()`: real printing flips the
// resolution media query and snapshots the page with no animation frame in
// between (evidence/gap-environments/print.mjs), which `emulateMedia` does not
// reproduce because frames keep running under emulation.
import type { CDPSession, Page } from '@playwright/test';
import { expect, hoverData, settle, test } from './fixtures';

/** A client rectangle in CSS pixels. */
type Box = { left: number; top: number; width: number; height: number };

interface Frame {
  data: string;
  deviceWidth: number;
}

/** Collect every composited frame the page produces, acknowledging each one. */
async function startScreencast(
  page: Page,
): Promise<{ frames: Frame[]; stop: () => Promise<void> }> {
  const cdp: CDPSession = await page.context().newCDPSession(page);
  const frames: Frame[] = [];
  cdp.on('Page.screencastFrame', (event) => {
    frames.push({ data: event.data, deviceWidth: event.metadata.deviceWidth });
    cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
  return {
    frames,
    stop: async () => {
      await cdp.send('Page.stopScreencast');
      await cdp.detach();
    },
  };
}

/** Resolve once no new frame has arrived for `quietMs` (the page is idle). */
async function quiesce(page: Page, frames: Frame[], quietMs = 250, timeoutMs = 5000) {
  const start = Date.now();
  let count = frames.length;
  let since = Date.now();
  while (Date.now() - start < timeoutMs) {
    await page.waitForTimeout(50);
    if (frames.length !== count) {
      count = frames.length;
      since = Date.now();
    } else if (frames.length > 0 && Date.now() - since >= quietMs) return;
  }
}

/**
 * Per frame, the fraction of near-black pixels and of pixels that differ from
 * the white page inside `box` (CSS pixels), decoded in the page.
 */
function frameStats(page: Page, frames: Frame[], box: Box) {
  return page.evaluate(
    async ({ frames, box }) => {
      const out: Array<{ black: number; ink: number }> = [];
      for (const frame of frames) {
        const bytes = Uint8Array.from(atob(frame.data), (c) => c.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
        const scale = bitmap.width / frame.deviceWidth;
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('no 2d context');
        context.drawImage(bitmap, 0, 0);
        const x = Math.ceil(box.left * scale);
        const y = Math.ceil(box.top * scale);
        const w = Math.floor(box.width * scale);
        const h = Math.floor(box.height * scale);
        const { data } = context.getImageData(x, y, w, h);
        let black = 0;
        let ink = 0;
        for (let i = 0; i < data.length; i += 4) {
          const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
          if (r < 24 && g < 24 && b < 24) black++;
          if (r < 240 || g < 240 || b < 240) ink++;
        }
        const n = data.length / 4;
        out.push({ black: black / n, ink: ink / n });
      }
      return out;
    },
    { frames, box },
  );
}

async function mountLine(page: Page, width = 600, height = 300): Promise<void> {
  await page.evaluate(
    ([w, h]) => {
      window.harness.mount(
        {
          data: Array.from({ length: 200 }, (_, t) => ({ t, v: 50 + 30 * Math.sin(t / 15) })),
          x: 't',
          series: [{ y: 'v', label: 'Signal', lineWidth: 3 }],
        },
        { width: w, height: h },
      );
    },
    [width, height] as const,
  );
  await settle(page);
}

function hostBox(page: Page, id = 'chart-0'): Promise<Box> {
  return page.evaluate((hostId) => {
    const rect = document.getElementById(hostId)?.getBoundingClientRect();
    if (!rect) throw new Error(`no #${hostId}`);
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }, id);
}

interface PdfImage {
  width: number;
  height: number;
  /** Fraction of near-black pixels (colour images only). */
  black: number;
  /** Fraction of pixels with any alpha, from the image's soft mask (1 when opaque). */
  covered: number;
  opaque: boolean;
}

/**
 * Decode the image XObjects of a PDF in the page (Skia writes canvases as
 * FlateDecode bitmaps with an optional /SMask), so the test reads what was
 * printed without a PDF rasteriser.
 */
function pdfImages(page: Page, pdfBase64: string): Promise<PdfImage[]> {
  return page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const text = new TextDecoder('latin1').decode(bytes);
    const inflate = async (data: Uint8Array<ArrayBuffer>) => {
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    };
    type Raw = { dict: string; data: Uint8Array<ArrayBuffer> };
    const objects = new Map<string, Raw>();
    for (const match of text.matchAll(/(\d+) 0 obj\s*<</g)) {
      // The dictionary, with nested << >> pairs.
      let depth = 1;
      let i = (match.index ?? 0) + match[0].length;
      for (; i < text.length && depth > 0; i++) {
        if (text.startsWith('<<', i)) {
          depth++;
          i++;
        } else if (text.startsWith('>>', i)) {
          depth--;
          i++;
        }
      }
      const dict = text.slice((match.index ?? 0) + match[0].length, i - 2);
      const streamAt = text.slice(i).match(/^\s*stream\r?\n/);
      const length = Number(dict.match(/\/Length (\d+)/)?.[1]);
      if (!streamAt || !Number.isFinite(length)) continue;
      const start = i + streamAt[0].length;
      objects.set(match[1], { dict, data: bytes.subarray(start, start + length) });
    }
    const out: PdfImage[] = [];
    const masks = new Set(
      [...objects.values()].flatMap((o) =>
        [...o.dict.matchAll(/\/SMask (\d+) 0 R/g)].map((m) => m[1]),
      ),
    );
    for (const [id, object] of objects) {
      if (!/\/Subtype\s*\/Image/.test(object.dict) || masks.has(id)) continue;
      if (!/\/FlateDecode/.test(object.dict)) continue;
      const width = Number(object.dict.match(/\/Width (\d+)/)?.[1]);
      const height = Number(object.dict.match(/\/Height (\d+)/)?.[1]);
      const pixels = await inflate(object.data);
      const channels = pixels.length / (width * height);
      let black = 0;
      for (let i = 0; i + 2 < pixels.length; i += channels) {
        if (pixels[i] < 24 && pixels[i + 1] < 24 && pixels[i + 2] < 24) black++;
      }
      const maskId = object.dict.match(/\/SMask (\d+) 0 R/)?.[1];
      let covered = 1;
      if (maskId) {
        const mask = objects.get(maskId);
        if (!mask) throw new Error(`missing /SMask ${maskId}`);
        const alpha = await inflate(mask.data);
        let any = 0;
        for (const a of alpha) if (a > 0) any++;
        covered = any / alpha.length;
      }
      out.push({ width, height, black: black / (width * height), covered, opaque: !maskId });
    }
    return out;
  }, pdfBase64);
}

test.describe('lifecycle', () => {
  test('[gap-scale-longevity-01] no composited frame of a 30-step resize is more than 5% black', async ({
    harnessPage: page,
  }) => {
    await mountLine(page);
    const box = await hostBox(page);
    const cast = await startScreencast(page);
    await quiesce(page, cast.frames);
    const first = cast.frames.length;
    // One width change per animation frame, as a dragged splitter or a CSS
    // transition produces.
    await page.evaluate(async () => {
      const host = document.getElementById('chart-0');
      if (!host) throw new Error('no host');
      for (let step = 1; step <= 30; step++) {
        host.style.width = `${600 - step * 7.3}px`;
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    });
    await quiesce(page, cast.frames);
    await cast.stop();
    const frames = cast.frames.slice(first);
    // The narrowest width the host reaches bounds the region every frame shows.
    const stats = await frameStats(page, frames, { ...box, width: 600 - 30 * 7.3 });
    // The run must have measured the resize, not an idle page.
    expect(stats.length).toBeGreaterThanOrEqual(10);
    const worst = Math.max(...stats.map((s) => s.black));
    expect(
      worst,
      `black fraction per frame: ${stats.map((s) => s.black.toFixed(2)).join(' ')}`,
    ).toBeLessThanOrEqual(0.05);
  });

  test('[gap-scale-longevity-01] the first composited frame after mount shows the chart, not black', async ({
    harnessPage: page,
  }) => {
    const cast = await startScreencast(page);
    // A blank page still produces a first frame; wait until it is idle.
    await quiesce(page, cast.frames);
    const first = cast.frames.length;
    // A fractional host size: the observer's first box differs from the
    // integer client size the constructor sees.
    await page.evaluate(() => {
      window.harness.mount(
        {
          data: Array.from({ length: 200 }, (_, t) => ({ t, v: Math.sin(t / 10) * 10 })),
          x: 't',
          series: [{ y: 'v' }],
        },
        { width: 500.5, height: 240 },
      );
    });
    await quiesce(page, cast.frames);
    await cast.stop();
    const box = await hostBox(page);
    const [stats] = await frameStats(page, cast.frames.slice(first, first + 1), box);
    expect(stats, 'a frame was composited after the mount').toBeDefined();
    expect(stats.ink, 'the frame shows the chart').toBeGreaterThan(0.01);
    expect(stats.black).toBeLessThanOrEqual(0.05);
  });

  test('[gap-environments-01] page.pdf() prints the chart canvases with their ink', async ({
    harnessPage: page,
  }) => {
    await mountLine(page);
    // What the canvases hold when printing ends: no animation frame runs
    // between beforeprint and afterprint, so this is what the snapshot saw.
    await page.evaluate(() => {
      const layers = () =>
        window.harness.canvases('chart-0').map((canvas) => {
          const context = canvas.getContext('2d');
          // The overlay has no backing store until it first shows something.
          if (!context || canvas.width === 0) return { opaque: 0, inked: 0 };
          const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
          let opaque = 0;
          let inked = 0;
          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] === 255 && data[i] + data[i + 1] + data[i + 2] > 72) opaque++;
            if (data[i + 3] > 0) inked++;
          }
          const n = data.length / 4;
          return { opaque: opaque / n, inked: inked / n };
        });
      const record = window as unknown as { printed?: ReturnType<typeof layers> };
      addEventListener('afterprint', () => {
        record.printed = layers();
      });
    });
    const pdf = await page.pdf({ format: 'A4' });
    const images = await pdfImages(page, pdf.toString('base64'));
    const printed = await page.evaluate(
      () => (window as unknown as { printed?: Array<{ opaque: number; inked: number }> }).printed,
    );

    // In the page: the grid layer still holds its gridlines (it is transparent by default, plan
    // D5, so "painted" means inked, not opaque), and the data layer still holds the line.
    expect(printed, 'afterprint fired').toBeDefined();
    const [grid, marks] = printed ?? [];
    expect(grid.inked).toBeGreaterThan(0.002);
    expect(marks.inked).toBeGreaterThan(0.002);

    // In the PDF: the chart's layers are bitmaps of the backing-store size;
    // the opaque grid layer is not black and some layer carries the line.
    const layers = images.filter((image) => image.width === 600 && image.height === 300);
    expect(layers.length, `PDF images: ${JSON.stringify(images)}`).toBeGreaterThanOrEqual(2);
    // No opaque layer prints as a black box (a masked layer's RGB under alpha 0 is not shown),
    // and some layer carries the line.
    for (const image of layers.filter((layer) => layer.opaque))
      expect(image.black).toBeLessThanOrEqual(0.05);
    expect(Math.max(0, ...layers.map((image) => image.covered))).toBeGreaterThan(0.002);
  });

  test('[gap-environments-02:print-basics] printing hides the tooltip', async ({
    harnessPage: page,
  }) => {
    // beforeprint hides the tooltip (M11); a one-series line shows one on hover (M12a).
    await mountLine(page);
    await hoverData(page, 'chart-0', 100, 50);
    expect(await page.evaluate(() => window.harness.tooltip())).not.toBeNull();
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await settle(page);
    expect(await page.evaluate(() => window.harness.tooltip())).toBeNull();
  });

  test('[gap-environments-02:print-basics] a printed chart does not split across pages', async ({
    harnessPage: page,
  }) => {
    await mountLine(page);
    await page.emulateMedia({ media: 'print' });
    const breaks = await page.evaluate(() => {
      const host = document.getElementById('chart-0');
      const inner = host?.firstElementChild;
      return [host, inner].map((element) =>
        element ? getComputedStyle(element).breakInside : 'missing',
      );
    });
    expect(breaks).toContain('avoid');
  });
});

test.describe('mount below the fold', () => {
  test('a chart mounted far below the viewport paints nothing until it is scrolled to', async ({
    harnessPage: page,
  }) => {
    const renders = await page.evaluate(async () => {
      const spacer = document.createElement('div');
      spacer.style.height = '3000px';
      document.body.append(spacer);
      const chart = window.harness.mount({
        data: Array.from({ length: 200 }, (_, t) => ({ t, v: Math.sin(t / 10) })),
        x: 't',
        series: [{ y: 'v' }],
      });
      const count = () =>
        (chart as unknown as Record<symbol, any>)[Symbol.for('snaplot.debug')].renderCount.data;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const before = count();
      chart.container.scrollIntoView();
      await new Promise((resolve) => setTimeout(resolve, 300));
      return { before, after: count() };
    });
    expect(renders.before).toBe(0);
    expect(renders.after).toBeGreaterThan(0);
  });
});
