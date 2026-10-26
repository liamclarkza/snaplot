// The shared site chrome (M16s, plan §9, D35): the custom layout (homepage, examples hub) and the
// Starlight docs load the same fonts, share one header (brand, nav, theme toggle) and one footer,
// and use the same tokens in both themes. Build first (`npm run build && npm run build:site`).
import { expect, type Page, test } from '@playwright/test';

const BASE = '/snaplot/';
const CUSTOM = [BASE, `${BASE}examples/`];
const DOCS = `${BASE}introduction/`;
const ROUTES = [...CUSTOM, DOCS];
const NAV = ['Docs', 'Examples', 'API', 'GitHub'];

const fontsOf = (page: Page) =>
  page.evaluate(async () => {
    await document.fonts.ready;
    const h1 = document.querySelector('h1');
    return {
      body: getComputedStyle(document.body).fontFamily,
      h1: h1 ? getComputedStyle(h1).fontFamily : '',
      loaded: [...document.fonts]
        .filter((face) => face.status === 'loaded')
        .map((face) => `${face.family.replaceAll('"', '')} ${face.weight}`),
      hasCode: document.querySelector('main pre, main code') !== null,
    };
  });

test.describe('[m16s] fonts', () => {
  for (const route of ROUTES) {
    test(`${route}: body and h1 are set in IBM Plex Sans and the Plex faces load`, async ({
      page,
    }) => {
      await page.goto(route);
      if (CUSTOM.includes(route)) {
        // The dev server serves the custom layout without Starlight's stylesheet; the build only
        // shares it by accident of chunking. Remove Starlight's system font stacks, as in dev, so
        // the layout has to stand on its own tokens.
        await page.addStyleTag({
          content: ':root:root:root { --sl-font-system: initial; --sl-font-system-mono: initial; }',
        });
      }
      const fonts = await fontsOf(page);
      expect(fonts.body).toMatch(/^"?IBM Plex Sans"?,/);
      expect(fonts.h1).toMatch(/^"?IBM Plex Sans"?,/);
      expect(fonts.loaded).toEqual(
        expect.arrayContaining(['IBM Plex Sans 400', 'IBM Plex Sans 600']),
      );
      if (fonts.hasCode) expect(fonts.loaded).toContain('IBM Plex Mono 400');
    });
  }
});

test.describe('[uisite-12][m16s] one header and footer on every page', () => {
  for (const width of [1280, 390]) {
    test(`at ${width}px the brand, nav and footer match across both layouts`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const seen: { route: string; brand: number; nav: string[]; footer: string[] }[] = [];
      for (const route of ROUTES) {
        await page.goto(route);
        const header = page.locator('[data-site-header]');
        await expect(header, route).toHaveCount(1);
        await expect(header.locator('[data-site-brand]'), route).toBeVisible();
        const brand = await header
          .locator('[data-site-brand]')
          .evaluate((el) => Math.round(el.getBoundingClientRect().left));
        const nav = (await header.locator('.site-nav a').allInnerTexts()).map((t) => t.trim());
        for (const link of await header.locator('.site-nav a').all()) {
          await expect(link, route).toBeVisible();
        }
        const footer = (await page.locator('.site-footer-links a').allInnerTexts()).map((t) =>
          t.trim(),
        );
        seen.push({ route, brand, nav, footer });
      }
      for (const row of seen) {
        expect(row.nav, row.route).toEqual(NAV);
        expect(row.brand, row.route).toBe(seen[0]?.brand);
        expect(row.footer, row.route).toEqual(seen[0]?.footer);
      }
      expect(seen[0]?.footer).toEqual(expect.arrayContaining([...NAV, 'Changelog']));
    });
  }

  test('the current section is marked in the nav', async ({ page }) => {
    await page.goto(`${BASE}examples/`);
    await expect(page.locator('.site-nav a[aria-current]')).toHaveText('Examples');
    await page.goto(DOCS);
    await expect(page.locator('.site-nav a[aria-current]')).toHaveText('Docs');
    await page.goto(`${BASE}reference/api/`);
    await expect(page.locator('.site-nav a[aria-current]')).toHaveText('API');
  });
});

test.describe('[m16s] the theme toggle and tokens', () => {
  const surfaces = { light: 'rgb(255, 255, 255)', dark: 'rgb(17, 17, 19)' };
  const codeSurfaces = { light: 'rgb(246, 247, 249)', dark: 'rgb(26, 26, 29)' };

  test('the header toggle sets the same theme and surfaces on every page', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const route of ROUTES) {
      await page.goto(route);
      await expect(page.locator('[data-site-header]'), route).toHaveCount(1);
      for (const theme of ['light', 'dark'] as const) {
        await page.locator('[data-site-header] snaplot-theme-select select').selectOption(theme);
        await expect(page.locator('html'), route).toHaveAttribute('data-theme', theme);
        const background = await page.evaluate(
          () => getComputedStyle(document.body).backgroundColor,
        );
        expect(background, `${route} ${theme}`).toBe(surfaces[theme]);
      }
    }
    // The last choice (dark) holds on the next page, in either layout.
    await page.goto(BASE);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`${theme}: code blocks and asides sit on the surface token`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto(DOCS);
      const aside = page.locator('.starlight-aside').first();
      await expect(aside).toHaveCSS('background-color', codeSurfaces[theme]);
      const pre = page.locator('.expressive-code pre').first();
      await expect(pre).toHaveCSS('background-color', codeSurfaces[theme]);
      await page.goto(BASE);
      await expect(page.locator('.install .expressive-code pre')).toHaveCSS(
        'background-color',
        codeSurfaces[theme],
      );
    });
  }
});
