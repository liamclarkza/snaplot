// v2 adapter: the 0.13 surface of plan §4 (M8 onwards). Handles have `setOptions`, take state
// through `update({ viewport | highlight })`, expose `scale(key)` instead of `getAxis`/`getLayout`,
// and drop `getStats` for the debug symbol (which also carries the plot rectangle). Legends are
// built in (`legend`) or a separate `createLegendTable(el, { chart })`, plugins draw through
// `drawBelow | drawAbove | drawOverlay`, a touch pan is `interaction: { drag: 'pan' }`, and
// React's `Chart` hands out its handle through `ref`.
//
// Finalised by M8 against the shipped handle. Detection picks it for any handle with `setOptions`.

import * as snaplot from 'snaplot';
import { debugSnapshot, defined, interop, type Loose, renderCounts } from './common';
import {
  type BenchApi,
  type BenchChart,
  type BenchGroup,
  type ChartSpec,
  type Columns,
  type PlotRect,
  type ReactHarness,
  type ReactSpec,
  type SeriesSpec,
  Unsupported,
} from './types';

const mod = snaplot as unknown as Loose;

function seriesOptions(s: SeriesSpec, x: string): Record<string, unknown> {
  if (s.type === 'heatmap') {
    if (typeof mod.histogram2d !== 'function') throw new Unsupported('this build has no heatmaps');
    const h = s.heatmap!;
    return defined({
      id: s.id,
      type: 'heatmap',
      values: h.values,
      bins: h.bins,
      y: h.rowsOnY ? x : undefined,
      domain: h.domain,
    });
  }
  return defined({
    id: s.id,
    label: s.id,
    type: s.type,
    y: s.y,
    x: s.x,
    colorBy: s.colorBy ? { field: s.colorBy } : undefined,
    sizeBy: s.sizeBy ? { field: s.sizeBy } : undefined,
    renderMode: s.density ? 'density' : undefined,
    data: s.data ? { columns: s.data } : undefined,
  });
}

function options(spec: ChartSpec): Record<string, unknown> {
  return defined({
    x: spec.x,
    data: Array.isArray(spec.data) ? spec.data : { columns: spec.data },
    axes: {
      x: { type: spec.xType },
      y: defined({ title: spec.yTitle, min: spec.yRange?.[0], max: spec.yRange?.[1] }),
    },
    series: spec.series.map((s) => seriesOptions(s, spec.x)),
    streaming: spec.maxPoints ? { maxPoints: spec.maxPoints } : undefined,
    // Like-for-like with v1, where a legend exists only as an add-on.
    legend: spec.addon === 'legend',
    plugins: spec.addon === 'noop' ? [{ id: 'noop', drawAbove() {} }] : undefined,
    group: spec.group?.raw,
    interaction: spec.touchPan ? { drag: 'pan' } : undefined,
    onPointClick: spec.onPointClick,
  });
}

/** The plot rectangle relative to the container: past a built-in legend above the canvases. */
function plotRect(chart: Loose): PlotRect {
  const container = chart.container as HTMLElement;
  const root = container.querySelector('[role="application"]') ?? container;
  const offset = root.getBoundingClientRect();
  const box = container.getBoundingClientRect();
  const dx = offset.left - box.left;
  const dy = offset.top - box.top;
  // The debug symbol's plot (CSS px from the canvases' top-left), else derived from scale().
  const plot = debugSnapshot(chart)?.plot;
  if (plot)
    return { left: dx + plot.left, top: dy + plot.top, width: plot.width, height: plot.height };
  const x = chart.scale('x');
  const y = chart.scale('y');
  const left = x.toPixel(x.min);
  const right = x.toPixel(x.max);
  const top = y.toPixel(y.max);
  const bottom = y.toPixel(y.min);
  return {
    left: dx + Math.min(left, right),
    top: dy + Math.min(top, bottom),
    width: Math.abs(right - left),
    height: Math.abs(bottom - top),
  };
}

function rowIndex(point: Loose): number | undefined {
  return point?.rowIndex ?? point?.index;
}

function wrapV2(chart: Loose, el: HTMLElement, owned = true, extra?: () => void): BenchChart {
  return {
    el,
    raw: chart,
    setX: (min, max) => chart.update({ viewport: { x: [min, max] } }),
    xRange: () => {
      const s = chart.scale('x');
      return s ? { min: s.min, max: s.max } : null;
    },
    plot: () => plotRect(chart),
    append: (columns: Columns, seriesId?: string) =>
      chart.appendData({ columns }, seriesId ? { seriesId } : undefined),
    appendRows: (rows) => chart.appendData(rows),
    highlight: (id) => chart.update({ highlight: id }),
    redraw: () => chart.redraw(),
    update: (patch) => {
      if (patch.yTitle !== undefined) chart.update({ axes: { y: { title: patch.yTitle } } });
      if (patch.onPointClick !== undefined) chart.update({ onPointClick: patch.onPointClick });
    },
    retained: () => {
      const first = rowIndex(chart.getCursor({ fallback: 'first' })?.points?.[0]);
      const last = rowIndex(chart.getCursor({ fallback: 'latest' })?.points?.[0]);
      return first === undefined || last === undefined ? null : last - first + 1;
    },
    renders: () => renderCounts(chart),
    ingests: () => debugSnapshot(chart)?.ingestCount ?? null,
    materializations: () => debugSnapshot(chart)?.materializeCount ?? null,
    debug: () => debugSnapshot(chart),
    destroy: () => {
      if (!owned) return;
      extra?.();
      chart.destroy();
      el.remove();
    },
  };
}

export function v2(): BenchApi {
  return {
    version: 'v2',
    mount: (el, spec) => {
      const chart = mod.createChart(el, options(spec));
      if (spec.addon !== 'legendtable') return wrapV2(chart, el);
      if (typeof mod.createLegendTable !== 'function') {
        chart.destroy();
        throw new Unsupported('this build has no createLegendTable');
      }
      const host = document.createElement('div');
      el.after(host);
      const table = mod.createLegendTable(host, { chart });
      return wrapV2(chart, el, true, () => {
        table?.destroy?.();
        host.remove();
      });
    },
    group: ({ alignPlots }): BenchGroup => {
      const group = mod.createChartGroup({ alignPlots: alignPlots === true });
      return { raw: group, destroy: () => group.destroy?.() };
    },
    react: async (host: HTMLElement, spec: ReactSpec): Promise<ReactHarness> => {
      const [React, client, dom, adapter] = await Promise.all([
        import('react').then(interop),
        import('react-dom/client').then(interop),
        import('react-dom').then(interop),
        import('snaplot/react'),
      ]);
      const Chart = (adapter as Loose).Chart;
      // A function component, or (from M13, for React 18) a forwardRef object.
      if (Chart == null) throw new Unsupported('this build has no snaplot/react');
      const ref: { current: Loose } = { current: null };
      let setTick: (tick: number) => void = () => {};
      const stableSeries = spec.series.map((s) => ({ id: s.id, y: s.y }));
      const stableAxes = { x: { type: spec.xType } };
      function App() {
        const [tick, set] = React.useState(0);
        setTick = set;
        const props: Record<string, unknown> = {
          ref,
          data: spec.rows,
          x: spec.x,
          height: spec.height,
          legend: false,
        };
        if (spec.variant === 'stable') {
          props.series = stableSeries;
          props.axes = stableAxes;
        } else {
          props.series = spec.series.map((s) => ({ id: s.id, y: s.y }));
          props.axes = { x: { type: spec.xType } };
          props.onPointClick = () => tick;
        }
        return React.createElement(Chart, props);
      }
      const root = client.createRoot(host);
      dom.flushSync(() => root.render(React.createElement(App)));
      if (!ref.current) throw new Error('the React chart did not attach its ref');
      return {
        rerender: (tick) => dom.flushSync(() => setTick(tick)),
        chart: () => wrapV2(ref.current, host, false),
        unmount: () => root.unmount(),
      };
    },
  };
}
