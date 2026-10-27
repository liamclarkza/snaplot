import type { ChartHandle } from './types';

/**
 * The handle createChart() returns (plan §4.4, gap-environments-03): its fourteen members, each
 * calling the chart, and nothing a group, a legend or the engine uses, so the runtime surface is
 * the typed one. Plugins, the built-in legend and the legend table receive this object; a group's
 * member is the chart itself.
 */
export function publicHandle<Row>(chart: ChartHandle<Row>): ChartHandle<Row> {
  return {
    container: chart.container,
    update: (patch) => chart.update(patch),
    setOptions: (options) => chart.setOptions(options),
    appendData: (data, options) => chart.appendData(data, options),
    getState: () => chart.getState(),
    subscribe: (listener) => chart.subscribe(listener),
    on: (event, listener) => chart.on(event, listener),
    getCursor: (options) => chart.getCursor(options),
    resetViewport: () => chart.resetViewport(),
    resumeFollow: () => chart.resumeFollow(),
    setCursor: (x) => chart.setCursor(x),
    scale: (key) => chart.scale(key),
    redraw: (layer) => chart.redraw(layer),
    destroy: () => chart.destroy(),
  };
}
