/**
 * The public types of the chart's state, points, plugins, handle and groups:
 * what a chart reports and what code that drives it names. Like
 * `./types.ts`, they are written by hand and never derived from the engine
 * (plan §4, P4); `./types.ts` re-exports them.
 */
import type {
  AppendOptions,
  AxisPosition,
  AxisState,
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

/** A persistent selection in data space, as `getState().selection` reports it. */
export interface SelectionRange {
  /** The selected X range. */
  x: ScaleRange;
  /** The selected Y range, for a two-axis selection. */
  y?: ScaleRange;
}

/** The current axis ranges by axis key, as `getState().viewport` reports them. */
export type ViewportRanges = Readonly<Record<string, Readonly<ScaleRange>>>;

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
  /** The bin interval of a histogram point. */
  xRange?: ScaleRange;
  /** The value. */
  y: number;
  /** The marker radius of a scatter point in CSS pixels. */
  radius?: number;
  /** Extra scatter fields from `tooltipFields`, `colorBy` and `sizeBy`. */
  fields?: readonly ChartPointField[];
  /** The X value as written. */
  formattedX: string;
  /** The value as written. */
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

/** Options of `getCursorSnapshot()`. */
export interface CursorSnapshotOptions {
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

/** The chart's state, as `getState()` reports it. */
export interface ChartState<Row = Record<string, any>> {
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
  /** The values under the cursor. */
  cursor: CursorSnapshot<Row>;
}

/** Event payloads by event name, for `chart.on()`. */
export interface ChartEvents<Row = Record<string, any>> {
  /** The cursor moved or left. */
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
  /** Any state changed. */
  'state:change': ChartState<Row>;
  /** A box selection finished. */
  select: SelectionResult<Row>;
  /** Data was replaced or appended. */
  'data:update': undefined;
  /** Options changed. */
  'options:update': ChartOptions<Row>;
  /** The resolved theme changed. */
  'theme:update': ThemeConfig;
  /** The chart was resized. */
  resize: {
    /** The new width in CSS pixels. */
    width: number;
    /** The new height in CSS pixels. */
    height: number;
  };
}

/** A finished box selection, with the points inside it. */
export interface SelectionResult<Row = Record<string, any>> extends SelectionRange {
  /** The scatter points inside a two-axis selection. */
  points?: readonly ChartPoint<Row>[];
}

// ─── Plugins ─────────────────────────────────────────────────────────

/**
 * A plugin: drawing hooks and lifecycle callbacks. Hook errors are caught and
 * logged.
 *
 * @example
 * ```ts
 * const watermark: ChartPlugin = {
 *   id: 'watermark',
 *   afterDrawOverlay(chart, ctx) { ctx.fillText('draft', 8, 16); },
 * };
 * ```
 */
export interface ChartPlugin<Row = Record<string, any>> {
  /** A unique id. */
  id: string;
  /** Called once with the chart when the plugin is added. */
  install?(chart: ChartHandle<Row>): void;
  /** Called once when the plugin is removed or the chart is destroyed. */
  destroy?(chart: ChartHandle<Row>): void;
  /** Called before the data layer draws; return `false` to skip the built-in marks. */
  beforeDraw?(chart: ChartHandle<Row>): boolean | void;
  /** Draw under the data, after the grid. */
  afterDrawGrid?(chart: ChartHandle<Row>, context: CanvasRenderingContext2D): void;
  /** Draw over the data. */
  afterDrawData?(chart: ChartHandle<Row>, context: CanvasRenderingContext2D): void;
  /** Draw on the overlay, above the crosshair. */
  afterDrawOverlay?(chart: ChartHandle<Row>, context: CanvasRenderingContext2D): void;
  /** Called after data is replaced or appended. */
  onDataUpdate?(chart: ChartHandle<Row>): void;
  /** Called after options change. */
  onOptionsUpdate?(chart: ChartHandle<Row>): void;
}

// ─── The chart handle ────────────────────────────────────────────────

/** A rectangle in CSS pixels, relative to the chart container. */
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

/** One number per canvas layer. */
export interface LayerCounts {
  /** The grid layer: gridlines, axes and frame. */
  grid: number;
  /** The data layer: the marks. */
  data: number;
  /** The overlay: crosshair, indicators and selection. */
  overlay: number;
}

/** Paint counters, for diagnostics. */
export interface ChartStats {
  /** Bumped on every data change. */
  dataVersion: number;
  /** Data replacements since creation. */
  setDataCount: number;
  /** Appends since creation. */
  appendDataCount: number;
  /** Paints per layer. */
  renderCount: LayerCounts;
  /** The duration of each layer's last paint in milliseconds (0 unless measured). */
  lastRenderMs: LayerCounts;
}

/** The colours and fonts a chart resolved from its theme and page. */
export interface ThemeConfig {
  /** The surface colour. */
  backgroundColor: string;
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
  /** The options as last applied. */
  getOptions(): Readonly<ChartOptions<Row>>;
  /** The current state. */
  getState(): ChartState<Row>;
  /** Called after any state change; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Listen to one event; returns the unsubscribe function. */
  on<K extends keyof ChartEvents<Row>>(
    event: K,
    listener: (value: ChartEvents<Row>[K]) => void,
  ): () => void;
  /** Set axis ranges by key. */
  setViewport(viewport: ViewportRanges): void;
  /**
   * Return every axis to its automatic range, as `update({ viewport: {} })` does, and report
   * the reset as `viewport:change` with `{}`.
   */
  resetViewport(): void;
  /** Follow the latest data again. */
  resumeFollow(): void;
  /** Set or clear the persistent selection. */
  setSelection(selection: SelectionRange | null): void;
  /** Show or hide a series. An id the chart does not have throws. */
  setSeriesVisible(id: string, visible: boolean): void;
  /** Highlight a series, or clear the highlight with `null`. An id the chart does not have throws. */
  setHighlight(id: string | null): void;
  /**
   * Move the cursor to an X value, or hide it with `null`. A string is a category label, or an
   * ISO-8601 date on a time axis; a string the X axis cannot read throws.
   */
  setCursor(x: number | Date | string | null): void;
  /** The values under the cursor, or at a fallback position. */
  getCursorSnapshot(options?: CursorSnapshotOptions): CursorSnapshot<Row>;
  /**
   * The values under the cursor, or at a fallback position (`'hide'`, the default, reports
   * none), computed when asked.
   */
  getCursor(options?: CursorSnapshotOptions): CursorSnapshot<Row>;
  /** One entry per series. */
  getLegendItems(): SeriesState[];
  /** The resolved theme. */
  getTheme(): ThemeConfig;
  /** The plot and axis rectangles. */
  getLayout(): Layout;
  /** Paint counters. */
  getStats(): ChartStats;
  /** An axis' kind and current range. */
  getAxis(key: string): Readonly<AxisState> | undefined;
  /** Resolve the theme from the page again. */
  refreshTheme(): void;
  /** Resize to a fixed size in CSS pixels. */
  resize(width: number, height: number): void;
  /** Repaint every layer. */
  redraw(): void;
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
  /** Share the horizontal viewport (vertical axes stay independent). @defaultValue `false` */
  viewport?: boolean;
  /** Align the plot edges. @defaultValue `false` */
  alignPlots?: boolean;
  /** Share one Y range across the group. @defaultValue `false` */
  yRange?: boolean;
}

/** Charts linked by `group` share their cursor, highlight and, optionally, X viewport. */
export interface ChartGroup {
  /** The options the group was created with. */
  readonly options: Readonly<ChartGroupOptions>;
  /** Move every member's cursor. A value the members' X axis cannot read throws. */
  setCursor(value: number | Date | string | null): void;
  /**
   * Highlight a series in every member. Members without that series clear their highlight; an id
   * no member has throws.
   */
  setHighlight(id: string | null): void;
  /** Unlink every member. */
  destroy(): void;
}
