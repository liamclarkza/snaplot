import { CSSProperties } from 'react';
import { ReactElement } from 'react';
import { ReactNode } from 'react';
import { Ref } from 'react';

/**
 * Reads a value from a row: a field name, or a function of the row and its index in the data you
 * passed. Field names are cheaper: a function's identity is part of the options, so memoise it.
 */
declare type Accessor<Row, Value> = Field<Row, Value> | RowFunction<Row, Value>;

/** Options of `appendData`. */
declare interface AppendOptions {
    /**
     * Append to this series' own source instead of the chart's data.
     * @defaultValue the chart's data
     */
    seriesId?: string;
    /** Replace the last row with the first appended row (a forming bucket). @defaultValue `false` */
    updateLast?: boolean;
}

/** Where an axis is drawn. */
declare interface AxisArea {
    /** The side of the plot. */
    position: AxisPosition;
    /** The rectangle of its labels and title. */
    area: PixelRect;
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
     * Round automatic bounds out to tick steps.
     * @defaultValue `true` for value axes, `false` for the X of line, area and band series
     */
    nice?: boolean;
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
declare type AxisInterval = readonly [from: number | Date, to: number | Date];

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
declare type AxisOptions = ValueAxisOptions | TimeAxisOptions | InferredAxisOptions | CategoryAxisOptions;

/** The side of the plot an axis sits on. */
declare type AxisPosition = 'top' | 'bottom' | 'left' | 'right';

/** An axis' kind and current range, as `getAxis()` reports it. */
declare interface AxisState extends ScaleRange {
    /** The axis kind. */
    type: AxisType;
}

/** The kind of an axis. */
declare type AxisType = 'linear' | 'log' | 'time' | 'category';

/**
 * A value on an axis: a number, a `Date`, an ISO-8601 date string (read as a time) or a category
 * label.
 */
declare type AxisValue = number | Date | string;

/** A band between `lower` and `upper` with a centre line at `y`. */
declare interface BandSeriesOptions<Row> extends SeriesCommon<Row>, PathOptions {
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
declare interface BarSeriesOptions<Row> extends SeriesCommon<Row> {
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
declare type Callback<Value> = {
    /** Receives the new value. */
    bivarianceHack(value: Value): void;
}['bivarianceHack'];

/** A category axis: one slot per label, in order of first appearance. */
declare interface CategoryAxisOptions extends AxisCommon {
    /** The scale. Inferred for string values that are not ISO-8601 dates. */
    type?: 'category';
    /**
     * The category order, including slots with no observation. Values outside this list throw.
     * @defaultValue the order of first appearance in the data
     */
    categories?: readonly string[];
    /** Category labels are shown as they are; `format` is not accepted. */
    format?: never;
}

/** Native React 19 component. Options are direct props; the ref exposes the imperative handle. */
export declare function Chart<Row = Record<string, any>>(props: ChartProps<Row>): ReactElement;

/** Controlled values are authoritative; defaults are applied only at mount. */
export declare interface ChartControls {
    /** The host's accessible name. @defaultValue `ariaLabel`, else `'Chart'` */
    'aria-label'?: string;
    /** Ids of elements that describe the chart. @defaultValue none */
    'aria-describedby'?: string;
    /** Ids of elements that name the chart. @defaultValue none */
    'aria-labelledby'?: string;
    /** Controlled axis ranges: gestures propose changes through `onViewportChange`. @defaultValue uncontrolled */
    viewport?: ViewportRanges;
    /** Axis ranges applied once at mount. @defaultValue automatic */
    defaultViewport?: ViewportRanges;
    /** Called with proposed axis ranges. */
    onViewportChange?: (viewport: ViewportRanges) => void;
    /** The controlled selection. @defaultValue uncontrolled */
    selectionState?: SelectionRange | null;
    /** A selection applied once at mount. @defaultValue none */
    defaultSelection?: SelectionRange | null;
    /** Called with a proposed selection. */
    onSelectionChange?: (selection: SelectionRange | null) => void;
    /** The controlled hidden series ids. @defaultValue uncontrolled */
    hiddenSeries?: readonly string[];
    /** Series hidden once at mount. @defaultValue none */
    defaultHiddenSeries?: readonly string[];
    /** Called with proposed hidden series ids. */
    onHiddenSeriesChange?: (ids: readonly string[]) => void;
}

/** Event payloads by event name, for `chart.on()`. */
declare interface ChartEvents<Row = Record<string, any>> {
    /** Any state changed. */
    'state:change': ChartState<Row>;
    /** The cursor moved or left. */
    'cursor:change': CursorSnapshot<Row>;
    /** An axis range changed. */
    'viewport:change': ViewportRanges;
    /** The persistent selection changed. */
    'selection:change': SelectionRange | null;
    /** Series were shown or hidden. */
    'visibility:change': readonly string[];
    /** The highlighted series changed. */
    'highlight:change': string | null;
    /** Following the latest data started or stopped. */
    'follow:change': boolean;
    /** A point was clicked. */
    'point:click': ChartPoint<Row>;
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

/** Charts linked by `group` share their cursor, highlight and, optionally, X viewport. */
export declare interface ChartGroup {
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

/** Charts linked by `group` share their cursor, highlight and, optionally, X viewport. */
declare interface ChartGroup_2 {
    /** The options the group was created with. */
    readonly options: Readonly<ChartGroupOptions_2>;
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

/** What a chart group links. */
export declare interface ChartGroupOptions {
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

/** What a chart group links. */
declare interface ChartGroupOptions_2 {
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
    /** Apply a partial update. */
    update(patch: ChartPatch<Row>): void;
    /** Append rows or columns to the chart's data, or to one series' own source. */
    appendData(data: DataSource<Row>, options?: AppendOptions): void;
    /** The options as last applied. */
    getOptions(): Readonly<ChartOptions<Row>>;
    /** The current state. */
    getState(): ChartState<Row>;
    /** Called after any state change; returns the unsubscribe function. */
    subscribe(listener: () => void): () => void;
    /** Listen to one event; returns the unsubscribe function. */
    on<K extends keyof ChartEvents<Row>>(event: K, listener: (value: ChartEvents<Row>[K]) => void): () => void;
    /** Set axis ranges by key. */
    setViewport(viewport: ViewportRanges): void;
    /** Return every axis to its automatic range. */
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
    /** One entry per series. */
    getLegendItems(): LegendItem[];
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
    /** Lines at fixed values. @defaultValue none */
    referenceLines?: readonly ReferenceLine[];
    /** Shaded spans between values. @defaultValue none */
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
    /** Show the crosshair and point indicators. @defaultValue `true` */
    cursor?: boolean;
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
    /** Called with the point a click hits. */
    onPointClick?: Callback<ChartPoint<Row>>;
    /** Called when the selection changes, with `null` when it is cleared. */
    onSelectionChange?: Callback<SelectionChange<Row> | null>;
    /** Called when the pinned axes change, with `{}` on a reset. */
    onViewportChange?: Callback<Viewport>;
    /** Called when series are shown or hidden. */
    onHiddenSeriesChange?: Callback<readonly string[]>;
    /** Called when the highlighted series changes. */
    onHighlightChange?: Callback<string | null>;
    /** Called when following the latest data starts or stops. */
    onFollowingChange?: Callback<boolean>;
    /** Called when the cursor moves or leaves. */
    onCursorChange?: Callback<CursorSnapshot<Row>>;
}

/**
 * A partial update for `chart.update()`. Objects merge; arrays, `data`, `series`, `plugins` and
 * `group` replace; `undefined` resets a key.
 */
declare type ChartPatch<Row> = {
    [K in keyof ChartOptions<Row>]?: K extends 'data' | 'series' | 'plugins' | 'group' ? ChartOptions<Row>[K] : OptionPatch<ChartOptions<Row>[K]>;
};

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
declare interface ChartPlugin<Row = Record<string, any>> {
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

/** One data point, as tooltips, the cursor and callbacks report it. */
declare interface ChartPoint_2<Row = Record<string, any>> {
    /** The series id. */
    seriesId: string;
    /** The series label. */
    label: string;
    /** The original row, for row data. */
    row?: Row;
    /** The row's index in the data you passed (before sorting), or among appended rows. */
    rowIndex: number;
    /** The row id, when the data has one. */
    rowId?: RowId_2;
    /** The X value: a number (epoch milliseconds on time axes) or a category label. */
    x: number | string;
    /** The bin interval of a histogram point. */
    xRange?: ScaleRange_2;
    /** The value. */
    y: number;
    /** The marker radius of a scatter point in CSS pixels. */
    radius?: number;
    /** Extra scatter fields from `tooltipFields`, `colorBy` and `sizeBy`. */
    fields?: readonly ChartPointField_2[];
    /** The X value as written. */
    formattedX: string;
    /** The value as written. */
    formattedY: string;
    /** The point's colour. */
    color: string;
}

/** One extra tooltip field of a scatter point. */
declare interface ChartPointField {
    /** The field's label. */
    label: string;
    /** The raw value (a category label for category encodings). */
    value: number | string;
    /** The value as written. */
    formatted: string;
}

/** One extra tooltip field of a scatter point. */
declare interface ChartPointField_2 {
    /** The field's label. */
    label: string;
    /** The raw value (a category label for category encodings). */
    value: number | string;
    /** The value as written. */
    formatted: string;
}

export declare interface ChartProps<Row = Record<string, any>> extends Omit<ChartOptions<Row>, ControlledOptionKeys>, ChartControls {
    /** Class names of the host element. @defaultValue none */
    className?: string;
    /** Inline styles of the host element. @defaultValue full width and height */
    style?: CSSProperties;
    /** Receives the chart handle. */
    ref?: Ref<ChartHandle<Row>>;
    /** Called once with the chart handle after mount. */
    onReady?: (chart: ChartHandle<Row>) => void;
}

/** The chart's state, as `getState()` reports it. */
export declare interface ChartState<Row = Record<string, any>> {
    /** The current range of every axis. */
    viewport: ViewportRanges;
    /** The persistent selection, or `null`. */
    selection: SelectionRange | null;
    /** The ids of hidden series. */
    hiddenSeries: readonly string[];
    /** The highlighted series id, or `null`. */
    highlightedSeries: string | null;
    /** Whether the X viewport follows the latest data. */
    following: boolean;
    /** The values under the cursor. */
    cursor: CursorSnapshot<Row>;
}

/** The chart's state, as `getState()` reports it. */
declare interface ChartState_2<Row = Record<string, any>> {
    /** The current range of every axis. */
    viewport: ViewportRanges_2;
    /** The persistent selection, or `null`. */
    selection: SelectionRange_2 | null;
    /** The ids of hidden series. */
    hiddenSeries: readonly string[];
    /** The highlighted series id, or `null`. */
    highlightedSeries: string | null;
    /** Whether the X viewport follows the latest data. */
    following: boolean;
    /** The values under the cursor. */
    cursor: CursorSnapshot_2<Row>;
}

/** Paint counters, for diagnostics. */
declare interface ChartStats {
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

/** A colour encoding: a field, or a field with options. */
declare type ColorEncoding<Row> = Accessor<Row, number | string | null | undefined> | ColorEncodingOptions<Row>;

/** Colour scatter points by a field. */
declare interface ColorEncodingOptions<Row> {
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
declare type ColorEncodingType = 'auto' | 'category' | 'continuous' | 'diverging';

/** Declares a custom column. */
export declare function column<Row>(spec: LegendTableColumn<Row>): LegendTableColumn<Row>;

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
declare interface ColumnData {
    /** The columns by field name. */
    readonly columns: Readonly<Record<string, Float64Array>>;
    /**
     * One identifier per row, reported on points as `rowId`. Must be unique.
     * @defaultValue no row ids
     */
    readonly rowIds?: readonly RowId[];
}

/**
 * Options the framework components take as controlled props instead (see
 * {@link ChartControls}).
 */
declare type ControlledOptionKeys = 'viewport' | 'selection' | 'hiddenSeries' | 'onViewportChange' | 'onSelectionChange' | 'onHiddenSeriesChange';

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

/** The values under the cursor, or at a fallback position. */
declare interface CursorSnapshot_2<Row = Record<string, any>> {
    /** The X position, or `null` when there is none. */
    x: number | string | null;
    /** The X position as written. */
    formattedX: string;
    /** One point per visible series. */
    points: readonly ChartPoint_2<Row>[];
    /** What produced the snapshot. */
    source: 'cursor' | 'latest' | 'first' | 'none';
    /** The series closest to the pointer, or `null`. */
    activeSeriesId: string | null;
}

/** Options of `getCursorSnapshot()`. */
declare interface CursorSnapshotOptions {
    /** What to report when the cursor is not over the chart. @defaultValue `'hide'` */
    fallback?: 'hide' | 'latest' | 'first';
}

/**
 * What a chart or a series draws: object rows (sorted by X for you), named typed columns (already
 * sorted, used without copying) or histogram bins.
 */
declare type DataSource<Row> = readonly Row[] | ColumnData | HistogramBins;

/** How times are written: a function of epoch milliseconds, or `Intl.DateTimeFormat` options. */
declare type DateFormat = ((value: number) => string) | Intl.DateTimeFormatOptions;

/**
 * A property of `Row` whose values are assignable to `Value`. For rows typed as a plain record, any
 * string is accepted.
 */
declare type Field<Row, Value> = Extract<keyof {
    [K in keyof Row as NonNullable<Row[K]> extends Value ? K : unknown extends Row[K] ? K : never]: 0;
}, string>;

/** The marks whose fields are read from rows. */
declare type FieldSeries<Row> = LineSeriesOptions<Row> | BarSeriesOptions<Row> | BandSeriesOptions<Row> | ScatterSeriesOptions<Row>;

/**
 * Histogram bins: `edges.length === counts.length + 1`, edges strictly increasing. {@link
 * histogram} computes them from raw values.
 */
declare interface HistogramBins {
    /** Bin edges; bin `i` spans `[edges[i], edges[i + 1])`, and the last bin includes its upper edge. */
    edges: Float64Array;
    /** The number of values in each bin. */
    counts: Float64Array;
    /** The largest count. */
    maxCount: number;
}

/** A histogram from {@link histogram} bins. */
declare interface HistogramSeriesOptions {
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

/** An axis whose type is inferred from the data. */
declare interface InferredAxisOptions extends AxisCommon {
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
declare interface InteractionOptions {
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
declare type InterpolationMode = 'linear' | 'monotone' | 'step-before' | 'step-after' | 'step-middle';

/** One number per canvas layer. */
declare interface LayerCounts {
    /** The grid layer: gridlines, axes and frame. */
    grid: number;
    /** The data layer: the marks. */
    data: number;
    /** The overlay: crosshair, indicators and selection. */
    overlay: number;
}

/** The rectangle the data is drawn in, and the axis areas, in CSS pixels. */
declare interface Layout {
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

/** A legend entry for one series. */
declare interface LegendItem {
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
    lineDash: number[];
    /** The series opacity. */
    opacity: number;
}

/** The built-in legend. */
declare interface LegendOptions {
    /** Where the legend sits. @defaultValue `'top'` */
    position?: 'top' | 'bottom';
}

/** A table of each series' value at the cursor. */
export declare function LegendTable<Row>(props: LegendTableProps<Row>): ReactNode;

/** One column of {@link LegendTable}. */
export declare interface LegendTableColumn<Row> {
    /** A stable key for the column. */
    key: string;
    /** The header text. */
    header: string;
    /** Text alignment. @defaultValue `'left'` */
    align?: 'left' | 'right' | 'center';
    /** A CSS width. @defaultValue automatic */
    width?: string;
    /** The header's title attribute. @defaultValue none */
    title?: string;
    /** Renders the cell of one series. */
    cell: (point: ChartPoint<Row>, series: LegendItem, api: {
        setHighlight: (id: string | null) => void;
    }) => ReactNode;
}

/** What a legend table shows when the cursor is not over the chart. */
export declare type LegendTableFallback = 'hide' | 'latest' | 'first' | 'series-only';

/** Props of {@link LegendTable}. */
export declare interface LegendTableProps<Row = Record<string, any>> {
    /** The chart, from a ref. */
    chart: ChartHandle<Row> | null | undefined;
    /** What the rows show when the cursor is not over the chart. @defaultValue `'series-only'` */
    fallback?: LegendTableFallback;
    /** The columns. @defaultValue name and value */
    columns?: readonly LegendTableColumn<Row>[];
    /** Show the X value above the rows. @defaultValue `true` */
    showStepHeader?: boolean;
    /** How the X value in the header is written. @defaultValue the X axis format */
    formatStep?: (value: number | string) => string;
    /** Highlight a series while its row is hovered. @defaultValue `true` */
    highlightOnHover?: boolean;
    /** A CSS max-height; the table scrolls beyond it. @defaultValue no limit */
    maxHeight?: string;
    /** Extra class names. @defaultValue none */
    className?: string;
    /** Inline styles. @defaultValue none */
    style?: CSSProperties;
    /** Render the table yourself from the cursor snapshot. */
    children?: (snapshot: CursorSnapshot<Row> | undefined, highlight: string | null, setHighlight: (id: string | null) => void) => ReactNode;
}

/** A line, or an area filled to zero. */
declare interface LineSeriesOptions<Row> extends SeriesCommon<Row>, PathOptions {
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

/** A column with a value computed from the point. */
export declare function metricColumn<Row>(resolve: (point: ChartPoint<Row>, series: LegendItem) => string, options?: {
    header?: string;
    truncate?: number;
}): LegendTableColumn<Row>;

/** A column with the series swatch and name. */
export declare function nameColumn<Row>(options?: {
    swatch?: boolean;
    truncate?: number;
}): LegendTableColumn<Row>;

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
declare type NumberFormat = ((value: number) => string) | NumberFormatOptions;

/** `Intl.NumberFormat` options plus text placed before and after the number. */
declare type NumberFormatOptions = Intl.NumberFormatOptions & {
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

/** A rectangle in CSS pixels, relative to the chart container. */
declare interface PixelRect {
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
declare type PointColor<Row> = {
    /** Returns the CSS colour of the point with this value, row and original row index. */
    bivarianceHack(value: number, row: Row | undefined, index: number): string;
}['bivarianceHack'];

/** A horizontal or vertical line at a value of one axis. */
declare interface ReferenceLine {
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
declare interface ReferenceRegion {
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
declare type RowFunction<Row, Value> = {
    /** Reads the value of `row`; `index` is its index in the data you passed. */
    bivarianceHack(row: Row, index: number): Value;
}['bivarianceHack'];

/** A stable identifier for a row, kept through sorting and streaming. */
declare type RowId = string | number;

/** A stable identifier for a row, kept through sorting and streaming. */
declare type RowId_2 = string | number;

/** A closed data-space interval. */
declare interface ScaleRange {
    /** The lower bound, in data units. */
    min: number;
    /** The upper bound, in data units. */
    max: number;
}

/** A closed data-space interval. */
declare interface ScaleRange_2 {
    /** The lower bound, in data units. */
    min: number;
    /** The upper bound, in data units. */
    max: number;
}

/**
 * Scatter drawing: individual points, a density map, or points until there are more than 200,000 in
 * view.
 */
declare type ScatterRenderMode = 'points' | 'density' | 'auto';

/** Points at (x, y), optionally coloured and sized by other fields. */
declare interface ScatterSeriesOptions<Row> extends SeriesCommon<Row> {
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

/** A selection as reported to `onSelectionChange`, with the points inside it. */
declare interface SelectionChange<Row = Record<string, any>> extends Selection_2 {
    /** The scatter points inside a two-axis selection. */
    readonly points?: readonly ChartPoint<Row>[];
}

/** A persistent selection in data space, as `getState().selection` reports it. */
declare interface SelectionRange {
    /** The selected X range. */
    x: ScaleRange;
    /** The selected Y range, for a two-axis selection. */
    y?: ScaleRange;
}

/** A persistent selection in data space, as `getState().selection` reports it. */
declare interface SelectionRange_2 {
    /** The selected X range. */
    x: ScaleRange_2;
    /** The selected Y range, for a two-axis selection. */
    y?: ScaleRange_2;
}

/** A finished box selection, with the points inside it. */
declare interface SelectionResult<Row = Record<string, any>> extends SelectionRange {
    /** The scatter points inside a two-axis selection. */
    points?: readonly ChartPoint<Row>[];
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
declare type SeriesData = readonly object[] | ColumnData;

/** A list legend for a chart: one button per series. */
export declare function SeriesLegend<Row>(props: SeriesLegendProps<Row>): ReactElement;

/** Props of {@link SeriesLegend}. */
export declare interface SeriesLegendProps<Row = Record<string, any>> {
    /** The chart, from a ref. */
    chart: ChartHandle<Row> | null | undefined;
    /** Toggle a series on click. @defaultValue `true` */
    toggle?: boolean;
    /** Highlight a series on hover and focus. @defaultValue `true` */
    highlight?: boolean;
    /** Extra class names. @defaultValue none */
    className?: string;
    /** Inline styles. @defaultValue none */
    style?: CSSProperties;
}

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
declare type SeriesOptions<Row = Record<string, any>> = (FieldSeries<Row> & {
    /** The chart's `data` is used. */
    data?: undefined;
}) | (FieldSeries<any> & {
    /** This series' own rows or columns. */
    data: SeriesData;
}) | HistogramSeriesOptions;

/** A mark type. */
declare type SeriesType = 'line' | 'area' | 'band' | 'bar' | 'scatter' | 'histogram';

/** A size encoding: a field, or a field with options. */
declare type SizeEncoding<Row> = Numeric<Row> | SizeEncodingOptions<Row>;

/** Size scatter points by a numeric field. */
declare interface SizeEncodingOptions<Row> {
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
declare interface StreamingOptions {
    /** Keep at most this many rows per source; older rows are dropped. @defaultValue unbounded */
    maxPoints?: number;
    /**
     * While following the latest data, show the window `[latest − followWindow, latest]` in X units.
     * Panning or zooming X stops following; `resumeFollow()` starts it again.
     * @defaultValue the whole data extent
     */
    followWindow?: number;
}

/** Native React cells; no DOM nodes are constructed while rendering. */
export declare function swatchColumn<Row>(options?: {
    size?: number;
    shape?: 'dot' | 'bar';
}): LegendTableColumn<Row>;

/** The colours and fonts a chart resolved from its theme and page. */
declare interface ThemeConfig {
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
 * Theme tokens. Any token you leave out comes from CSS variables on the
 * container (`--chart-surface`, `--chart-text`, …), then from the page.
 *
 * @example
 * ```ts
 * theme: { surface: '#fffdf7', categorical: ['#0072b2', '#d55e00'] }
 * ```
 */
declare interface ThemeTokens {
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

/** A time axis: epoch milliseconds, Dates or ISO-8601 strings. */
declare interface TimeAxisOptions extends AxisCommon {
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
declare type TooltipField<Row> = Accessor<Row, number | string | null | undefined> | TooltipFieldOptions<Row>;

/** An extra field shown in a scatter point's tooltip. */
declare interface TooltipFieldOptions<Row> {
    /** The field. */
    field: Accessor<Row, number | string | null | undefined>;
    /** The name shown before the value. @defaultValue the field name */
    label?: string;
    /** How the value is written. @defaultValue automatic */
    format?: (value: number) => string;
}

/** The tooltip. */
declare interface TooltipOptions<Row> {
    /**
     * `index` lists every series at the nearest X; `nearest` shows the closest point.
     * @defaultValue `'index'`, or `'nearest'` when every series is scatter
     */
    mode?: 'index' | 'nearest';
    /**
     * Render the tooltip yourself. A string is inserted as HTML, so escape untrusted text or return a
     * `Node` built with `textContent`.
     * @defaultValue the built-in tooltip
     */
    render?(points: readonly ChartPoint<Row>[]): string | Node;
}

/** Options are fixed for this group's lifetime. Create a new owner to change them. */
export declare function useChartGroup(options?: ChartGroupOptions): ChartGroup_2;

/** The chart's state; re-renders on every state change. */
export declare function useChartState<Row>(chart: ChartHandle<Row> | null | undefined): ChartState_2<Row> | undefined;

/** The values under the cursor, or at a fallback position. */
export declare function useCursorSnapshot<Row>(chart: ChartHandle<Row> | null | undefined, options?: CursorSnapshotOptions): CursorSnapshot_2<Row> | undefined;

/** The highlighted series id and a setter. */
export declare function useHighlight<Row>(chart: ChartHandle<Row> | null | undefined): readonly [string | null, (id: string | null) => void | undefined];

/** A numeric axis: linear or logarithmic. */
declare interface ValueAxisOptions extends AxisCommon {
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

/** A column with the series value. */
export declare function valueColumn<Row>(options?: {
    format?: (value: number, point: ChartPoint<Row>) => string;
    placeholder?: string;
    align?: 'left' | 'right' | 'center';
    header?: string;
}): LegendTableColumn<Row>;

/**
 * The pinned axes of the viewport. An axis that is not named stays automatic; `{}` means every axis
 * is automatic.
 */
declare type Viewport = Readonly<Partial<Record<string, AxisInterval>>>;

/** The current axis ranges by axis key, as `getState().viewport` reports them. */
declare type ViewportRanges = Readonly<Record<string, Readonly<ScaleRange>>>;

/** The current axis ranges by axis key, as `getState().viewport` reports them. */
declare type ViewportRanges_2 = Readonly<Record<string, Readonly<ScaleRange_2>>>;

export { }
