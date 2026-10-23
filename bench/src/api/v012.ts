// v012 adapter: the v0.12.0 release, whose public API was the `ChartCore` constructor over one
// columnar array (`[x, ...fields]`, addressed by `dataIndex`). Ported from the audit's
// `evidence/gap-perf-gate/ext/src/adapter-v012.ts` and the v0.12.0 bench configs, so the legacy
// scenarios run the same workloads the release's own bench ran.

import * as snaplot from 'snaplot';
import { defined, type Loose, renderCounts } from './common';
import {
  type BenchApi,
  type BenchChart,
  type BenchGroup,
  type ChartSpec,
  type Columns,
  Unsupported,
} from './types';

const mod = snaplot as unknown as Loose;
let groupKeys = 0;

function addons(kind: ChartSpec['addon']): unknown[] | undefined {
  if (!kind) return undefined;
  if (kind === 'noop') return [{ id: 'noop', afterDrawData() {} }];
  if (kind === 'legend') return [mod.createLegendPlugin()];
  return [mod.createLegendTablePlugin()];
}

function mount(el: HTMLElement, spec: ChartSpec): BenchChart {
  if (Array.isArray(spec.data)) throw new Unsupported('v0.12.0 takes columns, not rows');
  if (spec.series.some((s) => s.data)) throw new Unsupported('v0.12.0 has one source per chart');
  if (spec.onPointClick) throw new Unsupported('v0.12.0 has no onPointClick option');
  const data = spec.data;
  // Column 0 is X; every other field gets an index in first-use order.
  const fields = [spec.x];
  const index = (field: string) => {
    let i = fields.indexOf(field);
    if (i < 0) {
      fields.push(field);
      i = fields.length - 1;
    }
    return i;
  };
  const series = spec.series.map((s) =>
    defined({
      label: s.id,
      type: s.type,
      ...(s.x ? { xDataIndex: index(s.x), yDataIndex: index(s.y) } : { dataIndex: index(s.y) }),
      colorBy: s.colorBy ? index(s.colorBy) : undefined,
      sizeBy: s.sizeBy ? { dataIndex: index(s.sizeBy), scale: 'sqrt' } : undefined,
      renderMode: s.density ? 'density' : undefined,
    }),
  );
  const config = defined({
    debug: { stats: true },
    axes: {
      x: { type: spec.xType },
      y: defined({
        type: 'linear',
        title: spec.yTitle,
        min: spec.yRange?.[0],
        max: spec.yRange?.[1],
      }),
    },
    series,
    streaming: spec.maxPoints ? { maxLen: spec.maxPoints } : undefined,
    plugins: addons(spec.addon),
    cursor: spec.group ? { syncKey: (spec.group.raw as { key: string }).key } : undefined,
    touch: spec.touchPan ? { drag: 'pan' } : undefined,
  });
  const chart = new mod.ChartCore(
    el,
    config,
    fields.map((f) => data[f]),
  );
  const ids = spec.series.map((s) => s.id);
  return {
    el,
    raw: chart,
    setX: (min, max) => chart.setAxis('x', { min, max }),
    xRange: () => {
      const axis = chart.getAxis('x');
      return axis ? { min: axis.min, max: axis.max } : null;
    },
    plot: () => chart.getLayout().plot,
    append: (columns: Columns) => {
      const arrays = fields.map((f) => columns[f]);
      if (arrays.some((a) => !a)) throw new Unsupported('v0.12.0 appends every column at once');
      chart.appendData(arrays);
    },
    highlight: (id) => chart.setHighlight(id === null ? null : ids.indexOf(id)),
    redraw: () => chart.redraw(),
    update: (patch) => {
      if (patch.onPointClick !== undefined) throw new Unsupported('v0.12.0 has no onPointClick');
      if (patch.yTitle !== undefined) chart.setOptions({ axes: { y: { title: patch.yTitle } } });
    },
    retained: () => chart.getData()[0]?.length ?? null,
    renders: () => renderCounts(chart),
    ingests: () => chart.getStats().setDataCount,
    materializations: () => null,
    debug: () => null,
    destroy: () => {
      chart.destroy();
      el.remove();
    },
  };
}

export function v012(): BenchApi {
  return {
    version: 'v012',
    mount,
    group: ({ alignPlots }): BenchGroup => {
      if (alignPlots) throw new Unsupported('v0.12.0 has no plot alignment');
      // v0.12.0 linked charts by a shared cursor sync key.
      return { raw: { key: `bench-${++groupKeys}` }, destroy: () => {} };
    },
    react: async () => {
      throw new Unsupported('v0.12.0 has no React component');
    },
  };
}
