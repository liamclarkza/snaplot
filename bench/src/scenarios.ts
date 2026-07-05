import { ChartCore } from 'snaplot/core';
import type { ChartConfig, ChartInstance, ColumnarData } from 'snaplot/core';
import { genAppendChunk, genTabular, genTimeSeries } from './data';
import {
  heapMB,
  LayerTracker,
  measureFrames,
  type ScenarioResult,
  settleFrames,
  summarizeFrames,
} from './metrics';

const SWEEP_STEPS = 180;
const SWEEP_WARMUP = 20;
const RENDER_STEPS = 60;
const RENDER_WARMUP = 10;

interface RunOpts {
  stage: HTMLElement;
}

export interface Scenario {
  name: string;
  run(opts: RunOpts): Promise<ScenarioResult>;
}

function chartContainer(stage: HTMLElement, height = 440): HTMLDivElement {
  const el = document.createElement('div');
  const width = Math.min(Math.max(320, window.innerWidth - 24), 900);
  el.style.width = width + 'px';
  el.style.height = height + 'px';
  stage.appendChild(el);
  return el;
}

interface ChartHandle {
  chart: ChartInstance;
  el: HTMLDivElement;
  destroy(): void;
}

function makeChart(
  stage: HTMLElement,
  config: ChartConfig,
  data: ColumnarData,
  height = 440,
): ChartHandle {
  const el = chartContainer(stage, height);
  const chart = new ChartCore(el, { debug: { stats: true }, ...config }, data);
  return {
    chart,
    el,
    destroy() {
      chart.destroy();
      el.remove();
    },
  };
}

/** Triangle wave in [0, 1] over `steps`, so a sweep ends where it started. */
function triangle(i: number, steps: number): number {
  const t = (i % steps) / steps;
  return t < 0.5 ? t * 2 : (1 - t) * 2;
}

function xExtent(data: ColumnarData): [number, number] {
  const x = data[0];
  return [x[0], x[x.length - 1]];
}

/** Pan a 40%-of-domain window back and forth across the data. */
function panStep(chart: ChartInstance, extent: [number, number], i: number): void {
  const [lo, hi] = extent;
  const full = hi - lo;
  const span = full * 0.4;
  const maxOffset = full - span;
  const offset = triangle(i, SWEEP_STEPS) * maxOffset;
  chart.setAxis('x', { min: lo + offset, max: lo + offset + span });
}

/** Zoom from the full domain down to 4% around the center and back out. */
function zoomStep(chart: ChartInstance, extent: [number, number], i: number): void {
  const [lo, hi] = extent;
  const full = hi - lo;
  const center = lo + full / 2;
  const t = triangle(i, SWEEP_STEPS);
  const span = full * (1 - t * 0.96);
  chart.setAxis('x', { min: center - span / 2, max: center + span / 2 });
}

async function runSweep(
  opts: RunOpts,
  name: string,
  config: ChartConfig,
  data: ColumnarData,
  step: (chart: ChartInstance, extent: [number, number], i: number) => void,
  meta: Record<string, string | number> = {},
): Promise<ScenarioResult> {
  const handle = makeChart(opts.stage, config, data);
  const extent = xExtent(data);
  await settleFrames();
  const tracker = new LayerTracker(handle.chart);
  const heapBefore = heapMB();

  const startMin = handle.chart.getAxis('x')?.min ?? Number.NaN;
  let everMoved = false;
  const deltas = await measureFrames(
    SWEEP_STEPS,
    SWEEP_WARMUP,
    (i) => {
      step(handle.chart, extent, i);
      const min = handle.chart.getAxis('x')?.min;
      if (min !== undefined && min !== startMin) everMoved = true;
    },
    () => tracker.sample(),
  );

  const heapAfter = heapMB();
  const layers = tracker.result();
  const result: ScenarioResult = {
    name,
    valid: everMoved && layers.data.renders > 0,
    frame: summarizeFrames(deltas),
    layers,
    heapDeltaMB:
      heapBefore !== null && heapAfter !== null
        ? Math.round((heapAfter - heapBefore) * 100) / 100
        : null,
    meta: { points: data[0].length, ...meta },
  };
  handle.destroy();
  return result;
}

async function runRedrawLoop(
  opts: RunOpts,
  name: string,
  config: ChartConfig,
  data: ColumnarData,
  meta: Record<string, string | number> = {},
): Promise<ScenarioResult> {
  const handle = makeChart(opts.stage, config, data);
  await settleFrames();
  const tracker = new LayerTracker(handle.chart);
  const heapBefore = heapMB();

  const deltas = await measureFrames(
    RENDER_STEPS,
    RENDER_WARMUP,
    () => handle.chart.redraw(),
    () => tracker.sample(),
  );

  const heapAfter = heapMB();
  const layers = tracker.result();
  const result: ScenarioResult = {
    name,
    valid: layers.data.renders > 0,
    frame: summarizeFrames(deltas),
    layers,
    heapDeltaMB:
      heapBefore !== null && heapAfter !== null
        ? Math.round((heapAfter - heapBefore) * 100) / 100
        : null,
    meta: { points: data[0].length, ...meta },
  };
  handle.destroy();
  return result;
}

// ─── Config presets ─────────────────────────────────────────────

const timeScatterConfig: ChartConfig = {
  axes: { x: { type: 'time' }, y: { type: 'linear' } },
  series: [{ label: 'points', type: 'scatter', dataIndex: 1 }],
};

const lineConfig: ChartConfig = {
  axes: { x: { type: 'time' }, y: { type: 'linear' } },
  series: [{ label: 'value', type: 'line', dataIndex: 1 }],
};

const tabularScatterConfig: ChartConfig = {
  axes: { x: { type: 'linear' }, y: { type: 'linear' } },
  series: [{ label: 'metric', type: 'scatter', xDataIndex: 1, yDataIndex: 2 }],
};

const encodedScatterConfig: ChartConfig = {
  axes: { x: { type: 'linear' }, y: { type: 'linear' } },
  series: [
    {
      label: 'metric',
      type: 'scatter',
      xDataIndex: 1,
      yDataIndex: 2,
      colorBy: 3,
      sizeBy: { dataIndex: 4, scale: 'sqrt' },
    },
  ],
};

const densityConfig: ChartConfig = {
  axes: { x: { type: 'time' }, y: { type: 'linear' } },
  series: [{ label: 'density', type: 'scatter', dataIndex: 1, renderMode: 'density' }],
};

// ─── Gesture helpers ────────────────────────────────────────────

/** Start gestures from a 40% window so pans and zoom-outs have room to move. */
function zoomToMidWindow(chart: ChartInstance, extent: [number, number]): void {
  const [lo, hi] = extent;
  const full = hi - lo;
  chart.setAxis('x', { min: lo + full * 0.3, max: lo + full * 0.7 });
}

function plotCenterClient(chart: ChartInstance): { cx: number; cy: number } {
  const rect = chart.container.getBoundingClientRect();
  const plot = chart.getLayout().plot;
  return {
    cx: rect.left + plot.left + plot.width / 2,
    cy: rect.top + plot.top + plot.height / 2,
  };
}

function gestureTarget(cx: number, cy: number): Element {
  const el = document.elementFromPoint(cx, cy);
  if (!el) throw new Error('no element at plot center; is the chart offscreen?');
  return el;
}

interface PointerInit {
  pointerId: number;
  isPrimary: boolean;
  x: number;
  y: number;
}

function firePointer(el: Element, type: string, p: PointerInit): void {
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

async function runGesture(
  opts: RunOpts,
  name: string,
  config: ChartConfig,
  data: ColumnarData,
  makeStep: (chart: ChartInstance, el: Element, cx: number, cy: number) => {
    step: (i: number) => void;
    end: () => void;
  },
  meta: Record<string, string | number> = {},
  /**
   * Runs before measurement starts, typically to zoom into a window.
   * Gestures at the full data extent are clamped to no-ops by the default
   * zoom bounds, which measures nothing.
   */
  prepare?: (chart: ChartInstance, extent: [number, number]) => void,
): Promise<ScenarioResult> {
  const handle = makeChart(opts.stage, config, data);
  handle.el.scrollIntoView();
  await settleFrames();
  prepare?.(handle.chart, xExtent(data));
  await settleFrames(2);
  const { cx, cy } = plotCenterClient(handle.chart);
  const el = gestureTarget(cx, cy);
  const tracker = new LayerTracker(handle.chart);
  const heapBefore = heapMB();

  const xScale = handle.chart.getAxis('x');
  const startMin = xScale?.min ?? Number.NaN;
  const startMax = xScale?.max ?? Number.NaN;
  const { step, end } = makeStep(handle.chart, el, cx, cy);

  // A sweep that returns to its origin ends with the starting viewport, so
  // validity must track whether the viewport EVER moved, not the end state.
  let everMoved = false;
  const deltas = await measureFrames(SWEEP_STEPS, SWEEP_WARMUP, step, () => {
    tracker.sample();
    const s = handle.chart.getAxis('x');
    if (s && (s.min !== startMin || s.max !== startMax)) everMoved = true;
  });
  end();

  const moved = everMoved;
  const heapAfter = heapMB();
  const layers = tracker.result();
  const result: ScenarioResult = {
    name,
    valid: moved && layers.data.renders > 0,
    frame: summarizeFrames(deltas),
    layers,
    heapDeltaMB:
      heapBefore !== null && heapAfter !== null
        ? Math.round((heapAfter - heapBefore) * 100) / 100
        : null,
    meta: { points: data[0].length, ...meta },
  };
  handle.destroy();
  return result;
}

// ─── Scenario definitions ───────────────────────────────────────

export const scenarios: Scenario[] = [
  {
    name: 'scatter-render-10k',
    run: (o) => runRedrawLoop(o, 'scatter-render-10k', timeScatterConfig, genTimeSeries(10_000)),
  },
  {
    name: 'scatter-render-50k',
    run: (o) => runRedrawLoop(o, 'scatter-render-50k', timeScatterConfig, genTimeSeries(50_000)),
  },
  {
    name: 'scatter-render-200k',
    run: (o) => runRedrawLoop(o, 'scatter-render-200k', timeScatterConfig, genTimeSeries(200_000)),
  },
  {
    name: 'scatter-pan-50k',
    run: (o) => runSweep(o, 'scatter-pan-50k', timeScatterConfig, genTimeSeries(50_000), panStep),
  },
  {
    name: 'scatter-pan-200k',
    run: (o) => runSweep(o, 'scatter-pan-200k', timeScatterConfig, genTimeSeries(200_000), panStep),
  },
  {
    name: 'scatter-zoom-50k',
    run: (o) => runSweep(o, 'scatter-zoom-50k', timeScatterConfig, genTimeSeries(50_000), zoomStep),
  },
  {
    name: 'scatter-zoom-200k',
    run: (o) =>
      runSweep(o, 'scatter-zoom-200k', timeScatterConfig, genTimeSeries(200_000), zoomStep),
  },
  {
    name: 'scatter-offaxis-pan-50k',
    run: (o) => {
      const data = genTabular(50_000);
      return runSweep(o, 'scatter-offaxis-pan-50k', tabularScatterConfig, data, (chart, _e, i) => {
        // Pan across the metricA extent rather than the row-index column.
        const lo = -60;
        const hi = 60;
        const span = (hi - lo) * 0.4;
        const offset = triangle(i, SWEEP_STEPS) * (hi - lo - span);
        chart.setAxis('x', { min: lo + offset, max: lo + offset + span });
      });
    },
  },
  {
    name: 'scatter-encoded-pan-50k',
    run: (o) => {
      const data = genTabular(50_000);
      return runSweep(o, 'scatter-encoded-pan-50k', encodedScatterConfig, data, (chart, _e, i) => {
        const lo = -60;
        const hi = 60;
        const span = (hi - lo) * 0.4;
        const offset = triangle(i, SWEEP_STEPS) * (hi - lo - span);
        chart.setAxis('x', { min: lo + offset, max: lo + offset + span });
      });
    },
  },
  {
    name: 'heatmap-pan-300k',
    run: (o) => runSweep(o, 'heatmap-pan-300k', densityConfig, genTimeSeries(300_000), panStep),
  },
  {
    name: 'line-pan-200k',
    run: (o) => runSweep(o, 'line-pan-200k', lineConfig, genTimeSeries(200_000), panStep),
  },
  {
    name: 'two-heatmaps-highlight-150k',
    run: async (o) => {
      // Two density charts alternating highlight state force a data-layer
      // repaint on both charts every frame at an unchanged viewport. With a
      // correctly owned per-chart heatmap cache this is nearly free; a shared
      // cache degrades it to a full rebin per chart per frame.
      const a = makeChart(o.stage, densityConfig, genTimeSeries(150_000, 1), 300);
      const b = makeChart(o.stage, densityConfig, genTimeSeries(150_000, 2), 300);
      await settleFrames();
      const trackerA = new LayerTracker(a.chart);
      const trackerB = new LayerTracker(b.chart);
      const heapBefore = heapMB();

      const deltas = await measureFrames(
        SWEEP_STEPS,
        SWEEP_WARMUP,
        (i) => {
          const on = i % 2 === 0;
          a.chart.setHighlight(on ? 0 : null);
          b.chart.setHighlight(on ? 0 : null);
        },
        () => {
          trackerA.sample();
          trackerB.sample();
        },
      );

      const heapAfter = heapMB();
      const layersA = trackerA.result();
      const layersB = trackerB.result();
      const result: ScenarioResult = {
        name: 'two-heatmaps-highlight-150k',
        valid: layersA.data.renders > 0 && layersB.data.renders > 0,
        frame: summarizeFrames(deltas),
        layers: layersA,
        heapDeltaMB:
          heapBefore !== null && heapAfter !== null
            ? Math.round((heapAfter - heapBefore) * 100) / 100
            : null,
        meta: {
          points: 300_000,
          chartBDataRenders: layersB.data.renders,
          chartBDataMeanMs: layersB.data.meanMs,
        },
      };
      a.destroy();
      b.destroy();
      return result;
    },
  },
  {
    name: 'append-stream-50k-window',
    run: async (o) => {
      const initial = genTimeSeries(20_000);
      const handle = makeChart(
        o.stage,
        { ...lineConfig, streaming: { maxLen: 50_000 } },
        initial,
      );
      await settleFrames();
      const tracker = new LayerTracker(handle.chart);
      const heapBefore = heapMB();
      let lastX = initial[0][initial[0].length - 1];

      const deltas = await measureFrames(
        SWEEP_STEPS,
        SWEEP_WARMUP,
        (i) => {
          const chunk = genAppendChunk(lastX, 200, i + 1);
          lastX = chunk[0][chunk[0].length - 1];
          handle.chart.appendData(chunk);
        },
        () => tracker.sample(),
      );

      const heapAfter = heapMB();
      const layers = tracker.result();
      const result: ScenarioResult = {
        name: 'append-stream-50k-window',
        valid: handle.chart.getData()[0].length === 50_000 && layers.data.renders > 0,
        frame: summarizeFrames(deltas),
        layers,
        heapDeltaMB:
          heapBefore !== null && heapAfter !== null
            ? Math.round((heapAfter - heapBefore) * 100) / 100
            : null,
        meta: { finalPoints: handle.chart.getData()[0].length },
      };
      handle.destroy();
      return result;
    },
  },
  {
    name: 'hover-sweep-50k',
    run: (o) =>
      runGesture(
        o,
        'hover-sweep-50k',
        timeScatterConfig,
        genTimeSeries(50_000),
        (chart, el, cx, cy) => {
          const plot = chart.getLayout().plot;
          const halfW = plot.width * 0.45;
          return {
            step: (i) => {
              const x = cx + (triangle(i, SWEEP_STEPS) * 2 - 1) * halfW;
              el.dispatchEvent(
                new PointerEvent('pointermove', {
                  pointerId: 1,
                  pointerType: 'mouse',
                  isPrimary: true,
                  clientX: x,
                  clientY: cy,
                  bubbles: true,
                  cancelable: true,
                }),
              );
            },
            end: () => {
              el.dispatchEvent(
                new PointerEvent('pointerleave', {
                  pointerId: 1,
                  pointerType: 'mouse',
                  isPrimary: true,
                  bubbles: true,
                }),
              );
            },
          };
        },
      ).then((r) => {
        // Hover never changes the viewport; validity is overlay-only work.
        r.valid = r.layers.overlay.renders > 0 && r.layers.data.renders === 0;
        return r;
      }),
  },
  {
    name: 'touch-pan-gesture-50k',
    run: (o) =>
      runGesture(
        o,
        'touch-pan-gesture-50k',
        { ...timeScatterConfig, touch: { drag: 'pan' } },
        genTimeSeries(50_000),
        (_chart, el, cx, cy) => {
          const p: PointerInit = { pointerId: 11, isPrimary: true, x: cx, y: cy };
          firePointer(el, 'pointerdown', p);
          return {
            step: (i) => {
              // Drag left and right, 6 CSS px per frame, like a finger scrub.
              p.x = cx + (triangle(i, SWEEP_STEPS) * 2 - 1) * 120;
              firePointer(el, 'pointermove', p);
            },
            end: () => firePointer(el, 'pointerup', p),
          };
        },
        {},
        zoomToMidWindow,
      ),
  },
  {
    name: 'pinch-zoom-gesture-50k',
    run: (o) =>
      runGesture(
        o,
        'pinch-zoom-gesture-50k',
        timeScatterConfig,
        genTimeSeries(50_000),
        (_chart, el, cx, cy) => {
          const a: PointerInit = { pointerId: 21, isPrimary: true, x: cx - 30, y: cy };
          const b: PointerInit = { pointerId: 22, isPrimary: false, x: cx + 30, y: cy };
          firePointer(el, 'pointerdown', a);
          firePointer(el, 'pointerdown', b);
          return {
            step: (i) => {
              // Fingers spread apart and pinch back together.
              const gap = 30 + triangle(i, SWEEP_STEPS) * 110;
              a.x = cx - gap;
              b.x = cx + gap;
              firePointer(el, 'pointermove', a);
              firePointer(el, 'pointermove', b);
            },
            end: () => {
              firePointer(el, 'pointerup', a);
              firePointer(el, 'pointerup', b);
            },
          };
        },
        {},
        zoomToMidWindow,
      ),
  },
  {
    name: 'wheel-zoom-gesture-50k',
    run: (o) =>
      runGesture(
        o,
        'wheel-zoom-gesture-50k',
        timeScatterConfig,
        genTimeSeries(50_000),
        (_chart, el, cx, cy) => ({
          step: (i) => {
            // Zoom in for the first half of the sweep, back out for the rest.
            // ctrlKey marks the event as a trackpad pinch; plain wheel
            // deliberately passes through to page scroll.
            const dir = (i % SWEEP_STEPS) < SWEEP_STEPS / 2 ? -1 : 1;
            el.dispatchEvent(
              new WheelEvent('wheel', {
                deltaY: dir * 60,
                clientX: cx,
                clientY: cy,
                ctrlKey: true,
                bubbles: true,
                cancelable: true,
              }),
            );
          },
          end: () => {},
        }),
        {},
        zoomToMidWindow,
      ),
  },
];

export function findScenario(name: string): Scenario | undefined {
  return scenarios.find((s) => s.name === name);
}
