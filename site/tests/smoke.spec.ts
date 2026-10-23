// The site smoke spec (plan §8.3), against `astro preview` of the built site. Build first:
// `npm run build && npm run build:site`, then `npm run test:smoke -w site`.
//
// Every route: HTTP 200, no console errors or warnings (an example may declare an expected
// warning with a `// expect-warning: <code>` comment), a title, and no serious axe violations.
// Every [data-example]: a painted canvas in each of its three tabs, and Copy copies exactly the
// file the tab shows. Then the [uisite-*] locks, search, the old hash links and the no-build page.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { exampleKind, FRAMEWORKS, type Framework, tabSource } from '../src/lib/examples';

const site = fileURLToPath(new URL('..', import.meta.url));
const dist = join(site, 'dist');
const examplesDir = join(site, 'src/examples');
const BASE = '/snaplot/';

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

if (!existsSync(join(dist, 'index.html'))) {
  throw new Error('site/dist is missing: run `npm run build && npm run build:site` first.');
}

/** Every page the build produced, as a URL path under the base. */
const ROUTES = walk(dist)
  .filter((file) => file.endsWith('index.html'))
  .map((file) => BASE + relative(dist, file).replace(/index\.html$/, ''))
  .sort();

const exampleFiles = new Map(
  walk(examplesDir)
    .filter((file) => /\.(ts|tsx)$/.test(file))
    .map((file) => [relative(examplesDir, file), readFileSync(file, 'utf8')]),
);

/** The text a tab shows and Copy copies, computed from the example's files on disk. */
function expectedSource(name: string, framework: Framework): string {
  const kind = exampleKind(name, new Set(exampleFiles.keys()));
  return tabSource(kind, framework, {
    options: exampleFiles.get(`${name}.options.ts`),
    files: {
      vanilla: exampleFiles.get(`${name}.ts`),
      react: exampleFiles.get(`${name}.react.tsx`),
      solid: exampleFiles.get(`${name}.solid.tsx`),
    },
  });
}

/** Warning codes the examples on a page declare with `// expect-warning: <code>`. */
function expectedWarnings(names: string[]): string[] {
  return names.flatMap((name) =>
    [...exampleFiles.entries()]
      .filter(([file]) => file.startsWith(`${name}.`))
      .flatMap(([, text]) =>
        [...text.matchAll(/\/\/ expect-warning: (\S+)/g)].map((m) => m[1] ?? ''),
      ),
  );
}

/** Collects console errors and warnings and uncaught errors. */
function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      problems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('response', (response) => {
    if (response.status() >= 400) problems.push(`HTTP ${response.status()} ${response.url()}`);
  });
  return problems;
}

/** The most painted pixels in any canvas of a tab panel. */
function paintedPixels(page: Page, panelId: string): Promise<number> {
  return page.evaluate((id) => {
    let most = 0;
    for (const canvas of document.getElementById(id)?.querySelectorAll('canvas') ?? []) {
      const ctx = canvas.getContext('2d');
      if (!ctx || canvas.width === 0 || canvas.height === 0) continue;
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let painted = 0;
      for (let i = 3; i < data.length; i += 4) if ((data[i] ?? 0) > 0) painted++;
      most = Math.max(most, painted);
    }
    return most;
  }, panelId);
}

async function seriousViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.nodes
          .map((n) => n.target.join(' '))
          .slice(0, 3)
          .join(', ')}`,
    );
}

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test.describe('every route', () => {
  for (const route of ROUTES) {
    test(`${route} loads cleanly, passes axe and runs its examples`, async ({ page }) => {
      const problems = watch(page);
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);
      await expect(page).toHaveTitle(/snaplot/);

      const examples = await page
        .locator('[data-example]')
        .evaluateAll((els) => els.map((el) => ({ name: el.getAttribute('data-example') ?? '' })));
      for (const [index] of examples.entries()) {
        const example = page.locator('[data-example]').nth(index);
        const name = (await example.getAttribute('data-example')) ?? '';
        await example.scrollIntoViewIfNeeded();
        for (const framework of FRAMEWORKS) {
          await example.locator(`[role="tab"][data-framework="${framework.id}"]`).click();
          const panel = example.locator(`[role="tabpanel"][data-framework="${framework.id}"]`);
          await expect(panel).toBeVisible();
          const panelId = (await panel.getAttribute('id')) ?? '';
          await expect
            .poll(() => paintedPixels(page, panelId), {
              message: `${name}: the ${framework.label} tab paints its chart`,
              timeout: 10_000,
            })
            .toBeGreaterThan(500);
          // Copy copies the whole runnable file the tab shows ([docs-04], [uisite-16]).
          await panel.locator('.copy button').click();
          const copied = await page.evaluate(() => navigator.clipboard.readText());
          expect(copied.trimEnd(), `${name}: the ${framework.label} copy`).toBe(
            expectedSource(name, framework.id).trimEnd(),
          );
        }
      }

      const allowed = expectedWarnings(examples.map((e) => e.name));
      expect(problems.filter((p) => !allowed.some((code) => p.includes(code)))).toEqual([]);
      // The "Copied!" tooltips fade out and leave within 2.5s; axe would measure a half-faded one.
      await expect(page.locator('.expressive-code .feedback')).toHaveCount(0, { timeout: 5_000 });
      expect(await seriousViolations(page)).toEqual([]);
    });
  }
});

test('[uisite-06] axe finds no serious violations in the dark theme either', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  for (const route of [BASE, `${BASE}examples/`, `${BASE}first-chart/`, `${BASE}guides/data/`]) {
    await page.goto(route);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await seriousViolations(page), route).toEqual([]);
  }
});

test.describe('[uisite-01] blocked storage', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const denied = {
        get() {
          throw new DOMException('Access is denied for this document.', 'SecurityError');
        },
      };
      Object.defineProperty(window, 'localStorage', denied);
      Object.defineProperty(window, 'sessionStorage', denied);
    });
  });

  for (const route of [BASE, `${BASE}first-chart/`]) {
    test(`${route} still renders, switches theme and runs its example`, async ({ page }) => {
      const problems = watch(page);
      await page.goto(route);
      await expect(page.locator('h1')).toBeVisible();
      expect((await page.locator('main').innerText()).length).toBeGreaterThan(100);
      await page.locator('snaplot-theme-select select').first().selectOption('dark');
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      const example = page.locator('[data-example]').first();
      await example.locator('[role="tab"][data-framework="react"]').click();
      const panelId =
        (await example.locator('[role="tabpanel"][data-framework="react"]').getAttribute('id')) ??
        '';
      await expect
        .poll(() => paintedPixels(page, panelId), { timeout: 10_000 })
        .toBeGreaterThan(500);
      expect(problems).toEqual([]);
    });
  }
});

test.describe('[uisite-02] the first paint has the right theme', () => {
  /** Records the theme and background at the first animation frame, before the first paint. */
  async function firstFrame(page: Page) {
    await page.addInitScript(() => {
      requestAnimationFrame(() => {
        const root = getComputedStyle(document.documentElement).backgroundColor;
        const body = document.body ? getComputedStyle(document.body).backgroundColor : '';
        (window as unknown as { firstFrame: object }).firstFrame = {
          theme: document.documentElement.dataset.theme,
          background: body && body !== 'rgba(0, 0, 0, 0)' ? body : root,
        };
      });
    });
  }
  const luminance = (rgb: string) => {
    const [r, g, b] = (rgb.match(/\d+(\.\d+)?/g) ?? []).map(Number);
    return (0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)) / 255;
  };
  const read = (page: Page) =>
    page
      .waitForFunction(() => (window as unknown as { firstFrame?: object }).firstFrame)
      .then((handle) => handle.jsonValue() as Promise<{ theme: string; background: string }>);

  for (const route of [BASE, `${BASE}first-chart/`]) {
    test(`${route}: light system, no stored choice → light`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'light' });
      await firstFrame(page);
      await page.goto(route);
      const frame = await read(page);
      expect(frame.theme).toBe('light');
      expect(luminance(frame.background)).toBeGreaterThan(0.9);
    });

    test(`${route}: dark system → dark`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark' });
      await firstFrame(page);
      await page.goto(route);
      const frame = await read(page);
      expect(frame.theme).toBe('dark');
      expect(luminance(frame.background)).toBeLessThan(0.1);
    });
  }

  test('a stored choice wins over the system; stale keys from the old site do not', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem('snaplot-site-theme-v2', 'light');
        localStorage.setItem('snaplot-theme', 'dark');
        localStorage.setItem('starlight-theme', 'dark');
        sessionStorage.setItem('seeded', '1');
      }
    });
    await firstFrame(page);
    await page.goto(`${BASE}first-chart/`);
    expect((await read(page)).theme).toBe('light');
    // Back to System follows the (dark) system again, and stays so after a reload.
    await page.locator('snaplot-theme-select select').first().selectOption('auto');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await page.evaluate(() => localStorage.getItem('snaplot-site-theme-v2'))).toBeNull();
  });
});

test.describe('[uisite-04] keyboard focus', () => {
  for (const route of [BASE, `${BASE}first-chart/`]) {
    test(`${route}: the first Tab focuses a visible skip link`, async ({ page }) => {
      await page.goto(route);
      await page.keyboard.press('Tab');
      const focused = page.locator(':focus');
      await expect(focused).toHaveText(/skip to content/i);
      await expect(focused).toBeInViewport();
    });

    test(`${route}: focus rings stay visible under forced colours`, async ({ page }) => {
      await page.emulateMedia({ forcedColors: 'active' });
      await page.goto(route);
      for (const selector of ['[data-example] [role="tab"]', 'snaplot-theme-select select']) {
        await page.locator(selector).first().focus();
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab');
        const outline = await page.evaluate(() => {
          const style = getComputedStyle(document.activeElement as Element);
          return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
        });
        expect(outline.style, selector).not.toBe('none');
        expect(outline.width, selector).toBeGreaterThanOrEqual(2);
      }
    });
  }
});

test.describe('[uisite-14][docs-11] search', () => {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    test(`a combobox whose results nothing covers (${viewport.width}px)`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(`${BASE}first-chart/`);
      await page.locator('site-search button[data-open-modal]').click();
      const input = page.getByRole('combobox', { name: 'Search the docs' });
      await expect(input).toBeFocused();
      await input.fill('createChart');
      const options = page.getByRole('listbox', { name: 'Results' }).getByRole('option');
      await expect(options.first()).toContainText('createChart');
      // Styled as a list of options, although the script creates them after the page loads.
      await expect(options.first()).toHaveCSS('display', 'flex');
      await expect(options.first().locator('mark').first()).toHaveCSS('font-weight', '600');
      await expect(input).toHaveAttribute('aria-expanded', 'true');
      await expect(input).toHaveAttribute('aria-controls', 'snaplot-search-results');
      const first = await options.first().getAttribute('id');
      await expect(input).toHaveAttribute('aria-activedescendant', first ?? '');
      const uncovered = await options.first().evaluate((option) => {
        const box = option.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return hit !== null && option.contains(hit);
      });
      expect(uncovered).toBe(true);
      // ArrowDown moves the active option; Escape clears the query before it closes the dialog.
      await input.press('ArrowDown');
      await expect(input).not.toHaveAttribute('aria-activedescendant', first ?? '');
      await input.press('Escape');
      await expect(input).toHaveValue('');
      await expect(page.locator('site-search dialog')).toHaveAttribute('open', '');
      await input.press('Escape');
      await expect(page.locator('site-search dialog')).not.toHaveAttribute('open', '');
    });
  }

  test('the index finds API names, options and topics', async ({ page }) => {
    await page.goto(`${BASE}first-chart/`);
    const counts = await page.evaluate(
      async (terms) => {
        const pagefind = await import(`${location.origin}/snaplot/pagefind/pagefind.js`);
        const result: Record<string, number> = {};
        for (const term of terms) result[term] = (await pagefind.search(term)).results.length;
        return result;
      },
      ['createChart', 'useCursor', 'LegendTable', 'colorBy', 'height', 'dark', 'ssr', 'migrat'],
    );
    for (const [term, count] of Object.entries(counts)) expect(count, term).toBeGreaterThan(0);
  });
});

test('[uisite-15] the mobile drawer keeps focus in the header and the menu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}first-chart/`);
  await page.locator('button[popovertarget="starlight__sidebar"]').click();
  await expect(page.locator('#starlight__sidebar')).toBeVisible();
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const where = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return 'body';
      if (el.closest('.main-frame')) return 'main';
      if (el.closest('#starlight__sidebar')) return 'menu';
      // The menu button, which closes the menu, sits between the header and the menu.
      if (el.matches('button[popovertarget="starlight__sidebar"]')) return 'menu';
      if (el.closest('header')) return 'header';
      return el.tagName;
    });
    expect(['menu', 'header', 'body'], `Tab ${i + 1}`).toContain(where);
  }
});

test.describe('layout and chrome', () => {
  for (const width of [1440, 390]) {
    for (const route of [BASE, `${BASE}examples/`]) {
      test(`[uisite-12] ${route} at ${width}px: nav, page and footer share one left edge`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(route);
        const edges = await page.evaluate(() =>
          ['.brand', 'main h1', '.site-footer-links li'].map((selector) =>
            Math.round(document.querySelector(selector)?.getBoundingClientRect().left ?? -1),
          ),
        );
        expect(new Set(edges).size, edges.join(', ')).toBe(1);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }
  }

  test('[uisite-05] links and tabs show a hover state', async ({ page }) => {
    const changes = async (selector: string) => {
      const element = page.locator(selector).first();
      const style = () =>
        element.evaluate((el) => {
          const s = getComputedStyle(el);
          return `${s.color} ${s.backgroundColor} ${s.textDecorationLine} ${s.borderBottomColor}`;
        });
      await page.mouse.move(0, 0);
      const before = await style();
      await element.hover();
      return before !== (await style());
    };
    await page.goto(BASE);
    expect(await changes('.site-nav a'), 'nav').toBe(true);
    expect(await changes('.site-footer-links a'), 'footer').toBe(true);
    expect(await changes('[data-example] [role="tab"][aria-selected="false"]'), 'tab').toBe(true);
    await page.goto(`${BASE}first-chart/`);
    expect(await changes('.sidebar-content a:not([aria-current])'), 'sidebar').toBe(true);
  });

  test('[uisite-07] tabular figures only on numbers, not on body text', async ({ page }) => {
    for (const route of [BASE, `${BASE}first-chart/`]) {
      await page.goto(route);
      const body = await page.evaluate(() => getComputedStyle(document.body).fontVariantNumeric);
      expect(body, route).toBe('normal');
    }
    await page.goto(BASE);
    await expect(page.locator('.facts.num')).toHaveCSS('font-variant-numeric', 'tabular-nums');
  });

  test('[uisite-21][research-09] path routes, the IA groups and an on-page TOC', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${BASE}first-chart/`);
    const groups = await page.locator('.sidebar-content details > summary').allInnerTexts();
    expect(groups.map((g) => g.trim())).toEqual(
      expect.arrayContaining(['Start', 'Frameworks', 'Guides', 'Reference', 'Help']),
    );
    const hrefs = await page
      .locator('.sidebar-content a')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));
    expect(hrefs.length).toBeGreaterThanOrEqual(20);
    expect(hrefs.filter((href) => href.includes('#'))).toEqual([]);
    await expect(page.locator('starlight-toc')).toBeVisible();
  });

  test('[docs-16] the header shows the documented version', async ({ page }) => {
    const { version } = JSON.parse(
      readFileSync(join(site, '../packages/snaplot/package.json'), 'utf8'),
    ) as { version: string };
    await page.goto(`${BASE}first-chart/`);
    await expect(page.locator('.site-version')).toHaveText(`v${version}`);
  });

  test('[D1] a prerelease build shows the beta banner in both layouts, a release in neither', async ({
    page,
  }) => {
    const { version } = JSON.parse(
      readFileSync(join(site, '../packages/snaplot/package.json'), 'utf8'),
    ) as { version: string };
    for (const route of [BASE, `${BASE}examples/`, `${BASE}first-chart/`]) {
      await page.goto(route);
      const banner = page.locator('[data-prerelease]');
      if (version.includes('-')) {
        await expect(banner, route).toBeVisible();
        await expect(banner, route).toHaveAttribute('data-prerelease', version);
        await expect(banner.getByRole('link'), route).toHaveAttribute('href', /tree\/v0\.12\.0/);
      } else {
        await expect(banner, route).toHaveCount(0);
      }
    }
  });

  test('[uisite-20] every page has its own title, and an unknown page is a 404', async ({
    page,
  }) => {
    const titles = new Map<string, string>();
    for (const file of walk(dist).filter((f) => f.endsWith('.html'))) {
      const title = /<title>([^<]*)<\/title>/.exec(readFileSync(file, 'utf8'))?.[1] ?? '';
      const page = relative(dist, file);
      expect(title, page).not.toBe('');
      const duplicate = titles.get(title);
      // The API reference has same-named members in snaplot and snaplot/solid (createChart).
      if (duplicate && !page.startsWith('reference/api/')) {
        expect(`${page} repeats the title of ${duplicate}: ${title}`).toBe('');
      }
      titles.set(title, page);
    }
    const response = await page.goto(`${BASE}no-such-page/`);
    expect(response?.status()).toBe(404);
    await expect(page.locator('h1')).toHaveText('Page not found');
  });

  // The route tests load each page and its subresources, not the pages its links go to.
  test('every internal link resolves to a page, a file or a heading (G11)', () => {
    const ids = new Map<string, Set<string>>();
    const idsOf = (file: string) => {
      const found =
        ids.get(file) ??
        new Set([...readFileSync(file, 'utf8').matchAll(/\sid="([^"]*)"/g)].map((m) => m[1] ?? ''));
      ids.set(file, found);
      return found;
    };
    const broken = new Set<string>();
    let links = 0;
    for (const file of walk(dist).filter((f) => f.endsWith('.html'))) {
      const html = readFileSync(file, 'utf8');
      for (const [, url = ''] of html.matchAll(/\s(?:href|src)="(\/snaplot\/[^"]*)"/g)) {
        links++;
        const [path = '', anchor] = url.replaceAll('&amp;', '&').split('#');
        const local = join(dist, decodeURIComponent(path.split('?')[0] ?? '').slice(BASE.length));
        const target =
          existsSync(local) && statSync(local).isFile() ? local : join(local, 'index.html');
        const from = relative(dist, file);
        if (!existsSync(target)) broken.add(`${url} (from ${from})`);
        else if (anchor && target.endsWith('.html') && !idsOf(target).has(anchor)) {
          broken.add(`${url}: no heading #${anchor} (from ${from})`);
        }
      }
    }
    expect(links).toBeGreaterThan(1000);
    expect([...broken]).toEqual([]);
  });

  test('[uisite-17] the API link opens a reference that links to each entry point', async ({
    page,
  }) => {
    const problems = watch(page);
    await page.goto(BASE);
    await page.locator('.site-nav').getByRole('link', { name: 'API', exact: true }).click();
    await expect(page.locator('h1')).toBeVisible();
    const modules = (
      await page
        .locator('main .sl-markdown-content a')
        .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
    ).filter((href) => href.startsWith(BASE));
    // One page per public entry point: snaplot, snaplot/react and snaplot/solid.
    expect(modules).toHaveLength(3);
    for (const href of modules) {
      const response = await page.goto(href);
      expect(response?.status(), href).toBe(200);
      await expect(page.locator('main .sl-markdown-content a').first(), href).toBeVisible();
    }
    expect(problems).toEqual([]);
  });
});

test.describe('examples', () => {
  test('[uisite-16] the tabs follow the keyboard and the choice holds across pages', async ({
    page,
  }) => {
    await page.goto(`${BASE}first-chart/`);
    const example = page.locator('[data-example]').first();
    await example.locator('[role="tab"][data-framework="vanilla"]').focus();
    await page.keyboard.press('ArrowRight');
    await expect(example.locator('[role="tab"][data-framework="react"]')).toBeFocused();
    await expect(example.locator('[role="tabpanel"][data-framework="react"]')).toBeVisible();
    // Tab leaves the tab list for the panel's content: nothing traps the keyboard.
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('role'))).not.toBe('tab');
    await page.goto(BASE);
    await expect(
      page.locator('[data-example] [role="tabpanel"][data-framework="react"]').first(),
    ).toBeVisible();
    await expect(
      page.locator('[data-example] [role="tab"][data-framework="react"]').first(),
    ).toHaveAttribute('aria-selected', 'true');
  });
});

test.describe('old links', () => {
  const table = JSON.parse(readFileSync(join(site, 'src/lib/old-routes.json'), 'utf8')) as {
    pages: Record<string, string>;
    docs: Record<string, string>;
  };

  for (const [from, to] of [
    ['#/docs/theming/css-vars', 'guides/theming/#css-variables'],
    ['#/docs/getting-started', 'first-chart/'],
    ['#/demos', 'examples/'],
  ]) {
    test(`/snaplot/${from} lands on /snaplot/${to}`, async ({ page }) => {
      await page.goto(`${BASE}${from}`);
      await expect(page).toHaveURL(new RegExp(`${BASE}${to.replace(/[/#]/g, '\\$&')}$`));
      await expect(page.locator('h1')).toBeVisible();
    });
  }

  test('every old route has a page, and every anchor a heading', () => {
    const missing: string[] = [];
    for (const target of [...Object.values(table.docs), ...Object.values(table.pages)]) {
      const [path = '', anchor] = target.split('#');
      const file = join(dist, path, 'index.html');
      if (!existsSync(file)) missing.push(`${target}: no page`);
      else if (anchor && !readFileSync(file, 'utf8').includes(`id="${anchor}"`)) {
        missing.push(`${target}: no heading #${anchor}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

test('[D39] the no-build page runs snaplot from dist through an import map', async ({ page }) => {
  const libraryDist = join(site, '../packages/snaplot/dist');
  const types: Record<string, string> = { '.js': 'text/javascript', '.html': 'text/html' };
  await page.route('http://no-build.localhost/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    const file = pathname.startsWith('/dist/')
      ? join(libraryDist, pathname.slice('/dist/'.length))
      : join(site, 'tests/no-build', pathname === '/' ? 'index.html' : pathname);
    if (!existsSync(file)) return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({
      status: 200,
      contentType: types[extname(file)] ?? 'application/octet-stream',
      body: readFileSync(file),
    });
  });
  const problems = watch(page);
  await page.goto('http://no-build.localhost/');
  await expect.poll(() => page.locator('#chart canvas').count()).toBeGreaterThan(0);
  const painted = await page.evaluate(() => {
    let most = 0;
    for (const canvas of document.querySelectorAll('#chart canvas')) {
      const ctx = (canvas as HTMLCanvasElement).getContext('2d');
      if (!ctx) continue;
      const { data } = ctx.getImageData(
        0,
        0,
        (canvas as HTMLCanvasElement).width,
        (canvas as HTMLCanvasElement).height,
      );
      let n = 0;
      for (let i = 3; i < data.length; i += 4) if ((data[i] ?? 0) > 0) n++;
      most = Math.max(most, n);
    }
    return most;
  });
  expect(painted).toBeGreaterThan(500);
  expect(problems).toEqual([]);
});
