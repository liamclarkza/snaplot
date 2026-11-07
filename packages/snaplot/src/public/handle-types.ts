/**
 * The public types of the chart's state, points, plugins, handle and groups:
 * what a chart reports and what code that drives it names. Like
 * `./types.ts`, they are written by hand and never derived from the engine
 * (plan §4, P4); `./types.ts` re-exports them.
 */
import type {
  AppendOptions,
  AxisType,
  ChartOptions,
  ChartPatch,
  DataSource,
  RowId,
  ScaleRange,
  SeriesType,
} from './types';

// ─── State ───────────────────────────────────────────────────────────

/** An interval on one axis, as `[from, to]`. Dates are epoch milliseconds. */
export type AxisInterval = readonly [from: number | Date, to: number | Date];

/**
 * The pinned axes of the viewport. An axis that is not named stays automatic; `{}` means every axis
 * is automatic.
 */
export type Viewport = Readonly<Partial<Record<string, AxisInterval>>>;

/** A selection made with `interaction: { drag: 'select' }`. */
export interface Selection {
  /** The selected X interval. */
  readonly x: AxisInterval;
  /** The selected Y interval, for a two-axis selection. @defaultValue the whole Y range */
  readonly y?: AxisInterval;
}

/** A selection as reported to `onSelectionChange`, with the points inside it. */
export interface SelectionChange<Row = Record<string, any>> extends Selection {
  /** The scatter points inside a two-axis selection. */
  readonly points?: readonly ChartPoint<Row>[];
}

// ─── Points and readouts ─────────────────────────────────────────────

/** One extra tooltip field of a scatter point. */
export interface ChartPointField {
  /** The field's label. */
  label: string;
  /** The raw value (a category label for category encodings). */
  value: number | string;
  /** The value as written. */
  formatted: string;
}

/** One data point, as tooltips, the cursor and callbacks report it. */
export interface ChartPoint<Row = Record<string, any>> {
  /** The series id. */
  seriesId: string;
  /** The series label. */
  label: string;
  /** The original row, for row data. */
  row?: Row;
  /** The row's index in the data you passed (before sorting), or among appended rows. */
  rowIndex: number;
  /** The row id, when the data has one. */
  rowId?: RowId;
  /** The X value: a number (epoch milliseconds on time axes) or a category label. */
  x: number | string;
  /** The bin interval of a histogram point, or a heatmap cell's interval along X. */
  xRange?: ScaleRange;
  /** The value (a heatmap cell's vertical position: its value is `value`). */
  y: number;
  /** A heatmap cell's interval along Y. */
  yRange?: ScaleRange;
  /** A heatmap cell's value. */
  value?: number;
  /** A heatmap cell's value as written. */
  formattedValue?: string;
  /** A heatmap cell's index among its row's bins (`rowIndex` is its row). */
  bin?: number;
  /** The marker radius of a scatter point in CSS pixels. */
  radius?: number;
  /** Extra scatter fields from `tooltipFields`, `colorBy` and `sizeBy`. */
  fields?: readonly ChartPointField[];
  /** The X value as written. */
  formattedX: string;
  /** The value as written (a heatmap cell's vertical position). */
  formattedY: string;
  /** The point's colour. */
  color: string;
}

/** The values under the cursor, or at a fallback position. */
export interface CursorSnapshot<Row = Record<string, any>> {
  /** The X position, or `null` when there is none. */
  x: number | string | null;
  /** The X position as written. */
  formattedX: string;
  /** One point per visible series. */
  points: readonly ChartPoint<Row>[];
  /** What produced the snapshot. */
  source: 'cursor' | 'latest' | 'first' | 'none';
  /** The series closest to the pointer, or `null`. */
  activeSeriesId: string | null;
}

/** Options of `getCursor()`. */
export interface CursorOptions {
  /** What to report when the cursor is not over the chart. @defaultValue `'hide'` */
  fallback?: 'hide' | 'latest' | 'first';
}

/** One series with its colour, mark and visibility: what a legend draws. */
export interface SeriesState {
  /** The series id. */
  id: string;
  /** The series label. */
  label: string;
  /** The mark. */
  type: SeriesType;
  /** The series colour. */
  color: string;
  /** The fill colour, or `null`. */
  fill: string | null;
  /** Whether the series is shown. */
  visible: boolean;
  /** The dash pattern; empty when solid. */
  dash: readonly number[];
  /** The series opacity. */
  opacity: number;
}

/**
 * The chart's state, as `getState()` reports it: one frozen snapshot per revision. The cursor
 * is not part of it; read it with `getCursor()` or listen to `cursor:change`.
 */
export interface ChartState {
  /** Bumped by every data, option or state commit, so a subscriber can tell a change. */
  revision: number;
  /** The pinned axes, as `[from, to]`; `{}` when every axis is automatic. */
  viewport: Viewport;
  /** The selection, or `null`. */
  selection: Selection | null;
  /** The ids of hidden series. */
  hiddenSeries: readonly string[];
  /** The highlighted series id, or `null`. */
  highlight: string | null;
  /** Whether the X viewport follows the latest data. */
  following: boolean;
  /** Every series with its colour, mark and visibility, in paint order. */
  series: readonly SeriesState[];
}

/**
 * Event payloads by event name, for `chart.on()`. Each `<key>:change` has a matching
 * `on<Key>Change` option, called with the same value.
 */
export interface ChartEvents<Row = Record<string, any>> {
  /** The cursor moved or left: the values under it. */
  'cursor:change': CursorSnapshot<Row>;
  /** The pinned axes changed: the complete new viewport, `{}` on a reset. */
  'viewport:change': Viewport;
  /** The selection settled, or was cleared (`null`). */
  'selection:change': SelectionChange<Row> | null;
  /** Series were shown or hidden: the ids now hidden. */
  'hiddenSeries:change': readonly string[];
  /** The highlighted series changed. */
  'highlight:change': string | null;
  /** Following the latest data started or stopped. */
  'following:change': boolean;
  /** A point was clicked. */
  'point:click': ChartPoint<Row>;
}

// ─── Plugins ─────────────────────────────────────────────────────────

/** A rectangle in CSS pixels, from the top-left corner of the chart's canvases. */
export interface PixelRect {
  /** The left edge. */
  left: number;
  /** The top edge. */
  top: number;
  /** The width. */
  width: number;
  /** The height. */
  height: number;
}

/**
 * One axis as `chart.scale(key)` reports it: what plugins map data to pixels with. A snapshot:
 * read it again after the viewport moves.
 */
export interface ChartScale {
  /** The axis kind. */
  readonly type: AxisType;
  /** Whether the axis runs along the bottom or top of the plot. */
  readonly horizontal: boolean;
  /** The lower bound of the current range, in data units (slot positions on a category axis). */
  readonly min: number;
  /** The upper bound of the current range. */
  readonly max: number;
  /** The labels of a category axis, in order. */
  readonly categories?: readonly string[];
  /**
   * The pixel of a value, in CSS pixels from the canvases' top-left corner: a number, a Date or
   * an ISO-8601 string on a time axis, or a category label.
   */
  toPixel(value: number | Date | string): number;
  /** The value at a pixel (a slot position on a category axis). */
  fromPixel(pixel: number): number;
}

/**
 * A plugin: an id, an optional install hook, and draw hooks for three slots. Plugins are
 * reconciled by `id`, so an inline object installs once and its latest hooks draw. Each slot
 * draws after the built-in reference lines and regions, in array order; a hook that throws is
 * reported once and its plugin is disabled.
 *
 * @example
 * ```ts
 * const watermark: ChartPlugin = {
 *   id: 'watermark',
 *   drawOverlay(context, chart, plot) {
 *     context.fillText('draft', plot.left + 8, plot.top + 16);
 *   },
 * };
 * ```
 */
export interface ChartPlugin<Row = Record<string, any>> {
  /** A unique id among the chart's plugins; two plugins with one id throw. */
  id: string;
  /**
   * Called once with the chart when the plugin is added; return a cleanup function, called when
   * the plugin is removed or the chart is destroyed.
   */
  install?(chart: ChartHandle<Row>): void | (() => void);
  /** Draw under the data, after the grid and the reference regions. */
  drawBelow?(context: CanvasRenderingContext2D, chart: ChartHandle<Row>, plot: PixelRect): void;
  /** Draw over the data, after the reference lines. */
  drawAbove?(context: CanvasRenderingContext2D, chart: ChartHandle<Row>, plot: PixelRect): void;
  /** Draw on the overlay, above the crosshair. */
  drawOverlay?(context: CanvasRenderingContext2D, chart: ChartHandle<Row>, plot: PixelRect): void;
}

// ─── The chart handle ────────────────────────────────────────────────

/**
 * The handle `createChart` returns.
 *
 * @example
 * ```ts
 * const chart = createChart(el, options);
 * chart.update({ axes: { y: { title: 'Load' } } });
 * chart.appendData([{ time: Date.now(), cpu: 40 }]);
 * chart.on('point:click', (point) => console.log(point.row));
 * ```
 */
export interface ChartHandle<Row = Record<string, any>> {
  /** The element the chart was created in. */
  readonly container: HTMLElement;
  /**
   * Apply a partial update. Every key the patch names counts as changed, and the state options
   * it names always apply: `update({ viewport: {} })` resets the viewport.
   */
  update(patch: ChartPatch<Row>): void;
  /**
   * Replace every option, as a framework does on each render. Each option is compared with the
   * value last applied, so an unchanged one costs nothing, and a state option (`viewport`,
   * `selection`, `hiddenSeries`, `highlight`) applies only when it differs from the value last
   * given; an option left out returns to its default.
   */
  setOptions(options: ChartOptions<Row>): void;
  /** Append rows or columns to the chart's data, or to one series' own source. */
  appendData(data: DataSource<Row>, options?: AppendOptions): void;
  /** The current state: the same frozen object until the next commit. */
  getState(): ChartState;
  /**
   * Called after data, options or state change, at most once per animation frame; returns the
   * unsubscribe function. Cursor moves do not call it: listen to `cursor:change`.
   */
  subscribe(listener: () => void): () => void;
  /** Listen to one event; returns the unsubscribe function. An unknown event name throws. */
  on<K extends keyof ChartEvents<Row>>(
    event: K,
    listener: (value: ChartEvents<Row>[K]) => void,
  ): () => void;
  /**
   * The values under the cursor, or at a fallback position (`'hide'`, the default, reports
   * none), computed when asked.
   */
  getCursor(options?: CursorOptions): CursorSnapshot<Row>;
  /**
   * Return every axis to its automatic range, as `update({ viewport: {} })` does, and report
   * the reset as `viewport:change` with `{}`.
   */
  resetViewport(): void;
  /** Follow the latest data again, after a pan, a zoom or a pinned viewport paused it. */
  resumeFollow(): void;
  /**
   * Move the cursor to an X value, or hide it with `null`. A string is a category label, or an
   * ISO-8601 date on a time axis; a string the X axis cannot read throws.
   */
  setCursor(x: number | Date | string | null): void;
  /** An axis' kind, range and pixel mapping, or undefined for an axis the chart does not have. */
  scale(key: string): ChartScale | undefined;
  /**
   * Repaint a layer on the next frame: `'overlay'`, `'data'` (the marks and what plugins draw
   * over them) or `'all'`, which also resolves the theme from the page again.
   */
  redraw(layer?: 'overlay' | 'data' | 'all'): void;
  /** Remove the chart and release its resources. */
  destroy(): void;
}

// ─── Groups ──────────────────────────────────────────────────────────

/** What a chart group links. */
export interface ChartGroupOptions {
  /** Share the cursor. @defaultValue `true` */
  cursor?: boolean;
  /** Share the highlighted series. @defaultValue `true` */
  highlight?: boolean;
  /**
   * Share the horizontal viewport: a zoom, pan or reset of X in one member moves every member
   * that has that axis. Vertical axes stay each chart's own. @defaultValue `true`
   */
  viewport?: boolean;
  /** Align the plot edges: every member takes the widest member's side gutters. @defaultValue `true` */
  alignPlots?: boolean;
  /** Share one Y range, the union of the members' own. @defaultValue `false` */
  yRange?: boolean;
}

/**
 * Charts linked by their `group` option share their cursor, highlight, horizontal viewport and
 * plot edges, and a series id has the same colour in every member. A chart leaves with
 * `update({ group: undefined })` or `destroy()`.
 */
export interface ChartGroup {
  /** Move every member's cursor. A value the members' X axis cannot read throws. */
  setCursor(value: number | Date | string | null): void;
  /**
   * Highlight a series in every member. Members without that series clear their highlight; an id
   * no member has throws.
   */
  setHighlight(id: string | null): void;
}
