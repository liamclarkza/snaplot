// Heatmap scenarios (0.14 onwards): a streaming waterfall (rows up the plot, the Bluetooth channel
// sounding case: 75 bins, 300 rows kept) and a streaming spectrogram (rows along X, 512 bins, 600
// rows kept), one row per append at 60 Hz into a full ring. Builds without heatmaps report them
// as unsupported.

import type { ChartSpec, Row } from '../api/types';
import { mulberry32 } from '../data';
import { type ScenarioResult, settle, sweep } from '../metrics';
import {
  type Ctx,
  chartBox,
  fromSweep,
  type Head,
  rendersSince,
  SWEEP,
  type Scenario,
} from './common';

interface HeatmapStream {
  rows: number;
  bins: number;
  rowsOnY: boolean;
}

async function heatmapStream(ctx: Ctx, head: Head, o: HeatmapStream): Promise<ScenarioResult> {
  const random = mulberry32(o.bins);
  const row = (t: number) => ({
    t,
    v: Float64Array.from({ length: o.bins }, (_, b) => Math.sin(t / 40 + b / 9) + random() * 0.2),
  });
  const initial = Array.from({ length: o.rows }, (_, t) => row(t));
  const spec: ChartSpec = {
    data: initial as unknown as Row[],
    x: 't',
    xType: 'linear',
    series: [
      {
        id: 'cells',
        type: 'heatmap',
        y: 'v',
        heatmap: {
          values: 'v',
          bins: { start: 0, step: 1, count: o.bins },
          rowsOnY: o.rowsOnY,
          domain: [-1.2, 1.2],
        },
      },
    ],
    maxPoints: o.rows,
  };
  const chart = ctx.api.mount(chartBox(ctx.stage), spec);
  chart.el.scrollIntoView();
  await settle();
  let t = o.rows;
  const before = chart.renders();
  const sw = await sweep({
    steps: SWEEP.steps,
    warmup: SWEEP.warmup,
    heap: true,
    step: () => {
      chart.appendRows([row(t++)]);
      return true;
    },
  });
  const renders = rendersSince(chart, before);
  chart.destroy();
  return fromSweep(head, ctx.api, sw, {
    valid: renders.data > 0,
    renders,
    meta: { rows: o.rows, bins: o.bins, rowsOnY: o.rowsOnY },
  });
}

export const heatmap: Scenario[] = [
  {
    name: 'heatmap-waterfall-300x75',
    area: 'streaming',
    primary: 'busy',
    run: (ctx) =>
      heatmapStream(
        ctx,
        { name: 'heatmap-waterfall-300x75', area: 'streaming', primary: 'busy' },
        { rows: 300, bins: 75, rowsOnY: true },
      ),
  },
  {
    name: 'heatmap-spectrogram-600x512',
    area: 'streaming',
    primary: 'busy',
    run: (ctx) =>
      heatmapStream(
        ctx,
        { name: 'heatmap-spectrogram-600x512', area: 'streaming', primary: 'busy' },
        { rows: 600, bins: 512, rowsOnY: false },
      ),
  },
];
