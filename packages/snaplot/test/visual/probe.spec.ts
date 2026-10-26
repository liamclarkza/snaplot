/**
 * The interaction probe of the engine refactors (plan §12 M9b): for every fixture, the hit
 * results, cursor snapshots and `point:click` payloads on a 12 × 8 grid over the plot, compared
 * with the snapshot recorded at `ovh-m9a-done` (`__probe__/m9a.json`). The refactors that merge
 * the cursor snapshot paths, build the mark registry and turn the event wiring into a table must
 * leave it identical.
 *
 * Each grid point (the centres of a 12 × 8 grid over the plot box, visited so that two clicks in a
 * row are never a double tap) records:
 * - `cursor`: `getCursor()` after a real pointer move there;
 * - `tooltip`: the visible tooltip's text, cell by cell, and the colours of its swatches (the hit
 *   result as the tooltip shows it), or `null`;
 * - `click`: the `point:click` payloads of a click there.
 * Before the grid, `getCursor()` with each fallback; after it, the same once the pointer left.
 *
 * Only platform-independent facts are recorded: no pixels, no tooltip position. `row` (the user's
 * own object) is left out of points; `rowIndex` and `rowId` identify it.
 *
 *   npx playwright test --project probe                  compare with __probe__/m9a.json
 *   SNAPLOT_PROBE_UPDATE=1 npx playwright test --project probe
 *   node test/visual/probe-merge.mjs                     write __probe__/m9a.json from the run
 *
 * Every run writes each fixture's record to `test-results/probe/<area>--<name>.json`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { FIXTURES, type Fixture } from './fixtures';
import { withFixturePage } from './helpers';
import './page-api';

const HERE = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT = join(HERE, '__probe__/m9a.json');
const OUT = join(HERE, '../../test-results/probe');
const UPDATE = process.env.SNAPLOT_PROBE_UPDATE === '1';
const COLUMNS = 12;
const ROWS = 8;
/** The engine reads two taps closer than 30 px within 300 ms as a double tap (a zoom reset). */
const DOUBLE_TAP_PX = 30;
const DOUBLE_TAP_MS = 300;

/** Column order within a row: each step jumps about half the plot, so clicks stay apart. */
const COLUMN_ORDER = Array.from({ length: COLUMNS }, (_, k) =>
  k % 2 === 0 ? k / 2 : COLUMNS / 2 + (k - 1) / 2,
);

export interface ProbeRecord {
  id: string;
  /** `getCursor()` before the pointer enters, by fallback. */
  before: Record<'hide' | 'latest' | 'first', unknown>;
  /** One entry per grid point, row by row, in visiting order. */
  grid: Array<{ i: number; j: number; cursor: unknown; tooltip: unknown; click: unknown[] }>;
  /** `getCursor()` by fallback once the pointer left the chart. */
  after: Record<'hide' | 'latest' | 'first', unknown>;
}

/**
 * The stored form of a record: every distinct point (a cursor point or a click payload) once in
 * `points`, every distinct cursor snapshot, tooltip and click list once in `values` (their points
 * as indexes into `points`), and each grid entry as `[i, j, cursor, tooltip, click]` indexes into
 * `values`. About a fifth of the expanded size; specs compare the expanded form.
 */
export interface StoredProbe {
  id: string;
  points: unknown[];
  values: unknown[];
  before: Record<'hide' | 'latest' | 'first', number>;
  grid: Array<[number, number, number, number, number]>;
  after: Record<'hide' | 'latest' | 'first', number>;
}

const FALLBACKS = ['hide', 'latest', 'first'] as const;

export function storeProbe(record: ProbeRecord): StoredProbe {
  const points: unknown[] = [];
  const values: unknown[] = [];
  const pointIndex = new Map<string, number>();
  const valueIndex = new Map<string, number>();
  const intern = (list: unknown[], index: Map<string, number>, value: unknown) => {
    const key = JSON.stringify(value);
    let at = index.get(key);
    if (at === undefined) {
      at = list.length;
      list.push(value);
      index.set(key, at);
    }
    return at;
  };
  const point = (value: unknown) => intern(points, pointIndex, value);
  const value = (v: unknown) => {
    if (Array.isArray(v)) return intern(values, valueIndex, { click: v.map(point) });
    if (v && typeof v === 'object' && 'points' in v) {
      const snapshot = v as { points: unknown[] };
      return intern(values, valueIndex, { ...snapshot, points: snapshot.points.map(point) });
    }
    return intern(values, valueIndex, v);
  };
  const byFallback = (fallbacks: ProbeRecord['before']) =>
    Object.fromEntries(FALLBACKS.map((f) => [f, value(fallbacks[f])])) as StoredProbe['before'];
  return {
    id: record.id,
    before: byFallback(record.before),
    after: byFallback(record.after),
    grid: record.grid.map((g) => [g.i, g.j, value(g.cursor), value(g.tooltip), value(g.click)]),
    points,
    values,
  };
}

export function expandProbe(stored: StoredProbe): ProbeRecord {
  const value = (at: number): unknown => {
    const v = stored.values[at];
    if (v && typeof v === 'object' && 'click' in v)
      return (v as { click: number[] }).click.map((p) => stored.points[p]);
    if (v && typeof v === 'object' && 'points' in v) {
      const snapshot = v as { points: number[] };
      return { ...snapshot, points: snapshot.points.map((p) => stored.points[p]) };
    }
    return v;
  };
  const byFallback = (fallbacks: StoredProbe['before']) =>
    Object.fromEntries(FALLBACKS.map((f) => [f, value(fallbacks[f])])) as ProbeRecord['before'];
  return {
    id: stored.id,
    before: byFallback(stored.before),
    grid: stored.grid.map(([i, j, cursor, tooltip, click]) => ({
      i,
      j,
      cursor: value(cursor),
      tooltip: value(tooltip),
      click: value(click) as unknown[],
    })),
    after: byFallback(stored.after),
  };
}

const expected: Record<string, StoredProbe> | null = (() => {
  if (UPDATE) return null;
  try {
    return JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as Record<string, StoredProbe>;
  } catch {
    return null;
  }
})();

async function open(page: Page, fixture: Fixture): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/index.html?fixture=${encodeURIComponent(fixture.id)}`);
  await page.waitForFunction(() => window.__snaplotFixture?.status !== 'loading', null, {
    timeout: 30_000,
  });
  const state = await page.evaluate(() => ({
    status: window.__snaplotFixture?.status,
    error: window.__snaplotFixture?.error,
  }));
  if (state.status !== 'ready') throw new Error(`${fixture.id} did not render: ${state.error}`);
  if (errors.length > 0) throw new Error(`${fixture.id} threw: ${errors.join('\n')}`);
  // Collect point:click payloads, and define the in-page readers once.
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    const chart = window.__snaplotFixture!.chart!;
    const clicks: unknown[] = [];
    w.__probeClicks = clicks;
    const clean = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(clean);
      if (value instanceof Date) return { date: value.toISOString() };
      if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
      if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(value).sort()) {
          if (key === 'row') continue;
          out[key] = clean((value as Record<string, unknown>)[key]);
        }
        return out;
      }
      return value === undefined ? null : value;
    };
    w.__probeClean = clean;
    chart.on('point:click', (point) => clicks.push(clean(point)));
    w.__probeCursor = () => ({
      hide: clean(chart.getCursor()),
      latest: clean(chart.getCursor({ fallback: 'latest' })),
      first: clean(chart.getCursor({ fallback: 'first' })),
    });
    w.__probeTooltip = () => {
      const tip = [...document.body.querySelectorAll<HTMLElement>(':scope > div')].find(
        (element) => {
          const style = getComputedStyle(element);
          return style.position === 'fixed' && Number(style.opacity) >= 0.5;
        },
      );
      if (!tip) return null;
      const cells: string[] = [];
      const walker = document.createTreeWalker(tip, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (text) cells.push(text);
      }
      const swatches: string[] = [];
      for (const element of tip.querySelectorAll<HTMLElement>('*')) {
        const background = getComputedStyle(element).backgroundColor;
        if (background && background !== 'rgba(0, 0, 0, 0)' && background !== 'transparent')
          swatches.push(background);
      }
      return { cells, swatches };
    };
  });
}

/** Wait two frames (the overlay paints on the next one), then read the cursor and tooltip. */
const readHover = (page: Page) =>
  page.evaluate(async () => {
    const w = window as unknown as Record<string, () => unknown>;
    await window.__snaplotFixture!.frames(2);
    const chart = window.__snaplotFixture!.chart!;
    const clean = w.__probeClean as unknown as (value: unknown) => unknown;
    return { cursor: clean(chart.getCursor()), tooltip: w.__probeTooltip() };
  });

const readClicks = (page: Page) =>
  page.evaluate(async () => {
    await window.__snaplotFixture!.frames(1);
    const clicks = (window as unknown as { __probeClicks: unknown[] }).__probeClicks;
    return clicks.splice(0, clicks.length);
  });

const readFallbacks = (page: Page) =>
  page.evaluate(async () => {
    await window.__snaplotFixture!.frames(2);
    return (window as unknown as { __probeCursor: () => ProbeRecord['before'] }).__probeCursor();
  });

async function probe(page: Page, fixture: Fixture): Promise<ProbeRecord> {
  await open(page, fixture);
  const before = await readFallbacks(page);
  const grid: ProbeRecord['grid'] = [];
  let lastTap: { x: number; y: number; at: number } | null = null;
  for (let j = 0; j < ROWS; j++) {
    for (const i of COLUMN_ORDER) {
      const point = await page.evaluate(([fx, fy]) => window.__snaplotFixture!.plotPoint(fx, fy), [
        (i + 0.5) / COLUMNS,
        (j + 0.5) / ROWS,
      ] as const);
      await page.mouse.move(point.x, point.y);
      const hover = await readHover(page);
      if (lastTap && Math.hypot(point.x - lastTap.x, point.y - lastTap.y) < DOUBLE_TAP_PX) {
        const wait = DOUBLE_TAP_MS + 20 - (Date.now() - lastTap.at);
        if (wait > 0) await page.waitForTimeout(wait);
      }
      await page.mouse.down();
      await page.mouse.up();
      lastTap = { x: point.x, y: point.y, at: Date.now() };
      const click = await readClicks(page);
      grid.push({ i, j, cursor: hover.cursor, tooltip: hover.tooltip, click });
    }
  }
  await page.mouse.move(1, 1);
  const after = await readFallbacks(page);
  return { id: fixture.id, before, grid, after };
}

test.describe.configure({ mode: 'parallel' });

for (const fixture of FIXTURES) {
  test(`${fixture.id} probe`, async ({ page, playwright }, testInfo) => {
    test.setTimeout(240_000);
    testInfo.annotations.push({ type: 'fixture', description: fixture.id });
    const record = await withFixturePage(
      fixture,
      { dpr: 1, scheme: 'light' },
      { page, playwright },
      testInfo,
      (p) => probe(p, fixture),
    );
    mkdirSync(OUT, { recursive: true });
    const stored = storeProbe(record);
    writeFileSync(
      join(OUT, `${fixture.id.replace('/', '--')}.json`),
      `${JSON.stringify(stored)}\n`,
    );
    if (UPDATE) return;
    const want = expected?.[fixture.id];
    test.skip(!expected, `no snapshot at ${SNAPSHOT}`);
    test.skip(!want, `${fixture.id} is newer than the m9a probe snapshot`);
    expect(record).toEqual(expandProbe(want!));
  });
}
