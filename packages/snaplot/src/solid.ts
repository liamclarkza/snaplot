// SolidJS integration entrypoint. Import from `snaplot/solid`.

export { Chart } from './solid/Chart';
export type { ChartProps } from './solid/Chart';

export { createChart } from './solid/createChart';
export { createCursorSnapshot } from './solid/createCursorSnapshot';
export { createHighlight, createHighlightKey } from './solid/createHighlight';
export { createChartGroup } from './solid/createChartGroup';
export type { ChartGroup, ChartGroupBindings } from './solid/createChartGroup';

export { LegendTable } from './solid/LegendTable';
export type {
  LegendTableProps,
  LegendTableSolidColumn,
  LegendTableFallback,
} from './solid/LegendTable';

export type {
  ChartInstance,
  ChartConfig,
  ColumnarData,
  CursorSnapshot,
  CursorSnapshotOptions,
  HighlightSyncKey,
} from './core';
