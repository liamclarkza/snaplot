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
export type { ChartProps, HostAttributes } from './solid/Chart';
export { LegendTable } from './solid/LegendTable';
export type { LegendTableProps } from './solid/LegendTable';
export { createChartState, createCursor } from './solid/primitives';
export type { MaybeChart } from './solid/primitives';
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
