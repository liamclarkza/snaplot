/**
 * The React (18.3 and 19) components and hooks: `<Chart>` takes the same options as `createChart`.
 *
 * @example
 * ```tsx
 * import { Chart } from 'snaplot/react';
 *
 * export function Cpu({ rows }: { rows: Sample[] }) {
 *   return <Chart data={rows} x="time" series={[{ y: 'cpu' }]} ariaLabel="CPU" />;
 * }
 * ```
 *
 * @module snaplot/react
 */
export { Chart } from './react/Chart';
export type { ChartProps } from './react/Chart';
export { useChartState, useCursorSnapshot, useHighlight, useChartGroup } from './react/hooks';
export {
  SeriesLegend,
  LegendTable,
  nameColumn,
  valueColumn,
  swatchColumn,
  metricColumn,
  column,
} from './react/legends';
export type { SeriesLegendProps, LegendTableProps, LegendTableColumn } from './react/legends';
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
