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

/**
 * Scale kind for an axis. `time` treats X values as epoch milliseconds and
 * formats ticks in the viewer's local timezone; `log` requires strictly
 * positive domains. Defaults to `linear` when omitted on an axis.
 */
export type ScaleType = 'linear' | 'log' | 'time';

/** A closed data-space interval. `min` and `max` are in data units, not pixels. */
export interface ScaleRange {
  /** Lower bound, inclusive. May exceed `max` only transiently during a gesture. */
  min: number;
  /** Upper bound, inclusive. */
  max: number;
}

/**
 * A Scale is a pure function pair: dataToPixel and pixelToData.
 * Scales own a data domain and a pixel range, and convert between them.
 */
export interface Scale {
  /** Scale kind. Fixed at creation; changing an axis type rebuilds the scale. */
  readonly type: ScaleType;
  /** The axis key this scale is bound to (the key in `ChartConfig.axes`). */
  readonly key: string;
  /**
   * Current domain lower bound in data units. Writable: assigning bypasses
   * auto-range and repaint, so prefer `chart.setAxis()` for user-facing edits.
   */
  min: number;
  /** Current domain upper bound in data units. Same write caveat as `min`. */
  max: number;

  /** Map a data-space value to a pixel coordinate within the plot area */
  dataToPixel(value: number): number;

  /** Map a pixel coordinate back to data-space */
  pixelToData(pixel: number): number;

  /**
   * Nice tick values for the current domain. `count` is a target hint, not a
   * guarantee: linear scales honor it via nice-number rounding, while time
   * and log scales derive density from the pixel range / decades and treat
   * `count` loosely. Defaults to `DEFAULT_TICK_COUNT` (6).
   */
  ticks(count?: number): number[];

  /** Format a single tick value for display using this scale's conventions. */
  tickFormat(value: number): string;

  /**
   * Round the domain outward to clean tick boundaries. Mutates `min`/`max`.
   * `count` is the same density hint as `ticks()`.
   */
  nice(count?: number): void;

  /** Set the pixel extent the domain maps onto. Called by layout on resize. */
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

/**
 * Mark type for a series. `band` needs `upperDataIndex`/`lowerDataIndex`;
 * `histogram` expects pre-binned N+1 edges data. Defaults to `line`.
 */
export type ChartType = 'line' | 'area' | 'band' | 'scatter' | 'bar' | 'histogram';

/**
 * Scatter draw path. `points` always draws individual marks; `density`
 * always draws a binned heatmap; `auto` (the default) draws points until the
 * visible count crosses the internal density threshold, then switches.
 */
export type ScatterRenderMode = 'points' | 'density' | 'auto';

/** Mark glyph for non-density scatter rendering. Defaults to `circle`. */
export type ScatterPointShape = 'circle' | 'square' | 'diamond';

/**
 * How a `colorBy` column is interpreted. `auto` treats low-cardinality
 * integer columns as categories and everything else as a continuous ramp.
 */
export type ScatterColorEncodingType = 'auto' | 'category' | 'continuous' | 'diverging';

export interface ScatterColorEncoding {
  /** Absolute data column index. Column 0 is the default X column. */
  dataIndex: number;
  /**
   * `auto` treats low-cardinality integer columns as categories and
   * otherwise uses a continuous ramp. Default: `auto`.
   */
  type?: ScatterColorEncodingType;
  /** Palette/ramp override for this encoding. */
  palette?: string[];
  /** Numeric domain for continuous/diverging encodings. */
  domain?: [number, number];
  /** Colour for NaN/missing values. Default: the series colour. */
  nullColor?: string;
  /** Tooltip label for this encoded field. */
  label?: string;
  /** Tooltip formatter for this encoded field. */
  format?: (value: number) => string;
}

export interface ScatterSizeEncoding {
  /** Absolute data column index. Column 0 is the default X column. */
  dataIndex: number;
  /** Numeric input domain. Defaults to the visible data extent. */
  domain?: [number, number];
  /** Radius range in CSS pixels. Default: [2, 7]. */
  range?: [number, number];
  /** `sqrt` is useful when the encoded value represents area/count. */
  scale?: 'linear' | 'sqrt';
  /** Tooltip label for this encoded field. */
  label?: string;
  /** Tooltip formatter for this encoded field. */
  format?: (value: number) => string;
}

export interface ScatterTooltipField {
  /** Absolute data column index whose value is shown for the hovered point. */
  dataIndex: number;
  /** Row label in the tooltip. Defaults to `column N`. */
  label?: string;
  /** Value formatter. Defaults to the number's default string form. */
  format?: (value: number) => string;
}

/**
 * Line/area path interpolation. `monotone` is a shape-preserving cubic that
 * never overshoots between points; the three `step-*` variants place the
 * riser before, after, or centered on each point. Defaults to `linear`.
 */
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
  /**
   * Primary value column in `ColumnarData`.
   * Required for line, area, band, bar, and histogram series. Scatter series
   * should prefer `yDataIndex`, with `dataIndex` kept as a fallback alias.
   */
  dataIndex?: number;

  // Visual
  /**
   * Line / mark outline color (any CSS color). Defaults to the theme's
   * categorical palette entry for this series' index.
   */
  stroke?: string;
  /**
   * Area / bar fill color. `null` forces no fill (useful to draw an
   * `area` series as a bare outline). Defaults to a translucent `stroke`.
   */
  fill?: string | null;
  /** Stroke width in CSS pixels. Default: 1.5. Applies to line and area outlines. */
  lineWidth?: number;
  /**
   * Radius in CSS pixels for scatter marks and cursor indicators. Scatter's
   * auto styling shrinks the effective radius for very dense clouds; set this
   * to pin a fixed size.
   */
  pointRadius?: number;
  /**
   * Mark opacity, 0 to 1. Defaults are type-specific (line/area outline 1,
   * bar 0.85, histogram 0.75, band fill 0.15). Multiplied by highlight dimming.
   */
  opacity?: number;

  // Line/area
  interpolation?: InterpolationMode;
  /**
   * Bridge missing values (NaN) with a connecting line instead of breaking
   * the path. Default: `false`, NaN creates a visible gap. Useful when
   * gaps mean "not sampled" (multi-run data joined onto a shared X column,
   * missed scrapes) rather than "no signal". Applies to line and area
   * series across every interpolation mode.
   */
  spanGaps?: boolean;
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
  /**
   * Vertical fill gradient for `area` series, `top` at the line, `bottom`
   * at the baseline. Overrides `fill`. Each stop is a full CSS color
   * including its own alpha. Default: a translucent `stroke` ramp.
   */
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
  /**
   * Absolute column index for scatter X values. Defaults to column 0.
   * Useful for tabular datasets where several scatter views share the same
   * row identity but use different X/Y metric columns.
   */
  xDataIndex?: number;
  /** Absolute column index for scatter Y values. Preferred over `dataIndex`. */
  yDataIndex?: number;
  /** Preferred scatter render path. `auto` uses points until the density threshold. */
  renderMode?: ScatterRenderMode;
  /** Point shape for non-density scatter rendering. Default: 'circle'. */
  pointShape?: ScatterPointShape;
  /** Colour points by a categorical or numeric column. */
  colorBy?: number | ScatterColorEncoding;
  /** Size points by a numeric column. */
  sizeBy?: number | ScatterSizeEncoding;
  /** Extra columns to show in the default nearest-point tooltip. */
  tooltipFields?: Array<number | ScatterTooltipField>;
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
  /** Key of the X axis in `ChartConfig.axes` this series maps onto. Defaults to `'x'`. */
  xAxisKey?: string;
  /**
   * Key of the Y axis this series maps onto. Defaults to `'y'`. Point a
   * second series at a different key (e.g. `'y2'`) for a dual-axis chart.
   */
  yAxisKey?: string;

  // Visibility
  /**
   * Whether the series is drawn and included in auto-range. Default: `true`.
   * Toggling this (e.g. from a legend) preserves the series' config and
   * highlight state; a hidden series still occupies its `seriesIndex`.
   */
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
  /** Scale kind for this axis. Default: `'linear'`. */
  type?: ScaleType;
  /**
   * Axis title rendered outside the tick labels: below a bottom axis,
   * rotated alongside a left/right axis. Layout reserves the extra gutter
   * space automatically.
   */
  label?: string;
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
   * Default: `false`, so padded data bounds stay exact and predictable.
   * Set `nice: true` to opt into rounded presentation bounds. Always skipped
   * for bar/histogram X axes where exact-boundary rendering is required.
   */
  nice?: boolean;
  /**
   * Which side of the plot the axis renders on. Inferred from the axis key
   * when omitted (keys starting with `x` go bottom, others left), so set it
   * explicitly for a right-side or top axis.
   */
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
 * - timeseries: mouse drag=box-zoom, shift+drag=pan, pinch=zoom-x
 * - analytical: mouse drag=box-zoom, shift+drag=pan, pinch=zoom-xy
 * - readonly: tooltip only, all navigation disabled (reports, embeds)
 *
 * Touch defaults are cursor-first: one-finger drag moves the cursor,
 * double-tap+drag selects, and two-finger pinch zooms.
 */
export type InteractionMode = 'timeseries' | 'analytical' | 'readonly';

export interface CursorConfig {
  /** Master switch for the crosshair + indicators. Default: `true`. */
  show?: boolean;
  /**
   * Snap the cursor to the nearest data X index instead of tracking the
   * raw pointer position. Default: `true`. Keeps indicators on real samples.
   */
  snap?: boolean;
  /** Draw the vertical crosshair line. Default: `true`. */
  xLine?: boolean;
  /**
   * Draw the horizontal crosshair line. Default: `false`; most time-series
   * charts only want the vertical line.
   */
  yLine?: boolean;
  /**
   * Whether to draw the filled dot + ring at each series' hit-tested
   * point while hovering. Default: `true`. Set to `false` when a legend
   * table already surfaces per-series values below the chart and the
   * extra glyphs would be visual noise.
   */
  indicators?: boolean;
  /** Crosshair line color. Defaults to `theme.crosshairColor`. */
  color?: string;
  /**
   * Crosshair dash pattern, alternating dash/gap lengths in CSS pixels per
   * the Canvas `setLineDash()` spec. Default: solid.
   */
  dash?: number[];
  /**
   * Sync key for cross-chart cursor coordination. Charts sharing a key
   * mirror each other's cursor X position. `null` (default) disables sync.
   */
  syncKey?: string | null;
  /**
   * On a synced chart, also show this chart's tooltip when the cursor is
   * driven by a peer. Default: `false`, synced charts show crosshair only
   * so a dashboard does not sprout duplicate tooltips.
   */
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
  /** Master switch for all zoom gestures. Default: `true`. */
  enabled?: boolean;
  /** Allow zooming the X axis. Default: `true`. */
  x?: boolean;
  /**
   * Allow zooming the Y axis. Default: `false`; time-series charts usually
   * pin Y to auto-range. Enable for the `analytical` 2D-zoom experience.
   */
  y?: boolean;
  /** Enable wheel/pinch zoom gestures that start over axis gutters. Default: `false`. */
  axis?: boolean;
  /**
   * Zoom fraction per maximum wheel / pinch tick. 0 disables wheel zoom;
   * 0.1 (the default) scales by up to 10% per tick; 0.3 is aggressive.
   * Replaces the previous `wheelFactor` whose "1.0" meant "1x = no zoom",
   * which was easy to misread.
   */
  wheelStep?: number;
  /**
   * Touch pinch behavior when both `zoom.x` and `zoom.y` are enabled.
   * Default: `'xy'`, apply a uniform map/image-style 2D zoom. Set to
   * `'axis-lock'` to infer X-only or Y-only zoom from the pinch direction.
   */
  pinchMode?: 'xy' | 'axis-lock';
  /**
   * Smallest allowed X domain span (data units), the tightest zoom-in.
   * Prevents zooming past a meaningful resolution. Unset: no lower limit.
   */
  minRange?: number;
  /**
   * Largest allowed X domain span (data units), the widest zoom-out.
   * Independent of `bounds`, which constrains position rather than span.
   */
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
  /**
   * Called after the X viewport changes from a zoom or pan, with the new
   * data-space bounds. Fires per settled change, not per animation frame.
   * For non-X changes use the `viewport:change` event.
   */
  onZoom?: (xMin: number, xMax: number) => void;
  /**
   * Sync key for cross-chart zoom coordination. Charts sharing the same
   * key will synchronize their X-axis viewport: zooming or panning one
   * chart applies the same range to all peers. Reset-zoom propagates too.
   *
   * Uses the same SyncGroup registry as cursor/highlight sync. An
   * equality guard prevents infinite broadcast loops.
   */
  syncKey?: string | null;
}

export interface PanConfig {
  /** Master switch for pan (shift+drag on mouse, one-finger on touch when `touch.drag: 'pan'`). Default: `true`. */
  enabled?: boolean;
  /** Allow panning along X. Default: `true`. */
  x?: boolean;
  /** Allow panning along Y. Default: `false`, matching the zoom Y default. */
  y?: boolean;
  /** Enable drag-to-pan gestures that start over axis gutters. Default: `false`. */
  axis?: boolean;
}

export interface SelectionConfig {
  /**
   * Callback fired after a box-select gesture resolves (mouse drag /
   * double-tap + drag on touch by default). The `x` range is always set; `y` is
   * only present when the selection tracked both axes.
   */
  onSelect?: (selection: SelectionResult) => void;
}

/** A single scatter point captured inside a box selection. */
export interface SelectedPoint<TMeta = unknown> {
  /** Index of the owning series in `ChartConfig.series`. */
  seriesIndex: number;
  /** Row index into the series' columns. */
  dataIndex: number;
  /** The owning series' `label`. */
  label: string;
  /** Data-space X value of the point. */
  x: number;
  /** Data-space Y value of the point. */
  y: number;
  /** Resolved mark color, ready to paint (respects `colorBy`). */
  color: string;
  /** The owning series' `meta`, passed through for app-level lookups. */
  meta?: TMeta;
}

export interface SelectionResult<TMeta = unknown> {
  /** Selected X domain. Always present. */
  x: ScaleRange;
  /** Selected Y domain. Present only when the gesture tracked both axes. */
  y?: ScaleRange;
  /** Populated for visible scatter series when the selection spans both axes. */
  points?: SelectedPoint<TMeta>[];
}

export interface TooltipConfig {
  /** Whether to show the tooltip on hover. Default: `true`. */
  show?: boolean;
  /**
   * Which points to include. `index` (default) shows every series at the
   * snapped X index; `nearest` shows only the single closest point (best for
   * scatter); `x` matches `index` for shared-X series. `index` and `x` are
   * equivalent for line/area/bar data.
   */
  mode?: 'nearest' | 'index' | 'x';
  /** Pixel offset from the cursor. Defaults to TOOLTIP_OFFSET (12 px). */
  offset?: number;
  /**
   * Custom renderer. Returning a string sets the tooltip's `innerHTML`
   * verbatim, so escape any user-derived text or return an `HTMLElement`
   * built with `textContent` to avoid an injection hole. Receives the
   * points selected by `mode`.
   */
  render?: (points: TooltipPoint[]) => string | HTMLElement;
}

export interface TouchConfig {
  /**
   * Global hit-test radius override in CSS pixels. When unset, the chart
   * picks the radius per call from the pointer type: 44 px for touch
   * (WCAG 2.5.5 tap-target minimum) and 32 px for mouse / pen.
   */
  hitRadius?: number;
  /**
   * One-finger drag behavior. Default: `'cursor'`, which moves the cursor
   * and tooltip without changing the viewport. Set to `'pan'` for the old
   * one-finger pan behavior.
   */
  drag?: 'cursor' | 'pan';
  /**
   * Touch gesture for box selection. Default: `'double-tap-drag'`.
   * When `drag: 'pan'`, the default becomes `'none'` so ordinary pan
   * gestures are not mistaken for selections. Set to `'double-tap-drag'`
   * explicitly to combine touch panning with touch selection.
   */
  selectionGesture?: 'double-tap-drag' | 'long-press' | 'none';
  /** Long-press duration in ms before box selection activates. */
  longPressMs?: number;
}

/** One row passed to a custom `tooltip.render`. */
export interface TooltipPoint {
  /** Index of the owning series in `ChartConfig.series`. */
  seriesIndex: number;
  /** Row index into the series' columns. */
  dataIndex: number;
  /** The owning series' `label`. */
  label: string;
  /** Raw data-space X value. */
  x: number;
  /** Raw data-space Y value. */
  y: number;
  /** Resolved mark color for the swatch. */
  color: string;
  /** X value pre-formatted via the x-axis `tickFormat`. */
  formattedX: string;
  /** Y value pre-formatted via the y-axis `tickFormat`. */
  formattedY: string;
  /** Mark radius in CSS pixels; present for scatter points only. */
  radius?: number;
  /** Extra scatter columns requested via `series.tooltipFields`. */
  fields?: TooltipFieldValue[];
}

/** One extra scatter column value in a tooltip row. */
export interface TooltipFieldValue {
  /** Field label from `ScatterTooltipField.label` (or `column N`). */
  label: string;
  /** Raw value at the point's row. */
  value: number;
  /** Value run through the field's `format`. */
  formatted: string;
}

// ============================================================
// CURSOR SNAPSHOT (legend table data source)
// ============================================================

/**
 * One row of a cursor snapshot, the value of a single visible series
 * at a given X index, plus everything the legend table needs to render it.
 */
export interface CursorSeriesPoint<TMeta = unknown> {
  /** Index of this series in `ChartConfig.series` (stable across cursor moves). */
  seriesIndex: number;
  /** X-column index this row was sampled at (same for every row in a snapshot). */
  dataIndex: number;
  /** The series' `label`, for the row's name cell. */
  label: string;
  /** Resolved series color, for the row's swatch. */
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

/**
 * Stable cross-chart identity for a series, returned by `highlight.getKey`.
 * Lets linked charts with different series order highlight the same logical
 * run/metric.
 */
export type HighlightSyncKey = string | number;

/**
 * Wire format broadcast over a highlight sync group. `index` carries a raw
 * `seriesIndex` (identical-order charts); `key` carries a `getKey` identity
 * that each receiver maps to its own local series. `null` clears.
 */
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
  syncKey?: string | null;
  /**
   * Auto-highlight the series nearest the cursor when its hit-tested
   * point is within this many CSS pixels vertically; clear the highlight
   * when nothing qualifies. Off when unset. Propagates through `syncKey`
   * like a manual `setHighlight()`, so linked charts dim together.
   */
  proximity?: number;
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
// PERFORMANCE
// ============================================================

export interface PerformanceConfig {
  /**
   * Point budget per scatter series while the viewport is actively
   * changing. When the visible count exceeds it, points are
   * stride-sampled for the duration of the gesture and a full-fidelity
   * repaint follows as soon as the viewport settles. Keeps pan and zoom
   * responsive on large point clouds without giving up crisp rendering
   * at rest. `false` disables sampling. Default: 10000.
   *
   * Density (heatmap) scatter ignores the budget, its cost is already
   * bounded by pixels, not points. Hit-testing and tooltips always use
   * the full data.
   */
  interactionSampling?: number | false;
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
  /** Monotonic counter bumped on every data change; useful as a cache key. */
  dataVersion: number;
  /** Number of `setData` calls since creation. */
  setDataCount: number;
  /** Number of `appendData` calls since creation. */
  appendDataCount: number;
  /** Per-layer paint counts. A layer that never changes stays flat, which is the point of the layer split. */
  renderCount: {
    grid: number;
    data: number;
    overlay: number;
  };
  /**
   * Per-layer duration of the most recent paint, in milliseconds. Stays `0`
   * unless `debug.stats` is enabled, since timing each layer has a cost.
   */
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
  /** Fixed CSS-pixel width. Omit and set `autoResize` to fill the container. */
  width?: number;
  /** Fixed CSS-pixel height. Omit and set `autoResize` to fill the container. */
  height?: number;
  /**
   * Track the container's size with a ResizeObserver and repaint on change.
   * Default: `true`. Set `false` and provide `width`/`height` for a fixed size.
   */
  autoResize?: boolean;

  /**
   * Plot-area inset in CSS pixels. Any side omitted falls back to the
   * defaults (top 24, right 24, bottom 44, left 56); `left` is a floor and
   * grows automatically to fit measured y-axis labels.
   */
  padding?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };

  /**
   * Axis definitions keyed by axis key. `'x'`/`'y'` are conventional; extra
   * keys (e.g. `'y2'`) create additional axes that series bind to via
   * `xAxisKey`/`yAxisKey`. Omitted axes default to a linear scale.
   */
  axes?: Record<string, AxisConfig>;
  /** Series to draw, in paint order (later series draw on top). Required. */
  series: SeriesConfig<TMeta>[];

  /** Interaction mode preset, sets default gesture mappings. Default: `'timeseries'`. */
  interaction?: InteractionMode;

  /** Crosshair + indicator config. Merged over the mode preset. */
  cursor?: CursorConfig;
  /** Zoom gesture config. Merged over the mode preset. */
  zoom?: ZoomConfig;
  /** Pan gesture config. Merged over the mode preset. */
  pan?: PanConfig;
  /** Box-selection callback config. */
  selection?: SelectionConfig;
  /** Tooltip config. Merged over the mode preset. */
  tooltip?: TooltipConfig;
  /** Touch-specific gesture overrides layered on top of the mode preset. */
  touch?: TouchConfig;
  /** Series highlight + dim config, including cross-chart sync. */
  highlight?: HighlightConfig<TMeta>;
  /** Ring-buffer window for `appendData` streaming. */
  streaming?: StreamingConfig;
  /** Large-dataset interaction tuning. */
  performance?: PerformanceConfig;
  /** Timing diagnostics. Off by default. */
  debug?: DebugConfig;

  /**
   * Theme overrides. Any field omitted resolves from CSS variables on the
   * container, then the built-in light/dark default. Pass a full exported
   * theme object to pin colors regardless of the page.
   */
  theme?: Partial<ThemeConfig>;
  /** Plugins installed at creation. Also addable later via `chart.use()`. */
  plugins?: Plugin[];
}

/**
 * Recursively optional version of `T`, with arrays replaced wholesale rather
 * than merged element-wise. This is the shape `setOptions()` accepts, so a
 * `series` array in a partial update replaces the existing series list.
 */
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
  /** Plot background fill. The grid canvas is opaque, so this must be a solid color. */
  backgroundColor: string;
  /** Axis label / tick text color. Themes keep this off pure black/white for contrast comfort. */
  textColor: string;
  /** CSS font stack for all axis and tooltip text. */
  fontFamily: string;
  /** Base text size in CSS pixels. Built-in themes use 11. */
  fontSize: number;
  /** Gridline hue. Combined with `gridOpacity`; the border shares this hue at a higher opacity. */
  gridColor: string;
  /** Gridline opacity, 0 to 1. Kept low so lines sit beneath the data. */
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
  /** Color of the axis baseline strokes (distinct from gridlines). */
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
  /** Color of the short tick marks along each axis. */
  tickColor: string;
  /** Default crosshair line color, overridable per chart via `cursor.color`. */
  crosshairColor: string;
  /** Tooltip surface fill. Dark themes use a translucent value for a glass look. */
  tooltipBackground: string;
  /** Tooltip text color. */
  tooltipTextColor: string;
  /** Tooltip border color. */
  tooltipBorderColor: string;
}

// ============================================================
// PLUGIN SYSTEM
// ============================================================

export interface Plugin {
  /** Unique id. Registering a second plugin with the same id is rejected. */
  id: string;
  /** Called once when the plugin is added. Set up DOM / listeners here. */
  install?(chart: ChartInstance): void;
  /** Called once when the plugin is removed or the chart is destroyed. Tear down here. */
  destroy?(chart: ChartInstance): void;

  /** Runs before layout is computed; adjust reserved space here. */
  beforeLayout?(chart: ChartInstance): void;
  /** Runs after layout, with the resolved plot/axis rects. */
  afterLayout?(chart: ChartInstance, layout: Layout): void;

  /** Before gridlines/axes paint. Return `false` to suppress the default grid draw. */
  beforeDrawGrid?(chart: ChartInstance, ctx: CanvasRenderingContext2D): boolean | void;
  /** After gridlines/axes paint. Draw under the data here. */
  afterDrawGrid?(chart: ChartInstance, ctx: CanvasRenderingContext2D): void;

  /** Before series marks paint. Return `false` to suppress the default data draw. */
  beforeDrawData?(chart: ChartInstance, ctx: CanvasRenderingContext2D): boolean | void;
  /** After series marks paint. Annotations that sit above data go here (see `createReferenceLinesPlugin`). */
  afterDrawData?(chart: ChartInstance, ctx: CanvasRenderingContext2D): void;

  /** Before the overlay (crosshair, selection) paints. Return `false` to suppress it. */
  beforeDrawOverlay?(chart: ChartInstance, ctx: CanvasRenderingContext2D): boolean | void;
  /** After the overlay paints, the topmost draw layer. */
  afterDrawOverlay?(chart: ChartInstance, ctx: CanvasRenderingContext2D): void;

  /**
   * Cursor moved. `dataX`/`dataIdx` are `null` when the cursor left the plot.
   * `origin` distinguishes local pointer input from sync/programmatic moves,
   * use it to avoid echoing sync-driven updates back out.
   */
  onCursorMove?(
    chart: ChartInstance,
    dataX: number | null,
    dataIdx: number | null,
    origin: CursorEventOrigin,
  ): void;
  /** A scale's viewport changed via zoom/pan, with the affected axis key and new range. */
  onZoom?(chart: ChartInstance, scaleKey: string, range: ScaleRange): void;
  /** Reserved click hook. Not currently invoked by the core (see the DX audit). */
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

export interface AppendDataOptions {
  /**
   * Treat the first row of `data` as a correction of the current last row
   * instead of a new point: the last row is overwritten in place and any
   * remaining rows append normally. This is the streaming verb for
   * in-progress buckets (a live epoch aggregate, a forming candle) and
   * avoids the full-window reallocation that `setData` implies. The
   * replacement X must keep the X column sorted; it is usually the same
   * X the row was first appended with.
   */
  updateLast?: boolean;
}

export interface ChartInstance {
  /** Replace all data */
  setData(data: ColumnarData): void;
  /** Append data for streaming */
  appendData(data: ColumnarData, opts?: AppendDataOptions): void;
  /** Get current data */
  getData(): ColumnarData;

  /** Update axis domain */
  setAxis(key: string, range: Partial<ScaleRange>): void;
  /** Get a scale by axis key */
  getAxis(key: string): Scale | undefined;

  /** Merge config updates. Arrays such as `series` replace by value. */
  setOptions(config: DeepPartial<ChartConfig>): void;
  /**
   * Replace the chart config declaratively, resolving defaults again and
   * dropping keys omitted from the new config. Solid wrappers use this for
   * full `config` signal updates.
   */
  replaceOptions(config: ChartConfig): void;
  /** Get resolved config */
  getOptions(): ChartConfig;

  /**
   * Resolved theme after defaults, light/dark detection, and CSS variable
   * overrides. Plugins should color against this rather than re-deriving
   * palettes from `getOptions().theme`, which holds only the caller's
   * partial overrides.
   */
  getTheme(): ThemeConfig;

  /** Get current layout */
  getLayout(): Layout;

  /** Force full redraw */
  redraw(): void;
  /** Resize chart */
  resize(width: number, height: number): void;
  /** Destroy and clean up all resources */
  destroy(): void;

  /** Register a plugin. Returns false when a plugin with the same id is already registered. */
  use(plugin: Plugin): boolean;

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
   * Highlight by stable identity. Requires `highlight.getKey`; when no
   * visible series resolves to the key the highlight is cleared.
   */
  setHighlightKey(key: HighlightSyncKey | null): void;

  /** Currently highlighted stable identity key, or `null`. */
  getHighlightKey(): HighlightSyncKey | null;

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

/**
 * What produced a cursor change. `local` is this chart's own pointer;
 * `sync` came from a peer over a sync group; `programmatic` came from
 * `setCursorDataX`. Handlers use it to break sync feedback loops.
 */
export type CursorEventOrigin = 'local' | 'sync' | 'programmatic';

/** Event name to handler-signature map for `chart.on()`. */
export interface ChartEventMap {
  /** Cursor moved or left (null args on leave). Fires on the cursor hot path. */
  'cursor:move': (
    dataX: number | null,
    dataIdx: number | null,
    origin: CursorEventOrigin,
  ) => void;
  /** Highlighted series changed, `null` when cleared. */
  'highlight:change': (seriesIndex: number | null) => void;
  /** An axis viewport changed via zoom/pan, with the axis key and new range. */
  'viewport:change': (scaleKey: string, range: ScaleRange) => void;
  /** Data replaced or appended. The payload is the live store, do not mutate it. */
  'data:update': (data: ColumnarData) => void;
  /** Config changed via `setOptions`/`replaceOptions`, with the resolved config. */
  'options:update': (config: ChartConfig) => void;
  /** Chart resized, with the new CSS-pixel dimensions. */
  'resize': (width: number, height: number) => void;
  /** Reserved click event. Not currently emitted by the core (see the DX audit). */
  'click': (dataX: number, dataIdx: number) => void;
  /** Box selection resolved. Mirror of `selection.onSelect`. */
  'select': (selection: SelectionResult) => void;
  /** Emitted while the data layer paints, for canvas-level custom drawing without a plugin. */
  'drawData': (ctx: CanvasRenderingContext2D, layout: Layout) => void;
  /** Emitted while the overlay layer paints, above the data. */
  'drawOverlay': (ctx: CanvasRenderingContext2D, layout: Layout) => void;
}

// ============================================================
// RENDER PIPELINE
// ============================================================

/**
 * Bitmask of layers needing repaint. OR flags together to invalidate
 * several layers at once; the scheduler coalesces to one animation frame.
 */
export enum DirtyFlag {
  /** Nothing to repaint. */
  NONE    = 0,
  /** Gridlines, axes, border (the opaque background layer). */
  GRID    = 1 << 0,
  /** Series marks. */
  DATA    = 1 << 1,
  /** Crosshair, indicators, selection box, tap ring. */
  OVERLAY = 1 << 2,
  /** GRID | DATA | OVERLAY, a full repaint. */
  ALL     = 0b111,
}

/** The resolved state handed to renderers for one paint. Read-only per frame. */
export interface RenderContext {
  /** Fully resolved config (defaults + user overrides applied). */
  config: ChartConfig;
  /** The current data snapshot. */
  data: ColumnarData;
  /** Scales keyed by axis key. */
  scales: Map<string, Scale>;
  /** Plot and axis rects plus dpr for this paint. */
  layout: Layout;
  /** The resolved theme (defaults + CSS vars + overrides). */
  theme: ThemeConfig;
}
