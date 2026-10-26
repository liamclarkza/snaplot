export type {
  AxisPosition,
  InterpolationMode,
  PixelRect,
  ScaleRange,
  ScatterRenderMode,
} from '../public/types';
import type {
  AxisPosition,
  InterpolationMode,
  PixelRect,
  ScaleRange,
  ScatterRenderMode,
} from '../public/types';

// ============================================================
// ENGINE VIEWS (internal: the public handle reports scale() and the state instead)
// ============================================================

/** Where an axis is drawn. */
export interface AxisArea {
  /** The side of the plot. */
  position: AxisPosition;
  /** The rectangle of its labels and title. */
  area: PixelRect;
}

/** The rectangle the data is drawn in, and the axis areas, in CSS pixels. */
export interface Layout {
  /** The chart width. */
  width: number;
  /** The chart height. */
  height: number;
  /** The plot rectangle. */
  plot: PixelRect;
  /** Each axis' side and area. */
  axes: Record<string, AxisArea>;
  /** The device pixel ratio. */
  dpr: number;
}

/** The colours and fonts a chart resolved from its theme and page. */
export interface ThemeConfig {
  /** The colour painted behind the plot: `'transparent'` (the default) paints nothing. */
  backgroundColor: string;
  /**
   * The page surface behind the chart, resolved from `backgroundColor`, the container's ancestors
   * or the page's text colour. It picks light or dark roles and blends gridlines; it is not painted.
   */
  surfaceColor?: string;
  /** Light or dark roles, when the theme names them; otherwise derived from `surfaceColor`. */
  mode?: 'light' | 'dark';
  /** The strong text colour. */
  textColor: string;
  /** The axis label colour. */
  axisLabelColor?: string;
  /** The font family. */
  fontFamily: string;
  /** The axis text size in CSS pixels. */
  fontSize: number;
  /** The gridline colour. */
  gridColor: string;
  /** The gridline opacity. */
  gridOpacity: number;
  /** The series colours. */
  palette: string[];
  /** The categorical palette. */
  categoricalPalette?: string[];
  /** The sequential ramp. */
  sequentialPalette?: string[];
  /** The diverging ramp. */
  divergingPalette?: string[];
  /** The density ramp. */
  heatmapGradient?: string[];
  /** The axis line colour. */
  axisLineColor: string;
  /** The frame colour. */
  borderColor: string;
  /** The frame opacity. */
  borderOpacity: number;
  /** The muted text colour. */
  tickColor: string;
  /** The crosshair colour. */
  crosshairColor: string;
  /** The tooltip surface. */
  tooltipBackground: string;
  /** The tooltip text colour. */
  tooltipTextColor: string;
  /** The tooltip border colour. */
  tooltipBorderColor: string;
}

/** A persistent selection in data space, as `getState().selection` reports it. */
export interface SelectionRange {
  /** The selected X range. */
  x: ScaleRange;
  /** The selected Y range, for a two-axis selection. */
  y?: ScaleRange;
}

/** Options of the engine's cursor snapshot. */
export interface CursorSnapshotOptions {
  /** What to report when the cursor is not over the chart. */
  fallback?: 'hide' | 'latest' | 'first';
}

// ============================================================
// DATA TYPES
// ============================================================

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

/**
 * A Scale is a pure function pair: dataToPixel and pixelToData.
 * Scales own a data domain and a pixel range, and convert between them.
 */
export interface Scale {
  /** Scale kind. Fixed at creation; changing an axis type rebuilds the scale. */
  readonly type: ScaleType;
  /** The axis key this scale is bound to (the key in `ChartSpec.axes`). */
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

// ============================================================
// SERIES CONFIGURATION
// ============================================================

/**
 * Mark type for a series. Public bands name `lower` and `upper` fields;
 * histogram series consume explicit binning results. Defaults to `line`.
 */
export type ChartType = 'line' | 'area' | 'band' | 'scatter' | 'bar' | 'histogram';

/** Mark glyph for non-density scatter rendering. Defaults to `circle`. */
export type ScatterPointShape = 'circle' | 'square' | 'diamond';

/**
 * How a `colorBy` column is interpreted. `auto` treats low-cardinality
 * integer columns as categories and everything else as a continuous ramp.
 */
export type ScatterColorEncodingType = 'auto' | 'category' | 'continuous' | 'diverging';

export interface ScatterColorEncoding {
  /** The source column of the encoded field. Column 0 is the X column. */
  column: number;
  /**
   * `auto` treats low-cardinality integer columns as categories and
   * otherwise uses a continuous ramp. Default: `auto`.
   */
  type?: ScatterColorEncodingType;
  /** Internal stable category codes supplied by row preparation. */
  categoryValues?: readonly number[];
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
  /** The source column of the encoded field. Column 0 is the X column. */
  column: number;
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
  /** The source column whose value is shown for the hovered point. */
  column: number;
  /** Row label in the tooltip. Defaults to `column N`. */
  label?: string;
  /** Value formatter. Defaults to the number's default string form. */
  format?: (value: number) => string;
}

export interface SeriesSpec<TMeta = unknown> {
  /** Chart type for this series */
  type?: ChartType;
  /** Display label */
  label: string;
  /** This series' value readout format; it wins over its value axis' `format` (plan §5.2). */
  format?: (value: number) => string;
  /**
   * The source column of the series' value (`y`; the counts of a histogram).
   * Required for every mark.
   */
  yColumn?: number;

  // Visual
  /**
   * Line / mark outline color (any CSS color). Defaults to the theme's
   * categorical palette entry for this series' index.
   */
  color?: string;
  /**
   * The palette slot of a series without a `color`: its index in the chart, unless a chart group
   * assigns slots by series id across its members (plan D17).
   */
  paletteIndex?: number;
  /**
   * The area or band fill, painted as given; `null` paints none (an outline-only area, a band's
   * centre line alone). Unset, an area ramps `color` and a band fills `color` at its opacity.
   * A bar's per-bar `color` arrives here as a callback `(value, index) => colour`.
   */
  fill?: string | null | ((value: number, index: number) => string);
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
   * bar 0.75, histogram 0.75, band fill 0.15). Multiplied by highlight dimming.
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
   * { dash: [6, 3] }       // standard dash
   * { dash: [2, 2] }       // dotted
   * { dash: [10, 4, 2, 4] } // dash-dot
   * ```
   */
  dash?: number[];

  // Band (confidence interval / error band)
  /**
   * Column index for the upper bound of a `type: 'band'` series.
   * Required when `type` is `'band'`. Ignored for other chart types.
   */
  upperColumn?: number;
  /**
   * Column index for the lower bound of a `type: 'band'` series.
   * Required when `type` is `'band'`. Ignored for other chart types.
   *
   * A band series renders three elements as a single visual unit:
   * 1. Filled region between `upperColumn` and `lowerColumn`
   * 2. Center line at `yColumn` (used for tooltip values and cursor snapping)
   *
   * @example
   * ```ts
   * // data = [x, yMean, yUpper, yLower]
   * series: [
   *   { label: 'Loss', type: 'band', yColumn: 1,
   *     upperColumn: 2, lowerColumn: 3,
   *     color: '#4f8fea', fill: '#4f8fea', opacity: 0.15 },
   * ]
   * ```
   */
  lowerColumn?: number;

  // Bar
  /** Fraction of the category width each bar occupies (0–1). Default 0.8. */
  barWidthRatio?: number;

  // Scatter
  /**
   * Absolute column index for scatter X values. Defaults to column 0.
   * Useful for tabular datasets where several scatter views share the same
   * row identity but use different X/Y metric columns.
   */
  xColumn?: number;
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
  /** Key of the X axis in `ChartSpec.axes` this series maps onto. Defaults to `'x'`. */
  xAxis?: string;
  /**
   * Key of the Y axis this series maps onto. Defaults to `'y'`. Point a
   * second series at a different key (e.g. `'y2'`) for a dual-axis chart.
   */
  yAxis?: string;

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

/**
 * Per-axis gridline styling, independent of tick labels. `false` (or
 * `show: false`) removes this axis's gridlines while its labels stay; a
 * time-bar chart often wants horizontal guides only, so set
 * `axes.x.grid: false`. Colors here are concrete CSS color strings; theme
 * `var()` references are resolved only in `ThemeConfig` fields.
 */
export interface AxisGridConfig {
  /** Draw gridlines for this axis's ticks. Default: `true`. */
  show?: boolean;
  /** Gridline color. Default: the theme's `gridColor`. */
  color?: string;
  /** Gridline opacity. Default: derived from the theme's `gridOpacity`. */
  opacity?: number;
  /**
   * Canvas `setLineDash` pattern, e.g. `[4, 4]` for a dashed hairline.
   * Default: solid. Dashes shimmer slightly during pan (the pattern is
   * anchored in screen space), which is why solid is the default.
   */
  dash?: number[];
}

/** Styling for the short marks that anchor tick labels to exact scale positions. */
export interface AxisTickMarksConfig {
  /** Mark length in CSS pixels. Default: `4`. */
  length?: number;
  /** Which side of the plot border the mark extends toward. Default: `'out'`. */
  direction?: 'out' | 'in' | 'both';
  /** Mark color. Default: `theme.axisLineColor` at `theme.gridOpacity`. An explicit color is opaque. */
  color?: string;
}

/** Configuration for an axis entry in ChartSpec.axes */
export interface AxisSpec {
  /** Scale kind for this axis. Default: `'linear'`. */
  type?: ScaleType;
  /**
   * Axis title rendered outside the tick labels: below a bottom axis,
   * rotated alongside a left/right axis. Layout reserves the extra gutter
   * space automatically.
   */
  title?: string;
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
   * Whether to round auto-ranged bounds outward to clean 1/2/5 tick
   * boundaries. Linear continuous axes use this by default; set `nice: false`
   * to keep padded data bounds exact. Log axes remain opt-in with
   * `nice: true`, and time axes do not use this switch. Automatic linear bar
   * X axes use regular tick centers with half-interval outer grid cells;
   * `nice: false` retains category-edge padding. Histogram X bounds stay exact.
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
  format?: (value: number) => string;
  /**
   * Target tick density. Scales treat it as a hint (nice-number rounding
   * still applies on linear axes, including automatic bar grids). Default: 6.
   * Bar labels can thin independently of their slot-boundary grid. Histogram
   * and exact-bound bar category ticks treat it as a cap and also thin to fit
   * the plot width, so a year of daily bars does not label every day.
   */
  tickCount?: number;
  /**
   * Explicit tick values in data space. Overrides `tickCount` and the
   * scale's own generation; values outside the current domain are not
   * rendered. Gridlines follow these ticks, so this also controls the
   * grid density. Format labels with `format`.
   */
  ticks?: number[];
  /**
   * Gridline control for this axis. `false` hides this axis's gridlines
   * entirely; an object styles them. Default: solid hairlines in the
   * theme's grid color.
   */
  grid?: boolean | AxisGridConfig;
  /**
   * Short marks at axis grid positions. Continuous axes follow their visible
   * tick labels; automatic bar axes mark slot boundaries around center labels.
   * Default: `true`.
   */
  tickMarks?: boolean | AxisTickMarksConfig;
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

/** The public `interaction` option, with every field resolved. */
export type InteractionSpec =
  | 'readonly'
  | { zoom: 'x' | 'xy' | 'none'; drag: 'zoom' | 'select' | 'pan'; bounds: 'data' | 'none' };

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
export type ZoomBoundsSpec = 'data' | 'unbounded' | { min?: number; max?: number };

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
  /**
   * What a box-select gesture does. `zoom` (the default) zooms the viewport
   * to the box, preserving prior behavior. `brush` instead leaves a
   * persistent X-range band drawn as chart state: drag to create it, drag
   * inside to move it, drag an edge to resize it. Read it with
   * `getSelection()`, set it with `setSelection()`, and observe changes via
   * the `selection:change` event. Wheel still zooms and shift-drag still
   * pans in brush mode.
   */
  mode?: 'zoom' | 'brush';
  /**
   * How a persistent brush reacts when data is replaced or a rolling stream
   * evicts its range. Default: `'clear-if-outside'`, which preserves useful
   * selections but clears stale state with no overlap. `'clamp'` intersects
   * the selection with the new X extent; `'clear'` always resets it;
   * `'preserve'` retains the previous behavior.
   */
  dataChange?: 'clear-if-outside' | 'clamp' | 'clear' | 'preserve';
  /**
   * Callback fired whenever the persistent brush selection changes (create,
   * move, resize, programmatic set, or clear). `null` means the selection
   * was cleared. Mirrors the `selection:change` event.
   */
  onBrush?: (selection: SelectionRange | null) => void;
}

/** A single scatter point captured inside a box selection. */
export interface SelectedPoint<TMeta = unknown> {
  /** Index of the owning series in `ChartSpec.series`. */
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
   * Format the X value shown in the default tooltip (the header in
   * multi-series mode, the `x` readout in nearest mode). Covers the
   * common "nice date, no custom renderer" case; defaults to the X
   * axis's tick formatting. Populates `TooltipPoint.formattedX`.
   */
  xFormat?: (x: number) => string;
  /**
   * Format a histogram interval. When omitted, each edge uses `xFormat` or
   * the X axis tick formatter, so tooltip ranges use the same units and
   * precision as the axis. Populates `TooltipPoint.formattedX`.
   */
  rangeFormat?: (min: number, max: number, seriesIndex: number) => string;
  /**
   * Format each Y value shown in the default tooltip, e.g. to append
   * units. Receives the series index for mixed-unit charts. Defaults to
   * the Y axis's tick formatting. Populates `TooltipPoint.formattedY`.
   */
  yFormat?: (y: number, seriesIndex: number) => string;
  /**
   * Custom renderer. Returning a string sets the tooltip's `innerHTML`
   * verbatim, so escape any user-derived text or return an `HTMLElement`
   * built with `textContent` to avoid an injection hole. Receives the
   * points selected by `mode`.
   */
  render?: (points: TooltipPoint[]) => string | Node;
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
  /** Index of the owning series in `ChartSpec.series`. */
  seriesIndex: number;
  /** Row index into the series' columns. */
  dataIndex: number;
  /** The owning series' `label`. */
  label: string;
  /** Raw data-space X value. */
  x: number;
  /** Raw X interval represented by the mark; present for histogram bins. */
  xRange?: ScaleRange;
  /** Raw data-space Y value. */
  y: number;
  /** Resolved mark color for the swatch. */
  color: string;
  /** X value pre-formatted via the X axis `format`. */
  formattedX: string;
  /** Y value pre-formatted via the Y axis `format`. */
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

/** Resolved, renderer-independent description of one series legend entry. */
export interface LegendItem<TMeta = unknown> {
  seriesIndex: number;
  label: string;
  type: ChartType;
  visible: boolean;
  color: string;
  fill: string | null;
  lineWidth: number;
  dash: number[];
  opacity: number;
  meta?: TMeta;
}

// ============================================================
// CURSOR SNAPSHOT (legend table data source)
// ============================================================

/**
 * One row of a cursor snapshot, the value of a single visible series
 * at a given X index, plus everything the legend table needs to render it.
 */
export interface CursorSeriesPoint<TMeta = unknown> {
  /** Actual X coordinate sampled from this series source. */
  dataX?: number;
  /** Index of this series in `ChartSpec.series` (stable across cursor moves). */
  seriesIndex: number;
  /** X-column index this row was sampled at (same for every row in a snapshot). */
  dataIndex: number;
  /** The series' `label`, for the row's name cell. */
  label: string;
  /** Resolved series color, for the row's swatch. */
  color: string;
  /** Raw y value, NaN when missing at this index */
  value: number;
  /** Pre-formatted via the Y axis format (or `''` for missing values) */
  formattedValue: string;
  meta?: TMeta;
}

/**
 * Snapshot of all visible series at a given cursor (or fallback) index.
 * Returned by `chart.getCursorSnapshot()` and consumed by the legend table.
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

// ============================================================
// HIGHLIGHT (series highlight + dim)
// ============================================================

export interface HighlightConfig {
  /** Master switch. Default: true. */
  enabled?: boolean;
  /**
   * Opacity multiplier applied to non-highlighted series when a
   * highlight is active. Default: 0.2.
   */
  dimOpacity?: number;
  /**
   * Auto-highlight the series nearest the cursor when its hit-tested
   * point is within this many CSS pixels vertically; clear the highlight
   * when nothing qualifies. Off when unset. Propagates through a chart
   * group like a manual `setHighlight()`, so linked charts dim together.
   */
  proximity?: number;
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
   * at rest. `false` disables sampling. Explicit numeric values are exact.
   * The automatic default is 10000 for mouse/keyboard interaction and an
   * adaptive `max(400, 1.5 × plot CSS width)` for touch/pen gestures.
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

// ============================================================
// STREAMING
// ============================================================

export interface StreamingSpec {
  /**
   * Retain at most this many points after appendData(). When set, snaplot
   * uses an internal ring buffer so streaming updates do not allocate a new
   * full-window dataset on every tick.
   */
  maxPoints?: number;
  /**
   * Live-follow window width in X data units. When set and the chart is
   * "following" (the default until the user pans or zooms X), each
   * `appendData` keeps the X viewport at `[latestX - followWindow, latestX]`, so
   * the view scrolls with the newest data. Panning or zooming X pauses
   * following; `resumeFollow()` or a double-click reset resumes it.
   * Without this, a following chart tracks the full data extent instead of a
   * fixed trailing window. Follows the default `x` axis (and any horizontal
   * axis).
   */
  followWindow?: number;
}

// ============================================================
// CHART CONFIGURATION (top-level)
// ============================================================

export interface ChartSpec<TMeta = unknown> {
  /** Fixed CSS-pixel width. Omit and set `autoResize` to fill the container. */
  width?: number;
  /**
   * The public `height` (D26): CSS pixels or a CSS length. Unset fills the
   * container. Normalised here; the engine does not apply it yet (M11).
   */
  height?: number | string;
  /**
   * Track the container's size with a ResizeObserver and repaint on change.
   * Default: `true`. Set `false` and provide `width`/`height` for a fixed size.
   */
  autoResize?: boolean;

  /**
   * Axis definitions keyed by axis key. `'x'`/`'y'` are conventional; extra
   * keys (e.g. `'y2'`) create additional axes that series bind to via
   * `xAxis`/`yAxis`. Omitted axes default to a linear scale.
   */
  axes?: Record<string, AxisSpec>;
  /** Series to draw, in paint order (later series draw on top). Required. */
  series: SeriesSpec<TMeta>[];

  /** Interaction mode preset, sets default gesture mappings. Default: `'timeseries'`. */
  mode?: InteractionMode;
  /**
   * The public `interaction` option, resolved: `'readonly'` or every field set.
   * Today `mode`, `zoom`, `pan`, `selection` and `touch` carry its effect;
   * M12a's gestures read it.
   */
  interaction?: InteractionSpec;
  /** The public `legend` option (M8's automatic legend and M12b's views read it). */
  legend?: boolean | 'auto' | { position: 'top' | 'bottom' };
  /** BCP 47 locale for ticks and readouts; unset uses the runtime's (M10 reads it). */
  locale?: string;
  /**
   * The time zone of dates: ISO-8601 parsing and `DateFormat` objects read it;
   * M10's ticks and readouts will. Default: `'local'`.
   */
  timeZone?: 'local' | 'UTC';

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
  /** Series highlight + dim config. */
  highlight?: HighlightConfig;
  /** Ring-buffer window for `appendData` streaming. */
  streaming?: StreamingSpec;
  /** Large-dataset interaction tuning. */
  performance?: PerformanceConfig;

  /**
   * Theme overrides. Any field omitted resolves from CSS variables on the
   * container, then the built-in light/dark default. Pass a full exported
   * theme object to pin colors regardless of the page.
   */
  theme?: Partial<ThemeConfig>;
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

// ============================================================
// PLUGIN SYSTEM (internal: createChart bridges public ChartPlugins onto it)
// ============================================================

/**
 * What an engine plugin sees of the chart: the current plot rect, scales and
 * theme to draw against, and a way to ask for a repaint.
 */
export interface EngineHost {
  /** Get current layout */
  getLayout(): Layout;
  /** Get a scale by axis key */
  getAxis(key: string): Scale | undefined;
  /**
   * Resolved theme after defaults, light/dark detection, and CSS variable
   * overrides. Plugins should color against this rather than re-deriving
   * palettes from the config, which holds only the caller's partial
   * overrides.
   */
  getTheme(): ThemeConfig;
  /** A user colour the canvas can paint: `var()` resolved in the chart's cascade. */
  resolveColor(color: string): string;
  /** Force full redraw */
  redraw(): void;
}

export interface Plugin {
  /** Unique id. Registering a second plugin with the same id is rejected. */
  id: string;
  /** Called once when the plugin is added. Set up DOM / listeners here. */
  install?(chart: EngineHost): void;
  /** Called once when the plugin is removed or the chart is destroyed. Tear down here. */
  destroy?(chart: EngineHost): void;

  /** After gridlines/axes paint. Draw under the data here. */
  afterDrawGrid?(chart: EngineHost, ctx: CanvasRenderingContext2D): void;

  /** After series marks paint. Annotations that sit above data go here (see `createReferenceLinesPlugin`). */
  afterDrawData?(chart: EngineHost, ctx: CanvasRenderingContext2D): void;

  /** After the overlay paints, the topmost draw layer. */
  afterDrawOverlay?(chart: EngineHost, ctx: CanvasRenderingContext2D): void;
}

// ============================================================
// DATA UPDATES
// ============================================================

export interface AppendDataOptions {
  /**
   * Treat the first row of `data` as a correction of the current last row
   * instead of a new point: the last row is overwritten in place and any
   * remaining rows append normally. This is the streaming verb for
   * in-progress buckets (a live epoch aggregate, a forming candle) and
   * avoids the full-window reallocation that a data replacement implies. The
   * replacement X must keep the X column sorted; it is usually the same
   * X the row was first appended with.
   */
  updateLast?: boolean;
}

// ============================================================
// CHART EVENTS
// ============================================================

/**
 * What produced a cursor change. `local` is this chart's own pointer;
 * `programmatic` came from `setCursorDataX` (a chart group's cursor sync, or
 * application code).
 */
export type CursorEventOrigin = 'local' | 'programmatic';

/** Event name to handler-signature map for `chart.on()`. */
export interface ChartEventMap {
  /** A non-drag activation hit an actual data point or bar. */
  'point:click': (point: TooltipPoint) => void;
  /** Cursor moved or left (null args on leave). Fires on the cursor hot path. */
  'cursor:move': (dataX: number | null, dataIdx: number | null, origin: CursorEventOrigin) => void;
  /** Highlighted series changed, `null` when cleared. */
  'highlight:change': (seriesIndex: number | null) => void;
  /** An axis viewport changed via zoom/pan, with the axis key and new range. */
  'viewport:change': (scaleKey: string, range: ScaleRange) => void;
  /** Data replaced or appended. The payload is the live store, do not mutate it. */
  'data:update': (data: ColumnarData) => void;
  /** Config changed via `setOptions`/`replaceOptions`, with the resolved config. */
  'options:update': (config: ChartSpec) => void;
  /** The resolved theme changed through config, CSS variables, or color scheme. */
  'theme:update': (theme: ThemeConfig) => void;
  /**
   * Live-follow state toggled: `true` when the X viewport resumed tracking
   * new data, `false` when a pan/zoom paused it. Drive a live/paused badge
   * from this. See `isFollowing()` / `scrollToLatest()`.
   */
  'follow:change': (following: boolean) => void;
  /** Chart resized, with the new CSS-pixel dimensions. */
  resize: (width: number, height: number) => void;
  /** Box selection resolved. Mirror of `selection.onSelect`. */
  select: (selection: SelectionResult) => void;
  /** Persistent brush selection changed (`null` when cleared). Mirror of `selection.onBrush`. */
  'selection:change': (selection: SelectionRange | null) => void;
  /** A gesture action starts (`true`) or ends (`false`): its changes are one user action. */
  action: (start: boolean) => void;
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
  NONE = 0,
  /** Gridlines, axes, border (the opaque background layer). */
  GRID = 1 << 0,
  /** Series marks. */
  DATA = 1 << 1,
  /** Crosshair, indicators, selection box, tap ring. */
  OVERLAY = 1 << 2,
  /** GRID | DATA | OVERLAY, a full repaint. */
  ALL = 0b111,
}
