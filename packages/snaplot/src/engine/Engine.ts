import type {
  ChartSpec,
  ChartEventMap,
  AppendDataOptions,
  ColumnarData,
  CursorEventOrigin,
  CursorSnapshot,
  CursorSnapshotOptions,
  DeepPartial,
  EngineHost,
  Layout,
  LegendItem,
  Plugin,
  Scale,
  ScaleRange,
  SelectionRange,
  SeriesSpec,
  StreamingSpec,
  ThemeConfig,
  TooltipPoint,
} from './spec';
import { DirtyFlag } from './spec';

// The canvases, the frame loop and the input.
import { CanvasManager } from './render/surface';
import { RenderScheduler } from './render/scheduler';
import { EventBus } from './interaction/bus';
import { GestureManager } from './interaction/gestures';
import { TooltipManager } from '../dom/tooltip';

// Data, scales, options and theme.
import type { DataStore } from './data/DataStore';
import { validateMaxLen } from './data/DataStore';
import { ColumnarStore } from './data/ColumnarStore';
import type { ColumnRangeIndex, ScatterColumnRangeIndex } from './data/columnRangeIndex';
import { RingColumnarStore } from './data/RingColumnarStore';
import { createScale } from './scales/createScale';
import { formatValue, scaleStepDecimals } from './format';
import { deepMerge } from './merge';
import { DEFAULT_CONFIG } from './defaults';
import { applyThemeToElement, resolveTheme } from './theme/resolve';
import { type HostedPlugin, PluginHost } from './plugins';

// The engine's modules: functions of the engine, which own the logic named in their files.
import { rangeForDataChange, autoRange, invalidateRangeCache, type BarXAxisPlan } from './ranging';
import {
  applyFollowWindow,
  unpinMissedAxes,
  setAxis,
  getNaturalRange,
  setCoordinatedAxis,
  pinnedAxes,
  applyViewport,
  resetZoom,
  scrollToLatest,
} from './viewport';
import { getSelection, setSelection, reconcileSelectionForDataChange } from './selection';
import {
  setCursorDataX,
  refreshCursor,
  cancelPendingTouchCursor,
  getCursorSnapshot,
} from './cursor';
import { setHighlight } from './highlight';
import { HitTester } from './hit';
import { computeCustomXTicks } from './axes/ticks';
import { renderAxes } from './axes/render';
import { type AxesRenderResult, updateDOMLabels } from './axes/labels';
import {
  inferPosition,
  type PlotInsets,
  setPlotInsets,
  naturalGutters,
  layoutIsStale,
  updateLayout,
  updateScalePixelRanges,
} from './layout';
import { renderAllSeries } from './marks/index';
import type { ScatterSeriesCache } from './marks/scatter';
import type { ScatterStyleResolver, ScatterPalettes } from './marks/scatterEncoding';
import { renderOverlay } from './render/overlay';
import { wireEvents } from './interaction/actions';
import { debugSnapshot, type DataPassSeries, type DebugSnapshot } from './debug';

/**
 * The engine's composition root (plan §3.1): it owns the state (the sources' stores, the scales,
 * the layout, the theme, the cursor, selection and viewport state) and the parts that hold DOM
 * or timers (canvases, scheduler, gestures, tooltip, plugins), and paints the three layers.
 *
 * The logic lives in the modules beside it, as functions that take the engine first:
 * ranging.ts (domains), viewport.ts (pinned axes, follow, zoom and pan, bounds), selection.ts,
 * cursor.ts (hover and the cursor snapshot), highlight.ts, hit.ts, axes/ (ticks, grid, labels),
 * layout.ts, marks/index.ts (the series pass), render/overlay.ts (the overlay pass),
 * interaction/actions.ts (what each gesture does) and debug.ts (the D31 counters). Fields
 * without `private` are the state those modules read and write, and the helpers they call back
 * (stores, palettes, readouts, `emitEvent`) are public for them too; the engine methods the
 * public layer calls delegate to the modules. The class is internal: no public declaration
 * names it.
 */
export class ChartCore implements EngineHost {
  coordinatingAxis = false;

  // Public
  readonly container: HTMLElement;

  // Internal modules
  canvasManager: CanvasManager;
  scheduler: RenderScheduler;
  eventBus: EventBus;
  sourceStores: DataStore[] = [];
  seriesSources: readonly number[] = [];
  scales: Map<string, Scale> = new Map();
  layout!: Layout;
  layoutCacheKey = '';
  theme!: ThemeConfig;
  /**
   * Block-aggregate range indexes for viewport-driven vertical auto-range,
   * built lazily on the first pan/zoom query after a data change. Keyed by
   * series column (or x:y column pair for arbitrary-X scatter). The
   * data-change auto-range path deliberately does not build these: a
   * streaming append per tick would pay an O(n) rebuild for a single query.
   */
  rangeIndexVersion = -1;
  columnRangeIndexes = new Map<string, ColumnRangeIndex>();
  scatterRangeIndexes = new Map<string, ScatterColumnRangeIndex>();
  /**
   * Per-series scatter render caches (heatmap bitmaps), keyed by series
   * index. Owned here so two charts, or two density series in one chart,
   * never share cache slots. Entries self-invalidate on data identity and
   * viewport changes; the map is dropped wholesale on store replacement so
   * stale bitmaps do not retain replaced Float64Array columns.
   */
  scatterSeriesCaches = new Map<number, ScatterSeriesCache>();
  /**
   * Interaction-pass state: while the viewport is actively changing,
   * scatter series above the `performance.interactionSampling` budget are
   * stride-sampled, then repainted at full fidelity once the viewport has
   * been quiet for INTERACTION_REFINE_MS.
   */
  viewportActiveUntil = 0;
  refineTimer: ReturnType<typeof setTimeout> | null = null;
  sampledLastDataRender = false;
  /**
   * Scatter style resolvers cached per series index. Building one scans
   * the encoded columns (colorBy/sizeBy domains, category detection), so
   * it must happen once per data/config/theme change, not once per frame
   * or per pointer move. Domains derive from the full column: a point's
   * color and size stay stable while the viewport pans.
   *
   * Two views share one scan: the render loop addresses points by
   * physical index (segment ranges), hit-testing and selection by logical
   * index.
   */
  scatterEncodingCache = new Map<
    number,
    {
      series: SeriesSpec;
      theme: ThemeConfig;
      version: number;
      renderResolver: ScatterStyleResolver;
      logicalResolver: ScatterStyleResolver;
    }
  >();

  private gestureManager: GestureManager;
  hitTester: HitTester;
  tooltipManager: TooltipManager;
  private plugins = new PluginHost<unknown>();

  // Config
  config: ChartSpec;

  // Cursor state
  cursorX: number | null = null;
  cursorY: number | null = null;
  cursorDataX: number | null = null;
  cursorDataIdx: number | null = null;
  tooltipPoints: TooltipPoint[] = [];
  /** True when cursor position comes from local pointer events (not sync) */
  cursorIsLocal = false;
  /** Raw mouse position in CSS pixels (not snapped), used for tooltip placement */
  mouseX: number | null = null;
  mouseY: number | null = null;
  /** Pointer type of the most recent cursor event, drives hit-test radius. */
  lastPointerType: 'mouse' | 'touch' | 'pen' = 'mouse';
  pendingTouchCursor: { x: number; y: number; pointerType: 'touch' | 'pen' } | null = null;
  touchCursorFrame: number | null = null;
  /**
   * Re-resolves the theme when the document's theming context changes: an
   * attribute flip on <html>/<body> (the [data-theme] pattern) or an OS
   * color-scheme change. Only repaints when the resolved theme actually
   * differs, so the observer is effectively free outside real theme flips.
   */
  private themeObserver: MutationObserver | null = null;
  private colorSchemeQuery: MediaQueryList | null = null;
  private themeRefreshQueued = false;
  private boundSchemeChange = () => this.queueThemeRefresh();
  /** Active selection box (shift+drag) */
  selectionBox: { x1: number; y1: number; x2: number; y2: number } | null = null;
  /** Persistent brush selection in data space (selection.mode: 'brush'). */
  selection: SelectionRange | null = null;
  /** Selection value at the last emitted selection:change, to skip no-op emits. */
  lastEmittedSelection: SelectionRange | null = null;
  /** In-progress brush drag interaction. */
  brushDrag: {
    mode: 'create' | 'move' | 'resize-min' | 'resize-max';
    anchorDataX: number;
    orig: ScaleRange;
  } | null = null;
  /** Transient tap-feedback ring, cleared automatically once its lifetime expires. */
  tapFeedback: { x: number; y: number; startTime: number } | null = null;
  /**
   * Axis keys the user has actively zoomed. Suppresses auto-range on those
   * axes during data updates so a zoomed Y (or X) doesn't snap back on the
   * next data replacement or append. Cleared by resetZoom().
   */
  userZoomedAxes = new Set<string>();

  /**
   * Live-follow state: the X viewport tracks new data while true, and is
   * pinned by a user pan/zoom while false. Starts true; toggled by the first
   * horizontal viewport change, by `scrollToLatest()`, and by `resetZoom()`.
   */
  following = true;

  // Event listeners. Handlers have per-event signatures (see ChartEventMap);
  // the storage is a contravariant-friendly callable so every event's
  // handler shape assigns in without a cast (Function is banned by lint).
  private listeners = new Map<string, Set<(...args: never[]) => unknown>>();

  // Cleanup
  destroyed = false;

  // Highlight state
  highlightedSeries: number | null = null;

  /** Bumped by every data change: the range index and the hit and density caches key on it. */
  dataVersion = 0;
  // D31 debug counters; see DebugSnapshot. Ring stores share this object.
  debugCounters = {
    ingestCount: 0,
    materializeCount: 0,
    renderCount: { grid: 0, data: 0, overlay: 0 },
  };
  lastDataPass: DataPassSeries[] = [];
  lastAxisLabels: AxesRenderResult['labels'] | null = null;

  // Readout precision per axis (plan P9), recomputed when the domain or the
  // tick settings change; read on the cursor hot path.
  private readoutSteps = new Map<
    string,
    { scale: Scale; min: number; max: number; ticks?: number[]; count?: number; decimals: number }
  >();
  readonly readoutY = (value: number, seriesIndex: number): string =>
    this.formatReadout(this.config.series[seriesIndex]?.yAxis ?? 'y', value);

  /**
   * Per-axis "reset-zoom" extent, the scale's min/max after the last
   * `autoRange*` pass (including axis-config pins and any explicit
   * `nice: true` expansion). Used by `zoom.bounds: 'data'` so zoom-out stops
   * at the same range `resetZoom()` would produce.
   */
  naturalExtent = new Map<string, [number, number]>();
  barXAxisPlans = new Map<string, BarXAxisPlan>();
  /** A chart group's minimum side gutters (`setPlotInsets`). */
  plotInsets: PlotInsets = {};
  /** naturalGutters()'s cache, keyed by the layout inputs. */
  natural?: { key: string; left: number; right: number };

  constructor(
    parent: HTMLElement,
    config: ChartSpec,
    /** The data sources, and the source each series reads (one per series). */
    sources: { sources: readonly ColumnarData[]; seriesSources: readonly number[] },
    /**
     * Leave the first paint to the owner's `paint()`, called once it has
     * installed the plugins it adds through `use()` after construction. Its
     * first paint is then the only one at mount, and it draws them.
     */
    deferFirstPaint = false,
    /**
     * The sources were validated by the public ingest (one X pass, plan §3.4):
     * the stores take them without scanning X again.
     */
    trusted = false,
  ) {
    this.container = parent;

    // 1. Merge config with defaults
    this.config = deepMerge(
      DEFAULT_CONFIG as unknown as Record<string, unknown>,
      config as unknown as Record<string, unknown>,
    ) as unknown as ChartSpec;

    // 1b. Apply interaction mode presets (if zoom/pan not explicitly configured)
    this.applyModePresets(config);

    // 1c. Validate the merged config against the initial sources.
    this.validateSources(this.config, sources.sources, sources.seriesSources, trusted);

    // 2. Create canvas layers
    // Resize and DPR callbacks run outside the frame loop (a ResizeObserver
    // delivers after this frame's rAF callbacks and before paint), and a
    // reallocation cleared every layer. Paint now, or the cleared, opaque grid
    // is composited as a black frame (gap-scale-longevity-01). A delivery
    // that reallocated nothing (the first observation at mount, or a box
    // shown again at its old size) needs work only when the layout was made
    // for another box, such as the fallback size while display: none.
    this.canvasManager = new CanvasManager(parent, (w, h, reallocated) => {
      if (!reallocated && !layoutIsStale(this)) return;
      this.onResize(w, h);
      this.scheduler.flush();
    });

    // 3. Resolve theme, and keep it live: token-driven apps flip themes by
    // swapping an attribute on <html>/<body> or via the OS color scheme,
    // and a canvas cannot track CSS variables by itself the way SVG can.
    this.theme = resolveTheme(parent, this.config.theme);
    applyThemeToElement(parent, this.theme);
    if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
      this.themeObserver = new MutationObserver(() => this.queueThemeRefresh());
      this.themeObserver.observe(document.documentElement, { attributes: true });
      if (document.body) this.themeObserver.observe(document.body, { attributes: true });
    }
    if (typeof matchMedia !== 'undefined') {
      this.colorSchemeQuery = matchMedia('(prefers-color-scheme: dark)');
      this.colorSchemeQuery.addEventListener?.('change', this.boundSchemeChange);
    }

    // 4. Create data stores
    this.sourceStores = sources.sources.map((source) => this.createDataStore(source, trusted));
    this.seriesSources = sources.seriesSources.slice();
    this.debugCounters.ingestCount++;

    // 5. Create EventBus. Each gesture action is one user action: the owner hears where it
    // starts and ends, so it can report the action's changes once (plan D3).
    this.eventBus = new EventBus((run) => {
      this.emitEvent('action', true);
      try {
        run();
      } finally {
        this.emitEvent('action', false);
      }
    });

    // 6. Create scales
    this.initAxes();

    // 7. Compute initial layout
    updateLayout(this);

    // 8. Create interaction handlers
    // If the user pinned a hitRadius via `touch.hitRadius`, that becomes
    // the global override (applies to both touch and mouse). Otherwise
    // HitTester picks per-pointer defaults: 44 px for touch, 32 for mouse.
    this.hitTester = new HitTester(this.config.touch?.hitRadius);
    this.tooltipManager = new TooltipManager(this.theme);

    this.gestureManager = new GestureManager(
      this.canvasManager.interactionLayer,
      this.eventBus,
      () => this.config.mode ?? 'timeseries',
      () => this.layout,
      () => this.config.zoom ?? { enabled: true, x: true },
      () => this.config.pan ?? { enabled: true, x: true },
      () => this.config.touch ?? {},
      this.canvasManager.container,
    );

    // 9. Plugins are added after construction: the built-in annotations through use(), the
    // user's through setPlugins() once the owner's handle exists (plan D21).

    // 10. Wire EventBus listeners
    wireEvents(this);

    // 11. Attach gesture manager
    this.gestureManager.attach();

    // 12. Create render scheduler and schedule initial draw
    this.scheduler = new RenderScheduler((flags) => this.render(flags));

    // 13. Auto-resize
    if (this.config.autoResize !== false) {
      this.canvasManager.enableAutoResize();
    }

    // 14. Initial render
    this.canvasManager.resize(
      this.canvasManager.cssWidth || parent.clientWidth || 600,
      this.canvasManager.cssHeight || parent.clientHeight || 400,
    );
    updateLayout(this);
    updateScalePixelRanges(this);
    this.scheduler.markDirty(DirtyFlag.ALL);
    if (!deferFirstPaint) this.scheduler.flush();
  }

  setPlotInsets(insets: PlotInsets): void {
    setPlotInsets(this, insets);
  }

  naturalGutters(): { left: number; right: number } {
    return naturalGutters(this);
  }

  /** The element that holds the canvases and the label layer. */
  get root(): HTMLElement {
    return this.canvasManager.container;
  }

  /**
   * Size the canvases to the root's box now, after chrome beside it (the built-in legend)
   * changed it, instead of waiting for the ResizeObserver: the next paint has the right size.
   */
  fitToRoot(): void {
    if (this.destroyed) return;
    const width = this.canvasManager.cssWidth;
    const height = this.canvasManager.cssHeight;
    if (width > 0 && height > 0 && this.canvasManager.resize(width, height))
      this.onResize(width, height);
  }

  /**
   * Paint the dirty layers now instead of on the next frame: the first paint
   * of an engine constructed with `deferFirstPaint`.
   */
  paint(): void {
    if (this.destroyed) return;
    this.scheduler.flush();
  }

  // ─── Engine API (createChart's controller) ──────────────────

  /** Replace a prepared configuration and its independent sources as one transaction. */
  replaceSources(
    config: ChartSpec,
    sources: readonly ColumnarData[],
    seriesSources: readonly number[],
    trusted = false,
  ): void {
    if (this.destroyed) return;
    // Resolve and validate the complete candidate before replacing any live store.
    const resolved = deepMerge(
      DEFAULT_CONFIG as unknown as Record<string, unknown>,
      config as unknown as Record<string, unknown>,
    ) as unknown as ChartSpec;
    this.validateSources(resolved, sources, seriesSources, trusted);
    const maxLen = resolved.streaming?.maxPoints;
    if (maxLen !== undefined) validateMaxLen(maxLen);
    const build = () =>
      sources.map((data) =>
        maxLen === undefined
          ? new ColumnarStore(data)
          : new RingColumnarStore(data, maxLen, this.debugCounters),
      );
    const stores = trusted ? ColumnarStore.trusted(build) : build();
    this.sourceStores = stores;
    this.seriesSources = seriesSources.slice();
    invalidateRangeCache(this);
    unpinMissedAxes(this, resolved);
    this.dataVersion++;
    this.debugCounters.ingestCount++;
    this.replaceOptions(config);
    reconcileSelectionForDataChange(this);
    refreshCursor(this);
  }

  getSourceData(sourceIndex: number): ColumnarData {
    const store = this.sourceStores[sourceIndex];
    if (!store) throw new Error(`Unknown data source ${sourceIndex}`);
    return store.getData();
  }

  getSourceLength(sourceIndex: number): number {
    return this.sourceStores[sourceIndex]?.length ?? 0;
  }

  getSourceValue(sourceIndex: number, columnIndex: number, rowIndex: number): number {
    return this.sourceStores[sourceIndex]?.valueAt(columnIndex, rowIndex) ?? Number.NaN;
  }

  private validateSources(
    config: ChartSpec,
    sources: readonly ColumnarData[],
    indices: readonly number[],
    trusted: boolean,
  ): void {
    if (sources.length === 0) throw new Error('At least one data source is required');
    if (indices.length !== config.series.length)
      throw new Error('Each series requires a data source index');
    if (!trusted) for (const source of sources) ColumnarStore.validate(source);
    for (let si = 0; si < config.series.length; si++) {
      const sourceIndex = indices[si];
      if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= sources.length) {
        throw new Error(`Invalid data source for series ${si}`);
      }
    }
  }

  storeForSeries(seriesIndex: number): DataStore {
    return this.sourceStores[this.seriesSources[seriesIndex] ?? 0] ?? this.sourceStores[0];
  }

  hasData(): boolean {
    return this.sourceStores.some((store) => store.length > 0);
  }

  sourceExtent(axisKey?: string): [number, number] | null {
    let min = Infinity;
    let max = -Infinity;
    const stores =
      axisKey === undefined
        ? this.sourceStores
        : new Set(
            this.config.series.flatMap((series, si) =>
              series.visible !== false && (series.xAxis ?? 'x') === axisKey
                ? [this.storeForSeries(si)]
                : [],
            ),
          );
    for (const store of stores) {
      if (!store.length) continue;
      min = Math.min(min, store.xAt(0));
      max = Math.max(max, store.xAt(store.length - 1));
    }
    return min === Infinity ? null : [min, max];
  }

  appendToSource(
    sourceIndex: number,
    data: ColumnarData,
    opts?: AppendDataOptions,
    /** The public ingest validated the batch and its order. */
    trusted = false,
  ): void {
    if (this.destroyed) return;
    if (!this.sourceStores[sourceIndex]) throw new Error(`Unknown data source ${sourceIndex}`);
    this.ensureStoreMatchesStreaming();
    const store = this.sourceStores[sourceIndex];
    if (!trusted) ColumnarStore.validate(data);
    if (data.length !== store.seriesCount + 1)
      throw new Error('Appended columns must match the source schema');
    if (!trusted && data[0].length && store.length) {
      const previousIndex = opts?.updateLast ? store.length - 2 : store.length - 1;
      if (previousIndex >= 0 && data[0][0] < store.xAt(previousIndex))
        throw new Error('Appended X values must preserve source order');
    }

    const write = () => {
      if (opts?.updateLast && store.length > 0 && data.length > 0 && data[0].length > 0) {
        store.replaceLast(Array.from(data, (col) => col[0]));
        if (data[0].length > 1) {
          store.append(data.map((col) => col.subarray(1)) as ColumnarData);
        }
        return true;
      }
      return store.append(data);
    };
    const changed = trusted ? ColumnarStore.trusted(write) : write();
    if (!changed) return;

    this.dataVersion++;
    const gridDirty = rangeForDataChange(this);
    reconcileSelectionForDataChange(this);
    refreshCursor(this);
    this.scheduler.markDirty(gridDirty ? DirtyFlag.DATA | DirtyFlag.GRID : DirtyFlag.DATA);
  }

  setAxis(key: string, range: Partial<ScaleRange>): void {
    setAxis(this, key, range);
  }

  getNaturalRange(key: string): ScaleRange | undefined {
    return getNaturalRange(this, key);
  }

  setCoordinatedAxis(key: string, range: ScaleRange): void {
    setCoordinatedAxis(this, key, range);
  }

  getAxis(key: string): Scale | undefined {
    return this.scales.get(key);
  }

  /** Whether an axis is drawn along the bottom or top edge. */
  isHorizontalAxis(key: string): boolean {
    const position = inferPosition(key, this.config.axes?.[key]?.position);
    return position === 'bottom' || position === 'top';
  }

  pinnedAxes(): Record<string, ScaleRange> {
    return pinnedAxes(this);
  }

  applyViewport(viewport: Readonly<Record<string, ScaleRange>>): void {
    applyViewport(this, viewport);
  }

  setOptions(partial: DeepPartial<ChartSpec>): void {
    if (this.destroyed) return;
    this.config = deepMerge(
      this.config as unknown as Record<string, unknown>,
      partial as unknown as Record<string, unknown>,
    ) as unknown as ChartSpec;
    this.applyConfigSideEffects(partial, false);
  }

  replaceOptions(config: ChartSpec): void {
    if (this.destroyed) return;
    this.config = deepMerge(
      DEFAULT_CONFIG as unknown as Record<string, unknown>,
      config as unknown as Record<string, unknown>,
    ) as unknown as ChartSpec;
    this.applyConfigSideEffects(config, true);
  }

  private applyConfigSideEffects(partial: DeepPartial<ChartSpec>, fullReplace: boolean): void {
    let themeChanged = false;
    if (fullReplace || partial.mode) {
      this.applyModePresets(partial);
      this.gestureManager.updateTouchAction();
    }

    if (fullReplace || partial.theme) {
      const previousTheme = this.theme;
      this.theme = resolveTheme(this.container, this.config.theme);
      themeChanged = JSON.stringify(previousTheme) !== JSON.stringify(this.theme);
      applyThemeToElement(this.container, this.theme);
      this.tooltipManager.applyTheme(this.theme);
    }

    this.ensureStoreMatchesStreaming();
    this.initAxes();
    updateLayout(this);
    updateScalePixelRanges(this);
    autoRange(this);
    // Reapply the follow window that autoRange just overwrote with the full
    // extent, so a config update does not knock a following chart off its
    // trailing window (matches initAxes).
    if (this.following) applyFollowWindow(this);
    this.scheduler.markDirty(DirtyFlag.ALL);
    this.emitEvent('options:update', this.config);
    if (themeChanged) this.emitEvent('theme:update', this.theme);
  }

  getOptions(): ChartSpec {
    return this.config;
  }

  getTheme(): ThemeConfig {
    return this.theme;
  }

  getLegendItems(): LegendItem[] {
    const palette = this.categoricalPalette();
    return this.config.series.map((series, seriesIndex) => {
      const type = series.type ?? 'line';
      const color = series.color ?? palette[(series.paletteIndex ?? seriesIndex) % palette.length];
      const configuredFill = typeof series.fill === 'string' ? series.fill : null;
      const fill =
        series.fill === null
          ? null
          : (configuredFill ?? (type === 'line' || type === 'scatter' ? null : color));
      return {
        seriesIndex,
        label: series.label,
        type,
        visible: series.visible !== false,
        color,
        fill,
        lineWidth: series.lineWidth ?? 1.5,
        dash: series.dash ? [...series.dash] : [],
        opacity: series.opacity ?? 1,
        meta: series.meta,
      };
    });
  }

  refreshTheme(): void {
    if (this.destroyed) return;
    const next = resolveTheme(this.container, this.config.theme);
    // Attribute churn on <html> is far more common than actual theme
    // flips; a value-level compare keeps the no-op case paint-free.
    if (JSON.stringify(next) === JSON.stringify(this.theme)) return;
    this.theme = next;
    applyThemeToElement(this.container, next);
    this.tooltipManager.applyTheme(next);
    this.scheduler.markDirty(DirtyFlag.ALL);
    this.emitEvent('theme:update', next);
  }

  /** Collapse observer bursts (class + style + data-theme often flip together). */
  private queueThemeRefresh(): void {
    if (this.themeRefreshQueued || this.destroyed) return;
    this.themeRefreshQueued = true;
    setTimeout(() => {
      this.themeRefreshQueued = false;
      this.refreshTheme();
    }, 0);
  }

  getLayout(): Layout {
    return this.layout;
  }

  /**
   * Repaint a layer on the next frame: `'overlay'`, `'data'` (the marks and what plugins draw
   * above them) or `'all'`, which also resolves the theme from the page again.
   */
  redraw(layer: 'overlay' | 'data' | 'all' = 'all'): void {
    if (this.destroyed) return;
    if (layer === 'all') this.refreshTheme();
    this.scheduler.markDirty(
      layer === 'overlay' ? DirtyFlag.OVERLAY : layer === 'data' ? DirtyFlag.DATA : DirtyFlag.ALL,
    );
  }

  resetZoom(): void {
    resetZoom(this);
  }

  scrollToLatest(): void {
    scrollToLatest(this);
  }

  isFollowing(): boolean {
    return this.following;
  }

  getSelection(): SelectionRange | null {
    return getSelection(this);
  }

  setSelection(selection: SelectionRange | null): void {
    setSelection(this, selection);
  }

  resize(width: number, height: number): void {
    if (this.destroyed) return;
    this.canvasManager.resize(width, height);
    this.onResize(width, height);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    cancelPendingTouchCursor(this);
    if (this.refineTimer !== null) {
      clearTimeout(this.refineTimer);
      this.refineTimer = null;
    }
    this.themeObserver?.disconnect();
    this.themeObserver = null;
    this.colorSchemeQuery?.removeEventListener?.('change', this.boundSchemeChange);
    this.colorSchemeQuery = null;

    this.scheduler.destroy();
    this.gestureManager.detach();
    this.tooltipManager.destroy();
    this.eventBus.destroy();
    this.plugins.destroy(this);
    this.canvasManager.destroy();
    this.listeners.clear();
  }

  /** Add a built-in plugin (the reference lines and regions), drawn before the user's. */
  use(plugin: Plugin): void {
    if (this.destroyed) return;
    this.plugins.addBuiltin(plugin, this);
    this.scheduler.markDirty(DirtyFlag.ALL);
  }

  /**
   * Reconcile the user plugins by id (plan D21); their draw hooks receive `chart`, the owner's
   * public handle. A new object for an installed id only repaints.
   */
  setPlugins(plugins: readonly HostedPlugin<unknown>[], chart: unknown): void {
    if (this.destroyed) return;
    this.plugins.reconcile(plugins, chart);
    this.scheduler.markDirty(DirtyFlag.ALL);
  }

  on<K extends keyof ChartEventMap>(event: K, handler: ChartEventMap[K]): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  setCursorDataX(dataX: number | null, origin: CursorEventOrigin = 'programmatic'): void {
    setCursorDataX(this, dataX, origin);
  }

  // ─── Cursor snapshot (legend table data source) ─────────────

  getCursorSnapshot(opts?: CursorSnapshotOptions): CursorSnapshot {
    return getCursorSnapshot(this, opts);
  }

  // ─── Highlight (series highlight + dim) ─────────────────────

  setHighlight(seriesIndex: number | null): void {
    setHighlight(this, seriesIndex);
  }

  getHighlight(): number | null {
    return this.highlightedSeries;
  }

  /** The data X of the cursor, or `null` when there is none. */
  getCursorX(): number | null {
    return this.cursorDataX;
  }

  debugSnapshot(): DebugSnapshot {
    return debugSnapshot(this);
  }

  // ─── Private: Initialization ────────────────────────────────

  /**
   * Apply interaction mode presets to zoom/pan config.
   * Mode presets provide default zoom/pan axes while preserving explicit
   * zoom/pan fields supplied by the caller.
   */
  private applyModePresets(source?: DeepPartial<ChartSpec>): void {
    const mode = this.config.mode;
    if (!mode) return;

    const zoom = source?.zoom;
    const pan = source?.pan;

    if (mode === 'analytical') {
      this.config.zoom = {
        ...this.config.zoom,
        enabled: zoom?.enabled ?? true,
        x: zoom?.x ?? true,
        y: zoom?.y ?? true,
      };
      this.config.pan = {
        ...this.config.pan,
        enabled: pan?.enabled ?? true,
        x: pan?.x ?? true,
        y: pan?.y ?? true,
      };
    } else if (mode === 'timeseries') {
      this.config.zoom = {
        ...this.config.zoom,
        enabled: zoom?.enabled ?? true,
        x: zoom?.x ?? true,
        y: zoom?.y ?? false,
      };
      this.config.pan = {
        ...this.config.pan,
        enabled: pan?.enabled ?? true,
        x: pan?.x ?? true,
        y: pan?.y ?? false,
      };
    } else if (mode === 'readonly') {
      this.config.zoom = { enabled: false };
      this.config.pan = { enabled: false };
    }
  }

  private createDataStore(data: ColumnarData, trusted = false): DataStore {
    const maxLen = this.streamingMaxLen();
    const build = () =>
      maxLen === undefined
        ? new ColumnarStore(data)
        : new RingColumnarStore(data, maxLen, this.debugCounters);
    return trusted ? ColumnarStore.trusted(build) : build();
  }

  private ensureStoreMatchesStreaming(): void {
    const maxLen = this.streamingMaxLen();
    // The stores' data was validated when it was stored.
    this.sourceStores = ColumnarStore.trusted(() =>
      this.sourceStores.map((store) => {
        if (maxLen !== undefined) {
          if (store instanceof RingColumnarStore && store.maxLen === maxLen) return store;
          invalidateRangeCache(this);
          return new RingColumnarStore(store.getData(), maxLen, this.debugCounters);
        }
        if (!(store instanceof RingColumnarStore)) return store;
        invalidateRangeCache(this);
        return new ColumnarStore(store.getData());
      }),
    );
  }

  private streamingMaxLen(): number | undefined {
    const maxLen = (this.config.streaming as StreamingSpec | undefined)?.maxPoints;
    if (maxLen !== undefined) validateMaxLen(maxLen);
    return maxLen;
  }

  private initAxes(): void {
    const axisConfigs = this.config.axes ?? {};

    // Ensure X and Y axes exist
    if (!axisConfigs.x) {
      axisConfigs.x = { type: 'linear' };
    }
    if (!axisConfigs.y) {
      axisConfigs.y = { type: 'linear' };
    }
    // Write back so layout.ts and axes/render.ts can see all axes
    this.config.axes = axisConfigs;

    for (const key of Array.from(this.scales.keys())) {
      if (!axisConfigs[key]) {
        this.scales.delete(key);
        this.naturalExtent.delete(key);
        this.userZoomedAxes.delete(key);
      }
    }

    for (const [key, ac] of Object.entries(axisConfigs)) {
      if (!this.scales.has(key) || this.scales.get(key)!.type !== (ac.type ?? 'linear')) {
        const scale = createScale(ac.type ?? 'linear', key, ac.min, ac.max);
        this.scales.set(key, scale);
      } else {
        const existing = this.scales.get(key)!;
        if (!this.userZoomedAxes.has(key)) {
          if (ac.min !== undefined) existing.min = ac.min;
          if (ac.max !== undefined) existing.max = ac.max;
        }
      }
    }

    autoRange(this);
    // A configured follow window overrides full-extent X on first paint and
    // after a config replace, as long as the user has not paused following.
    if (this.following) applyFollowWindow(this);
  }

  // ─── Private: Render pipeline ───────────────────────────────

  /**
   * Main render method. Called by RenderScheduler via rAF.
   * Follows the exact pipeline from §2.3.
   */
  private render(flags: DirtyFlag): void {
    if (this.destroyed) return;

    // Overlay-only frames are the cursor hot path. Layout/tick measurement is
    // only needed when grid or data layers redraw (resize/config/data/viewport).
    if (flags & (DirtyFlag.GRID | DirtyFlag.DATA)) {
      updateLayout(this);
      updateScalePixelRanges(this);
    }

    // Step 4a: Grid layer (axes, gridlines)
    if (flags & DirtyFlag.GRID) {
      this.canvasManager.clear('grid');

      // Compute custom X ticks for bar/histogram charts
      const customXTicks = computeCustomXTicks(this);

      const labels = renderAxes(
        this.canvasManager.gridCtx,
        this.layout,
        this.scales,
        this.theme,
        this.config,
        customXTicks,
      );
      updateDOMLabels(this.canvasManager.domLayer, labels, this.theme, this.layout);
      this.lastAxisLabels = labels.labels;
      this.plugins.draw('below', this.canvasManager.gridCtx, this, this.layout.plot);
      this.debugCounters.renderCount.grid++;
    }

    // Step 4b: Data layer (series marks)
    if (flags & DirtyFlag.DATA) {
      this.canvasManager.clear('data');
      renderAllSeries(this);
      this.plugins.draw('above', this.canvasManager.dataCtx, this, this.layout.plot);
      this.debugCounters.renderCount.data++;
    }

    // Step 4c: Overlay layer (crosshair, tooltip)
    if (flags & DirtyFlag.OVERLAY) {
      this.canvasManager.clear('overlay');
      renderOverlay(this);
      this.plugins.draw('overlay', this.canvasManager.overlayCtx, this, this.layout.plot);
      this.debugCounters.renderCount.overlay++;
    }
  }

  // ─── Private: Helpers ───────────────────────────────────────

  categoricalPalette(): string[] {
    return this.theme.categoricalPalette ?? this.theme.palette;
  }

  scatterPalettes(): ScatterPalettes {
    return {
      categorical: this.categoricalPalette(),
      sequential: this.theme.sequentialPalette ?? this.theme.heatmapGradient,
      diverging: this.theme.divergingPalette,
    };
  }

  isValidColumn(columnIdx: number, store: DataStore): boolean {
    return Number.isInteger(columnIdx) && columnIdx >= 0 && columnIdx <= store.seriesCount;
  }

  /**
   * A value readout on `axisKey` at value precision (plan P9): never the tick
   * formatter, whose precision is the tick step's. A time axis reads as a
   * time (§5.2), through its tick format until M10's time readout. Internal;
   * also used by the public controller.
   */
  formatReadout(axisKey: string, value: number): string {
    const scale = this.scales.get(axisKey);
    if (!scale) return formatValue(value);
    if (scale.type === 'time') return scale.tickFormat(value);
    const axis = this.config.axes?.[axisKey];
    let step = this.readoutSteps.get(axisKey);
    if (
      !step ||
      step.scale !== scale ||
      step.min !== scale.min ||
      step.max !== scale.max ||
      step.ticks !== axis?.ticks ||
      step.count !== axis?.tickCount
    ) {
      step = {
        scale,
        min: scale.min,
        max: scale.max,
        ticks: axis?.ticks,
        count: axis?.tickCount,
        decimals: scaleStepDecimals(scale, axis?.ticks, axis?.tickCount),
      };
      this.readoutSteps.set(axisKey, step);
    }
    return formatValue(value, { stepDecimals: step.decimals });
  }

  /** A readout where the axis's own format already applied (histogram counts, multi-source rows). */
  formatAxisReadout(axisKey: string, value: number): string {
    const axisFormat = this.config.axes?.[axisKey]?.format;
    return axisFormat ? axisFormat(value) : this.formatReadout(axisKey, value);
  }

  formatAxisValue(axisKey: string, value: number): string {
    const axisFormat = this.config.axes?.[axisKey]?.format;
    if (axisFormat) return axisFormat(value);
    return this.scales.get(axisKey)?.tickFormat(value) ?? String(value);
  }

  formatHistogramBinRange(min: number, max: number, seriesIndex = 0): string {
    const tooltip = this.config.tooltip;
    if (tooltip?.rangeFormat) return tooltip.rangeFormat(min, max, seriesIndex);

    const series = this.config.series[seriesIndex];
    const axisKey = series?.xAxis ?? 'x';
    const format = tooltip?.xFormat ?? ((value: number) => this.formatAxisValue(axisKey, value));
    let formattedMin = format(min);
    let formattedMax = format(max);

    // Coarse axis formatters can collapse two different bin edges to the same
    // label. Preserve an intelligible interval without forcing app code to
    // supply a histogram-only formatter.
    if (min !== max && formattedMin === formattedMax && !tooltip?.xFormat) {
      const width = Math.abs(max - min);
      const decimals = width > 0 ? Math.max(0, Math.min(6, Math.ceil(-Math.log10(width)))) : 0;
      formattedMin = min.toFixed(decimals);
      formattedMax = max.toFixed(decimals);
    }
    return `${formattedMin} \u2013 ${formattedMax}`;
  }

  private onResize(width: number, height: number): void {
    updateLayout(this);
    updateScalePixelRanges(this);
    this.scheduler.markDirty(DirtyFlag.ALL);
    this.emitEvent('resize', width, height);
  }

  emitEvent(event: string, ...args: any[]): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        // The per-event handler signature lives in ChartEventMap and is
        // enforced at `.on()` registration time; the dispatch side is
        // variadic by design.
        (handler as (...a: unknown[]) => unknown)(...args);
      } catch (err) {
        // One bad handler must not stop the render loop or other subscribers.
        console.error(`[snaplot] '${event}' handler threw:`, err);
      }
    }
  }
}
