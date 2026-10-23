/**
 * The Solid components and hooks: `<Chart>` takes the same options as `createChart`.
 *
 * @example
 * ```tsx
 * import { Chart } from 'snaplot/solid';
 *
 * export function Cpu(props: { rows: Sample[] }) {
 *   return <Chart data={props.rows} x="time" series={[{ y: 'cpu' }]} ariaLabel="CPU" />;
 * }
 * ```
 *
 * @module snaplot/solid
 */
export { Chart } from './solid/Chart';
export type { ChartProps } from './solid/Chart';
export { createChart } from './solid/createChart';
export { createChartState } from './solid/createChartState';
export { createCursorSnapshot } from './solid/createCursorSnapshot';
export { createHighlight } from './solid/createHighlight';
export { createChartGroup } from './solid/createChartGroup';
export { LegendTable } from './solid/LegendTable';
export type { LegendTableProps, LegendTableColumn } from './solid/LegendTable';
export { SeriesLegend } from './solid/SeriesLegend';
export type { SeriesLegendProps } from './solid/SeriesLegend';
export type { ChartControls, LegendTableFallback } from './react/shared';
export type {
  ChartOptions,
  ChartHandle,
  ChartState,
  ChartPoint,
  CursorSnapshot,
  ChartGroup,
  ChartGroupOptions,
} from './public/types';

export { nameColumn, valueColumn, swatchColumn, metricColumn, column } from './solid/columns';
