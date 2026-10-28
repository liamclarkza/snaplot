// The examples hub (plan §10.3): an index of the six examples, two per framework, each with its
// question, task, dataset, licence and size, a thumbnail Playwright took of the real page, and
// Open and Source links. Build first (`npm run build && npm run build:site`, then `npm run thumbs`).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { fly } from '../../src/demos/max-q/flight';
import { DEMOS } from '../../src/lib/demos';
import { BASE, DESKTOP, PHONE, watch } from './page-checks';

const site = fileURLToPath(new URL('../..', import.meta.url));
const built = (slug: string) => existsSync(join(site, 'dist/examples', slug, 'index.html'));
const lines = (slug: string, file: string) =>
  readFileSync(join(site, 'public/data', slug, file), 'utf8')
    .trim()
    .split('\n').length - 1;

/** The size each row states, counted from the data files. */
const SIZES: Record<string, () => string[]> = {
  'max-q': () => [fly().frames.length.toLocaleString('en-US')],
  'hottest-year': () => [
    (
      JSON.parse(readFileSync(join(site, 'public/data/hottest-year/daily.json'), 'utf8')) as {
        temps: unknown[];
      }
    ).temps.length.toLocaleString('en-US'),
  ],
  'pick-a-checkpoint': () => [
    lines('pick-a-checkpoint', 'train.csv').toLocaleString('en-US'),
    String(lines('pick-a-checkpoint', 'val.csv')),
  ],
  'battery-payback': () => [lines('battery-payback', 'hourly.csv').toLocaleString('en-US')],
  'find-the-clipping': () => [
    String(
      Math.round(
        (
          JSON.parse(
            readFileSync(join(site, 'public/data/find-the-clipping/recording.json'), 'utf8'),
          ) as { durationSeconds: number }
        ).durationSeconds,
      ),
    ),
  ],
  'deploy-482': () => ['generated in the browser'],
};

test.describe('the examples hub', () => {
  test.use(DESKTOP);

  test('[demos-01] lists six examples, two for each framework', async ({ page }) => {
    await page.goto(`${BASE}examples/`);
    const rows = page.locator('.examples > li');
    await expect(rows).toHaveCount(6);
    for (const framework of ['Vanilla JS', 'React', 'Solid']) {
      await expect(page.locator(`.examples > li[data-framework="${framework}"]`)).toHaveCount(2);
    }
  });

  test('[demos-01] each framework has two built example pages', async ({ page, request }) => {
    await page.goto(`${BASE}examples/`);
    const open = (framework: string) =>
      page.locator(`.examples > li[data-framework="${framework}"]`).getByRole('link', {
        name: 'Open',
      });
    for (const framework of ['Vanilla JS', 'React', 'Solid']) {
      await expect(open(framework), framework).toHaveCount(2);
    }
    for (const link of await page.getByRole('link', { name: 'Open' }).all()) {
      const response = await request.get((await link.getAttribute('href')) ?? '');
      expect(response.status()).toBe(200);
    }
  });

  test('[uisite-09] an index, not a landing page: one heading, one sentence, the rows', async ({
    page,
  }) => {
    const problems = watch(page);
    await page.goto(`${BASE}examples/`);
    await expect(page.locator('main h1')).toHaveText('Examples');
    await expect(page.locator('main > p')).toHaveText([
      'Each example answers one question with real or documented data; for one chart type at a time, with its code, see Chart types.',
    ]);
    expect(
      await page.locator('main > *').evaluateAll((els) => els.map((el) => el.tagName)),
    ).toEqual(['H1', 'P', 'UL']);
    // Every heading is an example's question; every picture is a thumbnail.
    await expect(page.locator('main h2')).toHaveText(DEMOS.map((demo) => demo.question));
    expect(await page.locator('main img:not(.thumb)').count()).toBe(0);
    expect(problems).toEqual([]);
  });

  test('[uisite-09][demos-12] every built example has a real thumbnail file of its page', async ({
    page,
    request,
  }) => {
    await page.goto(`${BASE}examples/`);
    const builtDemos = DEMOS.filter((demo) => built(demo.slug));
    expect(builtDemos.length).toBeGreaterThanOrEqual(2);
    for (const demo of builtDemos) {
      const file = join(site, 'public/examples', `${demo.slug}.jpg`);
      expect(existsSync(file), `${demo.slug}: run npm run thumbs`).toBe(true);
      expect(statSync(file).size).toBeLessThanOrEqual(60 * 1024);
      const retina = file.replace(/\.jpg$/, '@2x.jpg');
      expect(existsSync(retina), `${demo.slug}: run npm run thumbs`).toBe(true);
      expect(statSync(retina).size).toBeLessThanOrEqual(160 * 1024);
      // The close-up a phone shows, at both densities.
      for (const close of [`${demo.slug}-close.jpg`, `${demo.slug}-close@2x.jpg`]) {
        expect(
          existsSync(join(site, 'public/examples', close)),
          `${close}: run npm run thumbs`,
        ).toBe(true);
      }
      const image = page.locator(`.examples > li[data-demo="${demo.slug}"] img.thumb`);
      await image.scrollIntoViewIfNeeded();
      const src = (await image.getAttribute('src')) ?? '';
      const response = await request.get(src);
      expect(response.headers()['content-type']).toBe('image/jpeg');
      // A JPEG (FF D8) rendered by the thumbs script at 640 × 400.
      expect([...(await response.body()).subarray(0, 2)]).toEqual([0xff, 0xd8]);
      // One of its two densities is the one shown (srcset picks by slot width and DPR).
      await expect
        .poll(() =>
          image.evaluate((img: HTMLImageElement) =>
            img.naturalWidth > 0 ? (img.currentSrc.split('/').pop() ?? '') : '',
          ),
        )
        .toMatch(new RegExp(`^${demo.slug}(@2x)?\\.jpg$`));
    }
  });

  test('each row names its task, dataset, licence and size, with Open and Source links', async ({
    page,
    request,
  }) => {
    await page.goto(`${BASE}examples/`);
    for (const demo of DEMOS) {
      const row = page.locator(`.examples > li[data-demo="${demo.slug}"]`);
      await expect(row).toContainText(demo.task);
      await expect(row).toContainText(`${demo.dataset} · ${demo.licence} · ${demo.rows}`);
      await expect(row.locator('.badge')).toHaveText(demo.framework);
      for (const number of SIZES[demo.slug]?.() ?? []) expect(demo.rows).toContain(number);
      await expect(row.getByRole('link', { name: 'Source' })).toHaveAttribute(
        'href',
        `https://github.com/liamclarkza/snaplot/tree/main/site/src/demos/${demo.slug}`,
      );
      if (!built(demo.slug)) continue;
      const open = row.getByRole('link', { name: 'Open' });
      await expect(open).toHaveAttribute('href', `${BASE}examples/${demo.slug}/`);
      const response = await request.get(`${BASE}examples/${demo.slug}/`);
      expect(response.status()).toBe(200);
      expect(await response.text()).toContain(`<title>${demo.question}`);
    }
  });
});

test.describe('the examples hub on a phone', () => {
  test.use(PHONE);

  test('one column with no horizontal overflow', async ({ page }) => {
    await page.goto(`${BASE}examples/`);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const first = page.locator('.examples > li').first();
    const image = await first.locator('.thumb').boundingBox();
    const text = await first.locator('.row-text').boundingBox();
    expect((image?.y ?? 0) < (text?.y ?? 0)).toBe(true);
    // A phone shows the close-up of the page's main chart.
    await expect
      .poll(() =>
        first
          .locator('img.thumb')
          .evaluate((img: HTMLImageElement) => img.currentSrc.split('/').pop() ?? ''),
      )
      .toMatch(/-close(@2x)?\.jpg$/);
  });
});
