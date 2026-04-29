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
  /** Axis regions keyed by axis config key, with position and area */
  axes: Record<string, { position: AxisPosition; area: { left: number; top: number; width: number; height: number } }>;
  /** Device pixel ratio */
  dpr: number;
}

// ============================================================
// SERIES CONFIGURATION
// ============================================================

export type ChartType = 'line' | 'area' | 'band' | 'scatter' | 'bar' | 'histogram';

export type InterpolationMode =
  | 'linear'
  | 'monotone'
  | 'step-before'
  | 'step-after'
  | 'step-middle';

export interface SeriesConfig<TMeta = unknown> {
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
  /**
   * Dash pattern for line strokes, following the Canvas `setLineDash()` spec.
   * Array of segment lengths alternating between dash and gap (e.g. `[6, 3]`
   * for a 6px dash with 3px gap). `undefined` or `[]` renders a solid line.
   *
   * Applied to both line and area outline strokes.
   *
   * @example
   * ```ts
   * { lineDash: [6, 3] }       // standard dash
   * { lineDash: [2, 2] }       // dotted
   * { lineDash: [10, 4, 2, 4] } // dash-dot
   * ```
   */
  lineDash?: number[];

  // Area
  fillGradient?: { top: string; bottom: string };
  // Band (confidence interval / error band)
  /**
   * Column index for the upper bound of a `type: 'band'` series.
   * Required when `type` is `'band'`. Ignored for other chart types.
   */
  upperDataIndex?: number;
  /**
   * Column index for the lower bound of a `type: 'band'` series.
   * Required when `type` is `'band'`. Ignored for other chart types.
   *
   * A band series renders three elements as a single visual unit:
   * 1. Filled region between `upperDataIndex` and `lowerDataIndex`
   * 2. Center line at `dataIndex` (used for tooltip values and cursor snapping)
   *
   * @example
   * ```ts
   * // data = [x, yMean, yUpper, yLower]
   * series: [
   *   { label: 'Loss', type: 'band', dataIndex: 1,
   *     upperDataIndex: 2, lowerDataIndex: 3,
   *     stroke: '#4f8fea', fill: '#4f8fea', opacity: 0.15 },
   * ]
   * ```
   */
  lowerDataIndex?: number;

  // Bar
  /** Fraction of the category width each bar occupies (0–1). Default 0.8. */
  barWidthRatio?: number;

  // Scatter
  /** Force heatmap (density) rendering for scatter plots regardless of point count */
  heatmap?: boolean;
  /** Heatmap bin size in CSS pixels (default: 1 = one bin per physical pixel) */
  heatmapBinSize?: number;
  /**
   * Density-to-colour ramp for heatmap rendering. Array of 2+ hex colours
   * interpolated linearly in sRGB; `t = 0` → first stop, `t = 1` → last.
   * Overrides `theme.heatmapGradient`, then `theme.sequentialPalette`.
   */
  heatmapGradient?: string[];

  // Axis binding
  xAxisKey?: string;
  yAxisKey?: string;

  // Visibility
  visible?: boolean;

  /**
   * Free-form per-series metadata for app-level data
   * (e.g. `{ runId, metricKey }` for ML dashboards). Surfaced in
   * `CursorSeriesPoint.meta` and to legend column renderers.
   * Generic so consumers get type inference end-to-end.
   */
  meta?: TMeta;
}

// ============================================================
// AXIS CONFIGURATION
// ============================================================

export type AxisPosition = 'top' | 'bottom' | 'left' | 'right';

/** Configuration for an axis entry in ChartConfig.axes */
export interface AxisConfig {
  type?: ScaleType;
  /** Fixed lower bound. Pinned, auto-range will restore to this value on reset. */
  min?: number;
  /** Fixed upper bound. Pinned, auto-range will restore to this value on reset. */
  max?: number;
  /**
   * Master switch for auto-range. When `false`, the scale keeps whatever
   * bounds it currently has (typically `min`/`max` or the last zoom).
   * Default: `true`.
   */
  auto?: boolean;
  /**
   * Fraction of the data range to pad on each side when auto-ranging.
   * `0` → exact extent, `0.05` → 5% on each side.
   * Default: `0` for horizontal axes, `0.05` for vertical axes.
   */
  padding?: number;
  /**
   * Whether to call `scale.nice(DEFAULT_TICK_COUNT)` after auto-ranging,
   * which rounds the bounds outward to produce clean tick boundaries.
   * Default: `true`. Always skipped for `time` scales and bar/histogram
   * X axes where exact-boundary rendering is required.
   */
  nice?: boolean;
  position?: AxisPosition;
  /**
   * Custom tick label formatter. Overrides the scale's default formatting
   * for axis labels (including bar / histogram category labels). Return
   * the label as a string; return `''` to hide a specific tick.
   */
  tickFormat?: (value: number) => string;
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
  /**
   * Whether to draw the filled dot + ring at each series' hit-tested
   * point while hovering. Default: `true`. Set to `false` when a legend
   * table already surfaces per-series values below the chart and the
   * extra glyphs would be visual noise.
   */
  indicators?: boolean;
  color?: string;
  dash?: number[];
  syncKey?: string;
  syncTooltip?: boolean;
}

/**
 * Per-axis bounds for zoom and pan. `'data'` tracks the current data
 * extent; an explicit `{ min?, max? }` pins custom limits (use
 * `undefined` on one side for half-open bounds).
 */
export type ZoomBoundsSpec =
  | 'data'
  | 'unbounded'
  | { min?: number; max?: number };

export interface ZoomConfig {
  enabled?: boolean;
  x?: boolean;
  y?: boolean;
  /**
   * Zoom fraction per maximum wheel / pinch tick. 0 disables wheel zoom;
   * 0.1 (the default) scales by up to 10% per tick; 0.3 is aggressive.
   * Replaces the previous `wheelFactor` whose "1.0" meant "1x = no zoom",
   * which was easy to misread.
   */
  wheelStep?: number;
  minRange?: number;
  maxRange?: number;
  /**
   * Constrains pan + zoom so the viewport cannot escape the data (or a
   * custom range). Applied on every viewport change, pan past the edge
   * stops at the edge, zoom-out stops at the full extent.
   *
   * - `true` (default) → shorthand for `{ x: 'data', y: 'data' }`.
   * - `false` / `'unbounded'` → no clamping, classic infinite zoom/pan.
   * - Per-axis: `{ x: 'data' }` or `{ x: { min, max }, y: 'unbounded' }`.
   *
   * Axes not mentioned fall back to the top-level default.
   */
  bounds?: boolean | ZoomBoundsSpec | { x?: ZoomBoundsSpec; y?: ZoomBoundsSpec };
  onZoom?: (xMin: number, xMax: number) => void;
  /**
   * Sync key for cross-chart zoom coordination. Charts sharing the same
   * key will synchronize their X-axis viewport: zooming or panning one
   * chart applies the same range to all peers. Reset-zoom propagates too.
   *
   * Uses the same SyncGroup registry as cursor/highlight sync. An
   * equality guard prevents infinite broadcast loops.
   */
  syncKey?: string;
}

export interface PanConfig {
  enabled?: boolean;
  x?: boolean;
  y?: boolean;
}

export interface SelectionConfig {
  /**
   * Callback fired after a box-select gesture resolves (mouse drag /
   * long-press + drag on touch). The `x` range is always set; `y` is
   * only present when the selection tracked both axes.
   */
  onSelect?: (range: { x: ScaleRange; y?: ScaleRange }) => void;
}

export interface TooltipConfig {
  show?: boolean;
  mode?: 'nearest' | 'index' | 'x';
  /** Pixel offset from the cursor. Defaults to TOOLTIP_OFFSET (12 px). */
  offset?: number;
  render?: (points: TooltipPoint[]) => string | HTMLElement;
}

export interface TouchConfig {
  /**
   * Global hit-test radius override in CSS pixels. When unset, the chart
   * picks the radius per call from the pointer type: 44 px for touch
   * (WCAG 2.5.5 tap-target minimum) and 32 px for mouse / pen.
   */
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
// CURSOR SNAPSHOT (legend table data source)
// ============================================================

/**
 * One row of a cursor snapshot, the value of a single visible series
 * at a given X index, plus everything the legend table needs to render it.
 */
export interface CursorSeriesPoint<TMeta = unknown> {
  seriesIndex: number;
  dataIndex: number;
  label: string;
  color: string;
  /** Raw y value, NaN when missing at this index */
  value: number;
  /** Pre-formatted via the y-axis tickFormat (or `''` for missing values) */
  formattedValue: string;
  meta?: TMeta;
}

/**
 * Snapshot of all visible series at a given cursor (or fallback) index.
 * Returned by `chart.getCursorSnapshot()` and consumed by the legend table.
 *
 * Safe to read on every `cursor:move`: the `points` array is reused
 * across calls (mutated in place) when you use `getCursorSnapshotInto()`.
 */
export interface CursorSnapshot<TMeta = unknown> {
  /** Index into the X column. `null` when source === 'none'. */
  dataIndex: number | null;
  /** Raw X value at `dataIndex`. `null` when source === 'none'. */
  dataX: number | null;
  /** Pre-formatted X for "Step: N" headers. Empty string when source === 'none'. */
  formattedX: string;
  /** One entry per *visible* series. */
  points: CursorSeriesPoint<TMeta>[];
  /** What produced this snapshot. Useful for empty-state styling. */
  source: 'cursor' | 'latest' | 'first' | 'none';
  /**
   * The series whose Y-value at `dataIndex` is visually closest to the
   * cursor (in pixel space). `null` when there is no cursor, when no
   * series has a valid value at this index, or when `source !== 'cursor'`.
   * Intended for "focus the line under the cursor" interactions,   * pair with `setHighlight(activeSeriesIndex)` to dim everything else.
   */
  activeSeriesIndex: number | null;
}

/** Options accepted by `getCursorSnapshot()` and the reactive primitive. */
export interface CursorSnapshotOptions {
  /**
   * What to return when the cursor is not over the chart.
   * - `hide`   → empty snapshot, source === 'none'
   * - `latest` → snapshot at the last X value
   * - `first`  → snapshot at the first X value
   * Default: `'hide'`.
   */
  fallback?: 'hide' | 'latest' | 'first';
}

// ============================================================
// HIGHLIGHT (cross-chart series highlight + dim)
// ============================================================

export type HighlightSyncKey = string | number;

export type HighlightSyncPayload =
  | { type: 'index'; seriesIndex: number | null }
  | { type: 'key'; key: HighlightSyncKey | null };

export interface HighlightConfig<TMeta = unknown> {
  /** Master switch. Default: true. */
  enabled?: boolean;
  /**
   * Opacity multiplier applied to non-highlighted series when a
   * highlight is active. Default: 0.2.
   */
  dimOpacity?: number;
  /**
   * Sync key for cross-chart highlight propagation. Mirrors
   * `cursor.syncKey` semantics, charts sharing a key publish/receive
   * highlight changes from each other.
   */
  syncKey?: string;
  /**
   * Optional stable identity resolver for cross-chart highlight sync.
   *
   * By default, sync publishes the local numeric `seriesIndex`, which is
   * correct for simple charts with identical series ordering. Provide
   * `getKey` when peers can have different series subsets/order; receiving
   * charts map the published key back to their own local series index.
   *
   * Example: `(series) => series.meta?.runId`.
   */
  getKey?: (
    series: SeriesConfig<TMeta>,
    seriesIndex: number,
  ) => HighlightSyncKey | null | undefined;
}

// ============================================================
// DEBUG / DIAGNOSTICS
// ============================================================

export interface DebugConfig {
  /**
   * Enable lightweight timing diagnostics. Counters are always maintained,
   * but per-layer duration measurement only runs when this is true.
   */
  stats?: boolean;
}

export interface ChartStats {
  dataVersion: number;
  setDataCount: number;
  appendDataCount: number;
  renderCount: {
    grid: number;
    data: number;
    overlay: number;
  };
  lastRenderMs: {
    grid: number;
    data: number;
    overlay: number;
  };
}

// ============================================================
// STREAMING
// ============================================================

export interface StreamingConfig {
  /**
   * Retain at most this many points after appendData(). When set, snaplot
   * uses an internal ring buffer so streaming updates do not allocate a new
   * full-window dataset on every tick.
   */
  maxLen?: number;
}

// ============================================================
// CHART CONFIGURATION (top-level)
// ============================================================

export interface ChartConfig<TMeta = unknown> {
  width?: number;
  height?: number;
  autoResize?: boolean;

  padding?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };

  axes?: Record<string, AxisConfig>;
  series: SeriesConfig<TMeta>[];

  /** Interaction mode preset, sets default gesture mappings */
  interaction?: InteractionMode;

  cursor?: CursorConfig;
  zoom?: ZoomConfig;
  pan?: PanConfig;
  selection?: SelectionConfig;
  tooltip?: TooltipConfig;
  touch?: TouchConfig;
  highlight?: HighlightConfig<TMeta>;
  streaming?: StreamingConfig;
  debug?: DebugConfig;

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
  /**
   * Legacy and fallback series colour cycle. Kept as the primary API for
   * compatibility; new themes should treat it as the categorical palette.
   */
  palette: string[];
  /**
   * Optional categorical series colour cycle for unordered/discrete series
   * such as lines, grouped bars, and multiple scatter categories.
   * Falls back to `palette`.
   */
  categoricalPalette?: string[];
  /**
   * Optional ordered magnitude ramp for density/continuous encodings.
   * Used by heatmap scatter rendering when `heatmapGradient` is not set.
   */
  sequentialPalette?: string[];
  /** Optional signed/centered-data ramp for future diverging encodings. */
  divergingPalette?: string[];
  /** Optional default density ramp for heatmap scatter series. */
  heatmapGradient?: string[];
  axisLineColor: string;
  /**
   * Plot-area frame. Kept separate from `axisLineColor` so you can tune
   * the rectangle around the plot without touching axis ticks. Typically
   * the same hue as the grid but more opaque, see `borderOpacity`.
   */
  borderColor: string;
  /**
   * Opacity of the plot-area frame. Intentionally distinct from
   * `gridOpacity` so the border can sit one visual step above the grid
   * while sharing its hue.
   */
  borderOpacity: number;
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

  onCursorMove?(
    chart: ChartInstance,
    dataX: number | null,
    dataIdx: number | null,
    origin: CursorEventOrigin,
  ): void;
  onZoom?(chart: ChartInstance, scaleKey: string, range: ScaleRange): void;
  onClick?(chart: ChartInstance, dataX: number, dataIdx: number): void;
  /** Fires after chart data changes through `setData()` or `appendData()`. */
  onSetData?(chart: ChartInstance, data: ColumnarData): void;
  /**
   * Fires after `chart.setOptions()` merges a partial config. Use this
   * for plugins whose DOM / visual state depends on config (series,
   * axes, theme) rather than data, legends, toolbars, stat readouts.
   * Avoid listening on `onSetData` for those: at high streaming rates
   * it rebuilds the DOM underneath the user's cursor.
   */
  onSetOptions?(chart: ChartInstance): void;
}

// ============================================================
// CHART INSTANCE (public interface)
// ============================================================

export interface ChartInstance {
  /** Replace all data */
  setData(data: ColumnarData): void;
  /** Append data for streaming */
  appendData(data: ColumnarData): void;
  /** Get current data */
  getData(): ColumnarData;

  /** Update axis domain */
  setAxis(key: string, range: Partial<ScaleRange>): void;
  /** Get a scale by axis key */
  getAxis(key: string): Scale | undefined;

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

  /** Set cursor position from external source (sync/programmatic) */
  setCursorDataX(dataX: number | null, origin?: CursorEventOrigin): void;

  /**
   * Snapshot of all visible series at the current cursor position
   * (or fallback). Allocates a fresh snapshot, use
   * `getCursorSnapshotInto()` in the cursor hot path to reuse buffers.
   */
  getCursorSnapshot(opts?: CursorSnapshotOptions): CursorSnapshot;

  /**
   * Zero-allocation variant of `getCursorSnapshot`. Mutates and returns
   * `target`. The `target.points` array is grown but never shrunk; use
   * `target.points.length` (after this call) as the row count.
   */
  getCursorSnapshotInto(target: CursorSnapshot, opts?: CursorSnapshotOptions): CursorSnapshot;

  /**
   * Set the highlighted series. Pass `null` to clear. Triggers a data-layer
   * redraw (non-highlighted series dim per `highlight.dimOpacity`) and
   * publishes to the sync group when `highlight.syncKey` is set.
   * No-op when the value is unchanged.
   */
  setHighlight(seriesIndex: number | null): void;

  /** Currently highlighted series index, or `null`. */
  getHighlight(): number | null;

  /**
   * Lightweight diagnostics for benchmark demos and local debugging.
   * Returns a copy so callers cannot mutate internal counters.
   */
  getStats(): ChartStats;

  /** The root DOM container */
  readonly container: HTMLElement;
}

// ============================================================
// CHART EVENTS
// ============================================================

export type CursorEventOrigin = 'local' | 'sync' | 'programmatic';

export interface ChartEventMap {
  'cursor:move': (
    dataX: number | null,
    dataIdx: number | null,
    origin: CursorEventOrigin,
  ) => void;
  'highlight:change': (seriesIndex: number | null) => void;
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
