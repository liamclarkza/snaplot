// SolidJS integration entrypoint. Import from `snaplot/solid`.

export { Chart } from './solid/Chart';
export type { ChartProps } from './solid/Chart';

export { createChart } from './solid/createChart';
export { createCursorSnapshot } from './solid/createCursorSnapshot';
export { createHighlight, createHighlightKey } from './solid/createHighlight';
export { createChartGroup } from './solid/createChartGroup';
export { createReferenceRegions } from './solid/createReferenceRegions';
export type {
  ChartGroup,
  ChartGroupBindings,
  ChartGroupBindOptions,
  ChartGroupOptions,
  ChartGroupLinkOptions,
} from './solid/createChartGroup';

export { LegendTable } from './solid/LegendTable';
export type {
  LegendTableProps,
  LegendTableSolidColumn,
  LegendTableFallback,
} from './solid/LegendTable';

export { SeriesLegend } from './solid/SeriesLegend';
export type { SeriesLegendProps } from './solid/SeriesLegend';

export type {
  ChartInstance,
  ChartConfig,
  ColumnarData,
  CursorSnapshot,
  CursorSnapshotOptions,
  HighlightSyncKey,
  LegendItem,
} from './core';
