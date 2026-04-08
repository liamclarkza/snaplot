// snaplot — high-performance canvas chart library for SolidJS

// Component (primary API)
export { Chart } from './solid/Chart';
export type { ChartProps } from './solid/Chart';

// Imperative core (advanced use)
export { ChartCore } from './core/Chart';

// Reactive primitive
export { createChart } from './solid/createChart';

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
export { lightTheme, darkTheme, oceanTheme, midnightTheme, resolveTheme } from './config/theme';

// Plugins
export { createLegendPlugin } from './plugins/builtins/legendPlugin';

// Utilities
export { histogram } from './utils/histogram';
export type { HistogramBins, HistogramOptions } from './utils/histogram';

// Types
export type {
  ChartInstance,
  ChartConfig,
  ChartType,
  ColumnarData,
  DeepPartial,
  Scale,
  ScaleType,
  ScaleRange,
  SeriesConfig,
  AxisConfig,
  AxisPosition,
  ThemeConfig,
  Layout,
  Plugin,
  TooltipPoint,
  TooltipConfig,
  CursorConfig,
  ZoomConfig,
  PanConfig,
  SelectionConfig,
  InteractionMode,
  TouchConfig,
  InterpolationMode,
  RenderContext,
  ChartEventMap,
} from './types';
