/**
 * The public contract of snaplot: every type a user can name. These types are
 * written by hand and documented here; nothing in this file is derived from
 * the internal engine, so an engine change can never widen the public API by
 * accident (plan §4, P4).
 *
 * @module
 */

import type {
  ChartGroup,
  ChartPlugin,
  ChartPoint,
  CursorSnapshot,
  Selection,
  SelectionChange,
  Viewport,
} from './handle-types';

export type * from './handle-types';

// ─── Data ────────────────────────────────────────────────────────────

/**
 * A value on an axis: a number, a `Date`, an ISO-8601 date string (read as a time) or a category
 * label.
 */
export type AxisValue = number | Date | string;

/** A stable identifier for a row, kept through sorting and streaming. */
export type RowId = string | number;

/**
 * A property of `Row` whose values are assignable to `Value`. For rows typed as a plain record, any
 * string is accepted.
 */
export type Field<Row, Value> = Extract<
  keyof {
    [K in keyof Row as NonNullable<Row[K]> extends Value
      ? K
      : unknown extends Row[K]
        ? K
        : never]: 0;
  },
  string
>;

/**
 * Reads a value from a row: a field name, or a function of the row and its index in the data you
 * passed. Field names are cheaper: a function's identity is part of the options, so memoise it.
 */
export type Accessor<Row, Value> = Field<Row, Value> | RowFunction<Row, Value>;

/**
 * A function of a row and its original index in the data you passed. Declared bivariantly, so a
 * function written for a narrower row type can be stored in options typed for a wider one.
 */
export type RowFunction<Row, Value> = {
  /** Reads the value of `row`; `index` is its index in the data you passed. */
  bivarianceHack(row: Row, index: number): Value;
}['bivarianceHack'];

/** A numeric value of a row. `null`, `undefined` and `NaN` are gaps. */
type Numeric<Row> = Accessor<Row, number | null | undefined>;

/**
 * Named typed columns. Every column has the same length; the X column must be
 * sorted ascending unless every series reading it is a scatter. The arrays are
 * used in place: do not mutate them after passing them in.
 *
 * @example
 * ```ts
 * createChart(el, {
 *   data: { columns: { t: times, p99: latencies } },
 *   x: 't',
 *   series: [{ y: 'p99' }],
 * });
 * ```
 */
export interface ColumnData {
  /** The columns by field name. */
  readonly columns: Readonly<Record<string, Float64Array>>;
  /**
   * One identifier per row, reported on points as `rowId`. Must be unique.
   * @defaultValue no row ids
   */
  readonly rowIds?: readonly RowId[];
}

/**
 * Histogram bins: `edges.length === counts.length + 1`, edges strictly increasing. {@link
 * histogram} computes them from raw values.
 */
export interface HistogramBins {
  /** Bin edges; bin `i` spans `[edges[i], edges[i + 1])`, and the last bin includes its upper edge. */
  edges: Float64Array;
  /** The number of values in each bin. */
  counts: Float64Array;
  /** The largest count. */
  maxCount: number;
}

/**
 * What a chart or a series draws: object rows (sorted by X for you), named typed columns (already
 * sorted, used without copying) or histogram bins.
 */
export type DataSource<Row> = readonly Row[] | ColumnData | HistogramBins;

// ─── Formatting ──────────────────────────────────────────────────────

/** `Intl.NumberFormat` options plus text placed before and after the number. */
export type NumberFormatOptions = Intl.NumberFormatOptions & {
  /** Text before the formatted number, such as `'$'`. @defaultValue `''` */
  prefix?: string;
  /**
   * Text after the formatted number, such as `'%'` for data that is already in percent (`style:
   * 'percent'` multiplies by 100).
   * @defaultValue `''`
   */
  suffix?: string;
};

/**
 * How numbers are written: a function, or `Intl.NumberFormat` options with an
 * optional `prefix` and `suffix`.
 *
 * @example
 * ```ts
 * axes: { y: { format: { suffix: '%' } } }          // 41.2%
 * axes: { y: { format: (v) => `${v.toFixed(1)} ms` } }
 * ```
 */
export type NumberFormat = ((value: number) => string) | NumberFormatOptions;

/** How times are written: a function of epoch milliseconds, or `Intl.DateTimeFormat` options. */
export type DateFormat = ((value: number) => string) | Intl.DateTimeFormatOptions;

// ─── Axes ────────────────────────────────────────────────────────────

/** The kind of an axis. */
export type AxisType = 'linear' | 'log' | 'time' | 'category';

/** The side of the plot an axis sits on. */
export type AxisPosition = 'top' | 'bottom' | 'left' | 'right';

/** A closed data-space interval. */
export interface ScaleRange {
  /** The lower bound, in data units. */
  min: number;
  /** The upper bound, in data units. */
  max: number;
}

/** Options every axis kind shares. */
interface AxisCommon {
  /** The axis title, drawn outside the tick labels. @defaultValue no title */
  title?: string;
  /**
   * A fixed lower bound. Dates are read as epoch milliseconds.
   * @defaultValue automatic, from the data
   */
  min?: number | Date;
  /**
   * A fixed upper bound. Dates are read as epoch milliseconds.
   * @defaultValue automatic, from the data
   */
  max?: number | Date;
  /**
   * The side of the plot. Keys starting with `x` go to the bottom, others to the left.
   * @defaultValue inferred from the axis key
   */
  position?: AxisPosition;
  /**
   * How far automatic bounds reach: `'data'` ends at the data (a scatter keeps a margin so its
   * points stay whole), `'pad'` pads out to the next round tick value.
   * @defaultValue `'pad'` for value axes; on the X of line, area and band series, padding only on
   * a side whose round value is within 5% of the span past the data
   */
  extent?: 'data' | 'pad';
  /**
   * Explicit tick values. Values outside the domain are dropped, gridlines follow them and `format`
   * still applies.
   * @defaultValue automatic ticks
   */
  ticks?: readonly (number | Date)[];
  /** Draw gridlines for this axis. @defaultValue `true` */
  grid?: boolean;
}

/** A numeric axis: linear or logarithmic. */
export interface ValueAxisOptions extends AxisCommon {
  /** The scale. `log` needs positive values. */
  type: 'linear' | 'log';
  /**
   * How tick labels and value readouts (tooltip, cursor, legend table) are written. A series
   * `format` wins for that series.
   * @defaultValue automatic, at the precision of the data
   */
  format?: NumberFormat;
  /** Not available on a value axis. */
  categories?: undefined;
}

/** A time axis: epoch milliseconds, Dates or ISO-8601 strings. */
export interface TimeAxisOptions extends AxisCommon {
  /** The scale. */
  type: 'time';
  /**
   * How tick labels and the cursor's X readout are written.
   * @defaultValue calendar labels at the tick step
   */
  format?: DateFormat;
  /** Not available on a time axis. */
  categories?: undefined;
}

/** An axis whose type is inferred from the data. */
export interface InferredAxisOptions extends AxisCommon {
  /** Inferred from the data: Dates and ISO-8601 strings give `'time'`, other strings `'category'`, numbers `'linear'`. */
  type?: undefined;
  /**
   * How tick labels and value readouts are written. Not accepted when the data makes this a
   * category axis.
   * @defaultValue automatic
   */
  format?: NumberFormat | DateFormat;
  /** Give a category order to make this a category axis; see {@link CategoryAxisOptions}. */
  categories?: undefined;
}

/** A category axis: one slot per label, in order of first appearance. */
export interface CategoryAxisOptions extends AxisCommon {
  /**
   * The scale. Inferred for string values that are not ISO-8601 dates.
   * @defaultValue inferred from the data
   */
  type?: 'category';
  /**
   * The category order, including slots with no observation. Values outside this list throw.
   * @defaultValue the order of first appearance in the data
   */
  categories?: readonly string[];
  /** Category labels are shown as they are; `format` is not accepted. */
  format?: never;
}

/**
 * One axis. `axes.x` and `axes.y` exist by default; other keys (`y2`, …) add
 * axes that series name with `xAxis` and `yAxis`.
 *
 * @example
 * ```ts
 * axes: {
 *   x: { type: 'time' },
 *   y: { title: 'Latency', format: { style: 'unit', unit: 'millisecond' } },
 *   y2: { title: 'Errors', format: { suffix: '%' }, position: 'right' },
 * }
 * ```
 */
export type AxisOptions =
  | ValueAxisOptions
  | TimeAxisOptions
  | InferredAxisOptions
  | CategoryAxisOptions;

// ─── Series ──────────────────────────────────────────────────────────

/** A mark type. */
export type SeriesType = 'line' | 'area' | 'band' | 'bar' | 'scatter' | 'histogram';

/**
 * Path shape between points. `monotone` never overshoots; the `step-*` variants place the riser
 * before, after or centred on each point.
 */
export type InterpolationMode =
  | 'linear'
  | 'monotone'
  | 'step-before'
  | 'step-after'
  | 'step-middle';

/**
 * Scatter drawing: individual points, a density map, or points until there are more than 200,000 in
 * view.
 */
export type ScatterRenderMode = 'points' | 'density' | 'auto';

/**
 * A colour for each bar or scatter point, from its value, its row and the row's original index.
 * Called when the layer paints.
 */
export type PointColor<Row> = {
  /** Returns the CSS colour of the point with this value, row and original row index. */
  bivarianceHack(value: number, row: Row | undefined, index: number): string;
}['bivarianceHack'];

/** Options every series shares. */
interface SeriesCommon<Row> {
  /**
   * The series id: the key for `hiddenSeries`, `highlight`, legends and `appendData({ seriesId })`.
   * @defaultValue the `y` field name; required when `y` is a function
   */
  id?: string;
  /** The name shown in the legend and the tooltip. @defaultValue the `y` field name, else the id */
  label?: string;
  /** This series' X, when it differs from the chart's `x`. @defaultValue the chart's `x` */
  x?: Accessor<Row, AxisValue>;
  /**
   * This series' row id, when it differs from the chart's `rowId`.
   * @defaultValue the chart's `rowId`
   */
  rowId?: Accessor<Row, RowId>;
  /** The key of the horizontal axis. @defaultValue `'x'` */
  xAxis?: string;
  /** The key of the vertical axis, such as `'y2'` for a second value axis. @defaultValue `'y'` */
  yAxis?: string;
  /** Stroke width in CSS pixels, for lines and outlines. @defaultValue `1.5` */
  lineWidth?: number;
  /**
   * Opacity from 0 to 1.
   * @defaultValue `1` for lines, `0.75` for bars and histograms, `0.15` for band fills
   */
  opacity?: number;
  /**
   * Marker radius in CSS pixels for scatter points and the cursor's indicators.
   * @defaultValue `3`, or `1.5` above 10,000 points
   */
  pointRadius?: number;
  /**
   * How this series' values are written in readouts, over the axis `format`.
   * @defaultValue the Y axis `format`
   */
  format?: NumberFormat;
}

/** Options of the line-like marks. */
interface PathOptions {
  /** The path shape between points. @defaultValue `'linear'` */
  interpolation?: InterpolationMode;
  /**
   * Bridge gaps (`null`, `undefined`, `NaN`) instead of breaking the path.
   * @defaultValue `false`
   */
  spanGaps?: boolean;
  /**
   * Dash pattern in CSS pixels, as for `setLineDash`: `[6, 3]` dashes, `[2, 2]` dots.
   * @defaultValue solid
   */
  dash?: readonly number[];
}

/** A line, or an area filled to zero. */
export interface LineSeriesOptions<Row> extends SeriesCommon<Row>, PathOptions {
  /** The mark. @defaultValue `'line'` */
  type?: 'line' | 'area';
  /** The value. */
  y: Numeric<Row>;
  /** The series colour: line, legend swatch and tooltip swatch. @defaultValue the next palette colour */
  color?: string;
  /**
   * The area fill colour; `null` draws the outline only. Lines ignore it.
   * @defaultValue a translucent ramp of `color`
   */
  fill?: string | null;
}

/** Bars, one per X value. */
export interface BarSeriesOptions<Row> extends SeriesCommon<Row> {
  /** The mark. */
  type: 'bar';
  /** The value. */
  y: Numeric<Row>;
  /** The series colour, or a colour per bar. @defaultValue the next palette colour */
  color?: string | PointColor<Row>;
}

/** A band between `lower` and `upper` with a centre line at `y`. */
export interface BandSeriesOptions<Row> extends SeriesCommon<Row>, PathOptions {
  /** The mark. */
  type: 'band';
  /** The centre value, used by the tooltip and the cursor. */
  y: Numeric<Row>;
  /** The lower bound. */
  lower: Numeric<Row>;
  /** The upper bound. */
  upper: Numeric<Row>;
  /** The series colour. @defaultValue the next palette colour */
  color?: string;
  /** The band fill; `null` draws the centre line only. @defaultValue `color` at the band opacity */
  fill?: string | null;
}

/** How a colour encoding reads its values. */
export type ColorEncodingType = 'auto' | 'category' | 'continuous' | 'diverging';

/** Colour scatter points by a field. */
export interface ColorEncodingOptions<Row> {
  /** The encoded field: strings are categories, numbers a ramp. */
  field: Accessor<Row, number | string | null | undefined>;
  /**
   * How values map to colours.
   * @defaultValue `'auto'`: strings and few distinct integers are categories, other numbers a ramp
   */
  type?: ColorEncodingType;
  /**
   * The colours (any CSS colour): one per category, or ramp stops.
   * @defaultValue the theme's categorical palette or sequential ramp
   */
  palette?: readonly string[];
  /** The numeric domain of a ramp. @defaultValue the data extent */
  domain?: readonly [number, number];
  /** The name of the field in the tooltip. @defaultValue the field name */
  label?: string;
  /** How the field's value is written in the tooltip. @defaultValue automatic */
  format?: (value: number) => string;
}

/** A colour encoding: a field, or a field with options. */
export type ColorEncoding<Row> =
  | Accessor<Row, number | string | null | undefined>
  | ColorEncodingOptions<Row>;

/** Size scatter points by a numeric field. */
export interface SizeEncodingOptions<Row> {
  /** The encoded field. */
  field: Numeric<Row>;
  /** The radius range in CSS pixels. @defaultValue `[2, 7]` */
  range?: readonly [number, number];
  /** The name of the field in the tooltip. @defaultValue the field name */
  label?: string;
  /** How the field's value is written in the tooltip. @defaultValue automatic */
  format?: (value: number) => string;
}

/** A size encoding: a field, or a field with options. */
export type SizeEncoding<Row> = Numeric<Row> | SizeEncodingOptions<Row>;

/** An extra field shown in a scatter point's tooltip. */
export interface TooltipFieldOptions<Row> {
  /** The field. */
  field: Accessor<Row, number | string | null | undefined>;
  /** The name shown before the value. @defaultValue the field name */
  label?: string;
  /** How the value is written. @defaultValue automatic */
  format?: (value: number) => string;
}

/** A tooltip field: a field, or a field with options. */
export type TooltipField<Row> =
  | Accessor<Row, number | string | null | undefined>
  | TooltipFieldOptions<Row>;

/** Points at (x, y), optionally coloured and sized by other fields. */
export interface ScatterSeriesOptions<Row> extends SeriesCommon<Row> {
  /** The mark. */
  type: 'scatter';
  /** The vertical position. */
  y: Numeric<Row>;
  /** The series colour, or a colour per point. @defaultValue the next palette colour */
  color?: string | PointColor<Row>;
  /** Colour points by a field. @defaultValue the series colour */
  colorBy?: ColorEncoding<Row>;
  /** Size points by a numeric field. @defaultValue `pointRadius` */
  sizeBy?: SizeEncoding<Row>;
  /** Extra fields in the tooltip, in order. @defaultValue none */
  tooltipFields?: readonly TooltipField<Row>[];
  /** Points, a density map, or points until 200,000 are in view. @defaultValue `'auto'` */
  renderMode?: ScatterRenderMode;
}

/** A histogram from {@link histogram} bins. */
export interface HistogramSeriesOptions {
  /** The mark. */
  type: 'histogram';
  /** The series id (a histogram has no field to name it after). */
  id: string;
  /** The bins. */
  data: HistogramBins;
  /** The name shown in the legend and the tooltip. @defaultValue the id */
  label?: string;
  /** The bar colour. @defaultValue the next palette colour */
  color?: string;
  /** Opacity from 0 to 1. @defaultValue `0.75` */
  opacity?: number;
  /** The key of the horizontal axis. @defaultValue `'x'` */
  xAxis?: string;
  /** The key of the vertical axis. @defaultValue `'y'` */
  yAxis?: string;
  /** How counts are written in readouts. @defaultValue the Y axis `format` */
  format?: NumberFormat;
}

/** The marks whose fields are read from rows. */
type FieldSeries<Row> =
  | LineSeriesOptions<Row>
  | BarSeriesOptions<Row>
  | BandSeriesOptions<Row>
  | ScatterSeriesOptions<Row>;

/** Data a series brings itself, instead of the chart's `data`. */
export type SeriesData = readonly object[] | ColumnData;

/**
 * One series. It reads the chart's `data` unless it brings its own; a series
 * with its own `data` names its fields as plain strings or functions of
 * `any` row, so series over different row shapes share one chart.
 *
 * @example
 * ```ts
 * series: [
 *   { y: 'cpu', label: 'CPU' },
 *   { type: 'band', y: 'p50', lower: 'p10', upper: 'p90', label: 'Latency' },
 *   { id: 'baseline', data: lastWeek, y: 'cpu', dash: [4, 3] },
 * ]
 * ```
 */
export type SeriesOptions<Row = Record<string, any>> =
  | (FieldSeries<Row> & {
      /** The chart's `data` is used. */
      data?: undefined;
    })
  | (FieldSeries<any> & {
      /** This series' own rows or columns. */
      data: SeriesData;
    })
  | HistogramSeriesOptions;

// ─── Annotations ─────────────────────────────────────────────────────

/** A horizontal or vertical line at a value of one axis. */
export interface ReferenceLine {
  /** The axis key the value is on, such as `'y'` or `'x'`. */
  axis: string;
  /** The value: a number, a Date, an ISO-8601 string or a category label. */
  value: AxisValue;
  /** A label drawn beside the line. @defaultValue no label */
  label?: string;
  /** The line colour. @defaultValue the theme's muted text colour */
  color?: string;
  /** Dash pattern in CSS pixels. @defaultValue `[4, 4]` */
  dash?: readonly number[];
  /** Stroke width in CSS pixels. @defaultValue `1` */
  lineWidth?: number;
}

/** A shaded span between two values of one axis. */
export interface ReferenceRegion {
  /** The axis key the span is on. */
  axis: string;
  /** The start: a number, a Date, an ISO-8601 string, a category label, or `-Infinity` for an open start. */
  from: AxisValue;
  /** The end: a number, a Date, an ISO-8601 string, a category label, or `Infinity` for an open end. */
  to: AxisValue;
  /** A label drawn in the region. @defaultValue no label */
  label?: string;
  /** The fill colour. @defaultValue the theme's muted text colour */
  color?: string;
  /** Fill opacity from 0 to 1. @defaultValue `0.08` */
  opacity?: number;
}

// ─── Interaction, tooltip, legend, streaming, theme ──────────────────

/** Gestures. Shift+drag pans, Ctrl/⌘+wheel and pinch zoom, a double-click resets. */
export interface InteractionOptions {
  /**
   * The axes wheel, pinch and keyboard zoom change.
   * @defaultValue `'x'`, or `'xy'` when every series is scatter
   */
  zoom?: 'x' | 'xy' | 'none';
  /**
   * What a drag does: `'zoom'` zooms to the dragged box, `'select'` keeps a selection, and
   * `'pan'` makes a one-finger touch drag pan. A mouse pans with Shift+drag in every mode.
   * @defaultValue `'zoom'`
   */
  drag?: 'zoom' | 'select' | 'pan';
  /** Keep zoom and pan inside the data, or let them leave it. @defaultValue `'data'` */
  bounds?: 'data' | 'none';
}

/** The tooltip. */
export interface TooltipOptions<Row> {
  /**
   * `index` lists every series at the nearest X; `nearest` shows the closest point.
   * @defaultValue `'index'`, or `'nearest'` when every series is scatter
   */
  mode?: 'index' | 'nearest';
  /**
   * How far the pointer may be from a point, in CSS pixels, for `nearest` to show it. `Infinity`
   * shows the nearest point wherever the pointer is over the plot. `index` shows wherever the
   * pointer is over the plot's X range, whatever this is.
   * @defaultValue `32` for a mouse or pen, `44` for touch
   */
  distance?: number;
  /**
   * The gap between the pointer and the tooltip, in CSS pixels; on touch the tooltip keeps at
   * least the finger's clearance above it. @defaultValue `12`
   */
  offset?: number;
  /**
   * Render the tooltip yourself. A string is inserted as HTML, so escape untrusted text or return a
   * `Node` built with `textContent`.
   * @defaultValue the built-in tooltip
   */
  render?(points: readonly ChartPoint<Row>[]): string | Node;
}

/** The crosshair and the dots it puts on the series under the pointer (`cursor`). */
export interface CrosshairOptions {
  /**
   * Snap the crosshair to the nearest data X, so it and its dots sit on real samples; `false`
   * follows the pointer exactly. @defaultValue `true`
   */
  snap?: boolean;
  /** A dot on each series' point under the cursor. @defaultValue `true` */
  indicators?: boolean;
  /** The vertical line. @defaultValue `true`, except on charts of bars or histograms only */
  xLine?: boolean;
  /** The horizontal line, at the pointer's height. @defaultValue `false` */
  yLine?: boolean;
}

/** The built-in legend. */
export interface LegendOptions {
  /** Where the legend sits. @defaultValue `'top'` */
  position?: 'top' | 'bottom';
}

/** Streaming with `appendData`. */
export interface StreamingOptions {
  /** Keep at most this many rows per source; older rows are dropped. @defaultValue unbounded */
  maxPoints?: number;
  /**
   * While following the latest data, show the window `[latest − followWindow, latest]` in X units.
   * Panning or zooming X stops following; `resumeFollow()` starts it again.
   * @defaultValue the whole data extent
   */
  followWindow?: number;
}

/**
 * Theme tokens. Any token you leave out comes from CSS variables on the
 * container (`--chart-bg`, `--chart-text`, …), then from the page.
 *
 * @example
 * ```ts
 * theme: { surface: '#fffdf7', categorical: ['#0072b2', '#d55e00'] }
 * ```
 */
export interface ThemeTokens {
  /** Light or dark roles. @defaultValue derived from `surface` */
  mode?: 'light' | 'dark';
  /**
   * The surface the chart sits on (used for contrast, not painted unless you set it).
   * @defaultValue the page behind the chart
   */
  surface?: string;
  /** Titles and strong text. @defaultValue the mode's text colour */
  text?: string;
  /** Axis labels, legend text, gridlines and frame. @defaultValue the mode's muted colour */
  muted?: string;
  /** The crosshair and focus colour. @defaultValue the mode's accent */
  accent?: string;
  /** The series colours, in order. @defaultValue a colour-blind-safe palette for the mode */
  categorical?: readonly string[];
  /**
   * The ramp for continuous colour and density, low to high.
   * @defaultValue a blue ramp for the mode
   */
  sequential?: readonly string[];
  /**
   * The ramp for signed values, negative to positive.
   * @defaultValue a blue–red ramp for the mode
   */
  diverging?: readonly string[];
  /** The font family of all chart text. @defaultValue the system UI font */
  fontFamily?: string;
  /** The axis text size in CSS pixels. @defaultValue `11` */
  fontSize?: number;
}

// ─── Chart options ───────────────────────────────────────────────────

/**
 * A callback option. Declared bivariantly, so a handler written for a narrower row type can be
 * stored in options typed for a wider one.
 */
export type Callback<Value> = {
  /** Receives the new value. */
  bivarianceHack(value: Value): void;
}['bivarianceHack'];

/**
 * Everything a chart draws and how it behaves: one object, the same in
 * vanilla, React and Solid.
 *
 * @example
 * ```ts
 * const chart = createChart(document.getElementById('cpu')!, {
 *   data: rows,                       // [{ time: '2026-03-01T09:00:00Z', cpu: 41.2, mem: 63 }, …]
 *   x: 'time',
 *   series: [{ y: 'cpu', label: 'CPU' }, { y: 'mem', label: 'Memory' }],
 *   axes: { y: { title: 'Utilisation', format: { suffix: '%' } } },
 *   ariaLabel: 'CPU and memory, last 24 hours',
 * });
 * ```
 */
export interface ChartOptions<Row = Record<string, any>> {
  /**
   * The data series read unless they bring their own: rows, typed columns or histogram bins.
   * @defaultValue no data
   */
  data?: DataSource<Row>;
  /**
   * The X of every series: a field name or a function of the row.
   * @defaultValue required unless every series brings its own `x` or bins
   */
  x?: Accessor<NoInfer<Row>, AxisValue>;
  /**
   * A stable id per row, reported on points and checked for uniqueness.
   * @defaultValue no row ids
   */
  rowId?: Accessor<NoInfer<Row>, RowId>;
  /** The series, in paint order. */
  series: readonly SeriesOptions<NoInfer<Row>>[];
  /** Axes by key. `x` and `y` exist by default. @defaultValue inferred from the data */
  axes?: Readonly<Record<string, AxisOptions>>;
  /** Streaming limits for `appendData`. @defaultValue unbounded, following the whole extent */
  streaming?: StreamingOptions;
  /**
   * Lines at fixed values. Those on a vertical axis are in its automatic range. @defaultValue none
   */
  referenceLines?: readonly ReferenceLine[];
  /**
   * Shaded spans between values. The finite ends of those on a vertical axis are in its automatic
   * range. @defaultValue none
   */
  referenceRegions?: readonly ReferenceRegion[];
  /** Plugins, by id. @defaultValue none */
  plugins?: readonly ChartPlugin<NoInfer<Row>>[];
  /** The group this chart links with; `undefined` leaves it. @defaultValue no group */
  group?: ChartGroup;
  /** The chart's accessible name. @defaultValue no name */
  ariaLabel?: string;
  /**
   * The chart height: a number of CSS pixels or a CSS length. Without it the chart fills its
   * container's height.
   * @defaultValue the container's height
   */
  height?: number | string;
  /**
   * Gestures, or `'readonly'` for a tooltip with no navigation.
   * @defaultValue `{ zoom: 'x', drag: 'zoom', bounds: 'data' }`
   */
  interaction?: 'readonly' | InteractionOptions;
  /**
   * The crosshair and point indicators: `false` hides them, `true` or options show them.
   * @defaultValue `true`
   */
  cursor?: boolean | CrosshairOptions;
  /**
   * The highlighted series id; the others dim. `null` highlights none. An id the chart does not
   * have throws.
   * @defaultValue `null`
   */
  highlight?: string | null;
  /** The tooltip: `false` hides it, an object configures it. @defaultValue `true` */
  tooltip?: boolean | TooltipOptions<Row>;
  /**
   * `'auto'` follows the page the chart sits on; `'light'` and `'dark'` pin the roles; tokens
   * override single roles.
   * @defaultValue `'auto'`
   */
  theme?: 'auto' | 'light' | 'dark' | ThemeTokens;
  /** The built-in legend: `'auto'` shows it for two or more series. @defaultValue `'auto'` */
  legend?: boolean | 'auto' | LegendOptions;
  /**
   * The locale of numbers and dates (BCP 47).
   * @defaultValue the page's `lang`, else the runtime's
   */
  locale?: string;
  /**
   * The time zone of time ticks, readouts and ISO-8601 strings without an offset.
   * @defaultValue `'local'`
   */
  timeZone?: 'local' | 'UTC';
  /**
   * The pinned axes. A gesture changes the chart at once and reports through `onViewportChange`.
   * @defaultValue `{}`, every axis automatic
   */
  viewport?: Viewport;
  /** The selection, with `interaction: { drag: 'select' }`. @defaultValue `null` */
  selection?: Selection | null;
  /** The ids of hidden series. An id the chart does not have throws. @defaultValue `[]` */
  hiddenSeries?: readonly string[];
  /** Called with the point a click hits. @defaultValue none */
  onPointClick?: Callback<ChartPoint<Row>>;
  /** Called when the selection changes, with `null` when it is cleared. @defaultValue none */
  onSelectionChange?: Callback<SelectionChange<Row> | null>;
  /** Called when the pinned axes change, with `{}` on a reset. @defaultValue none */
  onViewportChange?: Callback<Viewport>;
  /** Called when series are shown or hidden. @defaultValue none */
  onHiddenSeriesChange?: Callback<readonly string[]>;
  /** Called when the highlighted series changes. @defaultValue none */
  onHighlightChange?: Callback<string | null>;
  /** Called when following the latest data starts or stops. @defaultValue none */
  onFollowingChange?: Callback<boolean>;
  /** Called when the cursor moves or leaves. @defaultValue none */
  onCursorChange?: Callback<CursorSnapshot<Row>>;
}

type OptionPatch<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly unknown[]
    ? T
    : T extends object
      ? { [K in keyof T]?: OptionPatch<T[K]> | undefined }
      : T;

/**
 * A partial update for `chart.update()`. Objects merge; arrays, `data`, `series`, `plugins` and
 * `group` replace; `undefined` resets a key.
 */
export type ChartPatch<Row> = {
  [K in keyof ChartOptions<Row>]?: K extends 'data' | 'series' | 'plugins' | 'group'
    ? ChartOptions<Row>[K]
    : OptionPatch<ChartOptions<Row>[K]>;
};

/** Options of `appendData`. */
export interface AppendOptions {
  /**
   * Append to this series' own source instead of the chart's data.
   * @defaultValue the chart's data
   */
  seriesId?: string;
  /** Replace the last row with the first appended row (a forming bucket). @defaultValue `false` */
  updateLast?: boolean;
}
