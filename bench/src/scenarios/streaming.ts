// Streaming scenarios: rate-limited appends into a full ring, with the add-ons that change the
// append path (a plugin, the legend table), group appends with aligned plots, and an idle 50 Hz
// stream. Ported from the audit's `streamAt` and `groupAppend` (gap-perf-gate §3.3).

import type { BenchChart, ChartSpec } from '../api/types';
import { appendChunks, genTimeSeries } from '../data';
import { type ScenarioResult, settle, sweep } from '../metrics';
import {
  type Ctx,
  chartBox,
  fromSweep,
  type Head,
  line,
  rendersSince,
  SWEEP,
  type Scenario,
} from './common';

const WINDOW = 50_000;

interface StreamOptions {
  hz: number;
  chunk: number;
  frames: number;
  addon?: ChartSpec['addon'];
}

/** Appends `chunk` points at `hz` (gated by rAF) into a full `WINDOW`-point ring. */
async function stream(ctx: Ctx, head: Head, o: StreamOptions): Promise<ScenarioResult> {
  const initial = genTimeSeries(WINDOW);
  const chart = ctx.api.mount(chartBox(ctx.stage), {
    ...line(initial),
    maxPoints: WINDOW,
    addon: o.addon,
  });
  chart.el.scrollIntoView();
  await settle();
  const chunks = appendChunks(initial.x[initial.x.length - 1], o.frames + SWEEP.warmup, o.chunk);
  const period = 1000 / o.hz;
  let last = Number.NEGATIVE_INFINITY;
  let next = 0;
  const before = chart.renders();
  const materialized0 = chart.materializations();
  const sw = await sweep({
    steps: o.frames,
    warmup: SWEEP.warmup,
    heap: true,
    step: () => {
      const now = performance.now();
      if (now - last < period - 1) return false;
      last = now;
      chart.append(chunks[next++]);
      return true;
    },
  });
  const renders = rendersSince(chart, before);
  const materialized1 = chart.materializations();
  chart.destroy();
  return fromSweep(head, ctx.api, sw, {
    valid: renders.data > 0,
    renders,
    meta: {
      hz: o.hz,
      chunk: o.chunk,
      window: WINDOW,
      materializationsPerAppend:
        materialized0 === null || materialized1 === null || sw.ops === 0
          ? null
          : (materialized1 - materialized0) / sw.ops,
    },
  });
}

async function groupAppendAligned(ctx: Ctx, head: Head): Promise<ScenarioResult> {
  const group = ctx.api.group({ alignPlots: true });
  const charts: BenchChart[] = [];
  const firstData = genTimeSeries(20_000, 1);
  try {
    for (let k = 0; k < 3; k++) {
      const data = k === 0 ? firstData : genTimeSeries(20_000, k + 1);
      charts.push(
        ctx.api.mount(chartBox(ctx.stage, 220), {
          data,
          x: 'x',
          xType: 'time',
          series: [{ id: `v${k}`, type: 'line', y: 'value' }],
          maxPoints: 20_000,
          group,
        }),
      );
    }
    await settle();
    const chunks = appendChunks(
      firstData.x[firstData.x.length - 1],
      SWEEP.steps + SWEEP.warmup,
      10,
    );
    const peerBefore = charts[1].renders();
    const sw = await sweep({ ...SWEEP, step: (i) => charts[0].append(chunks[i]) });
    const peer = rendersSince(charts[1], peerBefore);
    return fromSweep(head, ctx.api, sw, {
      valid: true,
      renders: peer,
      meta: { charts: 3, note: 'renders are for an untouched peer' },
    });
  } finally {
    for (const chart of charts) chart.destroy();
    group.destroy();
  }
}

export const streaming: Scenario[] = [
  ...(['none', 'plugin', 'legendtable'] as const).map(
    (variant): Scenario => ({
      name: `stream20hz-50k-${variant}`,
      area: 'streaming',
      primary: 'busy',
      run: (ctx) =>
        stream(
          ctx,
          { name: `stream20hz-50k-${variant}`, area: 'streaming', primary: 'busy' },
          {
            hz: 20,
            chunk: 10,
            frames: 240,
            addon: variant === 'none' ? undefined : variant === 'plugin' ? 'noop' : 'legendtable',
          },
        ),
    }),
  ),
  {
    name: 'group-append-3x20k-align',
    area: 'streaming',
    primary: 'sync',
    run: (ctx) =>
      groupAppendAligned(ctx, {
        name: 'group-append-3x20k-align',
        area: 'streaming',
        primary: 'sync',
      }),
  },
  {
    // An idle (no cursor) 50 Hz stream; its software-raster frame time prices at-rest decimation.
    name: 'stream-50hz-idle',
    area: 'streaming',
    primary: 'busy',
    run: (ctx) =>
      stream(
        ctx,
        { name: 'stream-50hz-idle', area: 'streaming', primary: 'busy' },
        { hz: 50, chunk: 10, frames: 240 },
      ),
  },
];
