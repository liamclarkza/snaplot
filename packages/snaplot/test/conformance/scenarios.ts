/**
 * The conformance scenario table (plan §7.5). Each scenario runs unchanged against every runtime
 * page (`vanilla`, `react18`, `react19`, `solid`) and asserts the same thing; the four spec files
 * list the table once each, with literal titles, so the expected-failure ledger counts one marker
 * per runtime and scenario.
 *
 * A scenario keeps its state in `window.__s`: the options factory reads it, so a change there
 * plus `__host.rerender()` is a re-render with new props. Scenarios that compare output across
 * runtimes (#18 to #20) run the same steps on a vanilla page in the same browser context: equal to
 * vanilla in every runtime is equal across runtimes, within one run.
 */
import { expect, type Page } from '@playwright/test';
import type {} from './pages/kit';

export type Runtime = 'vanilla' | 'react18' | 'react19' | 'solid';

const URL: Record<Runtime, string> = {
  vanilla: 'vanilla.html',
  react18: 'react18/index.html',
  react19: 'react19.html',
  solid: 'solid.html',
};

/** A runtime page, with its console messages and page errors. */
export interface Opened {
  page: Page;
  runtime: Runtime;
  messages: string[];
}

/** Open a runtime page and wait until it is ready. */
export async function open(page: Page, runtime: Runtime): Promise<Opened> {
  const messages: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning')
      messages.push(`${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => messages.push(`pageerror: ${error.message}`));
  await page.goto(URL[runtime]);
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
  return { page, runtime, messages };
}

/** What snaplot printed (its messages start with "snaplot:"). */
const fromSnaplot = (messages: string[]) => messages.filter((m) => /snaplot:/.test(m));
/** Errors, page errors and framework warnings, without snaplot's own. */
const problems = (messages: string[]) => messages.filter((m) => !/snaplot:/.test(m));

/** Mount `series` over 40 rows (CPU is a ramp, cpu = t), with `extra` options. */
async function mountRows(
  page: Page,
  series: 1 | 2,
  extra: Record<string, unknown> = {},
  setup: Record<string, unknown> = {},
) {
  await page.evaluate(
    async ([count, more, options]) => {
      const s = (window.__s = { data: window.__kit.rows(40), ...more });
      const series: { y: 'cpu' | 'mem'; label: string }[] =
        count === 2
          ? [
              { y: 'cpu', label: 'CPU' },
              { y: 'mem', label: 'Memory' },
            ]
          : [{ y: 'cpu', label: 'CPU' }];
      await window.__host.mount(() => ({ x: 't', series, ...s }), options);
    },
    [series, extra, setup] as const,
  );
}

const ingests = (page: Page) =>
  page.evaluate(() => window.__kit.debug(window.__host.handle()!).ingestCount as number);

const recorded = (page: Page, name: string) =>
  page.evaluate(
    (event) => window.__kit.events.filter((e) => e.name === event).map((e) => e.value),
    name,
  );

const settle = (page: Page) => page.evaluate(() => window.__kit.settle());

/** Move the pointer to data point (x, y) of the chart (or of the pair's chart `pair`). */
async function hover(page: Page, x: number, y: number, pair?: number) {
  const point = await page.evaluate(
    ([px, py, index]) =>
      window.__kit.clientPoint(
        index === undefined ? window.__host.handle()! : window.__host.pairHandles()[index],
        px,
        py,
      ),
    [x, y, pair] as const,
  );
  await page.mouse.move(point.x, point.y);
  await settle(page);
}

/** Drag across the plot from `from` to `to` (fractions of its width), at mid height. */
async function drag(page: Page, from: number, to: number, modifier?: 'Shift', pair?: number) {
  const plot = await page.evaluate(
    (index) =>
      window.__kit.plotRect(
        index === undefined ? window.__host.handle()! : window.__host.pairHandles()[index],
      ),
    pair,
  );
  const y = plot.top + plot.height / 2;
  if (modifier) await page.keyboard.down(modifier);
  await page.mouse.move(plot.left + plot.width * from, y);
  await page.mouse.down();
  await page.mouse.move(plot.left + plot.width * ((from + to) / 2), y, { steps: 4 });
  await page.mouse.move(plot.left + plot.width * to, y, { steps: 4 });
  await page.mouse.up();
  if (modifier) await page.keyboard.up(modifier);
  await settle(page);
}

const yDomain = (page: Page) =>
  page.evaluate(() => {
    const y = window.__host.handle()!.scale('y')!;
    return { min: y.min, max: y.max };
  });

const stateOf = (page: Page) =>
  page.evaluate(() => JSON.parse(JSON.stringify(window.__host.handle()!.getState())));

/** A vanilla page in the same context, for the scenarios that compare across runtimes. */
async function vanilla(page: Page): Promise<Opened> {
  return open(await page.context().newPage(), 'vanilla');
}

// ─── The table ───────────────────────────────────────────────────────

/** #1 Mount: one live chart, host attributes passed through; React 18 is React 18.3, once. */
export async function mount({ page, runtime }: Opened) {
  await mountRows(
    page,
    2,
    {},
    {
      attrs: { id: 'cpu-chart', class: 'probe', 'data-testid': 'cpu', tabindex: '-1' },
    },
  );
  const facts = await page.evaluate(() => {
    const stage = window.__kit.stage();
    const host = window.__host.element();
    const chart = window.__host.handle();
    return {
      canvases: stage.querySelectorAll('canvas').length,
      surfaces: stage.querySelectorAll('[role="application"]').length,
      id: host?.id,
      class: host?.getAttribute('class'),
      testid: host?.dataset.testid,
      tabindex: host?.getAttribute('tabindex'),
      container: !!chart && chart.container === host,
      series: chart?.getState().series.length,
    };
  });
  expect(facts).toEqual({
    canvases: 3,
    surfaces: 1,
    id: 'cpu-chart',
    class: 'probe',
    testid: 'cpu',
    tabindex: '-1',
    container: true,
    series: 2,
  });
  if (runtime === 'react18') {
    expect(await page.evaluate(() => window.__host.version)).toMatch(/^18\.3\./);
    const meta = await page.evaluate(() => fetch('meta.json').then((r) => r.json()));
    expect(meta.reactDom).toEqual(['react18/node_modules/react-dom']);
  }
}

/** #1 Mount: the host is a figure named by a summary of its series (plan D20). */
export async function figure({ page }: Opened) {
  await mountRows(page, 2);
  const host = await page.evaluate(() => {
    const element = window.__host.element();
    return { role: element?.getAttribute('role'), name: element?.getAttribute('aria-label') };
  });
  expect(host).toEqual({ role: 'figure', name: 'Line chart, 2 series: CPU, Memory' });
}

/** #2 A paint-only change (`axes.y.title`) does not ingest, and draws the new title. */
export async function paintOnly({ page }: Opened) {
  await mountRows(page, 1, { axes: { y: { title: 'Load' } } });
  const before = await ingests(page);
  await page.evaluate(async () => {
    window.__s.axes = { y: { title: 'Load (%)' } };
    await window.__host.rerender();
  });
  expect(await ingests(page)).toBe(before);
  expect(await page.evaluate(() => window.__host.element()!.textContent)).toContain('Load (%)');
}

/** #3 Inline handlers: 30 re-renders with new identities, then a click calls the latest once. */
export async function inlineHandlers({ page }: Opened) {
  await page.evaluate(async () => {
    const s = (window.__s = { data: window.__kit.rows(40), version: 0, calls: [] as number[] });
    await window.__host.mount(() => {
      const version = s.version;
      return {
        data: s.data,
        x: 't',
        series: [{ y: 'cpu', label: 'CPU' }],
        onPointClick: () => s.calls.push(version),
      };
    });
  });
  const before = await ingests(page);
  for (let version = 1; version <= 30; version++)
    await page.evaluate(async (next) => {
      window.__s.version = next;
      await window.__host.rerender();
    }, version);
  expect(await ingests(page)).toBe(before);
  await hover(page, 20, 20);
  await page.mouse.down();
  await page.mouse.up();
  await settle(page);
  expect(await page.evaluate(() => window.__s.calls)).toEqual([30]);
}

/** #4 A new data array ingests once, and the tooltip shows the new values. */
export async function newData({ page }: Opened) {
  await mountRows(page, 1);
  const before = await ingests(page);
  await page.evaluate(async () => {
    window.__s.data = window.__kit.rows(40, (t) => 100 + t);
    await window.__host.rerender();
  });
  expect(await ingests(page)).toBe(before + 1);
  await hover(page, 10, 110);
  expect(await page.evaluate(() => window.__kit.tooltip())).toContain('110');
}

/** #5 A removed prop (`legend`) returns to its default, `'auto'`. */
export async function removedProp({ page }: Opened) {
  await mountRows(page, 2, { legend: false });
  const buttons = () =>
    page.evaluate(() =>
      [...window.__host.element()!.querySelectorAll('button')].map((b) => b.textContent),
    );
  expect(await buttons()).toEqual([]);
  await page.evaluate(async () => {
    delete window.__s.legend;
    await window.__host.rerender();
  });
  expect(await buttons()).toEqual(['CPU', 'Memory']);
}

/** #6 `viewport` set, echoed, then a double-click: applied, the echo is a no-op, one `{}`. */
export async function viewportEcho({ page }: Opened) {
  await page.evaluate(async () => {
    const s = (window.__s = {
      data: window.__kit.rows(40),
      viewport: { x: [10, 20] } as Record<string, unknown>,
    });
    await window.__host.mount(() => ({
      data: s.data,
      x: 't',
      series: [{ y: 'cpu', label: 'CPU' }],
      viewport: s.viewport as never,
      onViewportChange: (viewport) => {
        s.viewport = viewport;
        void window.__host.rerender();
      },
    }));
  });
  expect((await stateOf(page)).viewport).toEqual({ x: [10, 20] });
  const zoomed = await yDomain(page);
  expect(zoomed.min).toBeGreaterThanOrEqual(5);
  expect(zoomed.max).toBeLessThanOrEqual(25);
  expect(await recorded(page, 'viewport:change')).toEqual([]);
  const plot = await page.evaluate(() => window.__kit.plotRect(window.__host.handle()!));
  await page.mouse.dblclick(plot.left + plot.width / 2, plot.top + plot.height / 2);
  await settle(page);
  await settle(page);
  expect(await recorded(page, 'viewport:change')).toEqual([{}]);
  expect((await stateOf(page)).viewport).toEqual({});
  expect((await yDomain(page)).max).toBeGreaterThanOrEqual(39);
}

/** #7 An un-echoed inline `viewport={{}}`: a user zoom survives an unrelated re-render. */
export async function unechoedViewport({ page }: Opened) {
  await page.evaluate(async () => {
    const s = (window.__s = { data: window.__kit.rows(40) });
    await window.__host.mount(() => ({
      data: s.data,
      x: 't',
      series: [{ y: 'cpu', label: 'CPU' }],
      viewport: {},
    }));
  });
  await drag(page, 0.3, 0.6);
  const zoomed = (await stateOf(page)).viewport;
  expect(zoomed.x).toHaveLength(2);
  for (let i = 0; i < 3; i++) await page.evaluate(() => window.__host.rerender());
  expect((await stateOf(page)).viewport).toEqual(zoomed);
}

/** #8 A legend click emits `hiddenSeries:change`; re-rendering with the same prop is a no-op. */
export async function legendClick({ page }: Opened) {
  await mountRows(page, 2, { hiddenSeries: [] });
  await page.evaluate(() => {
    const button = [...window.__host.element()!.querySelectorAll('button')].find(
      (b) => b.textContent === 'Memory',
    );
    button?.click();
  });
  await settle(page);
  expect(await recorded(page, 'hiddenSeries:change')).toEqual([['mem']]);
  await page.evaluate(async () => {
    window.__s.hiddenSeries = [];
    await window.__host.rerender();
  });
  expect((await stateOf(page)).hiddenSeries).toEqual(['mem']);
  expect(await recorded(page, 'hiddenSeries:change')).toEqual([['mem']]);
}

/** #9 `drag: 'select'`: one `selection:change`, with the points inside the box. */
export async function brush({ page }: Opened) {
  await page.evaluate(async () => {
    const s = (window.__s = { data: window.__kit.rows(40) });
    await window.__host.mount(() => ({
      data: s.data,
      x: 't',
      series: [{ type: 'scatter', y: 'cpu', label: 'CPU' }],
      interaction: { drag: 'select', zoom: 'xy' },
    }));
  });
  const plot = await page.evaluate(() => window.__kit.plotRect(window.__host.handle()!));
  await page.mouse.move(plot.left + plot.width * 0.2, plot.top + plot.height * 0.1);
  await page.mouse.down();
  await page.mouse.move(plot.left + plot.width * 0.6, plot.top + plot.height * 0.9, { steps: 6 });
  await page.mouse.up();
  await settle(page);
  const changes = (await recorded(page, 'selection:change')) as { points?: unknown[] }[];
  expect(changes).toHaveLength(1);
  expect(changes[0].points?.length ?? 0).toBeGreaterThan(0);
}

/** Mount a following stream (a 20-step window) and append 10 rows. */
async function stream(page: Page) {
  await mountRows(page, 1, { streaming: { followWindow: 20 } });
  await page.evaluate(async () => {
    const chart = window.__host.handle()!;
    for (let t = 40; t < 50; t++) chart.appendData([{ t, cpu: t, mem: 50 }]);
    await window.__kit.settle();
  });
}

const following = (page: Page) => page.evaluate(() => window.__host.handle()!.getState().following);

async function resume(page: Page) {
  await page.evaluate(async () => {
    window.__host.handle()!.resumeFollow();
    await window.__kit.settle();
  });
}

/** #10 Append, box zoom, `resumeFollow()`: `following` goes true → false → true. */
export async function followZoom({ page }: Opened) {
  await stream(page);
  expect(await following(page)).toBe(true);
  await drag(page, 0.3, 0.7);
  expect(await following(page)).toBe(false);
  await resume(page);
  expect(await following(page)).toBe(true);
  expect(await recorded(page, 'following:change')).toEqual([false, true]);
}

/** #10 Append, pan (Shift+drag) back in time, `resumeFollow()`: true → false → true. */
export async function followPan({ page }: Opened) {
  await stream(page);
  expect(await following(page)).toBe(true);
  await drag(page, 0.3, 0.7, 'Shift');
  expect(await following(page)).toBe(false);
  await resume(page);
  expect(await following(page)).toBe(true);
  expect(await recorded(page, 'following:change')).toEqual([false, true]);
}

/** #11 20 cursor moves cost a highlight selector no render. */
export async function selectorRenders({ page }: Opened) {
  await mountRows(page, 2, {}, { selector: true });
  const before = await page.evaluate(() => window.__kit.counters.renders);
  for (let t = 5; t < 25; t++) await hover(page, t, t);
  expect(await page.evaluate(() => window.__kit.counters.renders)).toBe(before);
}

/** #12 The cursor hook and the legend table show new values after a data change. */
export async function cursorFallback({ page }: Opened) {
  await mountRows(page, 1, {}, { readout: true, table: ['name', 'value'] });
  const shown = () =>
    page.evaluate(() => ({
      readout: document.getElementById('readout')?.textContent ?? null,
      table: document.querySelector('#table tbody tr')?.textContent ?? null,
    }));
  const first = await shown();
  expect(first.readout).toContain('39');
  expect(first.table).toContain('39');
  await page.evaluate(async () => {
    window.__s.data = window.__kit.rows(40, (t) => 100 + t);
    await window.__host.rerender();
  });
  const next = await shown();
  expect(next.readout).toContain('139');
  expect(next.table).toContain('139');
}

const surfaceHeight = (page: Page) =>
  page.evaluate(
    () =>
      window.__host.element()!.querySelector('[role="application"]')!.getBoundingClientRect()
        .height,
  );

/** #13 A zero-height host gets a 300 px fallback and exactly one warning (plan D26). */
export async function zeroHeight({ page, messages }: Opened) {
  await mountRows(page, 1, {}, { stage: 'width:640px;height:auto' });
  expect(await surfaceHeight(page)).toBe(300);
  expect(fromSnaplot(messages)).toHaveLength(1);
}

/** #13 `height={280}` in a stretched flex item is 280 px, and 280 → 400 resizes (plan D26). */
export async function explicitHeight({ page }: Opened) {
  await mountRows(
    page,
    1,
    { height: 280 },
    {
      stage: 'display:flex;align-items:stretch;width:640px;height:500px',
    },
  );
  expect(await surfaceHeight(page)).toBe(280);
  await page.evaluate(async () => {
    window.__s.height = 400;
    await window.__host.rerender();
    await window.__kit.settle();
  });
  expect(await surfaceHeight(page)).toBe(400);
}

/** #14 Unmount ×20: no canvas, no listener, no group membership and no heap is left. */
export async function unmountTwenty({ page }: Opened) {
  const cdp = await page.context().newCDPSession(page);
  const listeners = async () => {
    let count = 0;
    for (const expression of ['window', 'document']) {
      const { result } = await cdp.send('Runtime.evaluate', { expression });
      const found = await cdp.send('DOMDebugger.getEventListeners', {
        objectId: result.objectId!,
      });
      count += found.listeners.length;
    }
    return count;
  };
  const heap = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    await cdp.send('HeapProfiler.collectGarbage');
    return (await cdp.send('Runtime.getHeapUsage')).usedSize;
  };
  const cycle = (count: number) =>
    page.evaluate(async (times) => {
      const s = (window.__s ??= { data: window.__kit.rows(40), refs: [] as WeakRef<object>[] });
      window.__kit.peer();
      for (let i = 0; i < times; i++) {
        await window.__host.mount(() => ({
          data: s.data,
          x: 't',
          series: [{ y: 'cpu', label: 'CPU' }],
          group: window.__kit.group(),
        }));
        s.refs.push(new WeakRef(window.__host.handle()!));
        await window.__host.unmount();
      }
    }, count);
  // Warm up first: the first cycles fill compiled code and caches, not leaks.
  await cycle(5);
  const before = { listeners: await listeners(), heap: await heap() };
  await cycle(20);
  const after = { listeners: await listeners(), heap: await heap() };
  expect(await page.evaluate(() => window.__kit.stage().querySelectorAll('canvas').length)).toBe(0);
  expect(after.listeners).toBe(before.listeners);
  // A destroyed chart left no reference behind: not its group, not a listener.
  const alive = await page.evaluate(
    () => window.__s.refs.filter((ref: WeakRef<object>) => ref.deref()).length,
  );
  expect(alive).toBe(0);
  expect(after.heap - before.heap).toBeLessThan(1024 * 1024);
}

/** #15 A mixed group (this runtime and a vanilla chart): cursor and X sync, Y independent. */
export async function mixedGroup({ page }: Opened) {
  await page.evaluate(async () => {
    const s = (window.__s = { data: window.__kit.rows(40) });
    window.__kit.peer();
    await window.__host.mount(() => ({
      data: s.data,
      x: 't',
      series: [{ y: 'cpu', label: 'CPU' }],
      group: window.__kit.group(),
    }));
  });
  await hover(page, 15, 15);
  expect(await page.evaluate(() => window.__kit.peer().getCursor().x)).toBe(15);
  await drag(page, 0.25, 0.5);
  const scales = await page.evaluate(() => {
    const read = (key: string, chart = window.__host.handle()!) => {
      const scale = chart.scale(key)!;
      return [scale.min, scale.max];
    };
    return {
      x: read('x'),
      peerX: read('x', window.__kit.peer()),
      y: read('y'),
      peerY: read('y', window.__kit.peer()),
      peerViewport: Object.keys(window.__kit.peer().getState().viewport),
    };
  });
  expect(scales.peerX).toEqual(scales.x);
  expect(scales.peerY[0]).toBeGreaterThan(scales.y[1]);
  expect(scales.peerViewport).toEqual(['x']);
}

/** #16 20 StrictMode mount cycles leave the host's attributes as the first mount had them. */
export async function strictCycles({ page, messages }: Opened) {
  const snapshots = await page.evaluate(async () => {
    const data = window.__kit.rows(40);
    const out: string[][] = [];
    for (let i = 0; i < 20; i++) {
      await window.__host.mount(() => ({ data, x: 't', series: [{ y: 'cpu', label: 'CPU' }] }), {
        strict: true,
        attrs: { id: 'strict', 'data-testid': 'strict' },
      });
      out.push(window.__kit.attributes(window.__host.element()));
      await window.__host.unmount();
    }
    return out;
  });
  for (const snapshot of snapshots) expect(snapshot).toEqual(snapshots[0]);
  expect(problems(messages)).toEqual([]);
}

/** #16 Two grouped charts hidden and shown (`<Activity>` on React 19): alive and in sync. */
export async function hideShow({ page, messages }: Opened) {
  await page.evaluate(async () => {
    const data = window.__kit.rows(40);
    await window.__host.pair((index) => ({
      data,
      x: 't',
      series: [{ y: index ? 'mem' : 'cpu', label: index ? 'Memory' : 'CPU' }],
      group: window.__kit.group(),
    }));
    await window.__host.showPair(false);
    await window.__host.showPair(true);
  });
  expect(
    await page.evaluate(() =>
      window.__host.pairHandles().map((chart) => chart.container.querySelectorAll('canvas').length),
    ),
  ).toEqual([3, 3]);
  await hover(page, 12, 12, 0);
  expect(await page.evaluate(() => window.__host.pairHandles()[1].getCursor().x)).toBe(12);
  await drag(page, 0.25, 0.5, undefined, 0);
  const [a, b] = await page.evaluate(() =>
    window.__host.pairHandles().map((chart) => [chart.scale('x')!.min, chart.scale('x')!.max]),
  );
  expect(b).toEqual(a);
  expect(problems(messages)).toEqual([]);
}

/** #17 An inline plugin object with the same id, 30 renders: installed once. */
export async function inlinePlugin({ page }: Opened) {
  await page.evaluate(async () => {
    const s = (window.__s = { data: window.__kit.rows(40), installs: 0 });
    await window.__host.mount(() => ({
      data: s.data,
      x: 't',
      series: [{ y: 'cpu', label: 'CPU' }],
      plugins: [
        {
          id: 'probe',
          install: () => {
            s.installs++;
          },
        },
      ],
    }));
  });
  for (let i = 0; i < 30; i++) await page.evaluate(() => window.__host.rerender());
  expect(await page.evaluate(() => window.__s.installs)).toBe(1);
}

/** #18 The hover tooltip's text is the same as vanilla's. */
export async function tooltipText({ page }: Opened) {
  const read = async (target: Page) => {
    await mountRows(target, 2);
    await hover(target, 10, 10);
    return target.evaluate(() => window.__kit.tooltip());
  };
  const reference = await vanilla(page);
  const expected = await read(reference.page);
  expect(expected).toContain('CPU');
  expect(await read(page)).toBe(expected);
}

/** #19 The legend's and the legend table's DOM is the same as vanilla's (ids normalised). */
export async function legendDom({ page }: Opened) {
  const read = async (target: Page) => {
    await mountRows(target, 2, {}, { table: ['swatch', 'name', 'value'] });
    return target.evaluate(() => ({
      legend: window.__kit.legendHTML(window.__host.handle()!),
      table: window.__kit.tableHTML(),
    }));
  };
  const reference = await vanilla(page);
  const expected = await read(reference.page);
  expect(expected.legend).toContain('Memory');
  expect(expected.table).toContain('<table');
  expect(await read(page)).toEqual(expected);
}

/** #20 Every canvas layer and the label layer are the same as vanilla's, pixel for pixel. */
export async function pixelEquality({ page }: Opened) {
  const read = async (target: Page) => {
    await mountRows(target, 2);
    await settle(target);
    return target.evaluate(() => window.__kit.pixels(window.__host.handle()!));
  };
  const reference = await vanilla(page);
  const expected = await read(reference.page);
  expect(expected.layers).toHaveLength(3);
  expect(expected.labels.length).toBeGreaterThan(4);
  expect(await read(page)).toEqual(expected);
}

/** #21 Server markup, then hydration: no warning on either side, one chart after hydrating. */
export async function hydration({ page, runtime, messages }: Opened) {
  const server = await page.evaluate(async (name) => {
    const prefix = name === 'react18' ? '../' : '';
    const ssr = await fetch(`${prefix}ssr/${name}.json`).then((r) => r.json());
    const stage = window.__kit.stage();
    stage.innerHTML = ssr.html;
    // Solid's hydration bootstrap, as the page head would run it.
    if (ssr.script) {
      const script = document.createElement('script');
      script.textContent = ssr.script;
      document.head.append(script);
    }
    return { messages: ssr.messages as string[], html: ssr.html as string };
  }, runtime);
  expect(server.messages).toEqual([]);
  const facts = await page.evaluate(async () => {
    const before = window.__kit.stage().firstElementChild;
    await window.__host.hydrate(() => ({
      data: window.__kit.rows(40),
      x: 't',
      series: [
        { y: 'cpu', label: 'CPU' },
        { y: 'mem', label: 'Memory' },
      ],
    }));
    const stage = window.__kit.stage();
    return {
      same: stage.firstElementChild === before,
      canvases: stage.querySelectorAll('canvas').length,
    };
  });
  expect(facts).toEqual({ same: true, canvases: 3 });
  expect(problems(messages)).toEqual([]);
}

/** #22 Solid: the primitives and `<LegendTable>` take a handle, an accessor or `undefined`. */
export async function solidSources({ page, messages }: Opened) {
  await mountRows(page, 1);
  const out = await page.evaluate(() =>
    (window as unknown as { __solid: { sources(): unknown } }).__solid.sources(),
  );
  expect(out).toEqual({
    following: [true, true, null],
    cursor: ['39', '39', null],
    tables: [true, true, false],
  });
  expect(problems(messages)).toEqual([]);
}

/** #23 Inline `data={[]}`, 30 appends, then an unrelated re-render: 30 rows, no warning. */
export async function inlineEmptyData({ page, messages }: Opened) {
  await page.evaluate(async () => {
    window.__s = {};
    await window.__host.mount(() => ({ data: [], x: 't', series: [{ y: 'cpu', label: 'CPU' }] }));
    const chart = window.__host.handle()!;
    for (let t = 0; t < 30; t++) chart.appendData([{ t, cpu: t, mem: 50 }]);
    await window.__host.rerender();
  });
  const rows = await page.evaluate(() => {
    const chart = window.__host.handle()!;
    return [
      chart.getCursor({ fallback: 'first' }).points[0]?.x,
      chart.getCursor({ fallback: 'latest' }).points[0]?.x,
    ];
  });
  expect(rows).toEqual([0, 29]);
  expect(fromSnaplot(messages)).toEqual([]);
}

/** #24 `highlight` set, echoed, then a legend hover: applied, the echo is a no-op, one event each. */
export async function highlightEcho({ page }: Opened) {
  await page.evaluate(async () => {
    const s = (window.__s = { data: window.__kit.rows(40), highlight: 'cpu' as string | null });
    await window.__host.mount(() => ({
      data: s.data,
      x: 't',
      series: [
        { y: 'cpu', label: 'CPU' },
        { y: 'mem', label: 'Memory' },
      ],
      highlight: s.highlight,
      onHighlightChange: (id) => {
        s.highlight = id;
        void window.__host.rerender();
      },
    }));
  });
  expect((await stateOf(page)).highlight).toBe('cpu');
  expect(await recorded(page, 'highlight:change')).toEqual([]);
  const button = await page.evaluate(() => {
    const found = [...window.__host.element()!.querySelectorAll('button')].find(
      (b) => b.textContent === 'Memory',
    )!;
    const box = found.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  });
  await page.mouse.move(button.x, button.y);
  await settle(page);
  await settle(page);
  expect(await recorded(page, 'highlight:change')).toEqual(['mem']);
  expect((await stateOf(page)).highlight).toBe('mem');
  await page.mouse.move(button.x, button.y + 200);
  await settle(page);
  await settle(page);
  expect(await recorded(page, 'highlight:change')).toEqual(['mem', null]);
}

/** React 18.3 (plan D2): the handle reaches a plain `useRef`, the hooks read it, no warning. */
export async function react18Support({ page, messages }: Opened) {
  await mountRows(page, 2, {}, { readout: true, selector: true });
  const facts = await page.evaluate(() => ({
    version: window.__host.version,
    handle: !!window.__host.handle(),
    readout: document.getElementById('readout')?.textContent ?? null,
  }));
  expect(facts.version).toMatch(/^18\.3\./);
  expect(facts.handle).toBe(true);
  expect(facts.readout).toContain('39');
  expect(problems(messages)).toEqual([]);
}
