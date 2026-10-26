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
  ThemeConfig,
  TooltipPoint,
} from './spec';
import { DirtyFlag } from './spec';

// The canvases, the frame loop and the input.
import { CanvasManager } from './render/surface';
import { RenderScheduler, watchPrint, watchTheme, watchVisibility } from './render/scheduler';
import { EventBus } from './interaction/bus';
import { GestureManager } from './interaction/gestures';
import { TooltipManager } from '../dom/tooltip';

// Data, options and theme.
import type { DataStore } from './data/DataStore';
import type { ColumnRangeIndex, ScatterColumnRangeIndex } from './data/columnRangeIndex';
import { axisReadout } from './format';
import { deepMerge } from './merge';
import { DEFAULT_CONFIG } from './defaults';
import { applyThemeToElement, resolveTheme } from './theme/resolve';
import { cssColor, resolveColor } from './theme/color';
import { type HostedPlugin, PluginHost } from './plugins';
import { EngineEvents } from './events';

// The engine's modules: functions of the engine, which own the logic named in their files.
import {
  appendToSource,
  createDataStore,
  ensureStoreMatchesStreaming,
  getSourceData,
  replaceSources,
  sourceExtent,
  validateSources,
} from './sources';
import { autoRange, type BarXAxisPlan, initAxes } from './ranging';
import {
  applyFollowWindow,
  setAxis,
  getNaturalRange,
  setCoordinatedAxis,
  pinnedAxes,
  applyViewport,
  resetZoom,
  scrollToLatest,
} from './viewport';
import { getSelection, setSelection } from './selection';
import { setCursorDataX, cancelPendingTouchCursor, getCursorSnapshot } from './cursor';
import { setHighlight } from './highlight';
import { HitTester } from './hit';
import { computeCustomXTicks } from './axes/ticks';
import { renderAxes } from './axes/render';
import { type LabelBox, updateDOMLabels } from './axes/labels';
import {
  inferPosition,
  type PlotInsets,
  reserveChrome,
  setPlotInsets,
  naturalGutters,
  layoutIsStale,
  updateLayout,
  updateScalePixelRanges,
} from './layout';
import { legendItems, renderAllSeries } from './marks/index';
import type { ScatterSeriesCache } from './marks/scatter/draw';
import type { ScatterPalettes, ScatterResolvers } from './marks/scatter/encoding';
import { renderOverlay } from './render/overlay';
import { wireEvents } from './interaction/actions';
import { applyModePresets } from './interaction/modes';
import { debugSnapshot, type DataPassSeries, type DebugSnapshot } from './debug';

/**
 * The engine's composition root (plan §3.1): it owns the state (the sources' stores, the scales,
 * the layout, the theme, the cursor, selection and viewport state) and the parts that hold DOM
 * or timers (canvases, scheduler, gestures, tooltip, plugins), and paints the three layers.
 *
 * The logic lives in the modules beside it, as functions that take the engine first:
 * sources.ts (stores, replacement, appends), ranging.ts (domains), viewport.ts (pinned axes,
 * follow, zoom and pan, bounds), selection.ts, cursor.ts (hover and the cursor snapshot),
 * highlight.ts, hit.ts, format.ts, axes/ (ticks, grid, labels), layout.ts, marks/ (the mark
 * registry and the series pass), render/overlay.ts (the overlay pass), interaction/actions.ts
 * (what each gesture does) and debug.ts (the D31 counters); docs/architecture.md maps them.
 * Fields without `private` are the state those modules read and write, and the helpers they call
 * back (stores, palettes, `emitEvent`) are public for them too; the engine methods the public
 * layer calls delegate to the modules. The class is internal: no public declaration names it.
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
  /** Scatter style resolvers per series index (marks/scatter/encoding.ts `scatterResolvers`). */
  scatterEncodingCache = new Map<number, ScatterResolvers>();

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
   * Stops re-resolving the theme when the document's theming context changes (render/scheduler.ts
   * `watchTheme`). Only a theme that actually differs repaints, so the watch is effectively free
   * outside real theme flips.
   */
  private unwatchTheme: () => void;
  private unwatchVisibility: () => void;
  private unwatchPrint: () => void;
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

  /** The outward events to the public layer (events.ts). */
  private events = new EngineEvents();

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
  /** The labels of the last grid paint (the debug hook's `labelBoxes()`). */
  lastAxisLabels: LabelBox[] | null = null;

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
    applyModePresets(this.config, config);

    // 1c. Validate the merged config against the initial sources.
    validateSources(this.config, sources.sources, sources.seriesSources, trusted);

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
    this.canvasManager.setHeight(this.config.height);

    // 3. Resolve theme, and keep it live: token-driven apps flip themes by
    // swapping an attribute on <html>/<body> or via the OS color scheme,
    // and a canvas cannot track CSS variables by itself the way SVG can.
    this.theme = resolveTheme(parent, this.config.theme);
    applyThemeToElement(parent, this.theme);
    this.unwatchTheme = watchTheme(() => this.refreshTheme());

    // 4. Create data stores
    this.sourceStores = sources.sources.map((source) => createDataStore(this, source, trusted));
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
    initAxes(this);

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

    // 12. Create render scheduler and schedule initial draw. Frames wait while the chart is
    // offscreen (plan D37); printing paints every chart now, and hides the tooltip.
    this.scheduler = new RenderScheduler((flags) => this.render(flags));
    this.unwatchVisibility = watchVisibility(parent, (visible) =>
      this.scheduler.setVisible(visible),
    );
    this.unwatchPrint = watchPrint(() => {
      this.scheduler.setVisible(true);
      this.scheduler.flush();
      this.tooltipManager.hide();
    });

    // 13. Auto-resize
    if (this.config.autoResize !== false) {
      this.canvasManager.enableAutoResize();
    }

    // 14. Initial render, at the 300 px fallback in a host that gives the chart no height.
    this.canvasManager.sizeToHost();
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

  /** Reserve CSS pixels at the top or bottom of the root for chrome (layout.ts `reserveChrome`). */
  reserveChrome(side: 'top' | 'bottom', px: number): void {
    reserveChrome(this, side, px);
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
    replaceSources(this, config, sources, seriesSources, trusted);
  }

  getSourceData(sourceIndex: number): ColumnarData {
    return getSourceData(this, sourceIndex);
  }

  getSourceLength(sourceIndex: number): number {
    return this.sourceStores[sourceIndex]?.length ?? 0;
  }

  getSourceValue(sourceIndex: number, columnIndex: number, rowIndex: number): number {
    return this.sourceStores[sourceIndex]?.valueAt(columnIndex, rowIndex) ?? Number.NaN;
  }

  storeForSeries(seriesIndex: number): DataStore {
    return this.sourceStores[this.seriesSources[seriesIndex] ?? 0] ?? this.sourceStores[0];
  }

  hasData(): boolean {
    return this.sourceStores.some((store) => store.length > 0);
  }

  sourceExtent(axisKey?: string): [number, number] | null {
    return sourceExtent(this, axisKey);
  }

  appendToSource(
    sourceIndex: number,
    data: ColumnarData,
    opts?: AppendDataOptions,
    /** The public ingest validated the batch and its order. */
    trusted = false,
  ): void {
    appendToSource(this, sourceIndex, data, opts, trusted);
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
      applyModePresets(this.config, partial);
      this.gestureManager.updateTouchAction();
    }

    if (fullReplace || 'height' in partial) {
      this.canvasManager.setHeight(this.config.height);
      this.fitToRoot();
    }

    if (fullReplace || partial.theme) {
      const previousTheme = this.theme;
      this.theme = resolveTheme(this.container, this.config.theme);
      themeChanged = JSON.stringify(previousTheme) !== JSON.stringify(this.theme);
      applyThemeToElement(this.container, this.theme);
      this.tooltipManager.applyTheme(this.theme);
    }

    ensureStoreMatchesStreaming(this);
    initAxes(this);
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

  /**
   * A user colour as the canvas can paint it: `var()` resolves in the container's cascade, once
   * per theme (a theme refresh re-reads the custom properties); anything else returns unchanged.
   */
  resolveColor(color: string): string {
    if (!color.includes('var(')) return color;
    if (this.colorCacheTheme !== this.theme) {
      this.colorCache.clear();
      this.colorCacheTheme = this.theme;
    }
    let resolved = this.colorCache.get(color);
    if (resolved === undefined) {
      const rgba = resolveColor(color, this.container);
      resolved = rgba ? cssColor(rgba) : color;
      this.colorCache.set(color, resolved);
    }
    return resolved;
  }
  private readonly colorCache = new Map<string, string>();
  private colorCacheTheme: ThemeConfig | null = null;

  getLegendItems(): LegendItem[] {
    return legendItems(this);
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
    this.unwatchTheme();
    this.unwatchVisibility();
    this.unwatchPrint();

    this.scheduler.destroy();
    this.gestureManager.detach();
    this.tooltipManager.destroy();
    this.eventBus.destroy();
    this.plugins.destroy(this);
    this.canvasManager.destroy();
    this.events.clear();
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
    return this.events.on(event, handler);
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
      // The overlay's backing store is allocated the first time it has something to show.
      if (
        this.cursorX !== null ||
        this.selection ||
        this.selectionBox ||
        this.tapFeedback ||
        this.plugins.drawsIn('overlay')
      )
        this.canvasManager.activateOverlay();
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
   * The automatic value readout on `axisKey` (engine/format.ts `axisReadout`), for the public
   * layer's cursor points.
   */
  formatReadout(axisKey: string, value: number): string {
    return axisReadout(this, axisKey, value);
  }

  private onResize(width: number, height: number): void {
    updateLayout(this);
    updateScalePixelRanges(this);
    this.scheduler.markDirty(DirtyFlag.ALL);
    this.emitEvent('resize', width, height);
  }

  emitEvent(event: string, ...args: any[]): void {
    this.events.emit(event, ...args);
  }
}
