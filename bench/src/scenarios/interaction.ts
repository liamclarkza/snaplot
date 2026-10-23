// Interaction scenarios: the per-move cost of hover on large sorted and unsorted data
// (gap-perf-gate-03), cursor sync across a 20-member group with most members offscreen
// (gap-scale-longevity-07), and a calendar-scale time-axis pan (formatter reuse, §3.4).

import type { BenchChart, ChartSpec } from '../api/types';
import { genCalendarSeries, genTabular, genTimeSeries } from '../data';
import { type ScenarioResult, settle, sweep } from '../metrics';
import {
  type Ctx,
  chartBox,
  fromSweep,
  type Head,
  line,
  mouseLeave,
  mouseMove,
  plotCenter,
  rendersSince,
  SWEEP,
  type Scenario,
  sumRenders,
  tabularScatter,
  timeScatter,
  triangle,
  viewportSweep,
  windowRenders,
} from './common';

async function hoverSync(ctx: Ctx, head: Head, spec: ChartSpec): Promise<ScenarioResult> {
  const chart = ctx.api.mount(chartBox(ctx.stage), spec);
  chart.el.scrollIntoView();
  await settle();
  const c = plotCenter(chart);
  const before = chart.renders();
  const sw = await sweep({
    ...SWEEP,
    step: (i) => mouseMove(c.target, c.cx + (triangle(i, SWEEP.steps) * 2 - 1) * c.halfW, c.cy),
  });
  mouseLeave(c.target);
  const renders = rendersSince(chart, before);
  chart.destroy();
  return fromSweep(head, ctx.api, sw, {
    valid: renders.overlay > 0 && renders.data === 0,
    renders,
  });
}

/**
 * Hover on the first of 20 grouped charts. Two members sit in view; a spacer pushes the other 18
 * below the fold, where a visibility-gated group paints nothing (plan §3.4: 2 overlays per move).
 */
async function groupHover(ctx: Ctx, head: Head): Promise<ScenarioResult> {
  const group = ctx.api.group({});
  const charts: BenchChart[] = [];
  try {
    for (let k = 0; k < 20; k++) {
      if (k === 2) {
        const spacer = document.createElement('div');
        spacer.style.height = `${window.innerHeight * 2}px`;
        ctx.stage.appendChild(spacer);
      }
      charts.push(
        ctx.api.mount(chartBox(ctx.stage, 160), {
          ...line(genTimeSeries(5_000, k + 1)),
          series: [{ id: `s${k}`, type: 'line', y: 'value' }],
          group,
        }),
      );
    }
    window.scrollTo(0, 0);
    await settle();
    const c = plotCenter(charts[0]);
    const counts = windowRenders(charts);
    const sw = await sweep({
      ...SWEEP,
      ...counts.hooks,
      step: (i) => mouseMove(c.target, c.cx + (triangle(i, SWEEP.steps) * 2 - 1) * c.halfW, c.cy),
    });
    mouseLeave(c.target);
    const each = counts.each();
    const all = sumRenders(each);
    const offscreen = sumRenders(each.slice(2));
    return fromSweep(head, ctx.api, sw, {
      valid: each[0].overlay > 0 && each[1].overlay > 0,
      renders: each[0],
      meta: {
        members: 20,
        overlaysPerMove: sw.ops ? all.overlay / sw.ops : null,
        offscreenOverlaysPerMove: sw.ops ? offscreen.overlay / sw.ops : null,
      },
    });
  } finally {
    for (const chart of charts) chart.destroy();
    group.destroy();
  }
}

export const interaction: Scenario[] = [
  {
    name: 'hover-sync-line-200k',
    area: 'interaction',
    primary: 'sync',
    run: (ctx) =>
      hoverSync(
        ctx,
        { name: 'hover-sync-line-200k', area: 'interaction', primary: 'sync' },
        line(genTimeSeries(200_000)),
      ),
  },
  {
    name: 'hover-sync-scatter-200k',
    area: 'interaction',
    primary: 'sync',
    run: (ctx) =>
      hoverSync(
        ctx,
        { name: 'hover-sync-scatter-200k', area: 'interaction', primary: 'sync' },
        timeScatter(genTimeSeries(200_000)),
      ),
  },
  {
    name: 'hover-sync-unsorted-200k',
    area: 'interaction',
    primary: 'sync',
    run: (ctx) =>
      hoverSync(
        ctx,
        { name: 'hover-sync-unsorted-200k', area: 'interaction', primary: 'sync' },
        tabularScatter(genTabular(200_000)),
      ),
  },
  {
    name: 'hover-sync-group-20',
    area: 'interaction',
    primary: 'busy',
    run: (ctx) =>
      groupHover(ctx, { name: 'hover-sync-group-20', area: 'interaction', primary: 'busy' }),
  },
  {
    // 200k samples over 30 days, two series, panning a 3-day window: every frame formats dates
    // and times across day boundaries, so formatter construction shows up here.
    name: 'time-pan-200k',
    area: 'interaction',
    primary: 'busy',
    run: (ctx) => {
      const data = genCalendarSeries(200_000, 30);
      const lo = data.x[0];
      const hi = data.x[data.x.length - 1];
      const chart = ctx.api.mount(chartBox(ctx.stage), {
        data,
        x: 'x',
        xType: 'time',
        series: [
          { id: 'a', type: 'line', y: 'a' },
          { id: 'b', type: 'line', y: 'b' },
        ],
      });
      const span = (hi - lo) * 0.1;
      return viewportSweep(
        { name: 'time-pan-200k', area: 'interaction', primary: 'busy' },
        ctx,
        chart,
        (i) => {
          const offset = triangle(i, SWEEP.steps) * (hi - lo - span);
          chart.setX(lo + offset, lo + offset + span);
        },
        { meta: { days: 30, windowDays: 3 } },
      );
    },
  },
];
