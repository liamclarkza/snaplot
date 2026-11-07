import { Accessor as Accessor_2 } from 'solid-js';
import { JSX } from 'solid-js';
import { Ref } from 'solid-js';

/**
 * Reads a value from a row: a field name, or a function of the row and its index in the data you
 * passed. Field names are cheaper: a function's identity is part of the options, so memoise it.
 */
export declare type Accessor<Row, Value> = Field<Row, Value> | RowFunction<Row, Value>;

/** Options of `appendData`. */
export declare interface AppendOptions {
    /**
     * Append to this series' own source instead of the chart's data.
     * @defaultValue the chart's data
     */
    seriesId?: string;
    /** Replace the last row with the first appended row (a forming bucket). @defaultValue `false` */
    updateLast?: boolean;
}

/** Options every axis kind shares. */
declare interface AxisCommon {
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

/** An interval on one axis, as `[from, to]`. Dates are epoch milliseconds. */
export declare type AxisInterval = readonly [from: number | Date, to: number | Date];

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
export declare type AxisOptions = ValueAxisOptions | TimeAxisOptions | InferredAxisOptions | CategoryAxisOptions;

/** The side of the plot an axis sits on. */
export declare type AxisPosition = 'top' | 'bottom' | 'left' | 'right';

/** The kind of an axis. */
export declare type AxisType = 'linear' | 'log' | 'time' | 'category';

/**
 * A value on an axis: a number, a `Date`, an ISO-8601 date string (read as a time) or a category
 * label.
 */
export declare type AxisValue = number | Date | string;

/** A band between `lower` and `upper` with a centre line at `y`. */
export declare interface BandSeriesOptions<Row> extends SeriesCommon<Row>, PathOptions {
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

/** Bars, one per X value. */
export declare interface BarSeriesOptions<Row> extends SeriesCommon<Row> {
    /** The mark. */
    type: 'bar';
    /** The value. */
    y: Numeric<Row>;
    /** The series colour, or a colour per bar. @defaultValue the next palette colour */
    color?: string | PointColor<Row>;
}

/**
 * A callback option. Declared bivariantly, so a handler written for a narrower row type can be
 * stored in options typed for a wider one.
 */
export declare type Callback<Value> = {
    /** Receives the new value. */
    bivarianceHack(value: Value): void;
}['bivarianceHack'];

/** A category axis: one slot per label, in order of first appearance. */
export declare interface CategoryAxisOptions extends AxisCommon {
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
 * A chart. Its props are the same options `createChart` takes, applied with `setOptions` when
 * they change, so inline objects and callbacks cost only what they change.
 */
export declare function Chart<Row = Record<string, any>>(props: ChartProps<Row>): JSX.Element;

/**
 * Event payloads by event name, for `chart.on()`. Each `<key>:change` has a matching
 * `on<Key>Change` option, called with the same value.
 */
export declare interface ChartEvents<Row = Record<string, any>> {
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

/**
 * Charts linked by their `group` option share their cursor, highlight, horizontal viewport and
 * plot edges, and a series id has the same colour in every member. A chart leaves with
 * `update({ group: undefined })` or `destroy()`.
 */
export declare interface ChartGroup {
    /** Move every member's cursor. A value the members' X axis cannot read throws. */
    setCursor(value: number | Date | string | null): void;
    /**
     * Highlight a series in every member. Members without that series clear their highlight; an id
     * no member has throws.
     */
    setHighlight(id: string | null): void;
}

/** What a chart group links. */
export declare interface ChartGroupOptions {
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
export declare interface ChartHandle<Row = Record<string, any>> {
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
    on<K extends keyof ChartEvents<Row>>(event: K, listener: (value: ChartEvents<Row>[K]) => void): () => void;
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
export declare interface ChartOptions<Row = Record<string, any>> {
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
    selection?: Selection_2 | null;
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

/**
 * A partial update for `chart.update()`. Objects merge; arrays, `data`, `series`, `plugins` and
 * `group` replace; `undefined` resets a key.
 */
export declare type ChartPatch<Row> = {
    [K in keyof ChartOptions<Row>]?: K extends 'data' | 'series' | 'plugins' | 'group' ? ChartOptions<Row>[K] : OptionPatch<ChartOptions<Row>[K]>;
};

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
export declare interface ChartPlugin<Row = Record<string, any>> {
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

/** One data point, as tooltips, the cursor and callbacks report it. */
export declare interface ChartPoint<Row = Record<string, any>> {
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

/** One extra tooltip field of a scatter point. */
export declare interface ChartPointField {
    /** The field's label. */
    label: string;
    /** The raw value (a category label for category encodings). */
    value: number | string;
    /** The value as written. */
    formatted: string;
}

/** The props of {@link Chart}: the chart's options, plus the host element's attributes. */
export declare interface ChartProps<Row = Record<string, any>> extends ChartOptions<Row>, HostAttributes {
    /** Class names of the host element. @defaultValue none */
    class?: string;
    /** Inline styles of the host element. @defaultValue full width and height */
    style?: string | JSX.CSSProperties;
    /** Receives the chart handle, and `undefined` on cleanup. */
    ref?: Ref<ChartHandle<Row> | undefined>;
}

/**
 * One axis as `chart.scale(key)` reports it: what plugins map data to pixels with. A snapshot:
 * read it again after the viewport moves.
 */
export declare interface ChartScale {
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
 * The chart's state, as `getState()` reports it: one frozen snapshot per revision. The cursor
 * is not part of it; read it with `getCursor()` or listen to `cursor:change`.
 */
export declare interface ChartState {
    /** Bumped by every data, option or state commit, so a subscriber can tell a change. */
    revision: number;
    /** The pinned axes, as `[from, to]`; `{}` when every axis is automatic. */
    viewport: Viewport;
    /** The selection, or `null`. */
    selection: Selection_2 | null;
    /** The ids of hidden series. */
    hiddenSeries: readonly string[];
    /** The highlighted series id, or `null`. */
    highlight: string | null;
    /** Whether the X viewport follows the latest data. */
    following: boolean;
    /** Every series with its colour, mark and visibility, in paint order. */
    series: readonly SeriesState[];
}

/** A colour encoding: a field, or a field with options. */
export declare type ColorEncoding<Row> = Accessor<Row, number | string | null | undefined> | ColorEncodingOptions<Row>;

/** Colour scatter points by a field. */
export declare interface ColorEncodingOptions<Row> {
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

/** How a colour encoding reads its values. */
export declare type ColorEncodingType = 'auto' | 'category' | 'continuous' | 'diverging';

/**
 * A heatmap's colours: a ramp of the theme (`'sequential'` for magnitudes, `'diverging'` for signed
 * values around zero, `'cyclic'` for phases and angles), or your own stops, low to high.
 */
export declare type ColorMap = 'sequential' | 'diverging' | 'cyclic' | readonly string[];

/** A heatmap's colour scale: a bar of its colours with ticks, beside the plot. */
export declare interface ColorScaleOptions {
    /** The title along the bar: a quantity or a unit. @defaultValue no title */
    title?: string;
    /** The tick values. @defaultValue round values across the domain */
    ticks?: readonly number[];
    /** How tick labels are written. @defaultValue the series `format`, else automatic */
    format?: NumberFormat;
}

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
export declare interface ColumnData {
    /** The columns by field name. */
    readonly columns: Readonly<Record<string, Float64Array>>;
    /**
     * One identifier per row, reported on points as `rowId`. Must be unique.
     * @defaultValue no row ids
     */
    readonly rowIds?: readonly RowId[];
}

/**
 * Link charts: pass the group as each chart's `group` option. Members share their cursor,
 * highlight and horizontal viewport, and align their plot edges; Y stays each chart's own unless
 * `yRange`.
 *
 * @example
 * ```ts
 * const group = createChartGroup();
 * createChart(a, { ...latency, group });
 * createChart(b, { ...errors, group });
 * ```
 */
export declare function createChartGroup(options?: ChartGroupOptions): ChartGroup;

/**
 * A slice of the chart's state as a signal, updated only when the slice changes (by `isEqual`).
 *
 * @example
 * ```tsx
 * const following = createChartState(chart, (state) => state.following);
 * ```
 */
export declare function createChartState<T = ChartState>(chart: MaybeChart<any>, selector?: (state: ChartState) => T, isEqual?: (a: T, b: T) => boolean): Accessor_2<T | undefined>;

/**
 * The values under the cursor, or at a fallback position, as a signal: updated on cursor moves
 * and data commits only.
 */
export declare function createCursor<Row>(chart: MaybeChart<Row>, options?: CursorOptions): Accessor_2<CursorSnapshot<Row> | undefined>;

/** The crosshair and the dots it puts on the series under the pointer (`cursor`). */
export declare interface CrosshairOptions {
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

/** Options of `getCursor()`. */
export declare interface CursorOptions {
    /** What to report when the cursor is not over the chart. @defaultValue `'hide'` */
    fallback?: 'hide' | 'latest' | 'first';
}

/** The values under the cursor, or at a fallback position. */
export declare interface CursorSnapshot<Row = Record<string, any>> {
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

/**
 * What a chart or a series draws: object rows (sorted by X for you), named typed columns (already
 * sorted, used without copying) or histogram bins.
 */
export declare type DataSource<Row> = readonly Row[] | ColumnData | HistogramBins;

/** How times are written: a function of epoch milliseconds, or `Intl.DateTimeFormat` options. */
export declare type DateFormat = ((value: number) => string) | Intl.DateTimeFormatOptions;

/**
 * A property of `Row` whose values are assignable to `Value`. For rows typed as a plain record, any
 * string is accepted.
 */
export declare type Field<Row, Value> = Extract<keyof {
    [K in keyof Row as NonNullable<Row[K]> extends Value ? K : unknown extends Row[K] ? K : never]: 0;
}, string>;

/** The marks whose fields are read from rows. */
declare type FieldSeries<Row> = LineSeriesOptions<Row> | BarSeriesOptions<Row> | BandSeriesOptions<Row> | ScatterSeriesOptions<Row> | HeatmapSeriesOptions<Row>;

/**
 * The cells along one axis of a heatmap: a regular step from the first cell's centre, the cells'
 * centres, or their edges. Dates are read as epoch milliseconds.
 *
 * Cells given by centres reach half way to their neighbours; a step more than 1.75 times the
 * steps beside it is a gap, drawn empty rather than bridged by stretched cells.
 *
 * @example
 * ```ts
 * { start: 2404, step: 1, count: 75 } // 2404, 2405, … 2478 MHz
 * { centers: [0.5, 1, 2, 4, 8] }       // irregular centres
 * { edges: [0, 10, 20, 50, 100] }      // four cells between five edges
 * ```
 */
export declare type HeatmapBins = {
    /** The centre of the first cell. */
    start: number | Date;
    /** The distance between centres, which is each cell's width. */
    step: number;
    /** The number of cells. */
    count: number;
} | {
    /** Each cell's centre, ascending. */
    centers: ArrayLike<number | Date>;
} | {
    /** The cells' edges, ascending: one more than there are cells. */
    edges: ArrayLike<number | Date>;
};

/** Options every heatmap shares, however it reads its values. */
declare interface HeatmapCommon {
    /** The name shown in the tooltip. @defaultValue the `values` field name, else the id */
    label?: string;
    /** The key of the horizontal axis. @defaultValue `'x'` */
    xAxis?: string;
    /** The key of the vertical axis. @defaultValue `'y'` */
    yAxis?: string;
    /** The colours values map to. @defaultValue `'sequential'` */
    colors?: ColorMap;
    /**
     * The values at the low and high ends of the colours.
     * @defaultValue the extent of the values, symmetric about zero for `'diverging'`
     */
    domain?: readonly [number, number];
    /**
     * Values past the domain take the end colours; `false` leaves them undrawn. `'cyclic'` colours
     * wrap instead, as an angle does.
     * @defaultValue `true`
     */
    clamp?: boolean;
    /**
     * The colour of an empty cell: a `null`, `undefined` or `NaN` value, such as a channel that was
     * never measured. A cell that is not in the grid at all is not drawn.
     * @defaultValue a faint tint of the theme's muted colour
     */
    emptyColor?: string;
    /** The colour scale beside the plot: `false` hides it. @defaultValue `true` */
    colorScale?: boolean | ColorScaleOptions;
    /** Opacity from 0 to 1. @defaultValue `1` */
    opacity?: number;
    /** How values are written in the tooltip and the colour scale. @defaultValue automatic */
    format?: NumberFormat;
}

/**
 * A grid of values for a heatmap, as {@link histogram2d} returns it: the cells along X and Y and
 * one value per cell, row by row from the lowest Y. `null` and `NaN` are empty cells.
 */
export declare interface HeatmapGrid {
    /** The cells along X. */
    x: HeatmapBins;
    /** The cells along Y. */
    y: HeatmapBins;
    /** One value per cell: the cell in X column `i` and Y row `j` at `j × (X cells) + i`. */
    values: ArrayLike<number | null>;
}

/** A heatmap of a {@link HeatmapGrid}: a 2D histogram from {@link histogram2d}, or any matrix. */
export declare interface HeatmapGridSeriesOptions extends HeatmapCommon {
    /** The mark. */
    type: 'heatmap';
    /** The series id (a grid has no field to name it after). */
    id: string;
    /** The grid. */
    data: HeatmapGrid;
    /** A grid holds its own cells. */
    values?: undefined;
    /** A grid holds its own cells. */
    bins?: undefined;
}

/**
 * A heatmap whose rows each hold a line of cells: a spectrogram, a waterfall. Each row's `values`
 * fill the cells across `bins`; the row's position runs along X (the chart's `x`, each row a column
 * of cells) or, with `y`, up the plot (each row a row of cells). `appendData` adds rows, and
 * `streaming.maxPoints` keeps the latest.
 *
 * @example
 * ```ts
 * // A waterfall: one row of 75 channels per procedure, newest at the top.
 * { type: 'heatmap', y: 'time', values: 'magnitude', bins: { start: 2404, step: 1, count: 75 } }
 * // A spectrogram: one column of frequency bins per frame.
 * { type: 'heatmap', values: 'power', bins: { start: 0, step: 43.07, count: 512 } }
 * ```
 */
export declare interface HeatmapSeriesOptions<Row> extends HeatmapCommon {
    /** The mark. */
    type: 'heatmap';
    /**
     * The series id. @defaultValue the `values` field name; required when `values` is a function
     */
    id?: string;
    /**
     * Each row's cells, in the order of `bins`: an array or typed array. `null`, `undefined` and
     * `NaN` are empty cells; a short array leaves its last cells empty.
     */
    values: Accessor<Row, ArrayLike<number | null | undefined> | null | undefined>;
    /** The cells across each row. */
    bins: HeatmapBins;
    /** Each row's horizontal position, when it differs from the chart's `x`. @defaultValue the chart's `x` */
    x?: Accessor<Row, AxisValue>;
    /**
     * Each row's vertical position: the rows run up the plot and the bins across it, as in a
     * waterfall. @defaultValue the rows run along X
     */
    y?: Accessor<Row, AxisValue>;
    /** This series' row id, when it differs from the chart's `rowId`. @defaultValue the chart's `rowId` */
    rowId?: Accessor<Row, RowId>;
}

/**
 * Count values into bins for a histogram series.
 *
 * @example
 * ```ts
 * const before = histogram(latencyBefore);
 * const after = histogram(latencyAfter, { thresholds: before.edges });
 * createChart(element, {
 *   series: [
 *     { id: 'before', type: 'histogram', data: before },
 *     { id: 'after', type: 'histogram', data: after },
 *   ],
 * });
 * ```
 */
export declare function histogram(values: Float64Array | readonly number[], options?: HistogramOptions): HistogramBins;

/** A 2D histogram: the grid a heatmap draws, and its largest count. */
export declare interface Histogram2d extends HeatmapGrid {
    /** The cells along X. */
    x: {
        /** The cells' edges, ascending: one more than there are cells. */
        edges: Float64Array;
    };
    /** The cells along Y. */
    y: {
        /** The cells' edges, ascending: one more than there are cells. */
        edges: Float64Array;
    };
    /** The count of each cell: X column `i`, Y row `j` at `j × (X cells) + i`. */
    values: Float64Array;
    /** The largest count. */
    maxCount: number;
}

/**
 * Count (x, y) pairs into a grid for a heatmap series.
 *
 * @example
 * ```ts
 * createChart(element, {
 *   series: [{ type: 'heatmap', id: 'density', data: histogram2d(durations, sizes) }],
 * });
 * ```
 */
export declare function histogram2d(x: Float64Array | readonly number[], y: Float64Array | readonly number[], options?: Histogram2dOptions): Histogram2d;

/** Options of {@link histogram2d}. */
export declare interface Histogram2dOptions {
    /**
     * Bins per axis: a count from 1 to 10,000 or a rule for both, or `[x, y]`. An automatic count
     * is capped at 200 per axis.
     * @defaultValue `'freedman-diaconis'` on each axis
     */
    bins?: number | HistogramRule | readonly [number | HistogramRule, number | HistogramRule];
    /** Explicit X edges, strictly increasing; not combined with an X bin count. @defaultValue from `bins` */
    xThresholds?: ArrayLike<number>;
    /** Explicit Y edges, strictly increasing; not combined with a Y bin count. @defaultValue from `bins` */
    yThresholds?: ArrayLike<number>;
}

/**
 * Histogram bins: `edges.length === counts.length + 1`, edges strictly increasing. {@link
 * histogram} computes them from raw values.
 */
export declare interface HistogramBins {
    /** Bin edges; bin `i` spans `[edges[i], edges[i + 1])`, and the last bin includes its upper edge. */
    edges: Float64Array;
    /** The number of values in each bin. */
    counts: Float64Array;
    /** The largest count. */
    maxCount: number;
}

/** Options of {@link histogram}. */
export declare interface HistogramOptions {
    /**
     * A bin count from 1 to 10,000, or the rule that picks one (capped at 1,000 bins on nice edges).
     * @defaultValue `'freedman-diaconis'`
     */
    bins?: number | HistogramRule;
    /**
     * Explicit edges, strictly increasing: pass one histogram's `edges` to bin another dataset the
     * same way. Values outside the first and last edge are not counted. Not combined with `bins`.
     * @defaultValue computed from `bins`
     */
    thresholds?: ArrayLike<number>;
}

/** The rules that pick an automatic bin count. */
export declare type HistogramRule = 'freedman-diaconis' | 'sturges' | 'scott';

/** A histogram from {@link histogram} bins. */
export declare interface HistogramSeriesOptions {
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

/**
 * Attributes of the host element that a chart component passes through, with any `data-*`
 * attribute (JSX accepts those on components without declaring them).
 */
export declare interface HostAttributes extends Omit<JSX.HTMLAttributes<HTMLDivElement>, 'ref' | 'children' | 'style' | 'innerHTML' | 'innerText' | 'textContent' | keyof ChartOptions> {
    /** The host element's id. @defaultValue none */
    id?: string;
    /** The host's accessible name. @defaultValue `ariaLabel`, else a summary of the series */
    'aria-label'?: string;
    /** Ids of elements that describe the chart. @defaultValue none */
    'aria-describedby'?: string;
    /** Ids of elements that name the chart. @defaultValue none */
    'aria-labelledby'?: string;
}

/** An axis whose type is inferred from the data. */
export declare interface InferredAxisOptions extends AxisCommon {
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

/** Gestures. Shift+drag pans, Ctrl/⌘+wheel and pinch zoom, a double-click resets. */
export declare interface InteractionOptions {
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

/**
 * Path shape between points. `monotone` never overshoots; the `step-*` variants place the riser
 * before, after or centred on each point.
 */
export declare type InterpolationMode = 'linear' | 'monotone' | 'step-before' | 'step-after' | 'step-middle';

/** The built-in legend. */
export declare interface LegendOptions {
    /** Where the legend sits. @defaultValue `'top'` */
    position?: 'top' | 'bottom';
}

/** A table of each series' value at the cursor: `createLegendTable` as a component. */
export declare function LegendTable<Row = Record<string, any>>(props: LegendTableProps<Row>): JSX.Element;

/**
 * One column of a legend table: the series' swatch, its name, its value at the cursor, or your
 * own text from the point and the series.
 *
 * @example
 * ```ts
 * columns: ['swatch', 'name', 'value', { header: 'LR', value: (point) => String(point?.row?.lr ?? '') }]
 * ```
 */
export declare type LegendTableColumn<Row = Record<string, any>> = 'swatch' | 'name' | 'value' | {
    /** The header text. */
    header: string;
    /**
     * The cell of one series: `point` is its value at the cursor (or the fallback). Text, or a
     * node (a button, a link); a node equal to the one shown is kept, so focus inside it stays.
     */
    value(point: ChartPoint<Row> | undefined, series: SeriesState): string | Node;
    /** Text alignment. @defaultValue `'left'` */
    align?: 'left' | 'right' | 'center';
};

/** What {@link createLegendTable} returns. */
export declare interface LegendTableHandle<Row = Record<string, any>> {
    /** Change the columns, the fallback or the chart. */
    update(options: Partial<LegendTableOptions<Row>>): void;
    /** Remove the table. */
    destroy(): void;
}

/** Options of {@link createLegendTable}. */
export declare interface LegendTableOptions<Row = Record<string, any>> {
    /** The chart the table reads. */
    chart: ChartHandle<Row>;
    /** The columns, in order. @defaultValue `['swatch', 'name', 'value']` */
    columns?: readonly LegendTableColumn<Row>[];
    /**
     * What the values show when the cursor is not over the chart: the latest or first data, or
     * nothing (the table is then hidden).
     * @defaultValue `'latest'`
     */
    fallback?: 'latest' | 'first' | 'hide';
}

/** The props of {@link LegendTable}: the vanilla options, plus the host's class and style. */
export declare interface LegendTableProps<Row = Record<string, any>> extends Omit<LegendTableOptions<Row>, 'chart'> {
    /** The chart the table reads: a handle, an accessor of one, or nothing yet. */
    chart: MaybeChart<Row>;
    /** Class names of the host element. @defaultValue none */
    class?: string;
    /** Inline styles of the host element. @defaultValue none */
    style?: string | JSX.CSSProperties;
}

/** A line, or an area filled to zero. */
export declare interface LineSeriesOptions<Row> extends SeriesCommon<Row>, PathOptions {
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

/** A chart handle, an accessor of one, or nothing yet. */
export declare type MaybeChart<Row> = ChartHandle<Row> | Accessor_2<ChartHandle<Row> | null | undefined> | null | undefined;

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
export declare type NumberFormat = ((value: number) => string) | NumberFormatOptions;

/** `Intl.NumberFormat` options plus text placed before and after the number. */
export declare type NumberFormatOptions = Intl.NumberFormatOptions & {
    /** Text before the formatted number, such as `'$'`. @defaultValue `''` */
    prefix?: string;
    /**
     * Text after the formatted number, such as `'%'` for data that is already in percent (`style:
     * 'percent'` multiplies by 100).
     * @defaultValue `''`
     */
    suffix?: string;
};

/** A numeric value of a row. `null`, `undefined` and `NaN` are gaps. */
declare type Numeric<Row> = Accessor<Row, number | null | undefined>;

declare type OptionPatch<T> = T extends (...args: never[]) => unknown ? T : T extends readonly unknown[] ? T : T extends object ? {
    [K in keyof T]?: OptionPatch<T[K]> | undefined;
} : T;

/** Options of the line-like marks. */
declare interface PathOptions {
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

/** A rectangle in CSS pixels, from the top-left corner of the chart's canvases. */
export declare interface PixelRect {
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
 * A colour for each bar or scatter point, from its value, its row and the row's original index.
 * Called when the layer paints.
 */
export declare type PointColor<Row> = {
    /** Returns the CSS colour of the point with this value, row and original row index. */
    bivarianceHack(value: number, row: Row | undefined, index: number): string;
}['bivarianceHack'];

/** A horizontal or vertical line at a value of one axis. */
export declare interface ReferenceLine {
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
export declare interface ReferenceRegion {
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

/**
 * A function of a row and its original index in the data you passed. Declared bivariantly, so a
 * function written for a narrower row type can be stored in options typed for a wider one.
 */
export declare type RowFunction<Row, Value> = {
    /** Reads the value of `row`; `index` is its index in the data you passed. */
    bivarianceHack(row: Row, index: number): Value;
}['bivarianceHack'];

/** A stable identifier for a row, kept through sorting and streaming. */
export declare type RowId = string | number;

/** A closed data-space interval. */
export declare interface ScaleRange {
    /** The lower bound, in data units. */
    min: number;
    /** The upper bound, in data units. */
    max: number;
}

/**
 * Scatter drawing: individual points, a density map, or points until there are more than 200,000 in
 * view.
 */
export declare type ScatterRenderMode = 'points' | 'density' | 'auto';

/** Points at (x, y), optionally coloured and sized by other fields. */
export declare interface ScatterSeriesOptions<Row> extends SeriesCommon<Row> {
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

/** A selection made with `interaction: { drag: 'select' }`. */
declare interface Selection_2 {
    /** The selected X interval. */
    readonly x: AxisInterval;
    /** The selected Y interval, for a two-axis selection. @defaultValue the whole Y range */
    readonly y?: AxisInterval;
}
export { Selection_2 as Selection }

/** A selection as reported to `onSelectionChange`, with the points inside it. */
export declare interface SelectionChange<Row = Record<string, any>> extends Selection_2 {
    /** The scatter points inside a two-axis selection. */
    readonly points?: readonly ChartPoint<Row>[];
}

/** Options every series shares. */
declare interface SeriesCommon<Row> {
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

/** Data a series brings itself, instead of the chart's `data`. */
export declare type SeriesData = readonly object[] | ColumnData;

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
export declare type SeriesOptions<Row = Record<string, any>> = (FieldSeries<Row> & {
    /** The chart's `data` is used. */
    data?: undefined;
}) | (FieldSeries<any> & {
    /** This series' own rows or columns. */
    data: SeriesData;
}) | HistogramSeriesOptions | HeatmapGridSeriesOptions;

/** One series with its colour, mark and visibility: what a legend draws. */
export declare interface SeriesState {
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

/** A mark type. */
export declare type SeriesType = 'line' | 'area' | 'band' | 'bar' | 'scatter' | 'histogram' | 'heatmap';

/** A size encoding: a field, or a field with options. */
export declare type SizeEncoding<Row> = Numeric<Row> | SizeEncodingOptions<Row>;

/** Size scatter points by a numeric field. */
export declare interface SizeEncodingOptions<Row> {
    /** The encoded field. */
    field: Numeric<Row>;
    /** The radius range in CSS pixels. @defaultValue `[2, 7]` */
    range?: readonly [number, number];
    /** The name of the field in the tooltip. @defaultValue the field name */
    label?: string;
    /** How the field's value is written in the tooltip. @defaultValue automatic */
    format?: (value: number) => string;
}

/** Streaming with `appendData`. */
export declare interface StreamingOptions {
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
export declare interface ThemeTokens {
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
    /**
     * The ramp for cyclic values (phases, angles, times of day): its last stop runs back into its
     * first. @defaultValue a hue wheel of even lightness for the mode
     */
    cyclic?: readonly string[];
    /** The font family of all chart text. @defaultValue the system UI font */
    fontFamily?: string;
    /** The axis text size in CSS pixels. @defaultValue `11` */
    fontSize?: number;
}

/** A time axis: epoch milliseconds, Dates or ISO-8601 strings. */
export declare interface TimeAxisOptions extends AxisCommon {
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

/** A tooltip field: a field, or a field with options. */
export declare type TooltipField<Row> = Accessor<Row, number | string | null | undefined> | TooltipFieldOptions<Row>;

/** An extra field shown in a scatter point's tooltip. */
export declare interface TooltipFieldOptions<Row> {
    /** The field. */
    field: Accessor<Row, number | string | null | undefined>;
    /** The name shown before the value. @defaultValue the field name */
    label?: string;
    /** How the value is written. @defaultValue automatic */
    format?: (value: number) => string;
}

/** The tooltip. */
export declare interface TooltipOptions<Row> {
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

/** A numeric axis: linear or logarithmic. */
export declare interface ValueAxisOptions extends AxisCommon {
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

/**
 * The pinned axes of the viewport. An axis that is not named stays automatic; `{}` means every axis
 * is automatic.
 */
export declare type Viewport = Readonly<Partial<Record<string, AxisInterval>>>;

export { }
