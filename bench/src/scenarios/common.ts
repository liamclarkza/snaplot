// Shared scenario helpers: containers, chart presets, the viewport and pointer sweeps, fidelity
// sampling and result assembly.

import type { BenchApi, BenchChart, ChartSpec, Columns, Renders } from '../api/types';
import {
  type Area,
  dist,
  type Fidelity,
  frameDist,
  type Meta,
  type Primary,
  type ScenarioResult,
  type SweepOut,
  settle,
  sweep,
} from '../metrics';

export const SWEEP = { steps: 180, warmup: 20 };
export const RENDER = { steps: 60, warmup: 10 };

export interface Ctx {
  stage: HTMLElement;
  api: BenchApi;
}

export interface Scenario {
  name: string;
  area: Area;
  primary: Primary;
  run(ctx: Ctx): Promise<ScenarioResult>;
}

export interface Head {
  name: string;
  area: Area;
  primary: Primary;
}

export function chartBox(
  stage: HTMLElement,
  height = 440,
  width?: number | string,
): HTMLDivElement {
  const el = document.createElement('div');
  const w = width ?? Math.min(Math.max(320, window.innerWidth - 24), 900);
  el.style.width = typeof w === 'number' ? `${w}px` : w;
  el.style.height = `${height}px`;
  stage.appendChild(el);
  return el;
}

/** Triangle wave in [0, 1] over `steps`, so a sweep ends where it started. */
export function triangle(i: number, steps: number): number {
  const t = (i % steps) / steps;
  return t < 0.5 ? t * 2 : (1 - t) * 2;
}

export function extentOf(column: Float64Array): [number, number] {
  return [column[0], column[column.length - 1]];
}

// ─── Presets ────────────────────────────────────────────────────

export const line = (data: Columns): ChartSpec => ({
  data,
  x: 'x',
  xType: 'time',
  series: [{ id: 'value', type: 'line', y: 'value' }],
});

export const timeScatter = (data: Columns): ChartSpec => ({
  data,
  x: 'x',
  xType: 'time',
  series: [{ id: 'points', type: 'scatter', y: 'value' }],
});

export const tabularScatter = (data: Columns): ChartSpec => ({
  data,
  x: 'row',
  xType: 'linear',
  series: [{ id: 'metric', type: 'scatter', x: 'metricA', y: 'metricB' }],
});

export const encodedScatter = (data: Columns): ChartSpec => ({
  data,
  x: 'row',
  xType: 'linear',
  series: [
    {
      id: 'metric',
      type: 'scatter',
      x: 'metricA',
      y: 'metricB',
      colorBy: 'category',
      sizeBy: 'size',
    },
  ],
});

export const densityScatter = (data: Columns): ChartSpec => ({
  data,
  x: 'x',
  xType: 'time',
  series: [{ id: 'density', type: 'scatter', y: 'value', density: true }],
});

// ─── Results ────────────────────────────────────────────────────

export function rendersSince(chart: BenchChart, before: Renders): Renders {
  const now = chart.renders();
  return {
    grid: now.grid - before.grid,
    data: now.data - before.data,
    overlay: now.overlay - before.overlay,
  };
}

export function sumRenders(list: readonly Renders[]): Renders {
  return list.reduce(
    (a, r) => ({ grid: a.grid + r.grid, data: a.data + r.data, overlay: a.overlay + r.overlay }),
    { grid: 0, data: 0, overlay: 0 },
  );
}

export interface Extra {
  valid: boolean;
  renders?: Renders | null;
  fidelity?: Fidelity | null;
  meta?: Meta;
}

export function fromSweep(head: Head, api: BenchApi, sw: SweepOut, extra: Extra): ScenarioResult {
  return {
    ...head,
    api: api.version,
    valid: extra.valid && sw.ops > 0,
    ops: sw.ops,
    busy: dist(sw.busy),
    sync: dist(sw.sync),
    wall: null,
    frame: frameDist(sw.frames),
    busyTotalMs: sw.busyTotalMs,
    loaf: sw.loaf,
    heap: sw.heap,
    fidelity: extra.fidelity ?? null,
    renders: extra.renders ?? null,
    meta: extra.meta ?? {},
  };
}

export interface OnceSamples {
  sync: number[];
  busy: number[];
  wall: number[];
}

export function fromOnce(
  head: Head,
  api: BenchApi,
  samples: OnceSamples,
  extra: Extra,
): ScenarioResult {
  return {
    ...head,
    api: api.version,
    valid: extra.valid && samples.sync.length > 0,
    ops: samples.sync.length,
    busy: dist(samples.busy),
    sync: dist(samples.sync),
    wall: dist(samples.wall),
    frame: null,
    busyTotalMs: Math.round(samples.busy.reduce((a, b) => a + b, 0) * 10_000) / 10_000,
    loaf: null,
    heap: null,
    fidelity: extra.fidelity ?? null,
    renders: extra.renders ?? null,
    meta: extra.meta ?? {},
  };
}

// ─── Fidelity ───────────────────────────────────────────────────

/**
 * Samples drawn / min(inView, budget) from the debug symbol during an interaction, with the plan's
 * budget max(400, 1.5 × plot width) (§3.4). It reads right after a paint, as the counters require,
 * every `every` frames to keep the lazy point counting off most frames. Versions without the debug
 * symbol (before `ovh-m1-done`) report no fidelity.
 */
export class FidelitySampler {
  private ratios: number[] = [];
  private budget = 0;

  constructor(
    private readonly chart: BenchChart,
    private readonly every = 6,
  ) {}

  sample(i: number): void {
    if (i % this.every !== 0) return;
    const counts = this.chart.debug();
    if (!counts) return;
    this.budget = Math.max(400, 1.5 * this.chart.plot().width);
    const expected = Math.min(counts.inViewPoints, this.budget);
    if (expected <= 0) return;
    this.ratios.push(Math.min(1, counts.drawnPoints / expected));
  }

  result(): Fidelity | null {
    const d = dist(this.ratios);
    return d
      ? { samples: d.n, min: d.min, median: d.median, budget: Math.round(this.budget) }
      : null;
  }
}

// ─── Sweeps ─────────────────────────────────────────────────────

/** Pan a 40%-of-domain window back and forth across the data. */
export function panStep(chart: BenchChart, [lo, hi]: [number, number], i: number): void {
  const full = hi - lo;
  const span = full * 0.4;
  const offset = triangle(i, SWEEP.steps) * (full - span);
  chart.setX(lo + offset, lo + offset + span);
}

/** Zoom from the full domain down to 4% around the center and back out. */
export function zoomStep(chart: BenchChart, [lo, hi]: [number, number], i: number): void {
  const full = hi - lo;
  const center = lo + full / 2;
  const span = full * (1 - triangle(i, SWEEP.steps) * 0.96);
  chart.setX(center - span / 2, center + span / 2);
}

export interface ViewportSweepOptions {
  fidelity?: boolean;
  meta?: Meta;
}

/** Drives `move` once per frame and checks the viewport actually moved. */
export async function viewportSweep(
  head: Head,
  ctx: Ctx,
  chart: BenchChart,
  move: (i: number) => void,
  options: ViewportSweepOptions = {},
): Promise<ScenarioResult> {
  await settle();
  const before = chart.renders();
  const start = chart.xRange();
  let moved = false;
  const fidelity = options.fidelity ? new FidelitySampler(chart) : null;
  const sw = await sweep({
    ...SWEEP,
    step: move,
    afterFlush: (i) => {
      const r = chart.xRange();
      if (r && start && (r.min !== start.min || r.max !== start.max)) moved = true;
      fidelity?.sample(i);
    },
  });
  const renders = rendersSince(chart, before);
  const result = fromSweep(head, ctx.api, sw, {
    valid: moved && renders.data > 0,
    renders,
    fidelity: fidelity?.result() ?? null,
    meta: options.meta,
  });
  chart.destroy();
  return result;
}

// ─── Pointer input ──────────────────────────────────────────────

export interface PlotCenter {
  cx: number;
  cy: number;
  halfW: number;
  target: Element;
}

export function plotCenter(chart: BenchChart): PlotCenter {
  const rect = chart.el.getBoundingClientRect();
  const plot = chart.plot();
  const cx = rect.left + plot.left + plot.width / 2;
  const cy = rect.top + plot.top + plot.height / 2;
  const target = document.elementFromPoint(cx, cy);
  if (!target) throw new Error('no element at the plot center; is the chart offscreen?');
  return { cx, cy, halfW: plot.width * 0.45, target };
}

export function mouseMove(target: Element, x: number, y: number): void {
  target.dispatchEvent(
    new PointerEvent('pointermove', {
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: x,
      clientY: y,
      bubbles: true,
      cancelable: true,
    }),
  );
}

export function mouseLeave(target: Element): void {
  target.dispatchEvent(
    new PointerEvent('pointerleave', {
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      bubbles: true,
    }),
  );
}

export interface PointerInit {
  pointerId: number;
  isPrimary: boolean;
  x: number;
  y: number;
}

export function touch(el: Element, type: string, p: PointerInit): void {
  el.dispatchEvent(
    new PointerEvent(type, {
      pointerId: p.pointerId,
      pointerType: 'touch',
      isPrimary: p.isPrimary,
      clientX: p.x,
      clientY: p.y,
      bubbles: true,
      cancelable: true,
      buttons: 1,
      pressure: 0.5,
    }),
  );
}

/** Measures a pointer-driven sweep and checks it moved the viewport. */
export async function gestureSweep(
  head: Head,
  ctx: Ctx,
  chart: BenchChart,
  makeStep: (center: PlotCenter) => { step(i: number): void; end(): void },
  options: ViewportSweepOptions & { prepare?(chart: BenchChart): void } = {},
): Promise<ScenarioResult> {
  chart.el.scrollIntoView();
  await settle();
  options.prepare?.(chart);
  await settle(2);
  const center = plotCenter(chart);
  const before = chart.renders();
  const start = chart.xRange();
  const fidelity = options.fidelity ? new FidelitySampler(chart) : null;
  const { step, end } = makeStep(center);
  // A sweep that returns to its origin ends at the starting viewport, so validity tracks
  // whether the viewport ever moved.
  let moved = false;
  const sw = await sweep({
    ...SWEEP,
    step,
    afterFlush: (i) => {
      const r = chart.xRange();
      if (r && start && (r.min !== start.min || r.max !== start.max)) moved = true;
      fidelity?.sample(i);
    },
  });
  end();
  const renders = rendersSince(chart, before);
  const result = fromSweep(head, ctx.api, sw, {
    valid: moved && renders.data > 0,
    renders,
    fidelity: fidelity?.result() ?? null,
    meta: options.meta,
  });
  chart.destroy();
  return result;
}

/** Start gestures from a 40% window so pans and zoom-outs have room to move. */
export function zoomToMidWindow(chart: BenchChart, [lo, hi]: [number, number]): void {
  const full = hi - lo;
  chart.setX(lo + full * 0.3, lo + full * 0.7);
}
