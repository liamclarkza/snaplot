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
export { LegendTable } from './react/LegendTable';
export type { LegendTableProps } from './react/LegendTable';
export { useChartState, useCursor } from './react/hooks';
export type { HostAttributes } from './react/shared';
export { createChartGroup } from './public/chart';
export { histogram } from './public/histogram';
export type * from './public/types';
export type {
  LegendTableColumn,
  LegendTableHandle,
  LegendTableOptions,
} from './public/legend';
export type { HistogramOptions, HistogramRule } from './public/histogram';
