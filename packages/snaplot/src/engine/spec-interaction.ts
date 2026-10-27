/**
 * The engine's interaction and readout types (split from spec.ts, which re-exports them): the
 * interaction mode, cursor, zoom, pan, selection, tooltip and touch configs, and the points a hit
 * or the cursor reports.
 */
import type { ScaleRange } from '../public/types';
import type { ChartType, SelectionRange } from './spec';

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
  /** The name of the X value in a point's tooltip (its axis title or field); scatter only. */
  xName?: string;
  /** The name of the Y value in a point's tooltip (its axis title or field); scatter only. */
  yName?: string;
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
