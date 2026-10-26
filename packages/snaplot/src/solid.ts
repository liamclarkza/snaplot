/**
 * The Solid components and primitives: `<Chart>` takes the same options as `createChart`.
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
export { LegendTable } from './solid/LegendTable';
export type { LegendTableProps } from './solid/LegendTable';
export { createChartState, createCursor } from './solid/primitives';
export type { MaybeChart } from './solid/primitives';
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
