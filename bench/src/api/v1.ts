// v1 adapter: the rows-first `createChart` API from `overhaul-baseline` until M8 (handles with
// `update`, `setViewport`, `getAxis`, `getLayout` and `getStats`, plugins for legends, and a React
// `Chart` that reports its handle through `onReady`).

import * as snaplot from 'snaplot';
import { debugSnapshot, defined, interop, type Loose, renderCounts } from './common';
import {
  type BenchApi,
  type BenchChart,
  type BenchGroup,
  type ChartSpec,
  type Columns,
  type ReactHarness,
  type ReactSpec,
  type SeriesSpec,
  Unsupported,
} from './types';

const mod = snaplot as unknown as Loose;

function seriesOptions(s: SeriesSpec): Record<string, unknown> {
  if (s.type === 'heatmap') throw new Unsupported('no heatmap series before 0.14');
  return defined({
    id: s.id,
    label: s.id,
    type: s.type,
    y: s.y,
    x: s.x,
    colorBy: s.colorBy,
    sizeBy: s.sizeBy ? { field: s.sizeBy, scale: 'sqrt' } : undefined,
    renderMode: s.density ? 'density' : undefined,
    data: s.data ? { columns: s.data } : undefined,
  });
}

function addons(kind: ChartSpec['addon']): unknown[] | undefined {
  if (!kind) return undefined;
  if (kind === 'noop') return [{ id: 'noop', afterDrawData() {} }];
  if (kind === 'legend') return [mod.createLegendPlugin()];
  return [mod.createLegendTablePlugin()];
}

function options(spec: ChartSpec): Record<string, unknown> {
  return defined({
    debug: { stats: true },
    x: spec.x,
    data: Array.isArray(spec.data) ? spec.data : { columns: spec.data },
    axes: {
      x: { type: spec.xType },
      y: defined({
        type: 'linear',
        title: spec.yTitle,
        min: spec.yRange?.[0],
        max: spec.yRange?.[1],
      }),
    },
    series: spec.series.map(seriesOptions),
    streaming: spec.maxPoints ? { maxPoints: spec.maxPoints } : undefined,
    plugins: addons(spec.addon),
    group: spec.group?.raw,
    touch: spec.touchPan ? { drag: 'pan' } : undefined,
    onPointClick: spec.onPointClick,
  });
}

export function wrapV1(chart: Loose, el: HTMLElement, owned = true): BenchChart {
  return {
    el,
    raw: chart,
    setX: (min, max) => chart.setViewport({ x: { min, max } }),
    xRange: () => {
      const axis = chart.getAxis('x');
      return axis ? { min: axis.min, max: axis.max } : null;
    },
    plot: () => chart.getLayout().plot,
    appendRows: () => {
      throw new Unsupported('no row appends of heatmap rows before 0.14');
    },
    append: (columns: Columns, seriesId?: string) =>
      chart.appendData({ columns }, seriesId ? { seriesId } : undefined),
    highlight: (id) => chart.setHighlight(id),
    redraw: () => chart.redraw(),
    update: (patch) => {
      if (patch.yTitle !== undefined) chart.update({ axes: { y: { title: patch.yTitle } } });
      if (patch.onPointClick !== undefined) chart.update({ onPointClick: patch.onPointClick });
    },
    retained: () => {
      const first = chart.getCursorSnapshot({ fallback: 'first' }).points[0]?.rowIndex;
      const last = chart.getCursorSnapshot({ fallback: 'latest' }).points[0]?.rowIndex;
      return first === undefined || last === undefined ? null : last - first + 1;
    },
    renders: () => renderCounts(chart),
    ingests: () => debugSnapshot(chart)?.ingestCount ?? chart.getStats().setDataCount,
    materializations: () => debugSnapshot(chart)?.materializeCount ?? null,
    debug: () => debugSnapshot(chart),
    destroy: () => {
      if (!owned) return;
      chart.destroy();
      el.remove();
    },
  };
}

export function v1(): BenchApi {
  return {
    version: 'v1',
    mount: (el, spec) => wrapV1(mod.createChart(el, options(spec)), el),
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
      if (typeof Chart !== 'function') throw new Unsupported('this build has no snaplot/react');
      let handle: Loose = null;
      let setTick: (tick: number) => void = () => {};
      const onReady = (chart: Loose) => {
        handle = chart;
      };
      const stableSeries = spec.series.map((s) => ({ id: s.id, y: s.y }));
      const stableAxes = { x: { type: spec.xType } };
      const style = { height: spec.height };
      function App() {
        const [tick, set] = React.useState(0);
        setTick = set;
        const props: Record<string, unknown> = {
          data: spec.rows,
          x: spec.x,
          debug: { stats: true },
          style,
          onReady,
        };
        if (spec.variant === 'stable') {
          props.series = stableSeries;
          props.axes = stableAxes;
        } else {
          props.series = spec.series.map((s) => ({ id: s.id, y: s.y }));
          props.axes = { x: { type: spec.xType } };
          props.onPointClick = () => tick;
        }
        return React.createElement('div', { style }, React.createElement(Chart, props));
      }
      const root = client.createRoot(host);
      dom.flushSync(() => root.render(React.createElement(App)));
      if (!handle) throw new Error('the React chart did not report its handle');
      return {
        rerender: (tick) => dom.flushSync(() => setTick(tick)),
        chart: () => wrapV1(handle, host, false),
        unmount: () => root.unmount(),
      };
    },
  };
}
