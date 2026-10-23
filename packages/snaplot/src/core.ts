// Framework-independent public API. The column-oriented rendering engine is private.
export { createChart, createChartGroup } from './api/createChart';
export type {
  Accessor,
  Field,
  AxisValue,
  RowId,
  ColumnData,
  DataSource,
  Viewport,
  AxisOptions,
  SeriesOptions,
  SeriesBase,
  ColorEncoding,
  SizeEncoding,
  TooltipField,
  ChartOptions,
  ChartPatch,
  ChartHandle,
  ChartPlugin,
  ChartPoint,
  ChartState,
  ChartEvents,
  ChartGroup,
  ChartGroupOptions,
  AppendOptions,
  CursorSnapshot,
  LegendItem,
  SelectionResult,
  ReferenceLine,
  ReferenceRegion,
} from './api/types';
export {
  lightTheme,
  darkTheme,
  oceanTheme,
  midnightTheme,
  refinedDarkTheme,
  marsTheme,
  forestTheme,
  sunsetTheme,
  violetTheme,
  fogTheme,
  ivoryTheme,
  mintTheme,
  studioTheme,
  tokyoTheme,
  resolveTheme,
  createTheme,
  applyThemeToElement,
  CHART_CSS_VARS,
  SNAPLOT_THEME_CSS_VARS,
} from './config/theme';
export type { ThemeTokens } from './config/theme';
export type {
  ThemeConfig,
  ScaleRange,
  AxisGridConfig,
  AxisTickMarksConfig,
  AxisPosition,
  Layout,
  ChartType,
  ChartStats,
  CursorSnapshotOptions,
  SelectionRange,
  ScatterPointShape,
  ScatterRenderMode,
  ScatterColorEncodingType,
  InterpolationMode,
  InteractionMode,
  DebugConfig,
} from './types';
export {
  createLegendPlugin,
  createLegendTablePlugin,
  nameColumn,
  valueColumn,
  swatchColumn,
  metricColumn,
  column,
} from './api/legend';
export type { LegendTableColumn, LegendTableOptions, LegendCellContent } from './api/legend';
export { histogram } from './utils/histogram';
export type { HistogramBins, HistogramOptions } from './utils/histogram';
export { lttb } from './data/downsampling/lttb';
export { m4 } from './data/downsampling/m4';
export { lowerBound, upperBound, nearestIndex, viewportIndices } from './data/binarySearch';
