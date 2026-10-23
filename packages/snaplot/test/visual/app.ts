/**
 * The visual fixture app: `index.html?fixture=<area>/<name>` renders one fixture at its fixed
 * size and publishes `window.__snaplotFixture` (see `page-api.ts`). Without `?fixture` it lists
 * every fixture, for review in a browser (`npm run test:visual -- --serve`).
 *
 * Determinism (plan §11.3 G10): IBM Plex Sans is bundled and loaded before the chart exists, the
 * font family is set explicitly, data is seeded, and the page reports ready only after
 * `document.fonts.ready` plus two animation frames and an idle callback. Reduced motion, the
 * viewport, the locale (en-US) and the time zone (UTC) come from the Playwright config.
 */
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import type { ChartHandle, ChartOptions } from '../../src/index';
import { createChart, histogram } from '../../src/index';
import { FIXTURES, type Fixture, findFixture } from './fixtures';
import { FONT_FAMILY, FONT_WEIGHTS, type FixturePageApi } from './page-api';
import { collectGeometry } from './probe';

const frames = (n: number): Promise<void> =>
  new Promise((resolve) => {
    const step = (left: number) => {
      if (left <= 0) resolve();
      else requestAnimationFrame(() => step(left - 1));
    };
    step(n);
  });

const idle = (): Promise<void> =>
  new Promise((resolve) => {
    if ('requestIdleCallback' in window) requestIdleCallback(() => resolve(), { timeout: 250 });
    else setTimeout(resolve, 0);
  });

function mountBox(fixture: Fixture): { root: HTMLElement; host: HTMLDivElement } {
  const stage = document.getElementById('stage')!;
  const root = document.createElement('div');
  root.id = 'fixture';
  root.dataset.fixture = fixture.id;
  const host = document.createElement('div');
  host.style.width = `${fixture.width}px`;
  host.style.height = `${fixture.height}px`;
  if (fixture.card) {
    const { background, color, vars, padding = 12 } = fixture.card;
    root.style.display = 'inline-block';
    root.style.padding = `${padding}px`;
    root.style.background = background;
    if (color) root.style.color = color;
    for (const [name, value] of Object.entries(vars ?? {})) root.style.setProperty(name, value);
    root.appendChild(host);
  } else {
    root.style.display = 'inline-block';
    root.style.width = `${fixture.width}px`;
    root.style.height = `${fixture.height}px`;
    host.style.width = '100%';
    host.style.height = '100%';
    root.appendChild(host);
  }
  stage.appendChild(root);
  return { root, host };
}

function withFont(options: ChartOptions<any>): ChartOptions<any> {
  return { ...options, theme: { fontFamily: FONT_FAMILY, ...(options.theme ?? {}) } };
}

async function renderFixture(id: string): Promise<void> {
  let chart: ChartHandle<any> | undefined;
  let host: HTMLElement | undefined;
  let options: ChartOptions<any> | undefined;
  const api: FixturePageApi = {
    id,
    status: 'loading',
    plotPoint(fx, fy) {
      if (!chart || !host) throw new Error('fixture not rendered');
      const box = host.getBoundingClientRect();
      const plot = chart.getLayout().plot;
      return {
        x: box.left + plot.left + fx * plot.width,
        y: box.top + plot.top + fy * plot.height,
      };
    },
    geometry() {
      if (!chart || !host || !options) throw new Error('fixture not rendered');
      return collectGeometry(id, chart, options, host);
    },
    frames,
  };
  window.__snaplotFixture = api;
  try {
    const fixture = findFixture(id);
    if (!fixture) throw new Error(`unknown fixture "${id}"`);
    // Measure with the real font from the first layout pass.
    await Promise.all(FONT_WEIGHTS.map((w) => document.fonts.load(`${w} 12px "IBM Plex Sans"`)));
    const box = mountBox(fixture);
    host = box.host;
    options = fixture.options({ histogram });
    chart = createChart(host, withFont(options));
    api.chart = chart;
    await frames(2);
    if (fixture.after) {
      fixture.after(chart);
      await frames(2);
    }
    await document.fonts.ready;
    await frames(2);
    await idle();
    api.status = 'ready';
  } catch (error) {
    api.status = 'error';
    api.error = error instanceof Error ? (error.stack ?? error.message) : String(error);
  }
}

function renderIndex(): void {
  const stage = document.getElementById('stage')!;
  const list = document.createElement('ol');
  for (const fixture of FIXTURES) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = `?fixture=${encodeURIComponent(fixture.id)}`;
    link.textContent = fixture.id;
    item.append(link, ` — ${fixture.title}`);
    list.appendChild(item);
  }
  stage.appendChild(list);
}

const id = new URLSearchParams(location.search).get('fixture');
if (id) void renderFixture(id);
else renderIndex();
