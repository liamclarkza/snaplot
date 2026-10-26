/**
 * Canvas charts for live data: one options object, the same in vanilla JavaScript, React and
 * Solid. Start with {@link createChart}.
 *
 * @example
 * ```ts
 * import { createChart } from 'snaplot';
 *
 * const chart = createChart(document.getElementById('cpu')!, {
 *   data: rows,
 *   x: 'time',
 *   series: [{ y: 'cpu', label: 'CPU' }, { y: 'mem', label: 'Memory' }],
 *   ariaLabel: 'CPU and memory',
 * });
 * ```
 *
 * @module snaplot
 */
export { createChart, createChartGroup } from './public/chart';
export { createLegendTable } from './public/legend';
export { histogram } from './public/histogram';
export type * from './public/types';
export type {
  LegendTableColumn,
  LegendTableHandle,
  LegendTableOptions,
} from './public/legend';
export type { HistogramOptions, HistogramRule } from './public/histogram';
