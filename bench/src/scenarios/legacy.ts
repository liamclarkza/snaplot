// The pre-M4 gate scenarios, unchanged in workload: the same seeded data, chart configs, sweeps and
// gestures as v0.12.0's bench (and `overhaul-baseline`'s), now measured as busy time and driven
// through the API adapters, so `bench:ab --base v0.12.0 --filter legacy` compares like with like.

import type { ChartSpec } from '../api/types';
import { appendChunks, genTabular, genTimeSeries } from '../data';
import { type ScenarioResult, settle, sweep } from '../metrics';
import {
  type Ctx,
  chartBox,
  densityScatter,
  encodedScatter,
  extentOf,
  fromSweep,
  gestureSweep,
  type Head,
  line,
  mouseLeave,
  mouseMove,
  panStep,
  RENDER,
  rendersSince,
  SWEEP,
  type Scenario,
  tabularScatter,
  timeScatter,
  touch,
  triangle,
  viewportSweep,
  zoomStep,
  zoomToMidWindow,
  type PointerInit,
} from './common';

const head = (name: string): Head => ({ name, area: 'legacy', primary: 'busy' });

async function redrawLoop(ctx: Ctx, name: string, n: number): Promise<ScenarioResult> {
  const chart = ctx.api.mount(chartBox(ctx.stage), timeScatter(genTimeSeries(n)));
  await settle();
  const before = chart.renders();
  const sw = await sweep({ ...RENDER, step: () => chart.redraw() });
  const renders = rendersSince(chart, before);
  chart.destroy();
  return fromSweep(head(name), ctx.api, sw, {
    valid: renders.data > 0,
    renders,
    meta: { points: n },
  });
}

function sweepScenario(
  name: string,
  build: () => { spec: ChartSpec; extent: [number, number] },
  move: typeof panStep,
  fidelity = false,
): Scenario {
  return {
    ...head(name),
    run: (ctx) => {
      const { spec, extent } = build();
      const chart = ctx.api.mount(chartBox(ctx.stage), spec);
      return viewportSweep(head(name), ctx, chart, (i) => move(chart, extent, i), { fidelity });
    },
  };
}

const timeSeries = (n: number, seed?: number) => {
  const data = genTimeSeries(n, seed);
  return { data, extent: extentOf(data.x) };
};

/** Off-axis X sweeps pan across the metricA extent rather than the row-index column. */
const metricExtent: [number, number] = [-60, 60];

export const legacy: Scenario[] = [
  {
    ...head('independent-lines-pan-75k'),
    run: (ctx) => {
      // Two separately sampled named-column sources (50K and 25K points), X grids not joined.
      const { data, extent } = timeSeries(50_000);
      const chart = ctx.api.mount(chartBox(ctx.stage), {
        data,
        x: 'x',
        xType: 'time',
        series: [
          { id: 'primary', type: 'line', y: 'value' },
          { id: 'secondary', type: 'line', y: 'value', data: genTimeSeries(25_000, 2) },
        ],
      });
      return viewportSweep(head('independent-lines-pan-75k'), ctx, chart, (i) =>
        panStep(chart, extent, i),
      );
    },
  },
  { ...head('scatter-render-10k'), run: (ctx) => redrawLoop(ctx, 'scatter-render-10k', 10_000) },
  { ...head('scatter-render-50k'), run: (ctx) => redrawLoop(ctx, 'scatter-render-50k', 50_000) },
  {
    ...head('scatter-render-200k'),
    run: (ctx) => redrawLoop(ctx, 'scatter-render-200k', 200_000),
  },
  sweepScenario(
    'scatter-pan-50k',
    () => {
      const t = timeSeries(50_000);
      return { spec: timeScatter(t.data), extent: t.extent };
    },
    panStep,
    true,
  ),
  sweepScenario(
    'scatter-pan-200k',
    () => {
      const t = timeSeries(200_000);
      return { spec: timeScatter(t.data), extent: t.extent };
    },
    panStep,
    true,
  ),
  sweepScenario(
    'scatter-zoom-50k',
    () => {
      const t = timeSeries(50_000);
      return { spec: timeScatter(t.data), extent: t.extent };
    },
    zoomStep,
    true,
  ),
  sweepScenario(
    'scatter-zoom-200k',
    () => {
      const t = timeSeries(200_000);
      return { spec: timeScatter(t.data), extent: t.extent };
    },
    zoomStep,
    true,
  ),
  sweepScenario(
    'scatter-offaxis-pan-50k',
    () => ({ spec: tabularScatter(genTabular(50_000)), extent: metricExtent }),
    panStep,
    true,
  ),
  sweepScenario(
    'scatter-encoded-pan-50k',
    () => ({ spec: encodedScatter(genTabular(50_000)), extent: metricExtent }),
    panStep,
    true,
  ),
  sweepScenario(
    'heatmap-pan-300k',
    () => {
      const t = timeSeries(300_000);
      return { spec: densityScatter(t.data), extent: t.extent };
    },
    panStep,
  ),
  sweepScenario(
    'line-pan-200k',
    () => {
      const t = timeSeries(200_000);
      return { spec: line(t.data), extent: t.extent };
    },
    panStep,
  ),
  {
    ...head('two-heatmaps-highlight-150k'),
    run: async (ctx) => {
      // Two density charts alternating highlight force a data repaint on both every frame at an
      // unchanged viewport. A correctly owned per-chart heatmap cache keeps this nearly free; a
      // shared cache degrades it to a full rebin per chart per frame.
      const a = ctx.api.mount(chartBox(ctx.stage, 300), densityScatter(genTimeSeries(150_000, 1)));
      const b = ctx.api.mount(chartBox(ctx.stage, 300), densityScatter(genTimeSeries(150_000, 2)));
      await settle();
      const beforeA = a.renders();
      const beforeB = b.renders();
      const sw = await sweep({
        ...SWEEP,
        step: (i) => {
          const id = i % 2 === 0 ? 'density' : null;
          a.highlight(id);
          b.highlight(id);
        },
      });
      const rendersA = rendersSince(a, beforeA);
      const rendersB = rendersSince(b, beforeB);
      a.destroy();
      b.destroy();
      return fromSweep(head('two-heatmaps-highlight-150k'), ctx.api, sw, {
        valid: rendersA.data > 0 && rendersB.data > 0,
        renders: rendersA,
        meta: { points: 300_000, chartBDataRenders: rendersB.data },
      });
    },
  },
  {
    ...head('append-stream-50k-window'),
    run: async (ctx) => {
      const initial = genTimeSeries(20_000);
      const chart = ctx.api.mount(chartBox(ctx.stage), { ...line(initial), maxPoints: 50_000 });
      await settle();
      const chunks = appendChunks(initial.x[initial.x.length - 1], SWEEP.steps + SWEEP.warmup, 200);
      const before = chart.renders();
      const sw = await sweep({ ...SWEEP, step: (i) => chart.append(chunks[i]) });
      const renders = rendersSince(chart, before);
      const retained = chart.retained();
      chart.destroy();
      return fromSweep(head('append-stream-50k-window'), ctx.api, sw, {
        valid: (retained === null || retained === 50_000) && renders.data > 0,
        renders,
        meta: { finalPoints: retained },
      });
    },
  },
  {
    ...head('hover-sweep-50k'),
    run: async (ctx) => {
      const chart = ctx.api.mount(chartBox(ctx.stage), timeScatter(genTimeSeries(50_000)));
      const result = await gestureSweep(head('hover-sweep-50k'), ctx, chart, (c) => ({
        step: (i) => mouseMove(c.target, c.cx + (triangle(i, SWEEP.steps) * 2 - 1) * c.halfW, c.cy),
        end: () => mouseLeave(c.target),
      }));
      // Hover never changes the viewport; validity is overlay-only work.
      const r = result.renders;
      result.valid = r !== null && r.overlay > 0 && r.data === 0;
      return result;
    },
  },
  {
    ...head('touch-pan-gesture-50k'),
    run: (ctx) => {
      const { data, extent } = timeSeries(50_000);
      const chart = ctx.api.mount(chartBox(ctx.stage), { ...timeScatter(data), touchPan: true });
      return gestureSweep(
        head('touch-pan-gesture-50k'),
        ctx,
        chart,
        (c) => {
          const p: PointerInit = { pointerId: 11, isPrimary: true, x: c.cx, y: c.cy };
          touch(c.target, 'pointerdown', p);
          return {
            // Drag left and right like a finger scrub.
            step: (i) => {
              p.x = c.cx + (triangle(i, SWEEP.steps) * 2 - 1) * 120;
              touch(c.target, 'pointermove', p);
            },
            end: () => touch(c.target, 'pointerup', p),
          };
        },
        { fidelity: true, prepare: (ch) => zoomToMidWindow(ch, extent) },
      );
    },
  },
  {
    ...head('pinch-zoom-gesture-50k'),
    run: (ctx) => {
      const { data, extent } = timeSeries(50_000);
      const chart = ctx.api.mount(chartBox(ctx.stage), timeScatter(data));
      return gestureSweep(
        head('pinch-zoom-gesture-50k'),
        ctx,
        chart,
        (c) => {
          const a: PointerInit = { pointerId: 21, isPrimary: true, x: c.cx - 30, y: c.cy };
          const b: PointerInit = { pointerId: 22, isPrimary: false, x: c.cx + 30, y: c.cy };
          touch(c.target, 'pointerdown', a);
          touch(c.target, 'pointerdown', b);
          return {
            // Fingers spread apart and pinch back together.
            step: (i) => {
              const gap = 30 + triangle(i, SWEEP.steps) * 110;
              a.x = c.cx - gap;
              b.x = c.cx + gap;
              touch(c.target, 'pointermove', a);
              touch(c.target, 'pointermove', b);
            },
            end: () => {
              touch(c.target, 'pointerup', a);
              touch(c.target, 'pointerup', b);
            },
          };
        },
        { fidelity: true, prepare: (ch) => zoomToMidWindow(ch, extent) },
      );
    },
  },
  {
    ...head('wheel-zoom-gesture-50k'),
    run: (ctx) => {
      const { data, extent } = timeSeries(50_000);
      const chart = ctx.api.mount(chartBox(ctx.stage), timeScatter(data));
      return gestureSweep(
        head('wheel-zoom-gesture-50k'),
        ctx,
        chart,
        (c) => ({
          step: (i) => {
            // Zoom in for the first half of the sweep, back out for the rest. ctrlKey marks a
            // trackpad pinch; a plain wheel deliberately passes through to page scroll.
            const dir = i % SWEEP.steps < SWEEP.steps / 2 ? -1 : 1;
            c.target.dispatchEvent(
              new WheelEvent('wheel', {
                deltaY: dir * 60,
                clientX: c.cx,
                clientY: c.cy,
                ctrlKey: true,
                bubbles: true,
                cancelable: true,
              }),
            );
          },
          end: () => {},
        }),
        { fidelity: true, prepare: (ch) => zoomToMidWindow(ch, extent) },
      );
    },
  },
];
