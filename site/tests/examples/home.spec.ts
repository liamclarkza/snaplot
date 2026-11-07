// The homepage (plan §9, D34): the sentence, the install string, the streaming hero whose tabs
// show the files that run, the fact line and the examples. Build first
// (`npm run build && npm run build:site`).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { DEMOS } from '../../src/lib/demos';
import { BASE, DESKTOP, PHONE, watch } from './page-checks';

const site = fileURLToPath(new URL('../..', import.meta.url));
const repo = join(site, '..');
const HERO = '[data-example="home/hero"]';
const FILES = { vanilla: 'hero.ts', react: 'hero.react.tsx', solid: 'hero.solid.tsx' } as const;
const pkg = JSON.parse(readFileSync(join(repo, 'packages/snaplot/package.json'), 'utf8')) as {
  version: string;
};

/** Rows the hero has streamed since the page opened (the history it opens with excluded). */
const streamed = (page: Page) =>
  page.evaluate(
    () =>
      (globalThis as unknown as Record<symbol, { streamed: number } | undefined>)[
        Symbol.for('snaplot.site.hero')
      ]?.streamed ?? 0,
  );

/** Waits, then returns how many rows arrived meanwhile. */
async function rowsDuring(page: Page, ms: number): Promise<number> {
  const before = await streamed(page);
  await page.waitForTimeout(ms);
  return (await streamed(page)) - before;
}

const VANILLA = `${HERO} [role="tabpanel"][data-framework="vanilla"]`;

/** A fingerprint of what the vanilla hero has painted. */
const frame = (page: Page) =>
  page.evaluate((selector) => {
    let hash = 2166136261;
    for (const canvas of document.querySelectorAll<HTMLCanvasElement>(`${selector} canvas`)) {
      const url = canvas.toDataURL();
      for (let i = 0; i < url.length; i++) hash = Math.imul(hash ^ url.charCodeAt(i), 16777619);
    }
    return hash >>> 0;
  }, VANILLA);

/** Whether the vanilla hero's picture changes within half a second, as a live chart's does. */
async function moving(page: Page): Promise<boolean> {
  const before = await frame(page);
  await page.waitForTimeout(500);
  return (await frame(page)) !== before;
}

/** The vanilla hero's chart, scrolled into view. */
async function heroBox(page: Page) {
  const mount = page.locator(`${VANILLA} snaplot-vanilla-mount`);
  await mount.scrollIntoViewIfNeeded();
  const box = await mount.boundingBox();
  if (!box) throw new Error('no hero');
  return box;
}

/** Drags across the middle of the vanilla hero's plot: the default drag zooms X. */
async function dragAcrossHero(page: Page): Promise<void> {
  const box = await heroBox(page);
  const y = box.y + box.height * 0.5;
  await page.mouse.move(box.x + box.width * 0.3, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, y, { steps: 8 });
  await page.mouse.up();
  // Off the plot, so the crosshair does not repaint the overlay.
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height + 120);
}

/** The client position of a painted line pixel in the middle column of the hero's plot. */
async function linePixel(page: Page, panel: string) {
  return page.evaluate((selector) => {
    const host = document.querySelector(`${selector} [role="application"]`) ?? null;
    const canvases = [...(document.querySelector(selector)?.querySelectorAll('canvas') ?? [])];
    for (const canvas of canvases) {
      const box = canvas.getBoundingClientRect();
      const ctx = canvas.getContext('2d');
      if (!ctx || box.width < 100) continue;
      const scale = canvas.width / box.width;
      const x = Math.round(canvas.width * 0.6);
      const { data } = ctx.getImageData(x, 0, 1, canvas.height);
      // The data layer: coloured (not grey) opaque pixels are the series' lines.
      for (let y = Math.round(canvas.height * 0.1); y < canvas.height * 0.85; y++) {
        const [r = 0, g = 0, b = 0, a = 0] = data.slice(y * 4, y * 4 + 4);
        if (a > 200 && Math.max(r, g, b) - Math.min(r, g, b) > 60) {
          return { x: box.left + x / scale, y: box.top + y / scale, host: host !== null };
        }
      }
    }
    return null;
  }, panel);
}

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test.describe('the homepage', () => {
  test.use(DESKTOP);

  test('[research-10][uisite-11] one framework-neutral sentence and the install string', async ({
    page,
  }) => {
    await page.goto(BASE);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveText(
      'Canvas charts for live data. One options object for vanilla JS, React and Solid.',
    );
    const install = pkg.version.includes('-') ? 'npm i snaplot@next' : 'npm i snaplot';
    await expect(page.locator('main pre').first()).toHaveText(install);
    await expect(page.locator('main')).not.toContainText(/SolidJS applications/i);
  });

  test('[uisite-11][demos-15] each hero tab shows and copies the file that runs beside it', async ({
    page,
  }) => {
    const problems = watch(page);
    await page.goto(BASE);
    const hero = page.locator(HERO);
    await hero.scrollIntoViewIfNeeded();
    for (const [framework, file] of Object.entries(FILES)) {
      await hero.locator(`[role="tab"][data-framework="${framework}"]`).click();
      const panel = hero.locator(`[role="tabpanel"][data-framework="${framework}"]`);
      await expect(panel).toBeVisible();
      await expect(panel.locator('[data-example-code]')).toHaveAttribute('data-file', file);
      const source = readFileSync(join(site, 'src/examples/home', file), 'utf8');
      await panel.locator('.copy button').click();
      expect((await page.evaluate(() => navigator.clipboard.readText())).trimEnd()).toBe(
        source.trimEnd(),
      );
      // The file streams with appendData: its legend names the two series, and rows arrive.
      await expect(panel.locator('[data-example-output]')).toContainText('p50');
      await expect(panel.locator('[data-example-output]')).toContainText('p99');
      expect(source).toMatch(/appendData/);
      await expect.poll(() => rowsDuring(page, 400)).toBeGreaterThan(0);
    }
    // The vanilla tab mounts the very module whose source it shows.
    await expect(hero.locator('snaplot-vanilla-mount')).toHaveAttribute('data-name', 'home/hero');
    expect(problems).toEqual([]);
  });

  test('the hero streams about thirty rows a second', async ({ page }) => {
    await page.goto(BASE);
    await page.locator(HERO).scrollIntoViewIfNeeded();
    await expect.poll(() => rowsDuring(page, 400)).toBeGreaterThan(0);
    const perSecond = (await rowsDuring(page, 2000)) / 2;
    expect(perSecond).toBeGreaterThan(20);
    expect(perSecond).toBeLessThan(40);
  });

  test('[uisite-13] the Pause button stops and resumes the stream', async ({ page }) => {
    await page.goto(BASE);
    await page.locator(HERO).scrollIntoViewIfNeeded();
    const toggle = page.locator('[data-hero-toggle]');
    await expect(toggle).toHaveText('Pause');
    await expect.poll(() => rowsDuring(page, 400)).toBeGreaterThan(0);
    await toggle.click();
    await expect(toggle).toHaveText('Play');
    await page.waitForTimeout(200);
    expect(await rowsDuring(page, 1000)).toBe(0);
    await toggle.click();
    await expect(toggle).toHaveText('Pause');
    await expect.poll(() => rowsDuring(page, 400)).toBeGreaterThan(0);
  });

  test('[uisite-13] after a zoom the toggle reads "Back to live" and brings the hero back', async ({
    page,
  }) => {
    await page.goto(BASE);
    await page.locator(HERO).scrollIntoViewIfNeeded();
    const toggle = page.locator('[data-hero-toggle]');
    await expect.poll(() => moving(page)).toBe(true);

    // Playing: a zoom stops following the stream, and the toggle says how to get back.
    await dragAcrossHero(page);
    await expect(toggle).toHaveText('Back to live');
    await expect(toggle).toHaveAttribute('data-live', 'false');
    await toggle.click();
    await expect(toggle).toHaveText('Pause');
    await expect.poll(() => moving(page)).toBe(true);
    await expect.poll(() => rowsDuring(page, 400)).toBeGreaterThan(0);

    // Paused: the same, and going back to live also plays.
    await toggle.click();
    await expect(toggle).toHaveText('Play');
    await dragAcrossHero(page);
    await expect(toggle).toHaveText('Back to live');
    await toggle.click();
    await expect(toggle).toHaveText('Pause');
    await expect.poll(() => moving(page)).toBe(true);

    // A double-click, the chart's own reset, also follows the stream again.
    await dragAcrossHero(page);
    await expect(toggle).toHaveText('Back to live');
    const box = await heroBox(page);
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    await expect(toggle).toHaveText('Pause');
  });

  test('[uisite-13] the stream pauses while the hero is offscreen', async ({ page }) => {
    // Short enough that scrolling to the footer takes the hero out of view.
    await page.setViewportSize({ width: 1280, height: 420 });
    await page.goto(BASE);
    await page.locator(HERO).scrollIntoViewIfNeeded();
    await expect.poll(() => rowsDuring(page, 400)).toBeGreaterThan(0);
    await page.locator('.site-footer').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    expect(await rowsDuring(page, 1000)).toBe(0);
    await page.locator(HERO).scrollIntoViewIfNeeded();
    await expect.poll(() => rowsDuring(page, 400)).toBeGreaterThan(0);
  });

  test('[uisite-03] the hero shows its values under the pointer on its lines', async ({ page }) => {
    await page.goto(BASE);
    await page.locator(HERO).scrollIntoViewIfNeeded();
    await page.locator('[data-hero-toggle]').click();
    const at = await linePixel(page, `${HERO} [role="tabpanel"][data-framework="vanilla"]`);
    expect(at).not.toBeNull();
    await page.mouse.move(at?.x ?? 0, at?.y ?? 0);
    const tooltip = page.locator('body > div').filter({ hasText: /p99\s*[\d.]+/ });
    await expect(tooltip.first()).toBeVisible();
  });

  // Index tooltips anywhere along X (M12a): the 12 × 8 hover sweep shows 96 of 96.
  test('[uisite-03:library] the hero tooltip shows anywhere over its plot', async ({ page }) => {
    await page.goto(BASE);
    await page.locator(HERO).scrollIntoViewIfNeeded();
    await page.locator('[data-hero-toggle]').click();
    // The chart below its legend: the plot and its gutters.
    const output = `${HERO} [role="tabpanel"][data-framework="vanilla"] [data-example-output]`;
    const canvas = await page.locator(`${output} canvas`).first().boundingBox();
    const legend = await page.locator(`${output} [data-snaplot-legend]`).boundingBox();
    if (!canvas || !legend) throw new Error('no hero');
    const top = legend.y + legend.height;
    const plot = {
      x: canvas.x,
      y: top,
      width: canvas.width,
      height: canvas.y + canvas.height - top,
    };
    let shown = 0;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 12; col++) {
        await page.mouse.move(
          plot.x + plot.width * (0.15 + (0.8 * col) / 11),
          plot.y + plot.height * (0.15 + (0.6 * row) / 7),
        );
        if (await page.locator('body > div').filter({ hasText: /p99/ }).first().isVisible())
          shown++;
      }
    }
    expect(shown).toBe(96);
  });

  test('[gap-competitive-04] the only facts are measured ones, with no performance claims', async ({
    page,
  }) => {
    await page.goto(BASE);
    const facts = await page.locator('.facts').innerText();
    let measured: string;
    try {
      measured = execFileSync(process.execPath, [join(repo, 'scripts/size.mjs'), '--json'], {
        encoding: 'utf8',
      });
    } catch (error) {
      // Over a budget, size.mjs still prints the sizes before it exits 1, as the page reads them.
      measured = (error as { stdout?: string }).stdout ?? '';
    }
    const sizes = JSON.parse(measured) as { from: string; gzipBytes: number }[];
    for (const entry of ['snaplot', 'snaplot/react', 'snaplot/solid']) {
      const bytes = Math.max(...sizes.filter((s) => s.from === entry).map((s) => s.gzipBytes));
      expect(facts).toContain(`${entry} ${(bytes / 1024).toFixed(1)} KB`);
    }
    expect(facts).toContain(`v${pkg.version}`);
    expect(facts).toMatch(/\b0 dependencies\b/);
    expect(facts).toMatch(/React \d/);
    expect(facts).toMatch(/Solid \d/);
    // The page's own prose: everything in main but code, the chart and the examples' questions.
    const prose = await page.evaluate(() => {
      const hide = document.createElement('style');
      hide.textContent =
        'main pre, main code, main script, [data-example-output], .home-examples { display: none !important }';
      document.head.append(hide);
      const text = document.querySelector('main')?.innerText ?? '';
      hide.remove();
      return text;
    });
    expect(prose).not.toMatch(
      /\b(fast|faster|fastest|high-performance|performant|blazing|million|fps|frames per second|benchmark|dense)\b/i,
    );
  });

  test('[uisite-08] one sentence, and no shouting eyebrows', async ({ page }) => {
    await page.goto(BASE);
    const found = await page.evaluate(() => {
      const bad: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>('body *')) {
        const style = getComputedStyle(el);
        const box = el.getBoundingClientRect();
        if (box.width === 0 || Number(style.opacity) === 0 || style.visibility === 'hidden')
          continue;
        const spacing = Number.parseFloat(style.letterSpacing) / Number.parseFloat(style.fontSize);
        if (style.textTransform === 'uppercase' && spacing > 0.05)
          bad.push(`eyebrow: ${el.textContent}`);
      }
      return bad;
    });
    expect(found).toEqual([]);
    // One sentence, not a slogan stack: a single h1.
    await expect(page.locator('main h1')).toHaveCount(1);
  });

  test('the examples list shows every example with its framework, dataset and thumbnail', async ({
    page,
  }) => {
    await page.goto(BASE);
    const rows = page.locator('.home-examples > li');
    await expect(rows).toHaveCount(DEMOS.length);
    for (const demo of DEMOS) {
      const row = page.locator(`.home-examples > li[data-demo="${demo.slug}"]`);
      await expect(row).toContainText(demo.name);
      await expect(row).toContainText(`${demo.framework} · ${demo.dataset}`);
      if (existsSync(join(site, 'dist/examples', demo.slug, 'index.html'))) {
        await expect(row.getByRole('link', { name: demo.name })).toHaveAttribute(
          'href',
          `${BASE}examples/${demo.slug}/`,
        );
        const thumbnail = row.locator('img');
        await thumbnail.scrollIntoViewIfNeeded();
        await expect
          .poll(() =>
            thumbnail.evaluate((img: HTMLImageElement) =>
              img.naturalWidth > 0 ? (img.currentSrc.split('/').pop() ?? '') : '',
            ),
          )
          .toMatch(new RegExp(`^${demo.slug}(@2x)?\\.jpg$`));
      }
    }
  });
});

test('[uisite-20] the homepage, the hub, the docs and the demos carry a social card', async ({
  page,
  request,
}) => {
  const pages = [
    BASE,
    `${BASE}examples/`,
    `${BASE}first-chart/`,
    ...DEMOS.filter((demo) => existsSync(join(site, 'dist/examples', demo.slug, 'index.html'))).map(
      (demo) => `${BASE}examples/${demo.slug}/`,
    ),
  ];
  for (const path of pages) {
    await page.goto(path);
    const image = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(image, path).toMatch(/^https:\/\/liamclarkza\.github\.io\/snaplot\/examples\/.+\.jpg$/);
    // The card is published with the site: the same file is served here under the base.
    const local = await request.get(new URL(image ?? '').pathname);
    expect(local.status(), path).toBe(200);
    expect(local.headers()['content-type']).toBe('image/jpeg');
  }
});

test.describe('the homepage on a phone', () => {
  test.use(PHONE);

  test('the chart comes before its code and nothing overflows', async ({ page }) => {
    await page.goto(BASE);
    const panel = page.locator(`${HERO} [role="tabpanel"]:not([hidden])`);
    const chart = await panel.locator('[data-example-output]').boundingBox();
    const code = await panel.locator('[data-example-code]').boundingBox();
    expect((chart?.y ?? 0) < (code?.y ?? 0)).toBe(true);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('the homepage under reduced motion', () => {
  test.use({ ...DESKTOP, contextOptions: { reducedMotion: 'reduce' } });

  test('[uisite-13] the hero opens paused, with its history drawn, until Play', async ({
    page,
  }) => {
    await page.goto(BASE);
    await page.locator(HERO).scrollIntoViewIfNeeded();
    const toggle = page.locator('[data-hero-toggle]');
    await expect(toggle).toHaveText('Play');
    await expect(
      page.locator(`${HERO} [role="tabpanel"]:not([hidden]) canvas`).first(),
    ).toBeVisible();
    expect(await rowsDuring(page, 1500)).toBe(0);
    await toggle.click();
    await expect.poll(() => rowsDuring(page, 400)).toBeGreaterThan(0);
  });
});
