// ============================================================
// DATA TYPES
// ============================================================

/** Supported typed array types for data columns */
export type TypedArray = Float64Array | Float32Array;

/**
 * Columnar data format: index 0 is always X values, indices 1..N are Y series.
 * All arrays must have identical length. X values (index 0) MUST be sorted
 * monotonically non-decreasing. This constraint enables O(log n) binary search
 * for viewport culling, hit-testing, and cursor snapping.
 */
export type ColumnarData = [xValues: Float64Array, ...yValues: Float64Array[]];

// ============================================================
// SCALE TYPES
// ============================================================

export type ScaleType = 'linear' | 'log' | 'time';

export interface ScaleRange {
  min: number;
  max: number;
}

/**
 * A Scale is a pure function pair: dataToPixel and pixelToData.
 * Scales own a data domain and a pixel range, and convert between them.
 */
export interface Scale {
  readonly type: ScaleType;
  readonly key: string;
  min: number;
  max: number;

  /** Map a data-space value to a pixel coordinate within the plot area */
  dataToPixel(value: number): number;

  /** Map a pixel coordinate back to data-space */
  pixelToData(pixel: number): number;

  /** Generate nice tick values for this scale's current domain */
  ticks(count?: number): number[];

  /** Format a tick value for display */
  tickFormat(value: number): string;

  /** Expand domain to nice boundaries */
  nice(count?: number): void;

  /** Update the pixel range (called on layout change) */
  setPixelRange(pxMin: number, pxMax: number): void;
}

// ============================================================
// LAYOUT
// ============================================================

export interface Layout {
  /** Total CSS pixel width of the chart container */
  width: number;
  /** Total CSS pixel height of the chart container */
  height: number;
  /** The data-rendering region */
  plot: { top: number; left: number; width: number; height: number };
  /** Axis regions */
  axes: {
    top: { left: number; top: number; width: number; height: number };
    bottom: { left: number; top: number; width: number; height: number };
    left: { left: number; top: number; width: number; height: number };
    right: { left: number; top: number; width: number; height: number };
  };
  /** Device pixel ratio */
  dpr: number;
}

// ============================================================
// SERIES CONFIGURATION
// ============================================================

export type ChartType = 'line' | 'area' | 'scatter' | 'bar' | 'histogram';

export type InterpolationMode =
  | 'linear'
  | 'monotone'
  | 'step-before'
  | 'step-after'
  | 'step-middle';

export interface SeriesConfig {
  /** Chart type for this series */
  type?: ChartType;
  /** Display label */
  label: string;
  /** Column index in ColumnarData (1-based; 0 is X) */
  dataIndex: number;

  // Visual
  stroke?: string;
  fill?: string | null;
  lineWidth?: number;
  pointRadius?: number;
  opacity?: number;

  // Line/area
  interpolation?: InterpolationMode;

  // Area
  fillGradient?: { top: string; bottom: string };

  // Bar
  barWidthRatio?: number;
  stacked?: boolean;
  stackGroup?: string;

  // Scatter
  /** Force heatmap (density) rendering for scatter plots regardless of point count */
  heatmap?: boolean;
  /** Heatmap bin size in CSS pixels (default: 1 = one bin per physical pixel) */
  heatmapBinSize?: number;

  // Histogram
  binMethod?: 'sturges' | 'scott' | 'freedman-diaconis';
  binCount?: number;

  // Scale binding
  xScaleKey?: string;
  yScaleKey?: string;

  // Visibility
  visible?: boolean;
}

// ============================================================
// AXIS CONFIGURATION
// ============================================================

export type AxisPosition = 'top' | 'bottom' | 'left' | 'right';

export interface AxisConfig {
  position: AxisPosition;
  scaleType?: ScaleType;
  scaleKey?: string;
  label?: string;
  tickCount?: number;
  tickFormat?: (value: number) => string;
  grid?: {
    show?: boolean;
    stroke?: string;
    width?: number;
    dash?: number[];
  };
  min?: number;
  max?: number;
  auto?: boolean;
  padding?: number;
}

// ============================================================
// INTERACTION CONFIGURATION
// ============================================================

/**
 * Interaction modes define default gesture→action mappings:
 * - timeseries: drag=pan, shift+drag=box-zoom, pinch=zoom-x (dashboards, monitoring)
 * - analytical: drag=box-zoom, shift+drag=pan, pinch=zoom-xy (scatter, exploration)
 * - readonly: tooltip only, all navigation disabled (reports, embeds)
 */
export type InteractionMode = 'timeseries' | 'analytical' | 'readonly';

export interface CursorConfig {
  show?: boolean;
  snap?: boolean;
  xLine?: boolean;
  yLine?: boolean;
  color?: string;
  dash?: number[];
  syncKey?: string;
  syncTooltip?: boolean;
}

export interface ZoomConfig {
  enabled?: boolean;
  x?: boolean;
  y?: boolean;
  wheelFactor?: number;
  minRange?: number;
  maxRange?: number;
  onZoom?: (xMin: number, xMax: number) => void;
}

export interface PanConfig {
  enabled?: boolean;
  x?: boolean;
  y?: boolean;
}

export interface SelectionConfig {
  enabled?: boolean;
  mode?: 'x' | 'xy';
  minDistance?: number;
  onSelect?: (range: { x: ScaleRange; y?: ScaleRange }) => void;
}

export interface TooltipConfig {
  show?: boolean;
  mode?: 'nearest' | 'index' | 'x';
  snap?: boolean;
  offset?: number;
  render?: (points: TooltipPoint[]) => string | HTMLElement;
}

export interface TouchConfig {
  /** Hit-test radius in CSS pixels (default: 24 for touch, 32 for mouse) */
  hitRadius?: number;
  /** Long-press duration in ms before box-zoom activates (default: 400) */
  longPressMs?: number;
}

export interface TooltipPoint {
  seriesIndex: number;
  dataIndex: number;
  label: string;
  x: number;
  y: number;
  color: string;
  formattedX: string;
  formattedY: string;
}

// ============================================================
// CHART CONFIGURATION (top-level)
// ============================================================

export interface ChartConfig {
  width?: number;
  height?: number;
  autoResize?: boolean;

  padding?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };

  scales?: Record<string, {
    type?: ScaleType;
    min?: number;
    max?: number;
    auto?: boolean;
    padding?: number;
    side?: 'left' | 'right';
  }>;

  axes?: Record<string, AxisConfig>;
  series: SeriesConfig[];

  /** Interaction mode preset — sets default gesture mappings */
  interaction?: InteractionMode;

  cursor?: CursorConfig;
  zoom?: ZoomConfig;
  pan?: PanConfig;
  selection?: SelectionConfig;
  tooltip?: TooltipConfig;
  touch?: TouchConfig;

  theme?: Partial<ThemeConfig>;
  plugins?: Plugin[];
}

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? DeepPartial<U>[]
    : T[P] extends object
    ? DeepPartial<T[P]>
    : T[P];
};

// ============================================================
// THEME
// ============================================================

export interface ThemeConfig {
  backgroundColor: string;
  textColor: string;
  fontFamily: string;
  fontSize: number;
  gridColor: string;
  gridOpacity: number;
  palette: string[];
  axisLineColor: string;
  tickColor: string;
  crosshairColor: string;
  tooltipBackground: string;
  tooltipTextColor: string;
  tooltipBorderColor: string;
}

// ============================================================
// PLUGIN SYSTEM
// ============================================================

export interface Plugin {
  id: string;
  install?(chart: ChartInstance): void;
  destroy?(chart: ChartInstance): void;

  beforeLayout?(chart: ChartInstance): void;
  afterLayout?(chart: ChartInstance, layout: Layout): void;

  beforeDrawGrid?(chart: ChartInstance, ctx: CanvasRenderingContext2D): boolean | void;
  afterDrawGrid?(chart: ChartInstance, ctx: CanvasRenderingContext2D): void;

  beforeDrawData?(chart: ChartInstance, ctx: CanvasRenderingContext2D): boolean | void;
  afterDrawData?(chart: ChartInstance, ctx: CanvasRenderingContext2D): void;

  beforeDrawOverlay?(chart: ChartInstance, ctx: CanvasRenderingContext2D): boolean | void;
  afterDrawOverlay?(chart: ChartInstance, ctx: CanvasRenderingContext2D): void;

  onCursorMove?(chart: ChartInstance, dataX: number | null, dataIdx: number | null): void;
  onZoom?(chart: ChartInstance, scaleKey: string, range: ScaleRange): void;
  onClick?(chart: ChartInstance, dataX: number, dataIdx: number): void;
  onSetData?(chart: ChartInstance, data: ColumnarData): void;
}

// ============================================================
// CHART INSTANCE (public interface)
// ============================================================

export interface ChartInstance {
  /** Replace all data */
  setData(data: ColumnarData): void;
  /** Append data for streaming */
  appendData(data: ColumnarData, maxLen?: number): void;
  /** Get current data */
  getData(): ColumnarData;

  /** Update scale domain */
  setScale(key: string, range: Partial<ScaleRange>): void;
  /** Get a scale by key */
  getScale(key: string): Scale | undefined;

  /** Merge config updates (ECharts setOption style) */
  setOptions(config: DeepPartial<ChartConfig>): void;
  /** Get resolved config */
  getOptions(): ChartConfig;

  /** Get current layout */
  getLayout(): Layout;

  /** Force full redraw */
  redraw(): void;
  /** Resize chart */
  resize(width: number, height: number): void;
  /** Destroy and clean up all resources */
  destroy(): void;

  /** Register a plugin */
  use(plugin: Plugin): void;

  /** Subscribe to chart events */
  on<K extends keyof ChartEventMap>(event: K, handler: ChartEventMap[K]): () => void;

  /** Set cursor position from external source (sync) */
  setCursorDataX(dataX: number | null): void;

  /** The root DOM container */
  readonly container: HTMLElement;
}

// ============================================================
// CHART EVENTS
// ============================================================

export interface ChartEventMap {
  'cursor:move': (dataX: number | null, dataIdx: number | null) => void;
  'viewport:change': (scaleKey: string, range: ScaleRange) => void;
  'data:update': (data: ColumnarData) => void;
  'resize': (width: number, height: number) => void;
  'click': (dataX: number, dataIdx: number) => void;
  'drawData': (ctx: CanvasRenderingContext2D, layout: Layout) => void;
  'drawOverlay': (ctx: CanvasRenderingContext2D, layout: Layout) => void;
}

// ============================================================
// RENDER PIPELINE
// ============================================================

export enum DirtyFlag {
  NONE    = 0,
  GRID    = 1 << 0,
  DATA    = 1 << 1,
  OVERLAY = 1 << 2,
  ALL     = 0b111,
}

export interface RenderContext {
  config: ChartConfig;
  data: ColumnarData;
  scales: Map<string, Scale>;
  layout: Layout;
  theme: ThemeConfig;
}
