export declare type Accessor<Row, Value> = Field<Row, Value> | ((row: Row, index: number) => Value);

declare interface AppendDataOptions {
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

export declare interface AppendOptions {
    seriesId?: string;
    updateLast?: boolean;
}

/** Apply a resolved canvas theme to a DOM companion's inheritable tokens. */
export declare function applyThemeToElement(element: HTMLElement, theme: ThemeConfig): void;

/** Configuration for an axis entry in ChartConfig.axes */
declare interface AxisConfig {
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
    tickFormat?: (value: number) => string;
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
     * grid density. Format labels with `tickFormat`.
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

/**
 * Per-axis gridline styling, independent of tick labels. `false` (or
 * `show: false`) removes this axis's gridlines while its labels stay; a
 * time-bar chart often wants horizontal guides only, so set
 * `axes.x.grid: false`. Colors here are concrete CSS color strings; theme
 * `var()` references are resolved only in `ThemeConfig` fields.
 */
export declare interface AxisGridConfig {
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

export declare interface AxisOptions extends Omit<AxisConfig, 'type' | 'label' | 'nice' | 'padding' | 'tickFormat'> {
    type?: 'linear' | 'log' | 'time' | 'category';
    title?: string;
    roundBounds?: boolean;
    rangePadding?: number;
    /** Numbers include epoch milliseconds; category axes supply their labels. */
    format?(value: number | string): string;
    /** Authoritative category order, including slots without observations. */
    categories?: readonly string[];
}

export declare type AxisPosition = 'top' | 'bottom' | 'left' | 'right';

/** Styling for the short marks that anchor tick labels to exact scale positions. */
export declare interface AxisTickMarksConfig {
    /** Mark length in CSS pixels. Default: `4`. */
    length?: number;
    /** Which side of the plot border the mark extends toward. Default: `'out'`. */
    direction?: 'out' | 'in' | 'both';
    /** Mark color. Default: `theme.axisLineColor` at `theme.gridOpacity`. An explicit color is opaque. */
    color?: string;
}

export declare type AxisValue = number | Date | string;

/**
 * CSS custom properties resolveTheme reads from the chart container's
 * computed style. Define any of these on the container (or an ancestor)
 * and the chart inherits them; combined with the automatic re-resolution
 * on `data-theme`/`prefers-color-scheme` changes, this is the zero-config
 * path for token-driven design systems. Values may be any CSS color the
 * browser can compute, including `oklch(...)` and `var()` references.
 *
 * Exported so consumers can alias their own tokens programmatically:
 * `for (const v of Object.values(CHART_CSS_VARS)) el.style.setProperty(v, ...)`.
 */
export declare const CHART_CSS_VARS: Partial<Record<keyof ThemeConfig, string>>;

declare interface ChartConfig<TMeta = unknown> {
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
    plugins?: Plugin_2[];
}

/** Event name to handler-signature map for `chart.on()`. */
declare interface ChartEventMap {
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
    'options:update': (config: ChartConfig) => void;
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
    /** Reserved click event. Not currently emitted by the core (see the DX audit). */
    click: (dataX: number, dataIdx: number) => void;
    /** Box selection resolved. Mirror of `selection.onSelect`. */
    select: (selection: SelectionResult_2) => void;
    /** Persistent brush selection changed (`null` when cleared). Mirror of `selection.onBrush`. */
    'selection:change': (selection: SelectionRange | null) => void;
    /** Emitted while the data layer paints, for canvas-level custom drawing without a plugin. */
    drawData: (ctx: CanvasRenderingContext2D, layout: Layout) => void;
    /** Emitted while the overlay layer paints, above the data. */
    drawOverlay: (ctx: CanvasRenderingContext2D, layout: Layout) => void;
}

export declare interface ChartEvents<Row = Record<string, unknown>> {
    'state:change': ChartState<Row>;
    'cursor:change': CursorSnapshot<Row>;
    'viewport:change': Viewport;
    'selection:change': SelectionRange | null;
    'visibility:change': readonly string[];
    'highlight:change': string | null;
    'follow:change': boolean;
    'point:click': ChartPoint<Row>;
    select: SelectionResult<Row>;
    'data:update': undefined;
    'options:update': ChartOptions<Row>;
    'theme:update': ThemeConfig;
    resize: {
        width: number;
        height: number;
    };
}

export declare interface ChartGroup {
    readonly options: Readonly<ChartGroupOptions>;
    setCursor(value: number | string | null): void;
    setHighlight(id: string | null): void;
    destroy(): void;
}

export declare interface ChartGroupOptions {
    cursor?: boolean;
    highlight?: boolean;
    viewport?: boolean;
    yRange?: boolean;
    yAxis?: string;
    alignPlots?: boolean;
}

export declare interface ChartHandle<Row = Record<string, unknown>> {
    readonly container: HTMLElement;
    update(patch: ChartPatch<Row>): void;
    appendData(data: DataSource<Row>, options?: AppendOptions): void;
    getOptions(): Readonly<ChartOptions<Row>>;
    getState(): ChartState<Row>;
    subscribe(listener: () => void): () => void;
    on<K extends keyof ChartEvents<Row>>(event: K, listener: (value: ChartEvents<Row>[K]) => void): () => void;
    setViewport(viewport: Viewport): void;
    resetViewport(): void;
    resumeFollow(): void;
    setSelection(selection: SelectionRange | null): void;
    setSeriesVisible(id: string, visible: boolean): void;
    setHighlight(id: string | null): void;
    setCursor(x: number | string | null): void;
    getCursorSnapshot(options?: CursorSnapshotOptions): CursorSnapshot<Row>;
    getLegendItems(): LegendItem[];
    getTheme(): ThemeConfig;
    getLayout(): Layout;
    getStats(): ChartStats;
    getAxis(key: string): Readonly<ScaleRange & {
        type: string;
    }> | undefined;
    refreshTheme(): void;
    resize(width: number, height: number): void;
    redraw(): void;
    destroy(): void;
}

declare interface ChartInstance {
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
    /**
     * Resolved series legend model for application-owned headers, sidebars, or
     * custom renderers. Colors follow the active theme and mark fields retain
     * enough geometry to distinguish lines, areas, bands, bars, and points.
     */
    getLegendItems(): LegendItem_2[];
    /**
     * Re-resolve the theme against the container's current CSS cascade and
     * repaint if anything changed. Charts already call this automatically
     * when an attribute changes on `<html>`/`<body>` (the `[data-theme]`
     * pattern) or the OS color scheme flips; call it manually only when
     * tokens change through some other mechanism (for example a variable
     * swapped on a mid-tree ancestor). No-ops when the resolved theme is
     * value-identical.
     */
    refreshTheme(): void;
    /** Get current layout */
    getLayout(): Layout;
    /** Force full redraw */
    redraw(): void;
    /** Resize chart */
    resize(width: number, height: number): void;
    /**
     * The current persistent brush selection in data space, or `null`. Set by
     * a `selection.mode: 'brush'` gesture or `setSelection()`. Safe to
     * serialize; feed it back to `setSelection()` to restore.
     */
    getSelection(): SelectionRange | null;
    /**
     * Set or clear the persistent brush selection programmatically (`null`
     * clears). Fires `selection:change` / `selection.onBrush` on a real
     * change. Independent of `selection.mode`, so a zoom-mode chart can still
     * carry a brush set from code.
     */
    setSelection(selection: SelectionRange | null): void;
    /**
     * Resume live-follow and snap the X viewport to the newest data. With
     * `streaming.follow` set this jumps to the trailing window; otherwise it
     * resets X to the full data extent. Re-enables following after the user
     * paused it by panning or zooming, and fires `follow:change`.
     */
    scrollToLatest(): void;
    /**
     * Whether the X viewport is tracking new data (live) rather than pinned by
     * a user pan/zoom (paused). Starts `true`; a horizontal pan or zoom sets it
     * `false`; `scrollToLatest()` and a double-click reset set it `true`.
     */
    isFollowing(): boolean;
    /** Destroy and clean up all resources */
    destroy(): void;
    /** Register a plugin. Returns false when a plugin with the same id is already registered. */
    use(plugin: Plugin_2): boolean;
    /** Subscribe to chart events */
    on<K extends keyof ChartEventMap>(event: K, handler: ChartEventMap[K]): () => void;
    /** Set cursor position from external source (sync/programmatic) */
    setCursorDataX(dataX: number | null, origin?: CursorEventOrigin): void;
    /**
     * Snapshot of all visible series at the current cursor position
     * (or fallback). Allocates a fresh snapshot, use
     * `getCursorSnapshotInto()` in the cursor hot path to reuse buffers.
     */
    getCursorSnapshot(opts?: CursorSnapshotOptions): CursorSnapshot_2;
    /**
     * Zero-allocation variant of `getCursorSnapshot`. Mutates and returns
     * `target`. The `target.points` array is grown but never shrunk; use
     * `target.points.length` (after this call) as the row count.
     */
    getCursorSnapshotInto(target: CursorSnapshot_2, opts?: CursorSnapshotOptions): CursorSnapshot_2;
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

export declare interface ChartOptions<Row = Record<string, unknown>> extends Omit<ChartConfig, 'series' | 'axes' | 'streaming' | 'plugins' | 'highlight' | 'selection' | 'tooltip' | 'cursor' | 'zoom'> {
    data?: DataSource<Row>;
    x?: Accessor<Row, AxisValue>;
    rowId?: Accessor<Row, RowId>;
    series: readonly SeriesOptions<Row>[];
    axes?: Record<string, AxisOptions>;
    streaming?: {
        maxPoints?: number;
        followWindow?: number;
    };
    referenceLines?: readonly ReferenceLine[];
    referenceRegions?: readonly ReferenceRegion[];
    plugins?: readonly ChartPlugin<Row>[];
    group?: ChartGroup;
    cursor?: Omit<NonNullable<ChartConfig['cursor']>, 'syncKey'>;
    zoom?: Omit<NonNullable<ChartConfig['zoom']>, 'syncKey'>;
    highlight?: Omit<NonNullable<ChartConfig['highlight']>, 'syncKey' | 'getKey'>;
    selection?: Omit<NonNullable<ChartConfig['selection']>, 'onSelect' | 'onBrush'>;
    tooltip?: Omit<NonNullable<ChartConfig['tooltip']>, 'yFormat' | 'rangeFormat' | 'render' | 'xFormat'> & {
        xFormat?(value: number | string): string;
        /** Strings are rendered as HTML; use a DOM node with textContent for untrusted values. */
        render?: (points: readonly ChartPoint<Row>[]) => string | HTMLElement;
        yFormat?: (value: number, seriesId: string) => string;
        rangeFormat?: (min: number, max: number, seriesId: string) => string;
    };
    /** Accessible name; no visual chart title is added. */
    ariaLabel?: string;
    onPointClick?: (point: ChartPoint<Row>) => void;
    onSelect?: (selection: SelectionResult<Row>) => void;
}

export declare type ChartPatch<Row> = {
    [K in keyof ChartOptions<Row>]?: K extends 'data' | 'series' | 'plugins' | 'group' ? ChartOptions<Row>[K] : OptionPatch<ChartOptions<Row>[K]>;
};

export declare interface ChartPlugin<Row = Record<string, unknown>> {
    id: string;
    install?(chart: ChartHandle<Row>): void;
    destroy?(chart: ChartHandle<Row>): void;
    beforeDraw?(chart: ChartHandle<Row>): boolean | void;
    afterDrawGrid?(chart: ChartHandle<Row>, context: CanvasRenderingContext2D): void;
    afterDrawData?(chart: ChartHandle<Row>, context: CanvasRenderingContext2D): void;
    afterDrawOverlay?(chart: ChartHandle<Row>, context: CanvasRenderingContext2D): void;
    onDataUpdate?(chart: ChartHandle<Row>): void;
    onOptionsUpdate?(chart: ChartHandle<Row>): void;
}

export declare interface ChartPoint<Row = Record<string, unknown>> {
    seriesId: string;
    label: string;
    row?: Row;
    rowIndex: number;
    rowId?: RowId;
    x: number | string;
    /** Histogram bin interval, in numeric axis units. */
    xRange?: ScaleRange;
    y: number;
    radius?: number;
    fields?: readonly {
        label: string;
        value: number | string;
        formatted: string;
    }[];
    formattedX: string;
    formattedY: string;
    color: string;
    meta?: unknown;
}

export declare interface ChartState<Row = Record<string, unknown>> {
    viewport: Viewport;
    selection: SelectionRange | null;
    hiddenSeries: readonly string[];
    highlightedSeries: string | null;
    following: boolean;
    cursor: CursorSnapshot<Row>;
}

export declare interface ChartStats {
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

/**
 * Mark type for a series. Public bands name `lower` and `upper` fields;
 * histogram series consume explicit binning results. Defaults to `line`.
 */
export declare type ChartType = 'line' | 'area' | 'band' | 'scatter' | 'bar' | 'histogram';

export declare type ColorEncoding<Row> = Accessor<Row, number | string | null | undefined> | (Omit<ScatterColorEncoding, 'dataIndex' | 'categoryValues'> & {
    field: Accessor<Row, number | string | null | undefined>;
});

/**
 * Generic escape hatch for one-off columns. Mostly here to give the
 * `import { column } from 'snaplot'` ergonomic an obvious entry point.
 */
export declare function column<Row = Record<string, unknown>>(spec: LegendTableColumn<Row>): LegendTableColumn<Row>;

/**
 * Columnar data format: index 0 is always X values, indices 1..N are Y series.
 * All arrays must have identical length. X values (index 0) MUST be sorted
 * monotonically non-decreasing. This constraint enables O(log n) binary search
 * for viewport culling, hit-testing, and cursor snapping.
 */
declare type ColumnarData = [xValues: Float64Array, ...yValues: Float64Array[]];

export declare interface ColumnData {
    columns: Record<string, Float64Array>;
    rowIds?: readonly RowId[];
}

export declare function createChart<Row>(element: HTMLElement, options: ChartOptions<Row>): ChartHandle<Row>;

export declare function createChartGroup(options?: ChartGroupOptions): ChartGroup;

/** Accessible, ID-based toggles using the same legend classes as the framework companions. */
export declare function createLegendPlugin<Row = Record<string, unknown>>(options?: LegendOptions): ChartPlugin<Row>;

/** Cursor-synchronised table with stable ID-keyed DOM rows and text-safe custom cells. */
export declare function createLegendTablePlugin<Row = Record<string, unknown>>(options?: LegendTableOptions<Row>): ChartPlugin<Row>;

/**
 * Build a theme override from a small set of product-level tokens.
 *
 * This intentionally returns a partial theme: roles not supplied continue
 * through the normal CSS-variable and light/dark default resolution path.
 */
export declare function createTheme(tokens: ThemeTokens): Partial<ThemeConfig>;

declare interface CursorConfig {
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
 * What produced a cursor change. `local` is this chart's own pointer;
 * `sync` came from a peer over a sync group; `programmatic` came from
 * `setCursorDataX`. Handlers use it to break sync feedback loops.
 */
declare type CursorEventOrigin = 'local' | 'sync' | 'programmatic';

/**
 * One row of a cursor snapshot, the value of a single visible series
 * at a given X index, plus everything the legend table needs to render it.
 */
declare interface CursorSeriesPoint<TMeta = unknown> {
    /** Actual X coordinate sampled from this series source. */
    dataX?: number;
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

export declare interface CursorSnapshot<Row = Record<string, unknown>> {
    x: number | string | null;
    formattedX: string;
    points: readonly ChartPoint<Row>[];
    source: 'cursor' | 'latest' | 'first' | 'none';
    activeSeriesId: string | null;
}

/**
 * Snapshot of all visible series at a given cursor (or fallback) index.
 * Returned by `chart.getCursorSnapshot()` and consumed by the legend table.
 *
 * Safe to read on every `cursor:move`: the `points` array is reused
 * across calls (mutated in place) when you use `getCursorSnapshotInto()`.
 */
declare interface CursorSnapshot_2<TMeta = unknown> {
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
export declare interface CursorSnapshotOptions {
    /**
     * What to return when the cursor is not over the chart.
     * - `hide`   → empty snapshot, source === 'none'
     * - `latest` → snapshot at the last X value
     * - `first`  → snapshot at the first X value
     * Default: `'hide'`.
     */
    fallback?: 'hide' | 'latest' | 'first';
}

/**
 * Dark theme, Soft-UI slate. The old navy #1a1a2e gave way to a
 * cooler slate (#14161f) that matches the `refinedDarkTheme` aesthetic:
 * tinted neutrals, warm off-white text (#e2e2e5, not pure white),
 * and a dark-surface categorical palette. Grid and border share one hue;
 * opacity does the visual separation.
 */
export declare const darkTheme: ThemeConfig;

export declare type DataSource<Row> = readonly Row[] | ColumnData | HistogramBins;

export declare interface DebugConfig {
    /**
     * Enable lightweight timing diagnostics. Counters are always maintained,
     * but per-layer duration measurement only runs when this is true.
     */
    stats?: boolean;
}

/**
 * Recursively optional version of `T`, with arrays replaced wholesale rather
 * than merged element-wise. This is the shape `setOptions()` accepts, so a
 * `series` array in a partial update replaces the existing series list.
 */
declare type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends (infer U)[] ? DeepPartial<U>[] : T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export declare type Field<Row, Value> = string extends keyof Row ? string : Extract<{
    [K in keyof Row]-?: NonNullable<Row[K]> extends Value ? K : never;
}[keyof Row], string>;

/**
 * Fog, Linear / Notion dashboard light. Cool off-white bg with a
 * restrained productivity palette: blue leads, emerald + violet for
 * contrast, amber as the warm accent. Muted enough for a writing-app
 * surface, saturated enough for >4 series to stay distinguishable.
 */
export declare const fogTheme: ThemeConfig;

/**
 * Forest, deep pine base with a leaf-to-moss cycle. Emerald leads
 * and every step stays in the green/teal/olive family so the theme
 * reads as one cohesive forest rather than a random green palette;
 * a single amber slot provides warm contrast for bar/histogram legends.
 */
export declare const forestTheme: ThemeConfig;

declare interface HighlightConfig<TMeta = unknown> {
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
    getKey?: (series: SeriesConfig<TMeta>, seriesIndex: number) => HighlightSyncKey | null | undefined;
}

/**
 * Stable cross-chart identity for a series, returned by `highlight.getKey`.
 * Lets linked charts with different series order highlight the same logical
 * run/metric.
 */
declare type HighlightSyncKey = string | number;

/**
 * Compute histogram bins from raw values.
 *
 * Usage:
 *   const bins = histogram(rawValues);
 *   createChart(element, { series: [{ id: 'distribution', type: 'histogram', data: bins }] });
 */
export declare function histogram(values: Float64Array | readonly number[], options?: HistogramOptions): HistogramBins;

/**
 * Histogram utility, compute bins from raw data.
 *
 * This is a USER-FACING utility, not called internally by the chart.
 * The chart only renders pre-computed bins. The user controls
 * when and how to bin their data (P3: library never touches your data).
 *
 * Bin methods:
 * - Freedman-Diaconis (default): 2 * IQR * n^(-1/3), robust to outliers
 * - Sturges: ceil(log2(n) + 1), simple, good for normal distributions
 * - Scott: 3.5 * sigma / n^(1/3), optimized for Gaussian data
 *
 * Returns N+1 bin edges and N counts. Pass the result directly as a
 * histogram series dataset; callers never need to pad counts.
 */
export declare interface HistogramBins {
    /** Bin edge values (length = N+1 for N bins) */
    edges: Float64Array;
    /** Count per bin (length = N) */
    counts: Float64Array;
    /** Maximum count */
    maxCount: number;
}

export declare interface HistogramOptions {
    method?: 'sturges' | 'scott' | 'freedman-diaconis';
    binCount?: number;
}

/**
 * Interaction modes define default gesture→action mappings:
 * - timeseries: mouse drag=box-zoom, shift+drag=pan, pinch=zoom-x
 * - analytical: mouse drag=box-zoom, shift+drag=pan, pinch=zoom-xy
 * - readonly: tooltip only, all navigation disabled (reports, embeds)
 *
 * Touch defaults are cursor-first: one-finger drag moves the cursor,
 * double-tap+drag selects, and two-finger pinch zooms.
 */
export declare type InteractionMode = 'timeseries' | 'analytical' | 'readonly';

/**
 * Line/area path interpolation. `monotone` is a shape-preserving cubic that
 * never overshoots between points; the three `step-*` variants place the
 * riser before, after, or centered on each point. Defaults to `linear`.
 */
export declare type InterpolationMode = 'linear' | 'monotone' | 'step-before' | 'step-after' | 'step-middle';

/**
 * Ivory, warm cream light theme for documents-that-happen-to-have-charts
 * (Notion, Bear, writing apps). Earth-tone palette leads with burnt
 * orange so charts feel printed, not screen-blasted.
 */
export declare const ivoryTheme: ThemeConfig;

export declare interface Layout {
    /** Total CSS pixel width of the chart container */
    width: number;
    /** Total CSS pixel height of the chart container */
    height: number;
    /** The data-rendering region */
    plot: {
        top: number;
        left: number;
        width: number;
        height: number;
    };
    /** Axis regions keyed by axis config key, with position and area */
    axes: Record<string, {
        position: AxisPosition;
        area: {
            left: number;
            top: number;
            width: number;
            height: number;
        };
    }>;
    /** Device pixel ratio */
    dpr: number;
}

/**
 * Cell content returned by a column. The plugin treats `string` as
 * text (set as `textContent` for safety + perf), and `HTMLElement` /
 * `Node` as DOM to insert. The Solid `<LegendTable>` accepts JSX too.
 */
export declare type LegendCellContent = string | Node;

export declare interface LegendItem {
    id: string;
    label: string;
    type: SeriesConfig['type'];
    color: string;
    fill: string | null;
    visible: boolean;
    lineDash: number[];
    opacity: number;
    meta?: unknown;
}

/** Resolved, renderer-independent description of one series legend entry. */
declare interface LegendItem_2<TMeta = unknown> {
    seriesIndex: number;
    label: string;
    type: ChartType;
    visible: boolean;
    color: string;
    fill: string | null;
    lineWidth: number;
    lineDash: number[];
    opacity: number;
    meta?: TMeta;
}

declare interface LegendOptions {
    position?: 'top' | 'bottom';
    /** Mount outside the chart without changing its layout. */
    container?: HTMLElement;
}

/**
 * One column in the legend table. The plugin renders the header from
 * `header`, the cell from `cell(point, series)`. `align` controls
 * `text-align`; `width` is forwarded to the `<td>` style.
 *
 * Generic in `Row` so `application rows remain typed in cell renderers.
 */
export declare interface LegendTableColumn<Row = Record<string, unknown>> {
    /** Stable key, used for keying the row's cells. */
    key: string;
    /** Header text. Pass empty string for unlabeled columns (e.g. swatch). */
    header: string;
    /** Cell renderer. Receives the snapshot row + the series config. */
    cell: (point: ChartPoint<Row>, series: SeriesOptions<Row>) => LegendCellContent;
    /** Optional text alignment. Defaults to `'left'`. */
    align?: 'left' | 'right' | 'center';
    /** Optional fixed/min width (CSS string). */
    width?: string;
    /** Header `title` tooltip. */
    title?: string;
}

export declare interface LegendTableOptions<Row = Record<string, unknown>> extends LegendOptions {
    fallback?: 'hide' | 'latest' | 'first' | 'series-only';
    showStepHeader?: boolean;
    formatStep?: (value: number | string) => string;
    columns?: readonly LegendTableColumn<Row>[];
    highlightOnHover?: boolean;
    toggleVisibilityOnClick?: boolean;
    maxHeight?: string;
    className?: string;
}

/**
 * Light theme, Soft-UI defaults. Grid and border share a single slate
 * hue and opacity so the frame does not compete with the data. Background is
 * a barely-cool off-white (~2 % brand hue) per Soft UI guidance; text
 * is near-black with a slight slate tint rather than pure #000.
 *
 *   #fafbfc  background      (tinted off-white)
 *   #c3c6cf  grid / border   (shared hue, opacity differentiates)
 *   #6b7181  tick labels     (legible mid-contrast)
 *   #3b4254  crosshair
 *   #1a1d29  text            (near-black with cool tint)
 */
export declare const lightTheme: ThemeConfig;

/**
 * Binary search utilities for sorted Float64Arrays.
 * These are the critical performance path for viewport culling,
 * hit-testing, and cursor snapping. O(log n) for all operations.
 */
/**
 * Find the index of the first element >= value (lower bound).
 * If all elements are < value, returns arr.length.
 */
export declare function lowerBound(arr: Float64Array, value: number): number;

/**
 * Largest Triangle Three Buckets (LTTB) downsampling.
 * Sveinn Steinarsson, 2013.
 *
 * Preserves visual shape by selecting points that form the largest
 * triangles with their neighbours. O(n) single pass, directly
 * controllable output size.
 *
 * This is a UTILITY, not called implicitly in the render path.
 * The user controls when and how to downsample (P3: library never touches your data).
 */
export declare function lttb(x: Float64Array, y: Float64Array, targetCount: number): [Float64Array, Float64Array];

/**
 * M4 algorithm, pixel-perfect visual aggregation.
 * Jugel et al., VLDB 2014.
 *
 * For each pixel column, retains exactly 4 points: first, last, min, max.
 * Zero visual error compared to rendering all points. O(n) single pass.
 *
 * This is a UTILITY, not called implicitly in the render path.
 */
export declare function m4(x: Float64Array, y: Float64Array, pixelWidth: number, xMin: number, xMax: number): [Float64Array, Float64Array];

/**
 * Mars, warm rust/terracotta on burnt umber. Kept as a back-compat
 * export; retired from the featured chip row in favour of `sunsetTheme`
 * (gold-led warm) + `ivoryTheme` (cream light).
 */
export declare const marsTheme: ThemeConfig;

/**
 * A "Metric" column, for ML dashboards where every series shows the
 * same metric (e.g. "eval/accuracy"), or each series carries its own
 * metric key in `meta`. Caller supplies the resolver.
 */
export declare function metricColumn<Row = Record<string, unknown>>(resolve: (point: ChartPoint<Row>, series: SeriesOptions<Row>) => string, opts?: {
    header?: string;
    truncate?: number;
}): LegendTableColumn<Row>;

/**
 * Midnight, the previous near-black theme. Kept as a named export
 * for back-compat but no longer featured in the site's theme chip
 * row. Prefer `darkTheme` (slate) for new work.
 */
export declare const midnightTheme: ThemeConfig;

/**
 * Mint, fresh, cool light theme for wellness / health / environment
 * dashboards. Barely-green bg with emerald lead; secondary accents
 * stay saturated enough to distinguish >4 series.
 */
export declare const mintTheme: ThemeConfig;

/**
 * Series name. By default includes a leading swatch dot (matches the
 * typical ML-dashboard look), so you usually want this OR `swatchColumn`, not both.
 */
export declare function nameColumn<Row = Record<string, unknown>>(opts?: {
    swatch?: boolean;
    truncate?: number;
}): LegendTableColumn<Row>;

/**
 * Find the index of the element nearest to value.
 * Returns 0 for empty arrays.
 */
export declare function nearestIndex(arr: Float64Array, value: number): number;

declare type Numeric<Row> = Accessor<Row, number | null | undefined>;

/**
 * Ocean, deep navy hero with a harmonised blue-to-warm cycle. Sky
 * blue leads (so the first series always reads as "primary"); cyan
 * and teal provide cool contrast; coral and amber are the single
 * warm accents. The palette stays on an ocean-sun axis rather than
 * fanning out into unrelated hues.
 */
export declare const oceanTheme: ThemeConfig;

declare type OptionPatch<T> = T extends (...args: never[]) => unknown ? T : T extends readonly unknown[] ? T : T extends object ? {
    [K in keyof T]?: OptionPatch<T[K]> | undefined;
} : T;

declare interface PanConfig {
    /** Master switch for pan (shift+drag on mouse, one-finger on touch when `touch.drag: 'pan'`). Default: `true`. */
    enabled?: boolean;
    /** Allow panning along X. Default: `true`. */
    x?: boolean;
    /** Allow panning along Y. Default: `false`, matching the zoom Y default. */
    y?: boolean;
    /** Enable drag-to-pan gestures that start over axis gutters. Default: `false`. */
    axis?: boolean;
}

declare interface PerformanceConfig {
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

declare interface Plugin_2 {
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
    onCursorMove?(chart: ChartInstance, dataX: number | null, dataIdx: number | null, origin: CursorEventOrigin): void;
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

export declare interface ReferenceLine {
    axis: string;
    value: AxisValue;
    label?: string;
    color?: string;
    dash?: number[];
    lineWidth?: number;
}

export declare interface ReferenceRegion {
    axis: string;
    from: AxisValue;
    to: AxisValue;
    label?: string;
    fill?: string;
    opacity?: number;
    edges?: boolean;
    edgeColor?: string;
    edgeDash?: number[];
}

/**
 * Refined dark, the original Soft-UI template that `DARK_THEME` now
 * also follows. Kept as a named export for back-compat; the palette is
 * effectively identical to `darkTheme` since 0.4.x.
 */
export declare const refinedDarkTheme: ThemeConfig;

/**
 * Resolve theme by reading CSS custom properties from the container
 * and merging with user-provided overrides.
 *
 * Priority: user theme -> CSS variables (from page) -> default light/dark theme.
 *
 * Any color value (a `--chart-*` custom property, a `var(--token)`
 * reference in a user theme field, or a color space like `oklch` that the
 * canvas-side helpers cannot parse) is resolved to a concrete computed
 * color against the container, so token-driven design systems work
 * without hand-copying values. Resolution reflects the container's
 * cascade at call time; the chart re-resolves automatically when the
 * document theme changes (see `refreshTheme`).
 */
export declare function resolveTheme(container: HTMLElement, userTheme?: Partial<ThemeConfig>): ThemeConfig;

export declare type RowId = string | number;

/**
 * A Scale is a pure function pair: dataToPixel and pixelToData.
 * Scales own a data domain and a pixel range, and convert between them.
 */
declare interface Scale {
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

/** A closed data-space interval. `min` and `max` are in data units, not pixels. */
export declare interface ScaleRange {
    /** Lower bound, inclusive. May exceed `max` only transiently during a gesture. */
    min: number;
    /** Upper bound, inclusive. */
    max: number;
}

/**
 * Scale kind for an axis. `time` treats X values as epoch milliseconds and
 * formats ticks in the viewer's local timezone; `log` requires strictly
 * positive domains. Defaults to `linear` when omitted on an axis.
 */
declare type ScaleType = 'linear' | 'log' | 'time';

declare interface ScatterColorEncoding {
    /** Absolute data column index. Column 0 is the default X column. */
    dataIndex: number;
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

/**
 * How a `colorBy` column is interpreted. `auto` treats low-cardinality
 * integer columns as categories and everything else as a continuous ramp.
 */
export declare type ScatterColorEncodingType = 'auto' | 'category' | 'continuous' | 'diverging';

/** Mark glyph for non-density scatter rendering. Defaults to `circle`. */
export declare type ScatterPointShape = 'circle' | 'square' | 'diamond';

/**
 * Scatter draw path. `points` always draws individual marks; `density`
 * always draws a binned heatmap; `auto` (the default) draws points until the
 * visible count crosses the internal density threshold, then switches.
 */
export declare type ScatterRenderMode = 'points' | 'density' | 'auto';

declare interface ScatterSizeEncoding {
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

declare interface ScatterTooltipField {
    /** Absolute data column index whose value is shown for the hovered point. */
    dataIndex: number;
    /** Row label in the tooltip. Defaults to `column N`. */
    label?: string;
    /** Value formatter. Defaults to the number's default string form. */
    format?: (value: number) => string;
}

/** A single scatter point captured inside a box selection. */
declare interface SelectedPoint<TMeta = unknown> {
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

declare interface SelectionConfig {
    /**
     * Callback fired after a box-select gesture resolves (mouse drag /
     * double-tap + drag on touch by default). The `x` range is always set; `y` is
     * only present when the selection tracked both axes.
     */
    onSelect?: (selection: SelectionResult_2) => void;
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

/**
 * A persistent brush selection in data space, safe to serialize (e.g. into a
 * URL). `x` is always present; `y` is reserved for a future 2D brush.
 */
export declare interface SelectionRange {
    x: ScaleRange;
    y?: ScaleRange;
}

export declare interface SelectionResult<Row = Record<string, unknown>> extends SelectionRange {
    points?: readonly ChartPoint<Row>[];
}

declare interface SelectionResult_2<TMeta = unknown> {
    /** Selected X domain. Always present. */
    x: ScaleRange;
    /** Selected Y domain. Present only when the gesture tracked both axes. */
    y?: ScaleRange;
    /** Populated for visible scatter series when the selection spans both axes. */
    points?: SelectedPoint<TMeta>[];
}

export declare interface SeriesBase<Row> extends Omit<SeriesConfig, 'type' | 'label' | 'dataIndex' | 'xDataIndex' | 'yDataIndex' | 'upperDataIndex' | 'lowerDataIndex' | 'xAxisKey' | 'yAxisKey' | 'colorBy' | 'sizeBy' | 'tooltipFields' | 'fill' | 'visible' | 'heatmap'> {
    /** Inferred from a unique Y field; required for computed or ambiguous series. */
    id?: string;
    label?: string;
    data?: DataSource<Row>;
    x?: Accessor<Row, AxisValue>;
    rowId?: Accessor<Row, RowId>;
    xAxis?: string;
    yAxis?: string;
    format?: (value: number, point?: ChartPoint<Row>) => string;
    fill?: string | null | ((value: number, rowIndex: number, row?: Row) => string);
}

declare interface SeriesConfig<TMeta = unknown> {
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
    /**
     * Line / mark outline color (any CSS color). Defaults to the theme's
     * categorical palette entry for this series' index.
     */
    stroke?: string;
    /**
     * Area / bar fill color. `null` forces no fill (useful to draw an
     * `area` series as a bare outline). Defaults to a translucent `stroke`
     * for areas and the series color for bars.
     *
     * Bar series also accept a per-datum callback `(value, index) => color`
     * for emphasis patterns like highlighting the most recent bar:
     *
     * ```ts
     * fill: (v, i) => i === data[0].length - 1 ? '#e8590c' : '#4f8fea'
     * ```
     *
     * Callbacks are honored by bar series only; other series types fall
     * back to their default fill.
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
    /**
     * Vertical fill gradient for `area` series, `top` at the line, `bottom`
     * at the baseline. Overrides `fill`. Each stop is a full CSS color
     * including its own alpha. Default: a translucent `stroke` ramp.
     */
    fillGradient?: {
        top: string;
        bottom: string;
    };
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
    /** Fraction of the category width each bar occupies (0–1). Default 0.8. */
    barWidthRatio?: number;
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
    /** Key of the X axis in `ChartConfig.axes` this series maps onto. Defaults to `'x'`. */
    xAxisKey?: string;
    /**
     * Key of the Y axis this series maps onto. Defaults to `'y'`. Point a
     * second series at a different key (e.g. `'y2'`) for a dual-axis chart.
     */
    yAxisKey?: string;
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

export declare type SeriesOptions<Row> = (SeriesBase<Row> & {
    type?: 'line' | 'area' | 'bar';
    y: Numeric<Row>;
}) | (SeriesBase<Row> & {
    type: 'band';
    y: Numeric<Row>;
    lower: Numeric<Row>;
    upper: Numeric<Row>;
}) | (SeriesBase<Row> & {
    type: 'scatter';
    y: Numeric<Row>;
    colorBy?: ColorEncoding<Row>;
    sizeBy?: SizeEncoding<Row>;
    tooltipFields?: readonly TooltipField<Row>[];
}) | (SeriesBase<Row> & {
    type: 'histogram';
    id: string;
    data: HistogramBins;
});

export declare type SizeEncoding<Row> = Numeric<Row> | (Omit<ScatterSizeEncoding, 'dataIndex'> & {
    field: Numeric<Row>;
});

/** CSS variables consumed by Snaplot's DOM companion components. */
export declare const SNAPLOT_THEME_CSS_VARS: {
    readonly text: "--snaplot-theme-text";
    readonly muted: "--snaplot-theme-muted";
    readonly border: "--snaplot-theme-border";
    readonly hover: "--snaplot-theme-hover";
    readonly highlight: "--snaplot-theme-highlight";
    readonly fontFamily: "--snaplot-theme-font-family";
};

declare interface StreamingConfig {
    /**
     * Retain at most this many points after appendData(). When set, snaplot
     * uses an internal ring buffer so streaming updates do not allocate a new
     * full-window dataset on every tick.
     */
    maxLen?: number;
    /**
     * Live-follow window width in X data units. When set and the chart is
     * "following" (the default until the user pans or zooms X), each
     * `appendData` keeps the X viewport at `[latestX - follow, latestX]`, so
     * the view scrolls with the newest data. Panning or zooming X pauses
     * following; `chart.scrollToLatest()` or a double-click reset resumes it.
     * Without this, a following chart tracks the full data extent instead of a
     * fixed trailing window. Follows the default `x` axis (and any horizontal
     * axis) and propagates through `zoom.syncKey`.
     */
    follow?: number;
}

/**
 * Studio, the home-page light look. Same off-white surface as
 * `lightTheme`, but the palette leads with the Observable / Tableau-10
 * quartet (blue, green, orange, red): the de facto standard for business
 * dashboards. Filled out to 8 with cohesive secondaries so it survives
 * past four series.
 */
export declare const studioTheme: ThemeConfig;

/**
 * Sunset, dusk gold / orange / violet. Gold leads (not pink) so
 * single-series charts land on a warm, grown-up accent; pink and
 * fuchsia stay as later slots for contrast. Deep aubergine bg keeps
 * the warm series popping without burning the eye.
 */
export declare const sunsetTheme: ThemeConfig;

/**
 * A small color swatch matching the series color. Useful when paired
 * with a `nameColumn` that should not include its own dot.
 */
export declare function swatchColumn<Row = Record<string, unknown>>(opts?: {
    size?: number;
    shape?: 'dot' | 'bar';
}): LegendTableColumn<Row>;

/**
 * Chart color and typography tokens.
 *
 * Every color field accepts any CSS color the browser can compute,
 * including `var(--token)` references and `oklch(...)`: values are
 * resolved against the chart container when the theme is applied, and
 * re-resolved automatically when the document theme changes (an attribute
 * flip on `<html>`/`<body>` or an OS color-scheme change), so charts in a
 * CSS-variable design system re-theme live with no remount. Alternatively
 * define the `--chart-*` custom properties (see `CHART_CSS_VARS`) on the
 * container and omit `theme` entirely.
 */
export declare interface ThemeConfig {
    /**
     * Plot background fill. The grid canvas is opaque, so this must resolve to
     * a solid color. Theme overrides may use the special value `'container'`
     * to copy the nearest non-transparent ancestor background color.
     */
    backgroundColor: string;
    /** Primary text color for DOM companions. Axis text uses axisLabelColor when set. */
    textColor: string;
    /** Shared axis title and tick-label color. Built-in themes use the muted text color. */
    axisLabelColor?: string;
    /** CSS font stack for all axis and tooltip text. */
    fontFamily: string;
    /** Base text size in CSS pixels. Built-in themes use 11. */
    fontSize: number;
    /** Gridline hue. Combined with gridOpacity. Built-in frames share this hue and opacity. */
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
     * the rectangle around the plot without touching axis ticks. Built-in
     * themes use the same hue and opacity as the grid.
     */
    borderColor: string;
    /**
     * Opacity of the plot-area frame. Intentionally distinct from
     * `gridOpacity` so the border can sit one visual step above the grid
     * while sharing its hue.
     */
    borderOpacity: number;
    /** Muted companion text color. Built-in themes also use this hue for axisLabelColor. */
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

/** Semantic product tokens for the common “make the chart match my app” path. */
export declare interface ThemeTokens {
    /** Optional named/full theme to extend before semantic tokens are applied. */
    base?: Partial<ThemeConfig>;
    /** Plot surface color, or `'container'` to copy the nearest opaque ancestor. */
    surface?: string;
    /** Primary chart text color. */
    text?: string;
    /** Axis/companion text color; grid, ticks and frame use this hue at 0.18 opacity unless overridden. */
    muted?: string;
    /** Interaction accent, currently used by the crosshair. */
    accent?: string;
    /** Categorical series cycle. Also populates the legacy `palette` role. */
    categorical?: string[];
    /** Ordered magnitude ramp. */
    sequential?: string[];
    /** Signed/centered-data ramp. */
    diverging?: string[];
    /** Density/heatmap ramp; defaults through the normal role cascade. */
    heatmap?: string[];
    fontFamily?: string;
    fontSize?: number;
    gridOpacity?: number;
    borderOpacity?: number;
    tooltip?: {
        surface?: string;
        text?: string;
        border?: string;
    };
}

/**
 * Tokyo, the home-page dark look. Slate background paired with the
 * Tokyo Night editor quartet (soft blue, sage, orange, rose), softer
 * pastels tuned for dark backgrounds so no line glares.
 */
export declare const tokyoTheme: ThemeConfig;

declare interface TooltipConfig {
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
    render?: (points: TooltipPoint[]) => string | HTMLElement;
}

export declare type TooltipField<Row> = Accessor<Row, number | string | null | undefined> | (Omit<ScatterTooltipField, 'dataIndex'> & {
    field: Accessor<Row, number | string | null | undefined>;
});

/** One extra scatter column value in a tooltip row. */
declare interface TooltipFieldValue {
    /** Field label from `ScatterTooltipField.label` (or `column N`). */
    label: string;
    /** Raw value at the point's row. */
    value: number;
    /** Value run through the field's `format`. */
    formatted: string;
}

/** One row passed to a custom `tooltip.render`. */
declare interface TooltipPoint {
    /** Index of the owning series in `ChartConfig.series`. */
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
    /** X value pre-formatted via the x-axis `tickFormat`. */
    formattedX: string;
    /** Y value pre-formatted via the y-axis `tickFormat`. */
    formattedY: string;
    /** Mark radius in CSS pixels; present for scatter points only. */
    radius?: number;
    /** Extra scatter columns requested via `series.tooltipFields`. */
    fields?: TooltipFieldValue[];
}

declare interface TouchConfig {
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

/**
 * Find the index of the last element <= value (upper bound).
 * If all elements are > value, returns -1.
 */
export declare function upperBound(arr: Float64Array, value: number): number;

/**
 * The current value at the cursor. Right-aligned and tabular-numeric
 * by default. Pass a custom `format` for precision/units; pass
 * `placeholder` for what to show when the snapshot is in `series-only`
 * fallback (default: `'—'`).
 */
export declare function valueColumn<Row = Record<string, unknown>>(opts?: {
    format?: (value: number, point: ChartPoint<Row>) => string;
    placeholder?: string;
    align?: 'left' | 'right' | 'center';
    header?: string;
}): LegendTableColumn<Row>;

export declare type Viewport = Record<string, ScaleRange>;

/**
 * Find viewport indices [left, right] for the given data range.
 * Includes ±1 point beyond the viewport so lines entering/leaving
 * the visible area are drawn continuously.
 */
export declare function viewportIndices(xData: Float64Array, viewMin: number, viewMax: number): [number, number];

/**
 * Violet, premium dark in the Linear / Vercel aesthetic. Rich
 * aubergine-black with a cohesive lavender-to-indigo cycle; a single
 * amber slot breaks the cool palette for legend legibility. No
 * saturated magentas or fuchsias, restraint is the whole point.
 */
export declare const violetTheme: ThemeConfig;

/**
 * Per-axis bounds for zoom and pan. `'data'` tracks the current data
 * extent; an explicit `{ min?, max? }` pins custom limits (use
 * `undefined` on one side for half-open bounds).
 */
declare type ZoomBoundsSpec = 'data' | 'unbounded' | {
    min?: number;
    max?: number;
};

declare interface ZoomConfig {
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
    bounds?: boolean | ZoomBoundsSpec | {
        x?: ZoomBoundsSpec;
        y?: ZoomBoundsSpec;
    };
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

export { }
