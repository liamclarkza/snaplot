// Framework-free snaplot core entrypoint.

export { ChartCore } from './core/Chart';

// Data utilities (P3: user controls when/how to downsample)
export { lttb } from './data/downsampling/lttb';
export { m4 } from './data/downsampling/m4';
export { lowerBound, upperBound, nearestIndex, viewportIndices } from './data/binarySearch';
export { ColumnarStore } from './data/ColumnarStore';

// Scales
export { createScale } from './scales/createScale';
export { LinearScale } from './scales/LinearScale';
export { LogScale } from './scales/LogScale';
export { TimeScale } from './scales/TimeScale';
export { niceTicks, niceRange, niceStep } from './scales/niceNumbers';

// Config & theming
export { deepMerge } from './config/merge';
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

// Plugins
export { createLegendPlugin } from './plugins/builtins/legendPlugin';
export { createLegendTablePlugin } from './plugins/builtins/legendTablePlugin';
export { createReferenceLinesPlugin } from './plugins/builtins/referenceLinesPlugin';
export { createReferenceRegionsPlugin } from './plugins/builtins/referenceRegionsPlugin';
export { tooltipPlugin } from './plugins/builtins/tooltipPlugin';
export { crosshairPlugin } from './plugins/builtins/crosshairPlugin';
export type { ReferenceLine } from './plugins/builtins/referenceLinesPlugin';
export type {
  ReferenceRegion,
  ReferenceRegionsPlugin,
} from './plugins/builtins/referenceRegionsPlugin';
export type {
  LegendTableOptions,
} from './plugins/builtins/legendTablePlugin';
export {
  nameColumn,
  valueColumn,
  swatchColumn,
  metricColumn,
  column,
} from './plugins/builtins/legendTableColumns';
export type {
  LegendTableColumn,
  LegendCellContent,
} from './plugins/builtins/legendTableColumns';

// Utilities
export { histogram } from './utils/histogram';
export type { HistogramBins, HistogramOptions } from './utils/histogram';

// Types
export type {
  AppendDataOptions,
  ChartInstance,
  ChartConfig,
  ChartType,
  ColumnarData,
  DeepPartial,
  Scale,
  ScaleType,
  ScaleRange,
  SeriesConfig,
  ScatterColorEncoding,
  ScatterColorEncodingType,
  ScatterPointShape,
  ScatterRenderMode,
  ScatterSizeEncoding,
  ScatterTooltipField,
  AxisConfig,
  AxisGridConfig,
  AxisTickMarksConfig,
  AxisPosition,
  ThemeConfig,
  Layout,
  Plugin,
  TooltipPoint,
  TooltipFieldValue,
  TooltipConfig,
  LegendItem,
  CursorConfig,
  CursorEventOrigin,
  ZoomConfig,
  PanConfig,
  SelectionConfig,
  SelectionResult,
  SelectedPoint,
  InteractionMode,
  TouchConfig,
  StreamingConfig,
  InterpolationMode,
  RenderContext,
  ChartEventMap,
  ChartStats,
  CursorSnapshot,
  CursorSeriesPoint,
  CursorSnapshotOptions,
  DebugConfig,
  HighlightConfig,
  HighlightSyncKey,
  HighlightSyncPayload,
  ZoomBoundsSpec,
} from './types';
