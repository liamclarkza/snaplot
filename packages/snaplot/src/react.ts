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
export type { ChartProps, HostAttributes } from './react/Chart';
export { LegendTable } from './react/LegendTable';
export type { LegendTableProps } from './react/LegendTable';
export { useChartState, useCursor } from './react/hooks';
export { createChartGroup, histogram, histogram2d } from 'snaplot';
export type {
  Histogram2d,
  Histogram2dOptions,
  HistogramOptions,
  HistogramRule,
  LegendTableColumn,
  LegendTableHandle,
  LegendTableOptions,
} from 'snaplot';
// The public types: a type-only re-export, erased from the JavaScript, which imports 'snaplot' only.
export type * from './public/types';
