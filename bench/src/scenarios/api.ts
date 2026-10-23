// API-layer scenarios (gap-perf-gate-08): what an option change, a React parent render and a
// large typed-column ingest cost through the public API. Ported from the audit's
// `evidence/gap-perf-gate/ext/src/wtonly.ts` (reingest, reactRerender, ingest).

import type { BenchChart, ChartSpec, Columns } from '../api/types';
import { genTimeSeries, rowsOf } from '../data';
import { gc, heapBytes, mark, once, type ScenarioResult, settle, sweep } from '../metrics';
import {
  type Ctx,
  chartBox,
  fromOnce,
  fromSweep,
  type Head,
  line,
  rendersSince,
  type Scenario,
} from './common';

const UPDATES = { steps: 30, warmup: 5 };

/** 200k samples of two series: `{ t, a, b }`. */
function twoSeries(n: number): Columns {
  const d = genTimeSeries(n);
  return { t: d.x, a: d.value, b: Float64Array.from(d.value, (v) => v * 0.5 + 10) };
}

async function reingest(
  ctx: Ctx,
  shape: 'rows' | 'cols',
  kind: 'title' | 'callback',
): Promise<ScenarioResult> {
  const name = `reingest-${shape}-200k-${kind}`;
  const head: Head = { name, area: 'api', primary: 'sync' };
  const columns = twoSeries(200_000);
  const spec: ChartSpec = {
    data: shape === 'rows' ? rowsOf(columns) : columns,
    x: 't',
    xType: 'time',
    yTitle: 'same',
    series: [
      { id: 'a', type: 'line', y: 'a' },
      { id: 'b', type: 'line', y: 'b' },
    ],
    onPointClick: kind === 'callback' ? () => -1 : undefined,
  };
  const chart = ctx.api.mount(chartBox(ctx.stage), spec);
  await settle();
  const ingests0 = chart.ingests();
  const before = chart.renders();
  const sw = await sweep({
    ...UPDATES,
    step: (i) => chart.update(kind === 'title' ? { yTitle: `T${i}` } : { onPointClick: () => i }),
  });
  const ingests1 = chart.ingests();
  const renders = rendersSince(chart, before);
  chart.destroy();
  const total = UPDATES.steps + UPDATES.warmup;
  return fromSweep(head, ctx.api, sw, {
    valid: true,
    renders,
    meta: {
      rows: 200_000,
      series: 2,
      ingestsPerUpdate:
        ingests0 === null || ingests1 === null ? null : (ingests1 - ingests0) / total,
    },
  });
}

async function reactRerender(ctx: Ctx, variant: 'stable' | 'inline'): Promise<ScenarioResult> {
  const name = `react-rerender-200k-${variant}`;
  const head: Head = { name, area: 'api', primary: 'sync' };
  const d = genTimeSeries(200_000);
  const rows = rowsOf({ t: d.x, cpu: d.value });
  const host = chartBox(ctx.stage);
  const harness = await ctx.api.react(host, {
    rows,
    x: 't',
    xType: 'time',
    series: [{ id: 'cpu', y: 'cpu' }],
    variant,
    height: 440,
  });
  await settle();
  const chart = harness.chart();
  const ingests0 = chart.ingests();
  const before = chart.renders();
  const sw = await sweep({ ...UPDATES, step: (i) => harness.rerender(i + 1) });
  const ingests1 = chart.ingests();
  const renders = rendersSince(chart, before);
  harness.unmount();
  host.remove();
  const total = UPDATES.steps + UPDATES.warmup;
  return fromSweep(head, ctx.api, sw, {
    valid: true,
    renders,
    meta: {
      rows: 200_000,
      ingestsPerRender:
        ingests0 === null || ingests1 === null ? null : (ingests1 - ingests0) / total,
    },
  });
}

/** Constructs a 1M-point typed-column line chart `reps` times; heap retained after GC per chart. */
async function ingestMillion(ctx: Ctx, head: Head, reps: number): Promise<ScenarioResult> {
  const data = genTimeSeries(1_000_000);
  const samples = { sync: [] as number[], busy: [] as number[], wall: [] as number[] };
  const retained: number[] = [];
  await mark('start');
  for (let r = 0; r < reps; r++) {
    const el = chartBox(ctx.stage);
    await settle(2);
    gc();
    const before = heapBytes();
    const mounted: { chart?: BenchChart } = {};
    const m = await once(() => {
      mounted.chart = ctx.api.mount(el, line(data));
    });
    samples.sync.push(m.sync);
    samples.busy.push(m.busy);
    samples.wall.push(m.wall);
    gc();
    const after = heapBytes();
    if (before !== null && after !== null) retained.push((after - before) / 1024);
    mounted.chart?.destroy();
    await settle(2);
  }
  await mark('end');
  retained.sort((a, b) => a - b);
  return fromOnce(head, ctx.api, samples, {
    valid: true,
    meta: {
      points: 1_000_000,
      reps,
      coldWallMs: Math.round(samples.wall[0] * 100) / 100,
      retainedKBPerChart: retained.length ? Math.round(retained[retained.length >> 1]) : null,
    },
  });
}

export const api: Scenario[] = [];
for (const shape of ['rows', 'cols'] as const) {
  for (const kind of ['title', 'callback'] as const) {
    api.push({
      name: `reingest-${shape}-200k-${kind}`,
      area: 'api',
      primary: 'sync',
      run: (ctx) => reingest(ctx, shape, kind),
    });
  }
}
for (const variant of ['stable', 'inline'] as const) {
  api.push({
    name: `react-rerender-200k-${variant}`,
    area: 'api',
    primary: 'sync',
    run: (ctx) => reactRerender(ctx, variant),
  });
}
api.push({
  name: 'ingest-cols-1m',
  area: 'api',
  primary: 'sync',
  run: (ctx) => ingestMillion(ctx, { name: 'ingest-cols-1m', area: 'api', primary: 'sync' }, 5),
});

export { ingestMillion };
