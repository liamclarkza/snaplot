// Scale scenarios: first paint of a 1M-point line, 24 charts on a page (mount cost, canvas bytes,
// offscreen paints), streaming into 24 offscreen charts, a container resize storm and theme
// churn (gap-competitive-05:harness, gap-scale-longevity-02/04/06, plan §3.4 and D37).

import type { BenchChart } from '../api/types';
import { appendChunks, genTimeSeries } from '../data';
import { libraryBusyMs } from '../instrument';
import {
  afterPaint,
  dist,
  gc,
  heapBytes,
  mark,
  type ScenarioResult,
  type SweepOut,
  settle,
  sleep,
  sweep,
} from '../metrics';
import { ingestMillion } from './api';
import {
  type Ctx,
  chartBox,
  fromSweep,
  type Head,
  line,
  RENDER,
  type Scenario,
  sumRenders,
  triangle,
  windowRenders,
} from './common';

const N = 24;

/** Width of a full-width phone or desktop chart (a 390 px phone gives the audit's 358 px). */
function chartWidth(): number {
  return Math.min(window.innerWidth - 32, 900);
}

/**
 * Past the viewport and the library's 200 px visibility margin (render/scheduler.ts), inside
 * which a chart paints on purpose, so it is ready when it scrolls in.
 */
const VISIBILITY_MARGIN = 200;
function isOffscreen(el: Element): boolean {
  const r = el.getBoundingClientRect();
  const m = VISIBILITY_MARGIN;
  return (
    r.bottom <= -m ||
    r.top >= window.innerHeight + m ||
    r.right <= -m ||
    r.left >= window.innerWidth + m
  );
}

function canvasBytes(root: Element): number {
  let bytes = 0;
  for (const c of Array.from(root.querySelectorAll('canvas'))) bytes += c.width * c.height * 4;
  return bytes;
}

function mountMany(
  ctx: Ctx,
  parent: HTMLElement,
  width: number | string,
  height = 200,
): BenchChart[] {
  const charts: BenchChart[] = [];
  for (let k = 0; k < N; k++) {
    charts.push(
      ctx.api.mount(chartBox(parent, height, width), {
        ...line(genTimeSeries(2_000, k + 1)),
        series: [{ id: `s${k}`, type: 'line', y: 'value' }],
      }),
    );
  }
  return charts;
}

async function mount24(ctx: Ctx, head: Head): Promise<ScenarioResult> {
  const datasets = Array.from({ length: N }, (_, k) => genTimeSeries(2_000, k + 1));
  const boxes = datasets.map(() => chartBox(ctx.stage, 200, chartWidth()));
  window.scrollTo(0, 0);
  await settle(2);
  gc();
  const heap0 = heapBytes();
  await mark('start');
  const async0 = libraryBusyMs();
  const t0 = performance.now();
  const charts = boxes.map((el, k) =>
    ctx.api.mount(el, {
      ...line(datasets[k]),
      series: [{ id: `s${k}`, type: 'line', y: 'value' }],
    }),
  );
  const syncMs = performance.now() - t0;
  const painted = await afterPaint();
  const busy = syncMs + (libraryBusyMs() - async0);
  const wall = painted - t0;
  await mark('end');
  // Let visibility observers and deferred paints settle before counting.
  await settle(5);
  await sleep(300);
  gc();
  const heap1 = heapBytes();
  const offscreen = charts.filter((c) => isOffscreen(c.el));
  const offscreenPaints = offscreen.reduce((sum, c) => sum + c.renders().data, 0);
  const result: ScenarioResult = {
    ...head,
    api: ctx.api.version,
    valid: charts.every((c) => isOffscreen(c.el) || c.renders().data > 0),
    ops: 1,
    busy: dist([busy]),
    sync: dist([syncMs]),
    wall: dist([wall]),
    frame: null,
    busyTotalMs: Math.round(busy * 10_000) / 10_000,
    loaf: null,
    heap: null,
    fidelity: null,
    renders: sumRenders(charts.map((c) => c.renders())),
    meta: {
      charts: N,
      offscreenCharts: offscreen.length,
      offscreenPaints,
      canvasMBPerChart: Math.round((canvasBytes(ctx.stage) / N / 1048576) * 100) / 100,
      heapKBPerChart:
        heap0 !== null && heap1 !== null ? Math.round((heap1 - heap0) / 1024 / N) : null,
    },
  };
  for (const c of charts) c.destroy();
  return result;
}

/**
 * Streams 10 points at 20 Hz into each of 24 charts stacked at one spot, alternately in view and
 * moved far below the fold. A visibility-gated chart keeps its data current but skips paint, so
 * the offscreen phases should cost a small share of the visible ones (D37,
 * gap-scale-longevity-02). The CDP task window is not used here (two phases per side).
 */
async function offscreenStream(ctx: Ctx, head: Head): Promise<ScenarioResult> {
  ctx.stage.style.position = 'relative';
  ctx.stage.style.height = `${window.innerHeight * 6}px`;
  const stack = document.createElement('div');
  stack.style.cssText = 'position:absolute;left:0;top:0;width:300px;height:150px';
  ctx.stage.appendChild(stack);
  const charts: BenchChart[] = [];
  const lastX: number[] = [];
  for (let k = 0; k < N; k++) {
    const data = genTimeSeries(2_000, k + 1);
    lastX.push(data.x[data.x.length - 1]);
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;left:0;top:0;width:300px;height:150px';
    stack.appendChild(el);
    charts.push(
      ctx.api.mount(el, {
        ...line(data),
        series: [{ id: `s${k}`, type: 'line', y: 'value' }],
        maxPoints: 2_000,
      }),
    );
  }
  const steps = 120;
  const phase = async (where: 'visible' | 'offscreen'): Promise<{ sw: SweepOut; data: number }> => {
    stack.style.top = where === 'visible' ? '0px' : `${window.innerHeight * 4}px`;
    window.scrollTo(0, 0);
    await settle(3);
    await sleep(200);
    const chunks = charts.map((_, k) => appendChunks(lastX[k], steps + 5, 10));
    for (let k = 0; k < N; k++) lastX[k] = chunks[k][chunks[k].length - 1].x.at(-1) ?? lastX[k];
    const counts = windowRenders(charts);
    let last = Number.NEGATIVE_INFINITY;
    let next = 0;
    const sw = await sweep({
      steps,
      warmup: 5,
      markWindow: false,
      ...counts.hooks,
      step: () => {
        const now = performance.now();
        if (now - last < 49) return false;
        last = now;
        for (let k = 0; k < N; k++) charts[k].append(chunks[k][next]);
        next++;
        return true;
      },
    });
    return { sw, data: sumRenders(counts.each()).data };
  };
  try {
    // Interleaved (ABAB), so drift over the run (heap growth, GC, JIT) affects both alike.
    const visible = [await phase('visible')];
    const offscreen = [await phase('offscreen')];
    visible.push(await phase('visible'));
    offscreen.push(await phase('offscreen'));
    const pooled = (list: { sw: SweepOut }[]): SweepOut => ({
      sync: list.flatMap((p) => p.sw.sync),
      busy: list.flatMap((p) => p.sw.busy),
      frames: list.flatMap((p) => p.sw.frames),
      ops: list.reduce((a, p) => a + p.sw.ops, 0),
      busyTotalMs: list.reduce((a, p) => a + p.sw.busyTotalMs, 0),
      heap: null,
      loaf: null,
    });
    const v = pooled(visible);
    const o = pooled(offscreen);
    const perTick = (sw: SweepOut) => (sw.ops ? sw.busyTotalMs / sw.ops : 0);
    const r3 = (x: number) => Math.round(x * 1000) / 1000;
    return fromSweep(head, ctx.api, o, {
      valid: visible.every((p) => p.data > 0) && o.ops > 0,
      meta: {
        charts: N,
        visibleBusyPerTickMs: r3(perTick(v)),
        offscreenBusyPerTickMs: r3(perTick(o)),
        offscreenShare: perTick(v) > 0 ? r3(perTick(o) / perTick(v)) : null,
        visibleDataRendersPerTick: v.ops
          ? r3(visible.reduce((a, p) => a + p.data, 0) / v.ops)
          : null,
        offscreenDataRendersPerTick: o.ops
          ? r3(offscreen.reduce((a, p) => a + p.data, 0) / o.ops)
          : null,
      },
    });
  } finally {
    for (const c of charts) c.destroy();
  }
}

/** Resizes the container of 24 full-width charts every frame (ResizeObserver on each chart). */
async function resizeStorm(ctx: Ctx, head: Head): Promise<ScenarioResult> {
  const wrap = document.createElement('div');
  wrap.style.width = '100%';
  ctx.stage.appendChild(wrap);
  const charts = mountMany(ctx, wrap, '100%');
  try {
    window.scrollTo(0, 0);
    await settle();
    const counts = windowRenders(charts);
    const sw = await sweep({
      ...RENDER,
      ...counts.hooks,
      step: (i) => {
        wrap.style.width = `${60 + 40 * triangle(i, 40)}%`;
      },
    });
    const each = counts.each();
    const all = sumRenders(each);
    const offscreen = sumRenders(each.filter((_, k) => isOffscreen(charts[k].el)));
    return fromSweep(head, ctx.api, sw, {
      valid: all.data > 0,
      renders: all,
      meta: {
        charts: N,
        dataRendersPerStep: sw.ops ? all.data / sw.ops : null,
        offscreenDataRendersPerStep: sw.ops ? offscreen.data / sw.ops : null,
      },
    });
  } finally {
    for (const c of charts) c.destroy();
  }
}

const THEME_CSS = `
body.bench-theme-dark {
  color: #e8eaed; background: #101216;
  --chart-bg: #101216; --chart-text: #e8eaed; --chart-axis-label: #9aa0a6; --chart-tick: #9aa0a6;
  --chart-grid: #2a2f37; --chart-axis: #3c4043; --chart-border: #3c4043; --chart-crosshair: #e8eaed;
}
body.bench-theme-light {
  color: #202124; background: #ffffff;
  --chart-bg: #ffffff; --chart-text: #202124; --chart-axis-label: #5f6368; --chart-tick: #5f6368;
  --chart-grid: #e8eaed; --chart-axis: #dadce0; --chart-border: #dadce0; --chart-crosshair: #202124;
}`;

/**
 * 100 body class mutations per frame, ending in the other theme, under 24 charts. A coalescing
 * theme observer resolves each chart at most once per frame (§3.4: ≤ 1 resolve per chart).
 */
async function themeChurn(ctx: Ctx, head: Head): Promise<ScenarioResult> {
  const style = document.createElement('style');
  style.textContent = THEME_CSS;
  document.head.appendChild(style);
  const body = document.body;
  const initialClass = body.className;
  body.classList.add('bench-theme-light');
  const charts = mountMany(ctx, ctx.stage, chartWidth());
  try {
    window.scrollTo(0, 0);
    await settle();
    await sleep(50);
    const counts = windowRenders(charts);
    const sw = await sweep({
      ...RENDER,
      ...counts.hooks,
      step: (i) => {
        for (let k = 0; k < 99; k++) body.classList.toggle('bench-churn');
        const dark = i % 2 === 0;
        body.classList.toggle('bench-theme-dark', dark);
        body.classList.toggle('bench-theme-light', !dark);
      },
    });
    const all = sumRenders(counts.each());
    return fromSweep(head, ctx.api, sw, {
      valid: all.data > 0 || all.grid > 0,
      renders: all,
      meta: {
        charts: N,
        mutationsPerFrame: 101,
        gridRendersPerChartPerFrame: sw.ops ? all.grid / sw.ops / N : null,
      },
    });
  } finally {
    for (const c of charts) c.destroy();
    body.className = initialClass;
    style.remove();
  }
}

export const scale: Scenario[] = [
  {
    // Construct a 1M-point typed-column line and wait for its first painted frame (3 times).
    name: 'firstpaint-line-1m',
    area: 'scale',
    primary: 'wall',
    run: (ctx) =>
      ingestMillion(ctx, { name: 'firstpaint-line-1m', area: 'scale', primary: 'wall' }, 3),
  },
  {
    name: 'mount-24-charts',
    area: 'scale',
    primary: 'busy',
    run: (ctx) => mount24(ctx, { name: 'mount-24-charts', area: 'scale', primary: 'busy' }),
  },
  {
    name: 'offscreen-stream-24',
    area: 'scale',
    primary: 'busy',
    run: (ctx) =>
      offscreenStream(ctx, { name: 'offscreen-stream-24', area: 'scale', primary: 'busy' }),
  },
  {
    name: 'resize-storm-24',
    area: 'scale',
    primary: 'busy',
    run: (ctx) => resizeStorm(ctx, { name: 'resize-storm-24', area: 'scale', primary: 'busy' }),
  },
  {
    name: 'theme-churn-24',
    area: 'scale',
    primary: 'busy',
    run: (ctx) => themeChurn(ctx, { name: 'theme-churn-24', area: 'scale', primary: 'busy' }),
  },
];
