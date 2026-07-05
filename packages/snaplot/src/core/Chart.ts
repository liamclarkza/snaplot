import type {
  ChartInstance,
  ChartConfig,
  ChartEventMap,
  ChartStats,
  AppendDataOptions,
  AxisConfig,
  ColumnarData,
  CursorEventOrigin,
  CursorSnapshot,
  CursorSnapshotOptions,
  DeepPartial,
  HighlightSyncKey,
  HighlightSyncPayload,
  Layout,
  Plugin,
  Scale,
  ScaleRange,
  SeriesConfig,
  StreamingConfig,
  ThemeConfig,
  TooltipPoint,
  ZoomBoundsSpec,
} from '../types';
import { DirtyFlag } from '../types';

import { CanvasManager } from './CanvasManager';
import { RenderScheduler } from './RenderScheduler';
import { EventBus, SyncGroup } from './EventBus';
import { computeLayout, inferPosition } from './Layout';
import { shouldValidateConfig, validateChartConfig } from './validateConfig';

import type { ColumnarSegment, DataStore } from '../data/DataStore';
import { validateMaxLen } from '../data/DataStore';
import { ColumnarStore } from '../data/ColumnarStore';
import { ColumnRangeIndex, ScatterColumnRangeIndex } from '../data/columnRangeIndex';
import { RingColumnarStore } from '../data/RingColumnarStore';
import { createScale } from '../scales/createScale';
import {
  AUTO_RANGE_PADDING,
  DEFAULT_INTERACTION_SAMPLING,
  DEFAULT_TICK_COUNT,
  INTERACTION_REFINE_MS,
  MIN_DRAG_DISTANCE,
} from '../constants';

import { deepMerge } from '../config/merge';
import { DEFAULT_CONFIG } from '../config/defaults';
import { resolveTheme } from '../config/theme';

import { renderAxes, updateDOMLabels } from '../renderers/AxesRenderer';
import { renderLineSegments, renderAreaSegments, renderBandSegments } from '../renderers/LineRenderer';
import { isDensityScatterSeries, renderScatterSegments, ScatterSeriesCache } from '../renderers/ScatterRenderer';
import {
  buildScatterEncodingState,
  normalizeScatterColorBy,
  normalizeScatterSizeBy,
  resolverFromEncodingState,
  type ScatterStyleResolver,
  seriesYDataIndex,
  scatterXDataIndex,
  type ScatterPalettes,
} from '../renderers/scatterEncoding';
import { renderBarsSegments } from '../renderers/BarRenderer';
import { barRectForCategory, categoryWidthFromData } from '../renderers/barGeometry';
import { renderHistogramSegments } from '../renderers/HistogramRenderer';
import { renderCrosshair, renderSelectionBox, renderTapRing } from '../renderers/InteractionRenderer';

import { GestureManager } from '../interaction/GestureManager';
import { HitTester } from '../interaction/HitTester';
import { TooltipManager } from '../interaction/TooltipManager';

import { PluginManager } from '../plugins/PluginManager';
import { isDarkColor } from '../utils/color';

// Stable identity for user tickFormat functions in the layout cache key.
// Stringifying the function body per frame allocated the whole source text
// on every render; a WeakMap id is O(1) and never retains the function.
const tickFormatIds = new WeakMap<(value: number) => string, number>();
let nextTickFormatId = 1;

function tickFormatId(fn: ((value: number) => string) | undefined): number {
  if (!fn) return 0;
  let id = tickFormatIds.get(fn);
  if (id === undefined) {
    id = nextTickFormatId++;
    tickFormatIds.set(fn, id);
  }
  return id;
}

/**
 * Chart, the composition root.
 *
 * Wires together: CanvasManager, RenderScheduler, EventBus, ColumnarStore,
 * Scales, Layout, Renderers, Interaction handlers, Plugins.
 *
 * Render pipeline follows the exact order from §2.3 of the plan.
 */
export class ChartCore implements ChartInstance {
  // Public
  readonly container: HTMLElement;

  // Internal modules
  private canvasManager: CanvasManager;
  private scheduler: RenderScheduler;
  private eventBus: EventBus;
  private store: DataStore;
  private scales: Map<string, Scale> = new Map();
  private layout!: Layout;
  private layoutCacheKey = '';
  private theme!: ThemeConfig;
  /**
   * Block-aggregate range indexes for viewport-driven vertical auto-range,
   * built lazily on the first pan/zoom query after a data change. Keyed by
   * series column (or x:y column pair for arbitrary-X scatter). The
   * data-change auto-range path deliberately does not build these: a
   * streaming append per tick would pay an O(n) rebuild for a single query.
   */
  private rangeIndexVersion = -1;
  private columnRangeIndexes = new Map<number, ColumnRangeIndex>();
  private scatterRangeIndexes = new Map<string, ScatterColumnRangeIndex>();
  /**
   * Per-series scatter render caches (heatmap bitmaps), keyed by series
   * index. Owned here so two charts, or two density series in one chart,
   * never share cache slots. Entries self-invalidate on data identity and
   * viewport changes; the map is dropped wholesale on store replacement so
   * stale bitmaps do not retain replaced Float64Array columns.
   */
  private scatterSeriesCaches = new Map<number, ScatterSeriesCache>();
  /**
   * Interaction-pass state: while the viewport is actively changing,
   * scatter series above the `performance.interactionSampling` budget are
   * stride-sampled, then repainted at full fidelity once the viewport has
   * been quiet for INTERACTION_REFINE_MS.
   */
  private viewportActiveUntil = 0;
  private refineTimer: ReturnType<typeof setTimeout> | null = null;
  private sampledLastDataRender = false;
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
  private scatterEncodingCache = new Map<
    number,
    {
      series: SeriesConfig;
      theme: ThemeConfig;
      version: number;
      renderResolver: ScatterStyleResolver;
      logicalResolver: ScatterStyleResolver;
    }
  >();

  private gestureManager: GestureManager;
  private hitTester: HitTester;
  private tooltipManager: TooltipManager;
  private pluginManager: PluginManager;

  // Config
  private config: ChartConfig;

  // Cursor state
  private cursorX: number | null = null;
  private cursorY: number | null = null;
  private cursorDataX: number | null = null;
  private cursorDataIdx: number | null = null;
  private tooltipPoints: TooltipPoint[] = [];
  /** True when cursor position comes from local pointer events (not sync) */
  private cursorIsLocal = false;
  /** Raw mouse position in CSS pixels (not snapped), used for tooltip placement */
  private mouseX: number | null = null;
  private mouseY: number | null = null;
  /** Pointer type of the most recent cursor event, drives hit-test radius. */
  private lastPointerType: 'mouse' | 'touch' | 'pen' = 'mouse';
  private pendingTouchCursor: { x: number; y: number; pointerType: 'touch' | 'pen'; publishSync: boolean } | null = null;
  private touchCursorFrame: number | null = null;
  /** Active selection box (shift+drag) */
  private selectionBox: { x1: number; y1: number; x2: number; y2: number } | null = null;
  /** Transient tap-feedback ring, cleared automatically once its lifetime expires. */
  private tapFeedback: { x: number; y: number; startTime: number } | null = null;
  /**
   * Axis keys the user has actively zoomed. Suppresses auto-range on those
   * axes during data updates so a zoomed Y (or X) doesn't snap back on the
   * next setData/appendData tick. Cleared by resetZoom().
   */
  private userZoomedAxes = new Set<string>();

  /**
   * Live-follow state: the X viewport tracks new data while true, and is
   * pinned by a user pan/zoom while false. Starts true; toggled by the first
   * horizontal viewport change, by `scrollToLatest()`, and by `resetZoom()`.
   */
  private following = true;

  // Event listeners. Handlers have per-event signatures (see ChartEventMap);
  // the storage is a contravariant-friendly callable so every event's
  // handler shape assigns in without a cast (Function is banned by lint).
  private listeners = new Map<string, Set<(...args: never[]) => unknown>>();

  // Cleanup
  private destroyed = false;
  private syncKey: string | null = null;
  private highlightSyncKey: string | null = null;
  private zoomSyncKey: string | null = null;
  private lastPublishedCursorDataX: number | null | undefined = undefined;
  /** Guard to suppress zoom sync publishing when applying a peer's broadcast */
  private suppressZoomSync = false;

  // Highlight state
  private highlightedSeries: number | null = null;

  // Diagnostics. Counters are cheap and always maintained; render duration
  // measurement is gated by config.debug.stats in the render path.
  private stats: ChartStats = {
    dataVersion: 0,
    setDataCount: 0,
    appendDataCount: 0,
    renderCount: { grid: 0, data: 0, overlay: 0 },
    lastRenderMs: { grid: 0, data: 0, overlay: 0 },
  };

  /**
   * Per-axis "reset-zoom" extent, the scale's min/max after the last
   * `autoRange*` pass (including axis-config pins and any explicit
   * `nice: true` expansion). Used by `zoom.bounds: 'data'` so zoom-out stops
   * at the same range `resetZoom()` would produce.
   */
  private naturalExtent = new Map<string, [number, number]>();

  constructor(parent: HTMLElement, config: ChartConfig, data?: ColumnarData) {
    this.container = parent;

    // 1. Merge config with defaults
    this.config = deepMerge(
      DEFAULT_CONFIG as unknown as Record<string, unknown>,
      config as unknown as Record<string, unknown>,
    ) as unknown as ChartConfig;

    // 1b. Apply interaction mode presets (if zoom/pan not explicitly configured)
    this.applyModePresets(config);

    // 1c. Validate the merged config against any initial data (dev only).
    if (shouldValidateConfig()) validateChartConfig(this.config, data);

    // 2. Create canvas layers
    this.canvasManager = new CanvasManager(parent, (w, h) => {
      this.onResize(w, h);
    });

    // 3. Resolve theme
    this.theme = resolveTheme(parent, this.config.theme);

    // 4. Create data store
    const initialData = data ?? [new Float64Array(0)];
    this.store = this.createDataStore(initialData);

    // 5. Create EventBus
    this.eventBus = new EventBus();

    // 6. Create scales
    this.initAxes();

    // 7. Compute initial layout
    this.updateLayout();

    // 8. Create interaction handlers
    // If the user pinned a hitRadius via `touch.hitRadius`, that becomes
    // the global override (applies to both touch and mouse). Otherwise
    // HitTester picks per-pointer defaults: 44 px for touch, 32 for mouse.
    this.hitTester = new HitTester(this.config.touch?.hitRadius);
    this.tooltipManager = new TooltipManager(this.theme);

    this.gestureManager = new GestureManager(
      this.canvasManager.interactionLayer,
      this.eventBus,
      () => this.config.interaction ?? 'timeseries',
      () => this.layout,
      () => this.config.zoom ?? { enabled: true, x: true },
      () => this.config.pan ?? { enabled: true, x: true },
      () => this.config.touch ?? {},
      this.canvasManager.container,
    );

    // 9. Create plugin manager and register plugins
    this.pluginManager = new PluginManager();
    for (const plugin of this.config.plugins ?? []) {
      this.pluginManager.register(plugin);
    }
    this.pluginManager.installAll(this);

    // 10. Wire EventBus listeners
    this.wireEvents();

    // 11. Attach gesture manager
    this.gestureManager.attach();

    // 12. Join sync group(s) if configured
    this.reconcileSyncGroups();

    // 13. Create render scheduler and schedule initial draw
    this.scheduler = new RenderScheduler((flags) => this.render(flags));

    // 14. Auto-resize
    if (this.config.autoResize !== false) {
      this.canvasManager.enableAutoResize();
    }

    // 15. Initial render
    this.canvasManager.resize(
      this.canvasManager.cssWidth || parent.clientWidth || 600,
      this.canvasManager.cssHeight || parent.clientHeight || 400,
    );
    this.updateLayout();
    this.updateScalePixelRanges();
    this.scheduler.markDirty(DirtyFlag.ALL);
    this.scheduler.flush();
  }

  // ─── Public API (ChartInstance) ─────────────────────────────

  setData(data: ColumnarData): void {
    if (this.destroyed) return;
    if (shouldValidateConfig()) validateChartConfig(this.config, data);
    this.setStoreData(data);
    this.stats.dataVersion++;
    this.stats.setDataCount++;
    const gridDirty = this.rangeForDataChange();
    this.refreshCursor();
    this.scheduler.markDirty(gridDirty ? DirtyFlag.DATA | DirtyFlag.GRID : DirtyFlag.DATA);
    this.dispatchDataUpdate();
  }

  appendData(data: ColumnarData, opts?: AppendDataOptions): void {
    if (this.destroyed) return;
    this.ensureStoreMatchesStreaming();

    let changed: boolean;
    if (opts?.updateLast && this.store.length > 0 && data.length > 0 && data[0].length > 0) {
      this.store.replaceLast(Array.from(data, (col) => col[0]));
      if (data[0].length > 1) {
        this.store.append(data.map((col) => col.subarray(1)) as ColumnarData);
      }
      changed = true;
    } else {
      changed = this.store.append(data);
    }
    if (!changed) return;

    this.stats.dataVersion++;
    this.stats.appendDataCount++;
    const gridDirty = this.rangeForDataChange();
    this.refreshCursor();
    this.scheduler.markDirty(gridDirty ? DirtyFlag.DATA | DirtyFlag.GRID : DirtyFlag.DATA);
    this.dispatchDataUpdate();
  }

  /**
   * Range the axes after a data change. When live-follow is active with a
   * window, the X viewport is pinned to the trailing window and only Y
   * auto-ranges; otherwise the normal auto-range runs (which itself respects
   * user-zoomed axes). Returns whether the grid layer needs a repaint.
   */
  private rangeForDataChange(): boolean {
    if (this.following && this.followWindow() !== undefined && this.store.length > 0) {
      return this.applyFollowWindow();
    }
    return this.autoRangeTracked();
  }

  private followWindow(): number | undefined {
    const follow = (this.config.streaming as StreamingConfig | undefined)?.follow;
    if (follow === undefined) return undefined;
    // A non-positive window is meaningless; treat it as "no window" so the
    // chart follows the full extent rather than collapsing to a zero span.
    return follow > 0 ? follow : undefined;
  }

  /**
   * Pin every horizontal axis to `[latestX - window, latestX]` (clamped to
   * the data) and re-fit Y over that window. Returns whether any bound moved,
   * so the caller knows if the grid must repaint.
   */
  private applyFollowWindow(): boolean {
    const window = this.followWindow();
    if (window === undefined || this.store.length === 0) return false;
    const lastX = this.store.xAt(this.store.length - 1);
    const dataMin = this.store.xAt(0);
    const min = Math.max(dataMin, lastX - window);

    let moved = false;
    const axisConfigs = this.config.axes ?? {};
    for (const [key, scale] of this.scales) {
      const pos = inferPosition(key, axisConfigs[key]?.position);
      if (pos !== 'bottom' && pos !== 'top') continue;
      if (scale.min !== min || scale.max !== lastX) moved = true;
      scale.min = min;
      scale.max = lastX;
      this.naturalExtent.set(key, [min, lastX]);
      if (this.zoomSyncKey && !this.suppressZoomSync) {
        SyncGroup.publishScale(this.zoomSyncKey, this, key, { min, max: lastX });
      }
    }
    if (!this.config.zoom?.y) this.autoRangeVertical(true);
    return moved;
  }

  /**
   * Run auto-range and report whether the grid layer needs a repaint.
   * When no scale moved (zoomed or pinned axes during streaming), ticks
   * and gridlines are unchanged and a data update can skip the grid layer
   * entirely. Bar and histogram X ticks derive from data positions rather
   * than the domain alone, so those charts always repaint the grid.
   */
  private autoRangeTracked(): boolean {
    const hasBarLike = this.config.series.some(
      (s) => s.visible !== false && (s.type === 'bar' || s.type === 'histogram'),
    );
    if (hasBarLike) {
      this.autoRange();
      return true;
    }

    let signature = '';
    for (const [key, scale] of this.scales) {
      signature += key + ':' + scale.min + ':' + scale.max + '|';
    }
    this.autoRange();
    let after = '';
    for (const [key, scale] of this.scales) {
      after += key + ':' + scale.min + ':' + scale.max + '|';
    }
    return signature !== after;
  }

  getData(): ColumnarData {
    return this.store.getData();
  }

  setAxis(key: string, range: Partial<ScaleRange>): void {
    if (this.destroyed) return;
    const scale = this.scales.get(key);
    if (!scale) return;

    if (range.min !== undefined) scale.min = range.min;
    if (range.max !== undefined) scale.max = range.max;

    // A peer-applied viewport must survive the next data update the same way a
    // local zoom does. Without marking the axis user-zoomed, this receiving
    // chart's next setData/appendData would auto-range back to the full extent
    // and snap out of sync with the chart that drove the zoom.
    this.userZoomedAxes.add(key);

    // When X axis changes (e.g. from a zoom sync peer), re-fit Y axis
    // to the new visible X range, otherwise the band/data may clip.
    const ac = this.config.axes?.[key];
    const pos = inferPosition(key, ac?.position);
    const isHoriz = pos === 'bottom' || pos === 'top';
    if (isHoriz && !this.config.zoom?.y) {
      this.autoRangeVertical(true);
    }

    // Sync peers relay a gesture in flight on another chart, so they get
    // the same interaction-pass sampling the originating chart does.
    this.markViewportActive();

    // Suppress zoom sync to prevent infinite peer→peer loops.
    // setAxis is the entry point for SyncGroup.publishScale() peers.
    this.suppressZoomSync = true;
    this.scheduler.markDirty(DirtyFlag.DATA | DirtyFlag.GRID | DirtyFlag.OVERLAY);
    this.emitEvent('viewport:change', key, { min: scale.min, max: scale.max });
    this.suppressZoomSync = false;
  }

  getAxis(key: string): Scale | undefined {
    return this.scales.get(key);
  }

  setOptions(partial: DeepPartial<ChartConfig>): void {
    if (this.destroyed) return;
    // Plugins are object instances, deep-merge would corrupt them.
    // Handle plugin updates separately: destroy old, install new.
    const newPlugins = (partial as Partial<ChartConfig>).plugins;
    if (newPlugins) {
      this.pluginManager.destroyAll(this);
      // Remove plugins from the merge input to avoid deep-merging instances
      const { plugins: _, ...rest } = partial as Partial<ChartConfig>;
      this.config = deepMerge(
        this.config as unknown as Record<string, unknown>,
        rest as unknown as Record<string, unknown>,
      ) as unknown as ChartConfig;
      this.config.plugins = newPlugins;
      for (const plugin of newPlugins) {
        this.pluginManager.register(plugin);
      }
      this.pluginManager.installAll(this);
    } else {
      this.config = deepMerge(
        this.config as unknown as Record<string, unknown>,
        partial as unknown as Record<string, unknown>,
      ) as unknown as ChartConfig;
    }

    if (shouldValidateConfig()) {
      // Structural checks only here: a config update can legitimately add a
      // series that references a column arriving with a later setData, so
      // column-index bounds are validated by setData and the constructor, not
      // against whatever data happens to be loaded now.
      validateChartConfig(this.config);
    }
    this.applyConfigSideEffects(partial, false);
  }

  replaceOptions(config: ChartConfig): void {
    if (this.destroyed) return;
    const previousPlugins = this.config.plugins ?? [];
    this.config = deepMerge(
      DEFAULT_CONFIG as unknown as Record<string, unknown>,
      config as unknown as Record<string, unknown>,
    ) as unknown as ChartConfig;

    const nextPlugins = this.config.plugins ?? [];
    // Compare by content, not reference: a fresh declarative config passes a
    // new array instance every call (so `!==` would rebuild every time, even
    // with the same or zero plugins), while a caller who mutates and re-passes
    // the same instance would never reinstall. Rebuild only when the plugin
    // set actually changed.
    const samePlugins =
      nextPlugins.length === previousPlugins.length &&
      nextPlugins.every((plugin, i) => plugin === previousPlugins[i]);
    if (!samePlugins) {
      this.pluginManager.destroyAll(this);
      this.pluginManager = new PluginManager();
      for (const plugin of nextPlugins) {
        this.pluginManager.register(plugin);
      }
      this.pluginManager.installAll(this);
    }

    if (shouldValidateConfig()) {
      // Structural checks only here: a config update can legitimately add a
      // series that references a column arriving with a later setData, so
      // column-index bounds are validated by setData and the constructor, not
      // against whatever data happens to be loaded now.
      validateChartConfig(this.config);
    }
    this.applyConfigSideEffects(config, true);
  }

  private applyConfigSideEffects(partial: DeepPartial<ChartConfig>, fullReplace: boolean): void {
    if (fullReplace || partial.interaction) {
      this.applyModePresets(partial);
      this.gestureManager.updateTouchAction();
    }

    if (fullReplace || partial.theme) {
      this.theme = resolveTheme(this.container, this.config.theme);
      this.tooltipManager.applyTheme(this.theme);
    }

    this.ensureStoreMatchesStreaming();
    this.reconcileSyncGroups();
    this.initAxes();
    this.updateLayout();
    this.updateScalePixelRanges();
    this.autoRange();
    this.scheduler.markDirty(DirtyFlag.ALL);
    this.emitEvent('options:update', this.config);
    this.pluginManager.dispatch('onSetOptions', this);
  }

  getOptions(): ChartConfig {
    return this.config;
  }

  getTheme(): ThemeConfig {
    return this.theme;
  }

  getLayout(): Layout {
    return this.layout;
  }

  redraw(): void {
    this.scheduler.markDirty(DirtyFlag.ALL);
  }

  /** Reset zoom to full data extent (double-click handler) */
  resetZoom(): void {
    this.userZoomedAxes.clear();
    this.setFollowing(true);
    this.autoRangeHorizontal();
    // Follow window (if configured) takes precedence over full-extent X.
    this.applyFollowWindow();
    this.autoRangeVertical();
    this.scheduler.markDirty(DirtyFlag.ALL);

    if (this.zoomSyncKey && !this.suppressZoomSync) {
      for (const [scaleKey, scale] of this.scales) {
        SyncGroup.publishScale(this.zoomSyncKey, this, scaleKey, { min: scale.min, max: scale.max });
      }
    }
  }

  scrollToLatest(): void {
    if (this.destroyed) return;
    this.userZoomedAxes.clear();
    this.setFollowing(true);
    if (this.followWindow() !== undefined && this.store.length > 0) {
      this.applyFollowWindow();
    } else {
      this.autoRangeHorizontal();
      this.autoRangeVertical();
    }
    this.refreshCursor();
    this.scheduler.markDirty(DirtyFlag.ALL);
    if (this.zoomSyncKey && !this.suppressZoomSync) {
      for (const [scaleKey, scale] of this.scales) {
        SyncGroup.publishScale(this.zoomSyncKey, this, scaleKey, { min: scale.min, max: scale.max });
      }
    }
  }

  isFollowing(): boolean {
    return this.following;
  }

  /** Set follow state and emit `follow:change` only on a real transition. */
  private setFollowing(next: boolean): void {
    if (this.following === next) return;
    this.following = next;
    this.emitEvent('follow:change', next);
  }

  resize(width: number, height: number): void {
    if (this.destroyed) return;
    this.canvasManager.resize(width, height);
    this.onResize(width, height);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    this.cancelPendingTouchCursor();
    if (this.refineTimer !== null) {
      clearTimeout(this.refineTimer);
      this.refineTimer = null;
    }
    this.scheduler.destroy();
    this.gestureManager.detach();
    this.tooltipManager.destroy();
    this.eventBus.destroy();
    this.pluginManager.destroyAll(this);
    this.canvasManager.destroy();
    this.listeners.clear();

    this.leaveSyncGroups();
  }

  use(plugin: Plugin): boolean {
    if (this.destroyed) return false;
    const registered = this.pluginManager.register(plugin);
    if (!registered) return false;
    plugin.install?.(this);
    // Keep config.plugins in sync so the plugin lifecycle is identical no
    // matter which entry point installed it: a later setOptions/replaceOptions
    // rebuilds from config.plugins and would otherwise silently drop a
    // use()-installed plugin. Reassign a new array rather than mutating the
    // existing one, which may be the caller's array or the shared default.
    this.config.plugins = [...(this.config.plugins ?? []), plugin];
    return true;
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
    this.cursorIsLocal = false; // Sync-driven cursor

    if (dataX === null) {
      this.cursorX = null;
      this.cursorY = null;
      this.cursorDataX = null;
      this.cursorDataIdx = null;
      this.tooltipPoints = [];
      this.tooltipManager.hide();
      this.scheduler.markDirty(DirtyFlag.OVERLAY);
      this.emitEvent('cursor:move', null, null, origin);
      this.pluginManager.dispatch('onCursorMove', this, null, null, origin);
      return;
    }

    const xScale = this.scales.get('x');
    if (!xScale) return;

    if (this.hasOnlyVisibleHistograms()) {
      const hit = this.resolveHistogramCursor(dataX);
      this.cursorDataX = hit?.dataX ?? dataX;
      this.cursorDataIdx = hit?.dataIndex ?? null;
      this.cursorX = xScale.dataToPixel(this.cursorDataX);
    } else {
      this.cursorDataX = dataX;
      // Mirror the local pointer path: column 0 is not the shared X axis when a
      // visible scatter series draws against a different X column, so snapping
      // this synced/programmatic cursor to nearestXIndex on column 0 would land
      // on the wrong point. Fall back to placing the crosshair at the raw dataX.
      if (this.canUseGlobalXCursor()) {
        this.cursorDataIdx = this.store.nearestXIndex(dataX);
        // Snap to nearest actual data point's X for accurate crosshair placement
        if (this.cursorDataIdx < this.store.length) {
          const snappedX = this.store.xAt(this.cursorDataIdx);
          this.cursorX = xScale.dataToPixel(snappedX);
        } else {
          this.cursorX = xScale.dataToPixel(dataX);
        }
      } else {
        this.cursorDataIdx = null;
        this.cursorX = xScale.dataToPixel(dataX);
      }
    }

    // Find Y position from first visible series at this index
    this.cursorY = this.layout.plot.top + this.layout.plot.height / 2; // default to plot center
    const yScale = this.scales.get('y');
    if (yScale && this.cursorDataIdx !== null && this.cursorDataIdx < this.store.length) {
      for (const sc of this.config.series) {
        if (sc.visible === false) continue;
        const colIdx = seriesYDataIndex(sc);
        if (colIdx < 1 || colIdx > this.store.seriesCount) continue;
        const yVal = this.store.yAt(colIdx - 1, this.cursorDataIdx);
        if (yVal !== undefined && yVal === yVal) {
          this.cursorY = yScale.dataToPixel(yVal);
          break;
        }
      }
    }

    // For synced cursors: show crosshair only, hide tooltip
    // unless syncTooltip is explicitly enabled
    if (this.config.cursor?.syncTooltip) {
      this.updateTooltipPoints();
    } else {
      this.tooltipPoints = [];
      this.tooltipManager.hide();
    }

    this.scheduler.markDirty(DirtyFlag.OVERLAY);
    this.emitEvent('cursor:move', this.cursorDataX, this.cursorDataIdx, origin);
    this.pluginManager.dispatch('onCursorMove', this, this.cursorDataX, this.cursorDataIdx, origin);
  }

  // ─── Cursor snapshot (legend table data source) ─────────────

  /**
   * Allocates and returns a fresh snapshot. For the cursor hot path
   * (60Hz updates), prefer `getCursorSnapshotInto()` to avoid GC pressure.
   */
  getCursorSnapshot(opts?: CursorSnapshotOptions): CursorSnapshot {
    const target: CursorSnapshot = {
      dataIndex: null,
      dataX: null,
      formattedX: '',
      points: [],
      source: 'none',
      activeSeriesIndex: null,
    };
    return this.fillSnapshot(target, opts);
  }

  /**
   * Zero-allocation variant. Mutates and returns `target`. The
   * `target.points` array is grown but never shrunk; trust
   * `target.points.length` after the call (the buffer is truncated to
   * the real row count via `length =`).
   */
  getCursorSnapshotInto(target: CursorSnapshot, opts?: CursorSnapshotOptions): CursorSnapshot {
    return this.fillSnapshot(target, opts);
  }

  // ─── Highlight (cross-chart series highlight + dim) ─────────

  setHighlight(seriesIndex: number | null): void {
    this.applyHighlight(seriesIndex, true);
  }

  getHighlight(): number | null {
    return this.highlightedSeries;
  }

  setHighlightKey(key: HighlightSyncKey | null): void {
    this.applyHighlight(this.findSeriesIndexForHighlightKey(key), true);
  }

  getHighlightKey(): HighlightSyncKey | null {
    if (this.highlightedSeries === null) return null;
    const getKey = this.config.highlight?.getKey;
    if (!getKey) return null;
    const series = this.config.series[this.highlightedSeries];
    if (!series) return null;
    return getKey(series, this.highlightedSeries) ?? null;
  }

  getStats(): ChartStats {
    return {
      dataVersion: this.stats.dataVersion,
      setDataCount: this.stats.setDataCount,
      appendDataCount: this.stats.appendDataCount,
      renderCount: { ...this.stats.renderCount },
      lastRenderMs: { ...this.stats.lastRenderMs },
    };
  }

  /**
   * Internal SyncGroup entry point. App code should call setHighlight(index);
   * sync payloads may carry stable identity keys that need local resolution.
   */
  receiveHighlightSync(payload: HighlightSyncPayload): void {
    this.applyHighlight(this.resolveHighlightSyncPayload(payload), false);
  }

  // ─── Private: Initialization ────────────────────────────────

  /**
   * Apply interaction mode presets to zoom/pan config.
   * Mode presets provide default zoom/pan axes while preserving explicit
   * zoom/pan fields supplied by the caller.
   */
  private applyModePresets(source?: DeepPartial<ChartConfig>): void {
    const mode = this.config.interaction;
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

  private applyHighlight(seriesIndex: number | null, publish: boolean): void {
    const normalized = this.normalizeHighlightIndex(seriesIndex);

    // Equality guard: prevents redundant redraws and breaks sync loops.
    if (this.highlightedSeries === normalized) return;

    this.highlightedSeries = normalized;
    this.scheduler.markDirty(DirtyFlag.DATA);
    this.emitEvent('highlight:change', normalized);

    if (publish && this.highlightSyncKey) {
      SyncGroup.publishHighlight(
        this.highlightSyncKey,
        this,
        this.createHighlightSyncPayload(normalized),
      );
    }
  }

  private normalizeHighlightIndex(seriesIndex: number | null): number | null {
    if (seriesIndex === null) return null;
    if (!Number.isInteger(seriesIndex)) return null;
    if (seriesIndex < 0 || seriesIndex >= this.config.series.length) return null;
    if (this.config.series[seriesIndex]?.visible === false) return null;
    return seriesIndex;
  }

  private createHighlightSyncPayload(seriesIndex: number | null): HighlightSyncPayload {
    const getKey = this.config.highlight?.getKey;
    if (!getKey) return { type: 'index', seriesIndex };
    if (seriesIndex === null) return { type: 'key', key: null };

    const series = this.config.series[seriesIndex];
    if (!series) return { type: 'key', key: null };
    return { type: 'key', key: getKey(series, seriesIndex) ?? null };
  }

  private resolveHighlightSyncPayload(payload: HighlightSyncPayload): number | null {
    if (payload.type === 'index') return payload.seriesIndex;
    return this.findSeriesIndexForHighlightKey(payload.key);
  }

  private findSeriesIndexForHighlightKey(key: HighlightSyncKey | null): number | null {
    if (key === null) return null;

    const getKey = this.config.highlight?.getKey;
    if (!getKey) return null;

    for (let si = 0; si < this.config.series.length; si++) {
      const series = this.config.series[si];
      if (!series || series.visible === false) continue;
      if (getKey(series, si) === key) return si;
    }

    return null;
  }

  private reconcileSyncGroups(): void {
    const previous = this.activeSyncKeys();
    const nextCursorKey = this.config.cursor?.syncKey ?? null;
    const nextHighlightKey = this.config.highlight?.syncKey ?? null;
    const nextZoomKey = this.config.zoom?.syncKey ?? null;
    const next = this.syncKeySet(nextCursorKey, nextHighlightKey, nextZoomKey);

    for (const key of previous) {
      if (!next.has(key)) SyncGroup.leave(key, this);
    }
    for (const key of next) {
      if (!previous.has(key)) SyncGroup.join(key, this);
    }

    this.syncKey = nextCursorKey;
    this.highlightSyncKey = nextHighlightKey;
    this.zoomSyncKey = nextZoomKey;
    this.lastPublishedCursorDataX = undefined;
  }

  private leaveSyncGroups(): void {
    for (const key of this.activeSyncKeys()) {
      SyncGroup.leave(key, this);
    }
    this.syncKey = null;
    this.highlightSyncKey = null;
    this.zoomSyncKey = null;
    this.lastPublishedCursorDataX = undefined;
  }

  private activeSyncKeys(): Set<string> {
    return this.syncKeySet(this.syncKey, this.highlightSyncKey, this.zoomSyncKey);
  }

  private syncKeySet(...keys: Array<string | null>): Set<string> {
    const set = new Set<string>();
    for (const key of keys) {
      if (key) set.add(key);
    }
    return set;
  }

  private publishCursorSync(dataX: number | null): void {
    if (!this.syncKey) return;
    if (this.lastPublishedCursorDataX === dataX) return;
    this.lastPublishedCursorDataX = dataX;
    SyncGroup.publishCursor(this.syncKey, this, dataX);
  }

  private createDataStore(data: ColumnarData): DataStore {
    const maxLen = this.streamingMaxLen();
    return maxLen === undefined
      ? new ColumnarStore(data)
      : new RingColumnarStore(data, maxLen);
  }

  private setStoreData(data: ColumnarData): void {
    const maxLen = this.streamingMaxLen();
    if (maxLen !== undefined) {
      if (this.store instanceof RingColumnarStore && this.store.maxLen === maxLen) {
        this.store.setData(data);
      } else {
        this.store = new RingColumnarStore(data, maxLen);
      }
      this.invalidateRangeCache();
      return;
    }

    if (this.store instanceof ColumnarStore) {
      this.store.setData(data);
    } else {
      this.store = new ColumnarStore(data);
    }
    this.invalidateRangeCache();
  }

  private ensureStoreMatchesStreaming(): void {
    const maxLen = this.streamingMaxLen();
    if (maxLen !== undefined) {
      if (!(this.store instanceof RingColumnarStore) || this.store.maxLen !== maxLen) {
        this.store = new RingColumnarStore(this.store.getData(), maxLen);
        this.invalidateRangeCache();
      }
      return;
    }

    if (this.store instanceof RingColumnarStore) {
      this.store = new ColumnarStore(this.store.getData());
      this.invalidateRangeCache();
    }
  }

  private streamingMaxLen(): number | undefined {
    const maxLen = (this.config.streaming as StreamingConfig | undefined)?.maxLen;
    if (maxLen !== undefined) validateMaxLen(maxLen);
    return maxLen;
  }

  private dispatchDataUpdate(): void {
    const dataListeners = this.listeners.get('data:update');
    const hasDataListeners = !!dataListeners && dataListeners.size > 0;
    const hasPluginHook = this.pluginManager.hasHook('onSetData');
    // Nothing consumes the payload: no materialization, no emit.
    if (!hasDataListeners && !hasPluginHook) return;

    // The 'data:update' handler type is `(data: ColumnarData) => void`, so
    // every listener is entitled to the payload. The previous Function.length
    // heuristic silently withheld it from `(...args)` and `(data = x)`
    // listeners (both report length 0), which arity cannot distinguish from a
    // genuine zero-arg signal. Materialize once when any listener or plugin
    // hook exists and pass it to all of them. The cost is one getData() per
    // data update, and only when something is actually subscribed.
    const data = this.store.getData();

    if (hasPluginHook) {
      this.pluginManager.dispatch('onSetData', this, data);
    }
    if (hasDataListeners) {
      this.emitEvent('data:update', data);
    }
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
    // Write back so Layout and AxesRenderer can see all axes
    this.config.axes = axisConfigs;

    for (const key of Array.from(this.scales.keys())) {
      if (!axisConfigs[key]) {
        this.scales.delete(key);
        this.naturalExtent.delete(key);
        this.userZoomedAxes.delete(key);
      }
    }

    for (const [key, ac] of Object.entries(axisConfigs)) {
      if (!this.scales.has(key)) {
        const scale = createScale(
          ac.type ?? 'linear',
          key,
          ac.min,
          ac.max,
        );
        this.scales.set(key, scale);
      } else {
        const existing = this.scales.get(key)!;
        if (ac.min !== undefined) existing.min = ac.min;
        if (ac.max !== undefined) existing.max = ac.max;
      }
    }

    this.autoRange();
    // A configured follow window overrides full-extent X on first paint and
    // after a config replace, as long as the user has not paused following.
    if (this.following) this.applyFollowWindow();
  }

  /**
   * Auto-range both horizontal and vertical axes to fit data.
   * Called on data change (setData, appendData, init), NOT on zoom.
   */
  private autoRange(): void {
    this.autoRangeHorizontal();
    this.autoRangeVertical();
  }

  /** Auto-range horizontal (bottom/top) axes to full data extent. Skipped per-axis when the user has actively zoomed that axis. */
  private autoRangeHorizontal(): void {
    if (this.store.length === 0) return;

    const axisConfigs = this.config.axes ?? {};
    for (const [key, ac] of Object.entries(axisConfigs)) {
      const pos = inferPosition(key, ac.position);
      if (pos !== 'bottom' && pos !== 'top') continue;

      const scale = this.scales.get(key);
      if (!scale) continue;
      if (ac.auto === false) continue;
      // A user-zoomed axis keeps its viewport, but we still recompute its
      // natural (reset-zoom / `bounds: 'data'`) extent below so streaming data
      // beyond the pre-zoom extent stays reachable by pan/zoom-out instead of
      // being frozen out until `resetZoom()`. We restore the live viewport
      // after the computation.
      const userZoomed = this.userZoomedAxes.has(key);
      const preservedMin = scale.min;
      const preservedMax = scale.max;
      // Both bounds pinned → restore to those values. Skipping here would
      // leave zoomed state intact after `resetZoom()`.
      if (ac.min !== undefined && ac.max !== undefined) {
        if (!userZoomed) {
          scale.min = ac.min;
          scale.max = ac.max;
        }
        this.naturalExtent.set(key, [ac.min, ac.max]);
        continue;
      }

      let xMin = Infinity;
      let xMax = -Infinity;
      let xPositiveMin = Infinity;
      let hasXValue = false;
      const includeXColumn = (columnIdx: number) => {
        if (!this.isValidColumn(columnIdx)) return;
        for (let i = 0; i < this.store.length; i++) {
          const value = this.store.valueAt(columnIdx, i);
          if (!Number.isFinite(value)) continue;
          hasXValue = true;
          if (value < xMin) xMin = value;
          if (value > xMax) xMax = value;
          if (value > 0 && value < xPositiveMin) xPositiveMin = value;
        }
      };
      let hasBoundSeries = false;
      for (const s of this.config.series) {
        if ((s.xAxisKey ?? 'x') !== key || s.visible === false) continue;
        hasBoundSeries = true;
        includeXColumn(s.type === 'scatter' ? scatterXDataIndex(s) : 0);
      }
      if (!hasBoundSeries) includeXColumn(0);
      if (!hasXValue) continue;
      if (scale.type === 'log') {
        if (xMax <= 0 || xPositiveMin === Infinity) continue;
        xMin = xPositiveMin;
      }
      const hasBarSeries = this.config.series.some(
        s => s.visible !== false &&
          (s.xAxisKey ?? 'x') === key &&
          (s.type === 'bar' || s.type === 'histogram'),
      );
      // Scatter/heatmap clouds default to a 5% pad so the data fills the plot
      // with just enough breathing room. Users can still opt into rounded
      // bounds with `nice: true`.
      const isScatterOnly =
        !hasBarSeries &&
        this.config.series.length > 0 &&
        this.config.series.every(
          s => s.visible === false || s.type === 'scatter',
        );

      if (scale.type === 'log') {
        const [min, max] = this.paddedLogRange(xMin, xMax, ac.padding ?? AUTO_RANGE_PADDING);
        scale.min = ac.min ?? min;
        scale.max = ac.max ?? max;
      } else if (xMin === xMax) {
        scale.min = xMin - 1;
        scale.max = xMax + 1;
      } else if (hasBarSeries && this.store.length > 1) {
        const firstPad = categoryWidthFromData((idx) => this.store.valueAt(0, idx), 0, this.store.length) * 0.5;
        const lastPad = categoryWidthFromData(
          (idx) => this.store.valueAt(0, idx),
          this.store.length - 1,
          this.store.length,
        ) * 0.5;
        scale.min = xMin - firstPad;
        scale.max = xMax + lastPad;
      } else if (isScatterOnly) {
        const pad = (xMax - xMin) * (ac.padding ?? AUTO_RANGE_PADDING);
        scale.min = xMin - pad;
        scale.max = xMax + pad;
      } else {
        // Horizontal auto-range defaults to zero padding; users can opt in
        // via `axes.[key].padding`.
        const pad = (xMax - xMin) * (ac.padding ?? 0);
        scale.min = xMin - pad;
        scale.max = xMax + pad;
      }

      // `nice: true` opts into rounded bounds. Bar/histogram X axes keep exact
      // category/bin padding so rendered geometry lines up with the domain.
      if (this.shouldNiceAutoRange(scale, ac, hasBarSeries)) {
        scale.nice(DEFAULT_TICK_COUNT);
      }

      // Remember the "full" extent so zoom.bounds: 'data' knows how far
      // out reset-zoom would go.
      this.naturalExtent.set(key, [scale.min, scale.max]);

      // The extent is refreshed above; a user-zoomed axis keeps the viewport
      // it had on entry so streaming appends don't snap it back.
      if (userZoomed) {
        scale.min = preservedMin;
        scale.max = preservedMax;
      }
    }
  }

  /**
   * Auto-range vertical (left/right) axes to fit the data visible in the current X viewport.
   * Called on zoom/pan (viewport change) AND on data change.
   * This is the key to "zoom X, Y follows" behavior.
   *
   * `fromViewport` marks the pan/zoom path, which runs once per gesture
   * frame: it answers range queries from block-aggregate indexes instead of
   * scanning every visible point. Data-change callers keep the direct scan
   * because their data version bump would invalidate any index anyway.
   */
  private autoRangeVertical(fromViewport = false): void {
    if (this.store.length === 0) return;

    const axisConfigs = this.config.axes ?? {};
    for (const [key, scale] of this.scales) {
      const ac = axisConfigs[key];
      if (!ac) continue;
      const pos = inferPosition(key, ac.position);
      if (pos !== 'left' && pos !== 'right') continue;
      if (ac.auto === false) continue;
      if (this.userZoomedAxes.has(key)) continue;
      // Both bounds pinned → restore to those values. Skipping here would
      // leave zoomed state intact after `resetZoom()`.
      if (ac.min !== undefined && ac.max !== undefined) {
        scale.min = ac.min;
        scale.max = ac.max;
        continue;
      }

      let yMin = Infinity;
      let yMax = -Infinity;
      let hasValue = false;

      const includeRange = (range: [number, number] | null) => {
        if (!range) return;
        hasValue = true;
        if (range[0] < yMin) yMin = range[0];
        if (range[1] > yMax) yMax = range[1];
      };

      const includeColumnRange = (columnIdx: number, startIdx: number, endIdx: number) => {
        includeRange(this.columnRange(columnIdx, startIdx, endIdx, scale.type, fromViewport));
      };
      const includeColumnForScatterViewport = (
        yColumnIdx: number,
        xColumnIdx: number,
        xScale: Scale | undefined,
      ) => {
        includeRange(
          this.scatterViewportColumnRange(yColumnIdx, xColumnIdx, xScale, scale.type, fromViewport),
        );
      };

      for (const s of this.config.series) {
        if ((s.yAxisKey ?? 'y') !== key || s.visible === false) continue;

        const xScale = this.scales.get(s.xAxisKey ?? 'x') ?? this.scales.get('x');
        const xColumnIdx = s.type === 'scatter' ? scatterXDataIndex(s) : 0;
        let startIdx = 0;
        let endIdx = this.store.length - 1;
        if (xScale && xColumnIdx === 0) {
          [startIdx, endIdx] = this.store.getViewportIndices(xScale.min, xScale.max);
        }

        const yColumnIdx = seriesYDataIndex(s) - 1;
        if (s.type === 'scatter' && xColumnIdx !== 0 && this.isValidColumn(xColumnIdx)) {
          includeColumnForScatterViewport(yColumnIdx, xColumnIdx, xScale);
        } else {
          includeColumnRange(yColumnIdx, startIdx, endIdx);
        }
        if (s.type === 'band') {
          if (s.upperDataIndex != null) includeColumnRange(s.upperDataIndex - 1, startIdx, endIdx);
          if (s.lowerDataIndex != null) includeColumnRange(s.lowerDataIndex - 1, startIdx, endIdx);
        }
      }

      // For bar/histogram series, always include 0 as the baseline
      const hasBarOrHist = this.config.series.some(
        s => (s.yAxisKey ?? 'y') === key && s.visible !== false && (s.type === 'bar' || s.type === 'histogram'),
      );
      if (!hasValue) continue;

      if (hasBarOrHist && scale.type !== 'log') {
        if (yMin > 0) yMin = 0;
        if (yMax < 0) yMax = 0;
      }

      if (scale.type === 'log') {
        const [min, max] = this.paddedLogRange(yMin, yMax, ac.padding ?? AUTO_RANGE_PADDING);
        if (ac.min === undefined) scale.min = min;
        if (ac.max === undefined) scale.max = max;
      } else {
        // Vertical auto-range defaults to 5% padding so line/area charts
        // don't touch the plot edges; users can override per-axis.
        const pad = (yMax - yMin) * (ac.padding ?? AUTO_RANGE_PADDING);
        if (ac.min === undefined) {
          scale.min = hasBarOrHist ? Math.min(0, yMin - pad) : yMin - pad;
        }
        if (ac.max === undefined) {
          scale.max = hasBarOrHist ? Math.max(0, yMax + pad) : yMax + pad;
        }
      }

      if (this.shouldNiceAutoRange(scale, ac, false)) {
        scale.nice(DEFAULT_TICK_COUNT);
        // nice() can push min below 0, clamp back for bar/histogram baseline
        if (hasBarOrHist && yMin >= 0 && scale.min < 0) scale.min = 0;
      }

      // Remember the "full" extent so zoom.bounds: 'data' knows how far
      // out reset-zoom would go.
      this.naturalExtent.set(key, [scale.min, scale.max]);
    }
  }

  private ensureRangeIndexesFresh(): void {
    if (this.rangeIndexVersion === this.stats.dataVersion) return;
    this.rangeIndexVersion = this.stats.dataVersion;
    this.columnRangeIndexes.clear();
    this.scatterRangeIndexes.clear();
  }

  private invalidateRangeCache(): void {
    this.rangeIndexVersion = -1;
    this.columnRangeIndexes.clear();
    this.scatterRangeIndexes.clear();
    this.scatterSeriesCaches.clear();
    this.scatterEncodingCache.clear();
  }

  private markViewportActive(): void {
    if (this.interactionSamplingBudget() === null) return;
    this.viewportActiveUntil = performance.now() + INTERACTION_REFINE_MS;
    if (this.refineTimer !== null) clearTimeout(this.refineTimer);
    this.refineTimer = setTimeout(() => {
      this.refineTimer = null;
      if (this.destroyed) return;
      // Only repaint if the last data pass actually dropped points.
      if (this.sampledLastDataRender) this.scheduler.markDirty(DirtyFlag.DATA);
    }, INTERACTION_REFINE_MS);
  }

  private interactionSamplingBudget(): number | null {
    const configured = this.config.performance?.interactionSampling;
    if (configured === false) return null;
    if (typeof configured === 'number') return configured > 0 ? configured : null;
    return DEFAULT_INTERACTION_SAMPLING;
  }

  private scatterResolvers(si: number, series: SeriesConfig, fallbackColor: string) {
    const cached = this.scatterEncodingCache.get(si);
    if (
      cached &&
      cached.series === series &&
      cached.theme === this.theme &&
      cached.version === this.stats.dataVersion
    ) {
      return cached;
    }

    const logicalValueAt = (columnIdx: number, index: number) =>
      this.store.valueAt(columnIdx, index);
    const state = buildScatterEncodingState({
      series,
      fallbackColor,
      fallbackRadius: series.pointRadius ?? (this.store.length > 10_000 ? 1.5 : 3),
      palettes: this.scatterPalettes(),
      columnCount: this.store.seriesCount + 1,
      ranges: [{ startIdx: 0, endIdx: this.store.length - 1 }],
      valueAt: logicalValueAt,
    });

    const physicalColumns = new Map<number, Float64Array>();
    const physicalValueAt = (columnIdx: number, index: number) => {
      let column = physicalColumns.get(columnIdx);
      if (!column) {
        column = this.store.getPhysicalColumn(columnIdx);
        physicalColumns.set(columnIdx, column);
      }
      return column[index] ?? Number.NaN;
    };

    const entry = {
      series,
      theme: this.theme,
      version: this.stats.dataVersion,
      renderResolver: resolverFromEncodingState(state, physicalValueAt),
      logicalResolver: resolverFromEncodingState(state, logicalValueAt),
    };
    this.scatterEncodingCache.set(si, entry);
    return entry;
  }

  private columnRange(
    columnIdx: number,
    startIdx: number,
    endIdx: number,
    scaleType: Scale['type'],
    useIndex: boolean,
  ): [number, number] | null {
    if (columnIdx < 0 || columnIdx >= this.store.seriesCount) return null;
    const start = Math.max(0, startIdx);
    const end = Math.min(this.store.length - 1, endIdx);
    if (end < start) return null;
    const positiveOnly = scaleType === 'log';

    if (useIndex) {
      this.ensureRangeIndexesFresh();
      let index = this.columnRangeIndexes.get(columnIdx);
      if (!index) {
        // Physical column columnIdx + 1: column 0 is X, series are 1-based.
        index = new ColumnRangeIndex(this.store.getPhysicalColumn(columnIdx + 1));
        this.columnRangeIndexes.set(columnIdx, index);
      }
      // Segments map the logical range onto live physical ranges, so ring
      // buffers never query dead slots between head and tail.
      let min = Infinity;
      let max = -Infinity;
      for (const segment of this.store.getSegments(start, end)) {
        const range = index.query(segment.physicalStart, segment.physicalEnd, positiveOnly);
        if (!range) continue;
        if (range[0] < min) min = range[0];
        if (range[1] > max) max = range[1];
      }
      return min === Infinity ? null : [min, max];
    }

    let min = Infinity;
    let max = -Infinity;
    for (let i = start; i <= end; i++) {
      const v = this.store.yAt(columnIdx, i);
      if (!Number.isFinite(v) || (positiveOnly && v <= 0)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    return min === Infinity ? null : [min, max];
  }

  private scatterViewportColumnRange(
    yColumnIdx: number,
    xColumnIdx: number,
    xScale: Scale | undefined,
    scaleType: Scale['type'],
    useIndex: boolean,
  ): [number, number] | null {
    if (yColumnIdx < 0 || yColumnIdx >= this.store.seriesCount) return null;
    if (!this.isValidColumn(xColumnIdx)) return null;

    const xMin = xScale?.min ?? -Infinity;
    const xMax = xScale?.max ?? Infinity;
    const positiveOnly = scaleType === 'log';

    // The sorted-permutation index assumes physical position == logical
    // position, which only holds for the plain columnar store. Ring buffers
    // fall back to the direct scan.
    if (useIndex && this.store instanceof ColumnarStore) {
      this.ensureRangeIndexesFresh();
      const key = xColumnIdx + ':' + yColumnIdx;
      let index = this.scatterRangeIndexes.get(key);
      if (!index) {
        index = new ScatterColumnRangeIndex(
          this.store.getPhysicalColumn(xColumnIdx),
          this.store.getPhysicalColumn(yColumnIdx + 1),
        );
        this.scatterRangeIndexes.set(key, index);
      }
      return index.query(xMin, xMax, positiveOnly);
    }

    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < this.store.length; i++) {
      const x = this.store.valueAt(xColumnIdx, i);
      if (!Number.isFinite(x)) continue;
      if (x < xMin || x > xMax) continue;
      const v = this.store.yAt(yColumnIdx, i);
      if (!Number.isFinite(v) || (positiveOnly && v <= 0)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    return min === Infinity ? null : [min, max];
  }

  private updateLayout(): void {
    const w = this.canvasManager.cssWidth || 600;
    const h = this.canvasManager.cssHeight || 400;
    const cacheKey = this.createLayoutCacheKey(w, h);
    if (this.layout && cacheKey === this.layoutCacheKey) {
      this.updateInteractionLayer();
      return;
    }

    this.layout = computeLayout(
      w, h,
      this.config,
      this.scales,
      this.canvasManager.dpr,
      this.theme.fontFamily,
      this.theme.fontSize,
    );
    this.layoutCacheKey = cacheKey;
    this.updateInteractionLayer();
  }

  private updateInteractionLayer(): void {
    const axisControls = this.config.pan?.axis === true || this.config.zoom?.axis === true;
    this.canvasManager.setInteractionRect(axisControls
      ? { left: 0, top: 0, width: this.layout.width, height: this.layout.height }
      : this.layout.plot);
  }

  private createLayoutCacheKey(width: number, height: number): string {
    const axes = Array.from(this.scales, ([key, scale]) => {
      const ac = this.config.axes?.[key];
      return [
        key,
        inferPosition(key, ac?.position),
        scale.type,
        scale.min,
        scale.max,
        tickFormatId(ac?.tickFormat),
        ac?.label ?? '',
      ].join(':');
    }).join('|');
    const padding = this.config.padding ?? {};
    return [
      width,
      height,
      this.canvasManager.dpr,
      this.theme.fontFamily,
      this.theme.fontSize,
      padding.top,
      padding.right,
      padding.bottom,
      padding.left,
      axes,
    ].join('|');
  }

  private updateScalePixelRanges(): void {
    const { plot } = this.layout;
    const axisConfigs = this.config.axes ?? {};

    for (const [key, scale] of this.scales) {
      const ac = axisConfigs[key];
      const pos = inferPosition(key, ac?.position);
      if (pos === 'bottom' || pos === 'top') {
        scale.setPixelRange(plot.left, plot.left + plot.width);
      } else {
        // left/right: pixel range is inverted (top = max, bottom = min)
        scale.setPixelRange(plot.top + plot.height, plot.top);
      }
    }
  }

  private queueTouchCursor(
    x: number,
    y: number,
    pointerType: 'touch' | 'pen',
    publishSync: boolean,
  ): void {
    this.pendingTouchCursor = { x, y, pointerType, publishSync };
    if (this.touchCursorFrame !== null) return;

    if (typeof requestAnimationFrame === 'undefined') {
      this.flushPendingTouchCursor();
      return;
    }

    this.touchCursorFrame = requestAnimationFrame(() => {
      this.touchCursorFrame = null;
      this.flushPendingTouchCursor();
    });
  }

  private flushPendingTouchCursor(): void {
    const pending = this.pendingTouchCursor;
    this.pendingTouchCursor = null;
    if (!pending) return;
    this.updateLocalCursorFromPoint(
      pending.x,
      pending.y,
      pending.pointerType,
      pending.publishSync,
    );
  }

  private cancelPendingTouchCursor(): void {
    this.pendingTouchCursor = null;
    if (this.touchCursorFrame !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.touchCursorFrame);
    }
    this.touchCursorFrame = null;
  }

  // ─── Private: Event wiring ──────────────────────────────────

  private wireEvents(): void {
    // ── Cursor tracking ──
    this.eventBus.on('action:cursor', ({ x, y, pointerType }) => {
      if (pointerType === 'touch' || pointerType === 'pen') {
        this.queueTouchCursor(x, y, pointerType, true);
        return;
      }
      this.cancelPendingTouchCursor();
      this.updateLocalCursorFromPoint(x, y, pointerType, true);
    });

    // ── Cursor leave ──
    this.eventBus.on('action:cursor-leave', () => {
      this.cancelPendingTouchCursor();
      this.cursorX = null;
      this.cursorY = null;
      this.mouseX = null;
      this.mouseY = null;
      this.cursorDataX = null;
      this.cursorDataIdx = null;
      this.tooltipPoints = [];
      this.tooltipManager.hide();
      this.clearProximityHighlight();
      this.scheduler.markDirty(DirtyFlag.OVERLAY);

      // Notify listeners and plugins that the cursor is gone, without
      // this, a fast mouse-leave skips the "cursor outside plot area"
      // path in action:cursor and the legend table never blanks its values.
      this.emitEvent('cursor:move', null, null, 'local');
      this.pluginManager.dispatch('onCursorMove', this, null, null, 'local');

      this.publishCursorSync(null);
    });

    // ── Pan (incremental pixel delta) ──
    this.eventBus.on('action:pan', ({ dx, dy, axis }) => {
      const pan = this.config.pan ?? { enabled: true, x: true };
      if (!pan.enabled) return;

      const axisConfigs = this.config.axes ?? {};

      if (axis) {
        if (pan.axis !== true) return;
        // Drag started on a specific axis, only pan that axis
        const scale = this.scales.get(axis);
        if (scale) {
          const pos = inferPosition(axis, axisConfigs[axis]?.position);
          const isHoriz = pos === 'bottom' || pos === 'top';
          const delta = isHoriz ? dx : dy;
          const [min, max] = this.pannedScaleRange(scale, delta);
          this.applyViewportChange(axis, min, max);
        }
      } else {
        // Drag in plot area, pan all enabled axes. Axes the user has actively
        // zoomed are also pannable even if pan.x/pan.y is off, mirroring how
        // scroll-on-axis can zoom an axis with zoom.x/zoom.y off: once the
        // user has engaged an axis, drag gestures on it should respond.
        for (const [key, scale] of this.scales) {
          const pos = inferPosition(key, axisConfigs[key]?.position);
          const isHoriz = pos === 'bottom' || pos === 'top';
          const userZoomed = this.userZoomedAxes.has(key);
          if (isHoriz && (pan.x !== false || userZoomed)) {
            const [min, max] = this.pannedScaleRange(scale, dx);
            this.applyViewportChange(key, min, max);
          } else if (!isHoriz && (pan.y || userZoomed)) {
            const [min, max] = this.pannedScaleRange(scale, dy);
            this.applyViewportChange(key, min, max);
          }
        }
      }
    });

    // ── Zoom (factor at anchor point) ──
    this.eventBus.on('action:zoom', ({ factor, anchorX, anchorY, axis }) => {
      const zoom = this.config.zoom ?? { enabled: true, x: true };
      if (!zoom.enabled) return;

      const axisConfigs = this.config.axes ?? {};
      if (!this.canZoomFromAnchor(axis, anchorX, anchorY, zoom.axis === true, axisConfigs)) return;

      if (axis === 'xy') {
        this.applyUniformZoom(factor, anchorX, anchorY);
      } else {
        // Zoom a specific axis by key
        const scale = this.scales.get(axis);
        if (scale) {
          const pos = inferPosition(axis, axisConfigs[axis]?.position);
          const isHoriz = pos === 'bottom' || pos === 'top';
          const anchorPx = isHoriz ? anchorX : anchorY;
          const [newMin, newMax] = this.zoomedScaleRange(scale, anchorPx, factor);
          // minRange/maxRange are enforced in the scale's own span metric
          // (`scaleDomainSpan`): a data-unit span for linear/time axes, a
          // log10-decade span for log axes. Measuring in that metric keeps the
          // limit consistent with how `zoomedScaleRange` applies the factor,
          // and applies to vertical axes too, not just horizontal.
          const span = this.scaleDomainSpan(scale, newMin, newMax);
          if (zoom.minRange && span < zoom.minRange) return;
          if (zoom.maxRange && span > zoom.maxRange) return;
          if (isHoriz) {
            if (zoom.x !== false) this.applyViewportChange(axis, newMin, newMax);
          } else {
            this.applyViewportChange(axis, newMin, newMax);
          }
        }
      }
    });

    // ── Box selection (start/update/end) ──
    this.eventBus.on('action:box-start', ({ x, y }) => {
      this.selectionBox = { x1: x, y1: y, x2: x, y2: y };
      this.updateLocalCursorFromPoint(x, y, this.lastPointerType, true);
      this.scheduler.markDirty(DirtyFlag.OVERLAY);
    });

    this.eventBus.on('action:box-update', ({ x, y }) => {
      if (!this.selectionBox) {
        this.selectionBox = { x1: x, y1: y, x2: x, y2: y };
      }
      const zoom = this.config.zoom ?? { enabled: true, x: true };
      const { plot } = this.layout;

      // Constrain box to enabled axes
      this.selectionBox.x2 = x;
      this.selectionBox.y2 = y;
      if (!zoom.y) {
        this.selectionBox.y1 = plot.top;
        this.selectionBox.y2 = plot.top + plot.height;
      }
      if (zoom.y && !zoom.x) {
        this.selectionBox.x1 = plot.left;
        this.selectionBox.x2 = plot.left + plot.width;
      }

      this.scheduler.markDirty(DirtyFlag.OVERLAY);
    });

    this.eventBus.on('action:box-end', ({ x1, y1, x2, y2 }) => {
      this.selectionBox = null;
      this.scheduler.markDirty(DirtyFlag.OVERLAY);

      // Zero-area box = cancelled
      if (x1 === 0 && y1 === 0 && x2 === 0 && y2 === 0) return;

      // Clamp the drag coordinates to the plot area. Without this, a drag
      // that continues past the chart edge reads the cursor's absolute
      // pixel position and zooms the axes to a range outside the data extent.
      const { plot } = this.layout;
      const clampX = (px: number) => Math.max(plot.left, Math.min(plot.left + plot.width, px));
      const clampY = (py: number) => Math.max(plot.top, Math.min(plot.top + plot.height, py));
      x1 = clampX(x1); x2 = clampX(x2);
      y1 = clampY(y1); y2 = clampY(y2);

      const zoom = this.config.zoom ?? { enabled: true, x: true };
      const dx = Math.abs(x2 - x1);
      const dy = Math.abs(y2 - y1);

      // Check overall drag distance (not per-axis) to distinguish from a click
      const totalDist = Math.sqrt(dx * dx + dy * dy);
      if (totalDist < MIN_DRAG_DISTANCE) return;

      const xScale = this.scales.get('x');
      const yScale = this.scales.get('y');
      const selectionX = xScale
        ? {
            min: xScale.pixelToData(Math.min(x1, x2)),
            max: xScale.pixelToData(Math.max(x1, x2)),
          }
        : null;
      const selectionY = yScale && zoom.y
        ? {
            min: yScale.pixelToData(Math.max(y1, y2)),
            max: yScale.pixelToData(Math.min(y1, y2)),
          }
        : undefined;

      if (selectionX) {
        const selection = {
          x: selectionX,
          ...(selectionY ? { y: selectionY } : {}),
          points: selectionY ? this.scatterPointsInSelection(selectionX, selectionY) : undefined,
        };
        this.emitEvent('select', selection);
        this.config.selection?.onSelect?.(selection);
      }

      if (zoom.enabled !== false) {
        if (zoom.x !== false && selectionX) {
          this.applyViewportChange('x', selectionX.min, selectionX.max);
        }
        if (zoom.y && selectionY) {
          this.applyViewportChange('y', selectionY.min, selectionY.max);
        }
      }
    });

    // ── Reset zoom ──
    this.eventBus.on('action:reset-zoom', () => {
      this.resetZoom();
    });

    // ── Tap (touch: show/persist tooltip) ──
    this.eventBus.on('action:tap', ({ x, y, pointerType }) => {
      this.cancelPendingTouchCursor();
      const inPlot = this.isInPlotArea(x, y);
      this.updateLocalCursorFromPoint(x, y, pointerType, true);
      if (inPlot) {
        // Leave a short-lived ring so the user can see the tap landed.
        this.tapFeedback = { x, y, startTime: performance.now() };
      }
    });

    // ── Legacy viewport:change (still used by sync) ──
    this.eventBus.on('viewport:change', ({ scaleKey, min, max }) => {
      this.applyViewportChange(scaleKey, min, max);
    });
  }

  private zoomedScaleRange(scale: Scale, anchorPx: number, factor: number): [number, number] {
    const anchor = scale.pixelToData(anchorPx);
    if (scale.type !== 'log') {
      return [
        anchor - (anchor - scale.min) * factor,
        anchor + (scale.max - anchor) * factor,
      ];
    }

    const logMin = Math.log10(Math.max(scale.min, 1e-10));
    const logMax = Math.log10(Math.max(scale.max, 1e-10));
    const logAnchor = Math.log10(Math.max(anchor, 1e-10));
    return [
      10 ** (logAnchor - (logAnchor - logMin) * factor),
      10 ** (logAnchor + (logMax - logAnchor) * factor),
    ];
  }

  private canZoomFromAnchor(
    axis: string,
    anchorX: number,
    anchorY: number,
    axisControlsEnabled: boolean,
    axisConfigs: NonNullable<ChartConfig['axes']>,
  ): boolean {
    if (axisControlsEnabled) return true;
    const { plot } = this.layout;
    if (axis === 'xy') return this.isInPlotArea(anchorX, anchorY);

    const ac = axisConfigs[axis];
    const pos = inferPosition(axis, ac?.position);
    if (pos === 'bottom' || pos === 'top') {
      return anchorY > plot.top && anchorY < plot.top + plot.height;
    }
    return anchorX > plot.left && anchorX < plot.left + plot.width;
  }

  private applyUniformZoom(factor: number, anchorX: number, anchorY: number): void {
    const zoom = this.config.zoom ?? { enabled: true, x: true };
    const axisConfigs = this.config.axes ?? {};
    const targets: Array<{ key: string; scale: Scale; pos: 'top' | 'bottom' | 'left' | 'right'; anchorPx: number }> = [];

    for (const [key, scale] of this.scales) {
      const pos = inferPosition(key, axisConfigs[key]?.position);
      const isHoriz = pos === 'bottom' || pos === 'top';
      if (isHoriz ? zoom.x !== false : zoom.y) {
        targets.push({ key, scale, pos, anchorPx: isHoriz ? anchorX : anchorY });
      }
    }
    if (targets.length === 0) return;

    let effectiveFactor = factor;
    for (const target of targets) {
      const span = this.scaleDomainSpan(target.scale, target.scale.min, target.scale.max);
      if (span <= 0 || !Number.isFinite(span)) continue;

      const proposed = this.zoomedScaleRange(target.scale, target.anchorPx, effectiveFactor);
      const proposedSpan = this.scaleDomainSpan(target.scale, proposed[0], proposed[1]);

      // minRange/maxRange are measured in the scale's own span metric so the
      // factor correction matches how zoomedScaleRange applies it (linear span
      // on linear/time axes, log10-decade span on log axes). Applies to every
      // zoomed axis, including vertical, not just horizontal.
      if (zoom.minRange && proposedSpan < zoom.minRange) {
        effectiveFactor = Math.max(effectiveFactor, zoom.minRange / span);
      }
      if (zoom.maxRange && proposedSpan > zoom.maxRange) {
        effectiveFactor = Math.min(effectiveFactor, zoom.maxRange / span);
      }

      const bounds = this.resolveBounds(target.key, target.pos);
      if (bounds?.min !== undefined && bounds.max !== undefined && proposedSpan > 0) {
        const boundsSpan = this.scaleDomainSpan(target.scale, bounds.min, bounds.max);
        if (Number.isFinite(boundsSpan) && boundsSpan > 0 && proposedSpan > boundsSpan) {
          effectiveFactor = Math.min(effectiveFactor, boundsSpan / span);
        }
      }
    }

    for (const target of targets) {
      const [newMin, newMax] = this.zoomedScaleRange(target.scale, target.anchorPx, effectiveFactor);
      this.applyViewportChange(target.key, newMin, newMax);
    }
  }

  private scaleDomainSpan(scale: Scale, min: number, max: number): number {
    if (scale.type !== 'log') return max - min;
    const safeMin = Math.max(min, 1e-10);
    const safeMax = Math.max(max, safeMin);
    return Math.log10(safeMax) - Math.log10(safeMin);
  }

  private pannedScaleRange(scale: Scale, deltaPx: number): [number, number] {
    if (scale.type !== 'log') {
      const dataD = scale.pixelToData(0) - scale.pixelToData(deltaPx);
      return [scale.min + dataD, scale.max + dataD];
    }

    const logDelta =
      Math.log10(Math.max(scale.pixelToData(0), 1e-10)) -
      Math.log10(Math.max(scale.pixelToData(deltaPx), 1e-10));
    return [
      10 ** (Math.log10(Math.max(scale.min, 1e-10)) + logDelta),
      10 ** (Math.log10(Math.max(scale.max, 1e-10)) + logDelta),
    ];
  }

  /** Apply a viewport change, shared by pan, zoom, box-end, and sync */
  private applyViewportChange(scaleKey: string, min: number, max: number): void {
    const scale = this.scales.get(scaleKey);
    if (!scale) return;

    const ac = this.config.axes?.[scaleKey];
    const pos = inferPosition(scaleKey, ac?.position);
    const isHoriz = pos === 'bottom' || pos === 'top';

    // Clamp to configured bounds (defaults to data extent). Keeps pan at
    // the edge when you push past it, and stops zoom-out at the full extent.
    const clamped = this.clampViewportToBounds(scaleKey, pos, min, max);
    min = clamped[0];
    max = clamped[1];

    // Fully clamped no-op (panning at the data edge, zooming out at full
    // extent): nothing changes, so skip the repaint, events, and sync
    // publish. Without this, dragging against the edge repaints all three
    // layers at gesture rate for zero visual change.
    if (scale.min === min && scale.max === max) return;

    this.markViewportActive();
    this.userZoomedAxes.add(scaleKey);
    // A horizontal pan/zoom pauses live-follow (the user took control of the
    // X window); a Y-only change leaves follow untouched.
    if (isHoriz) this.setFollowing(false);

    scale.min = min;
    scale.max = max;

    if (isHoriz && !this.config.zoom?.y) {
      this.autoRangeVertical(true);
    }

    this.refreshCursor();
    this.scheduler.markDirty(DirtyFlag.DATA | DirtyFlag.GRID | DirtyFlag.OVERLAY);
    this.emitEvent('viewport:change', scaleKey, { min, max });
    this.pluginManager.dispatch('onZoom', this, scaleKey, { min, max });

    // Broadcast to zoom sync peers (only for local gestures, not peer echoes)
    if (this.zoomSyncKey && !this.suppressZoomSync) {
      SyncGroup.publishScale(this.zoomSyncKey, this, scaleKey, { min, max });
    }
  }

  /**
   * Every visible series bound to this Y axis is a scatter. Used to
   * default `zoom.bounds.y` to `'data'` on scatter-only charts where
   * there is no viewport-driven Y auto-range to take up the slack.
   */
  private isScatterOnlyAxis(scaleKey: string): boolean {
    const bound = this.config.series.filter(
      (s) => (s.yAxisKey ?? 'y') === scaleKey && s.visible !== false,
    );
    return bound.length > 0 && bound.every((s) => s.type === 'scatter');
  }

  /**
   * Resolve the `zoom.bounds` config for a specific axis.
   *
   * Returns `null` when no clamping should happen, or `{ min, max }` with
   * either bound potentially `undefined` (half-open). The `'data'` literal
   * is resolved here via `this.store` / Y-range over the visible X window.
   */
  private resolveBounds(
    scaleKey: string,
    pos: 'top' | 'bottom' | 'left' | 'right',
  ): { min?: number; max?: number } | null {
    const raw = this.config.zoom?.bounds;
    if (raw === false || raw === 'unbounded') return null;

    const isHoriz = pos === 'top' || pos === 'bottom';
    let spec: ZoomBoundsSpec | undefined;

    // Default for Y: line/area/bar charts auto-range Y from the visible
    // X window, so leaving Y unbounded lets the user stretch the viewport
    // while the data still fills it. Scatter-only axes have no such
    // driver, a point cloud lives in both dimensions independently,    // so we default those to 'data' to match the X-axis behaviour.
    const scatterDefault = !isHoriz && this.isScatterOnlyAxis(scaleKey);
    const yDefault: ZoomBoundsSpec = scatterDefault ? 'data' : 'unbounded';

    if (raw === undefined || raw === true) {
      spec = isHoriz ? 'data' : yDefault;
    } else if (typeof raw === 'string' || (typeof raw === 'object' && ('min' in raw || 'max' in raw))) {
      // Top-level scalar spec applies to every axis.
      spec = raw as ZoomBoundsSpec;
    } else {
      const perAxis = raw as { x?: ZoomBoundsSpec; y?: ZoomBoundsSpec };
      spec = (isHoriz ? perAxis.x : perAxis.y)
        ?? (isHoriz ? 'data' : yDefault);
    }

    if (spec === 'unbounded' || spec === undefined) return null;

    if (typeof spec === 'object') return { ...spec };

    // spec === 'data', use the cached natural extent (output of autoRange,
    // which already honors axis pins and any explicit `nice: true` expansion).
    // Falls back to the raw data range if autoRange hasn't run yet for this axis.
    const natural = this.naturalExtent.get(scaleKey);
    if (natural) return { min: natural[0], max: natural[1] };

    if (this.store.length === 0) return null;
    if (isHoriz) {
      return { min: this.store.xAt(0), max: this.store.xAt(this.store.length - 1) };
    }
    const seriesIndices = this.config.series
      .filter((s) => (s.yAxisKey ?? 'y') === scaleKey && s.visible !== false)
      .map((s) => seriesYDataIndex(s) - 1)
      .filter((idx) => idx >= 0 && idx < this.store.seriesCount);
    if (seriesIndices.length === 0) return null;
    const [yMin, yMax] = this.store.yRange(seriesIndices, 0, this.store.length - 1);
    return { min: yMin, max: yMax };
  }

  /**
   * Apply bounds clamping to a proposed [min, max] viewport. Preserves the
   * viewport's span when shifting away from an edge (pan-into-wall stops
   * at the wall); collapses to the full bounded extent when the proposed
   * span exceeds the allowed one (zoom-out stops at data extent).
   */
  private clampViewportToBounds(
    scaleKey: string,
    pos: 'top' | 'bottom' | 'left' | 'right',
    min: number,
    max: number,
  ): [number, number] {
    const b = this.resolveBounds(scaleKey, pos);
    if (!b) return [min, max];

    const bMin = b.min;
    const bMax = b.max;
    const scale = this.scales.get(scaleKey);
    const span = scale ? this.scaleDomainSpan(scale, min, max) : max - min;

    if (bMin !== undefined && bMax !== undefined) {
      const boundedSpan = scale ? this.scaleDomainSpan(scale, bMin, bMax) : bMax - bMin;
      if (span >= boundedSpan) {
        // User is trying to see more than the full range, clamp to it.
        return [bMin, bMax];
      }
    }
    if (bMin !== undefined && min < bMin) {
      [min, max] = this.rangeFromMin(scale, bMin, span);
    }
    if (bMax !== undefined && max > bMax) {
      [min, max] = this.rangeFromMax(scale, bMax, span);
    }
    // After shifting, the opposite edge may have crossed its bound.
    if (bMin !== undefined && min < bMin) min = bMin;
    if (bMax !== undefined && max > bMax) max = bMax;
    return [min, max];
  }

  private rangeFromMin(scale: Scale | undefined, min: number, span: number): [number, number] {
    if (scale?.type === 'log') {
      const safeMin = Math.max(min, 1e-10);
      return [min, 10 ** (Math.log10(safeMin) + span)];
    }
    return [min, min + span];
  }

  private rangeFromMax(scale: Scale | undefined, max: number, span: number): [number, number] {
    if (scale?.type === 'log') {
      const safeMax = Math.max(max, 1e-10);
      return [10 ** (Math.log10(safeMax) - span), max];
    }
    return [max - span, max];
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
      this.updateLayout();
      this.updateScalePixelRanges();
    }

    // Step 4a: Grid layer (axes, gridlines)
    if (flags & DirtyFlag.GRID) {
      const start = this.statsStart();
      if (this.pluginManager.dispatch('beforeDrawGrid', this, this.canvasManager.gridCtx)) {
        this.canvasManager.clear('grid');

        // Compute custom X ticks for bar/histogram charts
        const customXTicks = this.computeCustomXTicks();

        const labels = renderAxes(
          this.canvasManager.gridCtx,
          this.layout,
          this.scales,
          this.theme,
          this.config,
          customXTicks,
        );
        updateDOMLabels(this.canvasManager.domLayer, labels, this.theme, this.layout);
        this.pluginManager.dispatch('afterDrawGrid', this, this.canvasManager.gridCtx);
        // Count only actual paints: a beforeDraw* plugin that returns false
        // vetoes the clear/draw, so it must not bump renderCount.
        this.statsEnd('grid', start);
      }
    }

    // Step 4b: Data layer (series marks)
    if (flags & DirtyFlag.DATA) {
      const start = this.statsStart();
      if (this.pluginManager.dispatch('beforeDrawData', this, this.canvasManager.dataCtx)) {
        this.canvasManager.clear('data');
        this.renderAllSeries();
        this.pluginManager.dispatch('afterDrawData', this, this.canvasManager.dataCtx);
        this.emitEvent('drawData', this.canvasManager.dataCtx, this.layout);
        this.statsEnd('data', start);
      }
    }

    // Step 4c: Overlay layer (crosshair, tooltip)
    if (flags & DirtyFlag.OVERLAY) {
      const start = this.statsStart();
      if (this.pluginManager.dispatch('beforeDrawOverlay', this, this.canvasManager.overlayCtx)) {
        this.canvasManager.clear('overlay');
        this.renderOverlay();
        this.pluginManager.dispatch('afterDrawOverlay', this, this.canvasManager.overlayCtx);
        this.emitEvent('drawOverlay', this.canvasManager.overlayCtx, this.layout);
        this.statsEnd('overlay', start);
      }
    }
  }

  private statsStart(): number {
    return this.config.debug?.stats ? performance.now() : 0;
  }

  private statsEnd(layer: keyof ChartStats['renderCount'], start: number): void {
    this.stats.renderCount[layer]++;
    if (this.config.debug?.stats) {
      this.stats.lastRenderMs[layer] = performance.now() - start;
    }
  }

  private renderSegments(
    segments: ColumnarSegment[],
    xData: Float64Array,
    yData: Float64Array,
    colorData?: Float64Array,
    sizeData?: Float64Array,
  ) {
    return segments.map((segment) => ({
      xData,
      yData,
      colorData,
      sizeData,
      startIdx: segment.physicalStart,
      endIdx: segment.physicalEnd,
    }));
  }

  private bandRenderSegments(
    segments: ColumnarSegment[],
    xData: Float64Array,
    centerYData: Float64Array,
    upperYData: Float64Array,
    lowerYData: Float64Array,
  ) {
    return segments.map((segment) => ({
      xData,
      centerYData,
      upperYData,
      lowerYData,
      startIdx: segment.physicalStart,
      endIdx: segment.physicalEnd,
    }));
  }

  private renderAllSeries(): void {
    const ctx = this.canvasManager.dataCtx;
    const palette = this.categoricalPalette();
    // Reset per data pass; drawOne sets it when a scatter series samples.
    this.sampledLastDataRender = false;

    // Count bar-type series for grouped width calculation. This mapping is
    // position-based (which slot a bar occupies in each group), so it must
    // be computed from config order, not affected by the highlight draw-last pass.
    const barSeries = this.config.series.filter(
      s => s.visible !== false && (s.type === 'bar'),
    );
    const barIdxFor = new Map<number, number>();
    {
      let i = 0;
      for (let si = 0; si < this.config.series.length; si++) {
        const s = this.config.series[si];
        if (s.visible !== false && s.type === 'bar') {
          barIdxFor.set(si, i++);
        }
      }
    }

    // Resolve highlight dimming once per draw.
    const highlightCfg = this.config.highlight;
    const highlightedSi = this.highlightedSeries;
    const highlightActive =
      highlightedSi !== null && (highlightCfg?.enabled !== false);
    const dimOpacity = highlightCfg?.dimOpacity ?? 0.2;

    // Draw order: when a highlight is active, draw every other series first
    // (dimmed), then the highlighted series on top. Otherwise, draw in config
    // order. This prevents the focused line from being visually composited
    // under later dimmed series.
    const drawOne = (si: number) => {
      const series = this.config.series[si];
      if (!series || series.visible === false) return;

      const color = series.stroke ?? palette[si % palette.length];
      const xScale = this.scales.get(series.xAxisKey ?? 'x')!;
      const yScale = this.scales.get(series.yAxisKey ?? 'y')!;
      if (!xScale || !yScale) return;

      const colIdx = seriesYDataIndex(series);
      if (colIdx < 1 || colIdx > this.store.seriesCount) return;

      const type = series.type ?? 'line';
      const xColumnIdx = type === 'scatter' ? scatterXDataIndex(series) : 0;
      if (!this.isValidColumn(xColumnIdx)) return;
      const canCullByGlobalX = xColumnIdx === 0;
      const [startIdx, endIdx] = canCullByGlobalX
        ? this.store.getViewportIndices(xScale.min, xScale.max)
        : [0, this.store.length - 1];
      const segments = this.store.getSegments(startIdx, endIdx);
      if (segments.length === 0) return;
      const xData = this.store.getPhysicalColumn(xColumnIdx);
      const yData = this.store.getPhysicalColumn(colIdx);
      const colorBy = normalizeScatterColorBy(series.colorBy);
      const sizeBy = normalizeScatterSizeBy(series.sizeBy);
      const renderSegments = this.renderSegments(
        segments,
        xData,
        yData,
        colorBy && this.isValidColumn(colorBy.dataIndex)
          ? this.store.getPhysicalColumn(colorBy.dataIndex)
          : undefined,
        sizeBy && this.isValidColumn(sizeBy.dataIndex)
          ? this.store.getPhysicalColumn(sizeBy.dataIndex)
          : undefined,
      );
      const renderSeries = type === 'scatter' && series.heatmap && !series.heatmapGradient
        ? { ...series, heatmapGradient: this.heatmapGradient() }
        : series;

      const opacityMul = highlightActive && si !== highlightedSi ? dimOpacity : 1;

      switch (type) {
        case 'line':
          renderLineSegments(ctx, renderSegments, xScale, yScale, this.layout, renderSeries, color, opacityMul);
          break;
        case 'area':
          renderAreaSegments(ctx, renderSegments, xScale, yScale, this.layout, renderSeries, color, opacityMul);
          break;
        case 'band': {
          const upperIdx = series.upperDataIndex;
          const lowerIdx = series.lowerDataIndex;
          if (
            upperIdx != null &&
            lowerIdx != null &&
            upperIdx >= 1 &&
            lowerIdx >= 1 &&
            upperIdx <= this.store.seriesCount &&
            lowerIdx <= this.store.seriesCount
          ) {
            const upperYData = this.store.getPhysicalColumn(upperIdx);
            const lowerYData = this.store.getPhysicalColumn(lowerIdx);
            renderBandSegments(
              ctx,
              this.bandRenderSegments(segments, xData, yData, upperYData, lowerYData),
              xScale,
              yScale,
              this.layout,
              renderSeries,
              color,
              opacityMul,
            );
          }
          break;
        }
        case 'scatter': {
          let cache = this.scatterSeriesCaches.get(si);
          if (!cache) {
            cache = new ScatterSeriesCache();
            this.scatterSeriesCaches.set(si, cache);
          }
          // Interaction pass: while the viewport is in motion, cap the
          // points drawn this frame; hit-testing and the settled repaint
          // stay full-fidelity.
          let sampleStride = 1;
          const budget = this.interactionSamplingBudget();
          if (budget !== null && performance.now() < this.viewportActiveUntil) {
            let visible = 0;
            for (const segment of renderSegments) {
              visible += segment.endIdx - segment.startIdx + 1;
            }
            if (visible > budget) {
              sampleStride = Math.ceil(visible / budget);
              this.sampledLastDataRender = true;
            }
          }
          renderScatterSegments(
            ctx,
            renderSegments,
            xScale,
            yScale,
            this.layout,
            renderSeries,
            color,
            opacityMul,
            this.scatterPalettes(),
            cache,
            this.scatterResolvers(si, series, color).renderResolver,
            sampleStride,
          );
          break;
        }
        case 'bar':
          renderBarsSegments(ctx, renderSegments, xScale, yScale, this.layout, renderSeries, color, barIdxFor.get(si) ?? 0, barSeries.length, opacityMul);
          break;
        case 'histogram':
          renderHistogramSegments(ctx, renderSegments, xScale, yScale, this.layout, renderSeries, color, opacityMul);
          break;
      }
    };

    if (highlightActive) {
      for (let si = 0; si < this.config.series.length; si++) {
        if (si !== highlightedSi) drawOne(si);
      }
      drawOne(highlightedSi!);
    } else {
      for (let si = 0; si < this.config.series.length; si++) {
        drawOne(si);
      }
    }
  }

  private renderOverlay(): void {
    const ctx = this.canvasManager.overlayCtx;
    const cursorEnabled = this.config.cursor?.show !== false;
    const isSelecting = this.selectionBox !== null;

    // During active selection, hide crosshair/tooltip/dots, only show the selection box
    if (!isSelecting && cursorEnabled && this.cursorX !== null && this.cursorY !== null) {
      // Draw crosshair, skip for scatter-only charts
      const isScatterOnly = this.config.series.every(
        s => s.visible === false || s.type === 'scatter',
      );
      if (!isScatterOnly) {
        const cursorCfg = this.config.cursor ?? { show: true };
        renderCrosshair(
          ctx,
          this.cursorX,
          this.cursorY,
          this.layout,
          cursorCfg,
          // `cursor.color` overrides the theme's crosshair colour when set,          // useful for matching a brand accent on one chart without changing
          // the whole theme.
          cursorCfg.color ?? this.theme.crosshairColor,
        );
      }

      // Draw data point indicators (dot + ring per hit-tested point).
      // Skip when the caller has opted out, typically because a legend
      // table already shows the values and the extra glyphs would be noise.
      if (this.config.cursor?.indicators !== false) {
        this.drawPointIndicators(ctx);
      }
    }

    // Show tooltip, hide during selection or when cursor is disabled
    if (
      !isSelecting &&
      cursorEnabled &&
      this.cursorIsLocal &&
      this.config.tooltip?.show !== false &&
      this.tooltipPoints.length > 0 &&
      this.mouseX !== null
    ) {
      const rect = this.canvasManager.container.getBoundingClientRect();
      this.tooltipManager.show(
        this.tooltipPoints,
        rect.left + this.mouseX,
        rect.top + (this.mouseY ?? 0),
        this.config.tooltip,
        this.lastPointerType,
      );
    } else {
      this.tooltipManager.hide();
    }

    // Draw selection box
    if (this.selectionBox) {
      renderSelectionBox(
        ctx,
        this.selectionBox.x1,
        this.selectionBox.y1,
        this.selectionBox.x2,
        this.selectionBox.y2,
        this.layout,
      );
    }

    // Tap feedback, 220ms ring animation. Schedule another overlay frame
    // until the lifetime runs out, then clear state.
    if (this.tapFeedback) {
      const TAP_RING_MS = 220;
      const elapsed = performance.now() - this.tapFeedback.startTime;
      const progress = elapsed / TAP_RING_MS;
      if (progress >= 1) {
        this.tapFeedback = null;
      } else {
        renderTapRing(
          ctx,
          this.tapFeedback.x,
          this.tapFeedback.y,
          progress,
          this.theme.crosshairColor,
        );
        this.scheduler.markDirty(DirtyFlag.OVERLAY);
      }
    }
  }

  private drawPointIndicators(ctx: CanvasRenderingContext2D): void {
    // Clip all indicators to the plot area
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(this.layout.plot.left, this.layout.plot.top, this.layout.plot.width, this.layout.plot.height, 4);
    ctx.clip();

    // Ring around cursor dots: white works on both light and dark backgrounds.
    // On dark themes it reads as a subtle glow; on light themes it separates
    // the vibrant fill from the white canvas. Alpha varies by luminance so
    // the ring is visible but never harsh.
    const bg = this.theme.backgroundColor;
    // Default unparseable backgrounds to dark, matching the previous behavior
    // of this ring's luminance check. isDarkColor correctly handles 3-digit
    // hex and named colors, which the old hand-rolled parser did not.
    const isDark = isDarkColor(bg, true);
    const ringAlpha = isDark ? 0.15 : 0.08;

    // When a series is highlighted, only draw the indicator on that series,    // the others just get the crosshair line (matches Neptune/W&B behavior).
    const hlActive = this.highlightedSeries !== null
      && (this.config.highlight?.enabled !== false);

    for (const point of this.tooltipPoints) {
      if (hlActive && point.seriesIndex !== this.highlightedSeries) continue;

      const sc = this.config.series[point.seriesIndex];
      if (!sc) continue;

      const xScale = this.scales.get(sc.xAxisKey ?? 'x');
      const yScale = this.scales.get(sc.yAxisKey ?? 'y');
      if (!xScale || !yScale) continue;

      if (sc.type === 'histogram') {
        // Highlight hovered bin, edges from X data, counts from Y data
        const colIdx = seriesYDataIndex(sc);
        const binIdx = point.dataIndex;
        if (colIdx >= 1 && colIdx <= this.store.seriesCount && binIdx < this.store.length - 1) {
          const x1 = xScale.dataToPixel(this.store.xAt(binIdx));
          const x2 = xScale.dataToPixel(this.store.xAt(binIdx + 1));
          const yTop = yScale.dataToPixel(this.store.yAt(colIdx - 1, binIdx));
          const yBase = yScale.dataToPixel(0);
          ctx.fillStyle = `rgba(255, 255, 255, ${ringAlpha})`;
          ctx.fillRect(x1, Math.min(yTop, yBase), x2 - x1, Math.abs(yTop - yBase));
          ctx.strokeStyle = `rgba(255, 255, 255, ${ringAlpha * 2})`;
          ctx.lineWidth = 1;
          ctx.strokeRect(x1, Math.min(yTop, yBase), x2 - x1, Math.abs(yTop - yBase));
        }
        continue;
      }

      if (sc.type === 'bar') {
        const idx = point.dataIndex;
        const barSeries = this.config.series.filter(s => s.visible !== false && s.type === 'bar');
        const barIdx = barSeries.indexOf(sc);
        const totalBars = barSeries.length;
        if (barIdx >= 0 && idx < this.store.length) {
          const centerX = xScale.dataToPixel(this.store.xAt(idx));
          const categoryWidth = categoryWidthFromData(
            (dataIndex) => xScale.dataToPixel(this.store.xAt(dataIndex)),
            idx,
            this.store.length,
            this.layout.plot.width * 0.5,
          );
          const rect = barRectForCategory({
            centerX,
            categoryWidth,
            series: sc,
            barSeriesIndex: barIdx,
            totalBarSeries: totalBars,
          });
          const barTop = yScale.dataToPixel(point.y);
          const baselineY = yScale.dataToPixel(0);
          if (!Number.isFinite(centerX) || !Number.isFinite(barTop) || !Number.isFinite(baselineY)) continue;
          const rectY = Math.min(barTop, baselineY);
          const rectH = Math.abs(barTop - baselineY);
          ctx.fillStyle = `rgba(255, 255, 255, ${ringAlpha})`;
          ctx.fillRect(rect.left, rectY, rect.width, rectH);
          ctx.strokeStyle = `rgba(255, 255, 255, ${ringAlpha * 2})`;
          ctx.lineWidth = 1;
          ctx.strokeRect(rect.left, rectY, rect.width, rectH);
        }
        continue;
      }

      // Density scatter represents aggregate bins, not a single datum. A
      // nearest-point dot is misleading, so only point-rendered scatter gets
      // the unified indicator style.
      if (sc.type === 'scatter' && isDensityScatterSeries(sc, this.store.length)) continue;

      const px = xScale.dataToPixel(point.x);
      const py = yScale.dataToPixel(point.y);
      const r = sc.type === 'scatter' ? (point.radius ?? sc.pointRadius ?? 3) : 4;

      // On light backgrounds, a subtle drop-shadow gives the dot depth
      // without needing a dark ring stroke.
      if (!isDark) {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.18)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 1;
      }

      // White ring slightly larger than the fill, acts as a clean halo.
      ctx.beginPath();
      ctx.arc(px, py, r + 1.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      // Clear shadow for the inner fill so it's crisp.
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;

      // Filled center with the series color
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = point.color;
      ctx.fill();
    }

    ctx.restore();
  }

  private updateLocalCursorFromPoint(
    x: number,
    y: number,
    pointerType: string,
    publishSync: boolean,
  ): void {
    this.cursorIsLocal = true;
    this.cursorX = x;
    this.cursorY = y;
    this.mouseX = x;
    this.mouseY = y;
    if (pointerType === 'touch' || pointerType === 'pen' || pointerType === 'mouse') {
      this.lastPointerType = pointerType;
    }

    const xScale = this.scales.get('x');
    if (xScale && this.isInPlotArea(x, y)) {
      const pointerDataX = xScale.pixelToData(x);
      const hasOnlyHistograms = this.hasOnlyVisibleHistograms();
      if (hasOnlyHistograms) {
        const hit = this.resolveHistogramCursor(pointerDataX);
        this.cursorDataX = hit?.dataX ?? pointerDataX;
        this.cursorDataIdx = hit?.dataIndex ?? null;
        this.cursorX = xScale.dataToPixel(this.cursorDataX);
      } else {
        this.cursorDataX = pointerDataX;
        this.cursorDataIdx = this.canUseGlobalXCursor() ? this.store.nearestXIndex(this.cursorDataX) : null;
      }

      if (
        !hasOnlyHistograms &&
        this.config.cursor?.snap !== false &&
        this.cursorDataIdx !== null &&
        this.canUseGlobalXCursor()
      ) {
        const snappedX = this.store.xAt(this.cursorDataIdx);
        this.cursorX = xScale.dataToPixel(snappedX);
        this.cursorDataX = snappedX;
      }

      this.updateTooltipPoints();
      this.applyNearestScatterCursor();
      this.applyProximityHighlight();

      if (publishSync) this.publishCursorSync(this.cursorDataX);
    } else {
      this.cursorX = null;
      this.cursorY = null;
      this.cursorDataX = null;
      this.cursorDataIdx = null;
      this.tooltipPoints = [];
      this.tooltipManager.hide();
      this.clearProximityHighlight();

      if (publishSync) this.publishCursorSync(null);
    }

    this.scheduler.markDirty(DirtyFlag.OVERLAY);
    this.emitEvent('cursor:move', this.cursorDataX, this.cursorDataIdx, 'local');
    this.pluginManager.dispatch('onCursorMove', this, this.cursorDataX, this.cursorDataIdx, 'local');
  }

  /**
   * highlight.proximity: auto-focus the series whose hit-tested point is
   * vertically closest to the pointer, clear when none is within range.
   * setHighlight() no-ops on unchanged values, so steady hover costs
   * nothing, and sync propagation rides the normal highlight path.
   */
  private applyProximityHighlight(): void {
    const proximity = this.config.highlight?.proximity;
    if (proximity === undefined || this.config.highlight?.enabled === false) return;
    if (this.mouseY === null) return;

    let best: number | null = null;
    let bestDist = Infinity;
    for (const point of this.tooltipPoints) {
      const sc = this.config.series[point.seriesIndex];
      if (!sc) continue;
      const yScale = this.scales.get(sc.yAxisKey ?? 'y');
      if (!yScale) continue;
      const py = yScale.dataToPixel(point.y);
      if (!Number.isFinite(py)) continue;
      const dist = Math.abs(py - this.mouseY);
      if (dist < bestDist) {
        bestDist = dist;
        best = point.seriesIndex;
      }
    }

    this.setHighlight(bestDist <= proximity ? best : null);
  }

  private clearProximityHighlight(): void {
    if (this.config.highlight?.proximity === undefined) return;
    if (this.config.highlight?.enabled === false) return;
    this.setHighlight(null);
  }

  private updateTooltipPoints(): void {
    if (this.store.length === 0 || this.cursorX === null || this.cursorY === null) {
      this.tooltipPoints = [];
      return;
    }

    // Use chart-type-specific hit-testing for bar/histogram (they need geometry awareness),
    // fall back to generic HitTester for line/scatter/area.
    const hasHistogram = this.config.series.some(s => s.type === 'histogram' && s.visible !== false);
    const hasBar = this.config.series.some(s => s.type === 'bar' && s.visible !== false);

    if (hasHistogram) {
      this.tooltipPoints = this.findHistogramTooltipPoints();
    } else if (hasBar) {
      this.tooltipPoints = this.findBarTooltipPoints();
    } else {
      const mode = this.config.tooltip?.mode ?? 'index';
      const hitX = mode === 'nearest' && this.mouseX !== null ? this.mouseX : this.cursorX;
      const hitY = mode === 'nearest' && this.mouseY !== null ? this.mouseY : this.cursorY;
      const palette = this.categoricalPalette();
      this.tooltipPoints = this.hitTester.findPoints(
        this.store,
        this.scales,
        this.config.series,
        hitX,
        hitY,
        mode,
        palette,
        this.lastPointerType,
        this.scatterPalettes(),
        this.stats.dataVersion,
        (si) => {
          const series = this.config.series[si];
          const fallback = series.stroke ?? palette[si % palette.length];
          return this.scatterResolvers(si, series, fallback).logicalResolver;
        },
      );
    }
  }

  /**
   * Hit-test histogram bins: find which bin the cursor X falls into
   * and return a tooltip point showing the bin range and count.
   */
  private findHistogramTooltipPoints(): TooltipPoint[] {
    const points: TooltipPoint[] = [];
    if (this.cursorX === null || this.store.length < 2) return points;
    const palette = this.categoricalPalette();

    for (let si = 0; si < this.config.series.length; si++) {
      const series = this.config.series[si];
      if (series.visible === false || series.type !== 'histogram') continue;

      const xScale = this.scales.get(series.xAxisKey ?? 'x');
      if (!xScale) continue;
      const dataX = xScale.pixelToData(this.cursorX);

      const colIdx = seriesYDataIndex(series);
      if (colIdx < 1 || colIdx > this.store.seriesCount) continue;

      const color = series.stroke ?? palette[si % palette.length];

      // Find which bin the cursor X falls into. Edges are sorted, so
      // `upperBound` gives the largest b with edges[b] <= dataX in O(log n).
      // Bins are left-edge inclusive. The exact final edge maps to the
      // final bin so a click on the right border still selects that bar.
      const b = this.histogramBinIndexForDataX(dataX);
      if (b === null) continue;

      const binMin = this.store.xAt(b);
      const binMax = this.store.xAt(b + 1);
      const count = this.store.yAt(colIdx - 1, b);

      points.push({
        seriesIndex: si,
        dataIndex: b,
        label: series.label,
        x: (binMin + binMax) / 2,
        y: count,
        color,
        formattedX: this.formatHistogramBinRange(binMin, binMax),
        formattedY: String(count),
      });
    }

    return points;
  }

  /**
   * Hit-test bar charts: find the nearest category to the cursor X
   * and return tooltip points for all bar series at that category.
   */
  private findBarTooltipPoints(): TooltipPoint[] {
    const points: TooltipPoint[] = [];
    if (this.cursorX === null || this.store.length === 0) return points;
    const palette = this.categoricalPalette();

    for (let si = 0; si < this.config.series.length; si++) {
      const series = this.config.series[si];
      if (series.visible === false || series.type !== 'bar') continue;

      const xScale = this.scales.get(series.xAxisKey ?? 'x');
      if (!xScale) continue;

      const dataX = xScale.pixelToData(this.cursorX);
      const idx = this.store.nearestXIndex(dataX);
      const xVal = this.store.xAt(idx);
      const categoryWidth = categoryWidthFromData(
        (dataIndex) => this.store.xAt(dataIndex),
        idx,
        this.store.length,
      );
      if (Math.abs(dataX - xVal) > categoryWidth * 0.6) continue;

      const colIdx = seriesYDataIndex(series);
      if (colIdx < 1 || colIdx > this.store.seriesCount) continue;

      const yVal = this.store.yAt(colIdx - 1, idx);
      if (!Number.isFinite(yVal)) continue;

      const color = series.stroke ?? palette[si % palette.length];
      const yScale = this.scales.get(series.yAxisKey ?? 'y');

      points.push({
        seriesIndex: si,
        dataIndex: idx,
        label: series.label,
        x: xVal,
        y: yVal,
        color,
        formattedX: Number.isInteger(xVal) ? String(xVal) : xVal.toFixed(1),
        formattedY: yScale ? yScale.tickFormat(yVal) : String(Math.round(yVal)),
      });
    }

    return points;
  }

  // ─── Private: Cursor snapshot helpers ───────────────────────

  /**
   * Mutate `target` to match the current snapshot. Shared implementation
   * for both allocating and zero-alloc public variants.
   */
  private fillSnapshot(target: CursorSnapshot, opts?: CursorSnapshotOptions): CursorSnapshot {
    const fallback = opts?.fallback ?? 'hide';
    const length = this.store.length;

    // Resolve the index to read from.
    let idx: number | null = this.cursorDataIdx;
    let source: CursorSnapshot['source'] = idx !== null ? 'cursor' : 'none';

    if (idx === null && length > 0) {
      if (fallback === 'latest') {
        idx = this.hasOnlyVisibleHistograms() && length > 1 ? length - 2 : length - 1;
        source = 'latest';
      } else if (fallback === 'first') {
        idx = 0;
        source = 'first';
      }
    }

    if (idx === null || idx < 0 || idx >= length) {
      target.dataIndex = null;
      target.dataX = null;
      target.formattedX = '';
      target.points.length = 0;
      target.source = 'none';
      target.activeSeriesIndex = null;
      return target;
    }

    const histogramRange = this.hasOnlyVisibleHistograms()
      ? this.histogramBinRange(idx)
      : null;
    const xVal = histogramRange
      ? (histogramRange.min + histogramRange.max) / 2
      : this.store.xAt(idx);
    const xScale = this.scales.get('x');

    target.dataIndex = idx;
    target.dataX = xVal;
    target.formattedX = histogramRange
      ? this.formatHistogramBinRange(histogramRange.min, histogramRange.max)
      : xScale ? xScale.tickFormat(xVal) : String(xVal);
    target.source = source;

    const palette = this.categoricalPalette();
    const seriesList = this.config.series;
    const points = target.points;

    // Track the series whose Y is nearest the cursor (pixel-space).
    // Only meaningful when the snapshot is cursor-driven; otherwise null.
    const cursorY = source === 'cursor' ? this.cursorY : null;
    let nearestSi: number | null = null;
    let nearestDist = Infinity;

    // Walk visible series, mutate row objects in place; reuse rows
    // across calls to keep the cursor hot path allocation-free.
    let writeIdx = 0;
    for (let si = 0; si < seriesList.length; si++) {
      const s = seriesList[si];
      if (s.visible === false) continue;

      const colIdx = seriesYDataIndex(s);
      if (colIdx < 1 || colIdx > this.store.seriesCount) continue;

      const value = this.store.yAt(colIdx - 1, idx);
      const yScale = this.scales.get(s.yAxisKey ?? 'y');
      const formattedValue = Number.isFinite(value)
        ? (yScale ? yScale.tickFormat(value) : String(value))
        : '';
      const color = s.stroke ?? palette[si % palette.length];

      let row = points[writeIdx];
      if (!row) {
        row = {
          seriesIndex: si,
          dataIndex: idx,
          label: s.label,
          color,
          value,
          formattedValue,
          meta: s.meta,
        };
        points[writeIdx] = row;
      } else {
        row.seriesIndex = si;
        row.dataIndex = idx;
        row.label = s.label;
        row.color = color;
        row.value = value;
        row.formattedValue = formattedValue;
        row.meta = s.meta;
      }
      writeIdx++;

      // Nearest-series in pixel space: compare the series' Y pixel to
      // the cursor's Y pixel. Skipped for NaN values or when no cursor.
      if (cursorY !== null && yScale && value === value) {
        const px = yScale.dataToPixel(value);
        const d = Math.abs(px - cursorY);
        if (d < nearestDist) {
          nearestDist = d;
          nearestSi = si;
        }
      }
    }
    points.length = writeIdx;
    target.activeSeriesIndex = nearestSi;

    return target;
  }

  // ─── Private: Helpers ───────────────────────────────────────

  private categoricalPalette(): string[] {
    return this.theme.categoricalPalette ?? this.theme.palette;
  }

  private scatterPalettes(): ScatterPalettes {
    return {
      categorical: this.categoricalPalette(),
      sequential: this.theme.sequentialPalette ?? this.theme.heatmapGradient,
      diverging: this.theme.divergingPalette,
    };
  }

  private heatmapGradient(): string[] | undefined {
    return this.theme.heatmapGradient ?? this.theme.sequentialPalette;
  }

  private isValidColumn(columnIdx: number): boolean {
    return Number.isInteger(columnIdx) && columnIdx >= 0 && columnIdx <= this.store.seriesCount;
  }

  private canUseGlobalXCursor(): boolean {
    return !this.config.series.some(
      series => series.visible !== false &&
        series.type === 'scatter' &&
        scatterXDataIndex(series) !== 0,
    );
  }

  private applyNearestScatterCursor(): void {
    if ((this.config.tooltip?.mode ?? 'index') !== 'nearest') return;
    const point = this.tooltipPoints[0];
    if (!point) return;
    if (this.config.series[point.seriesIndex]?.type !== 'scatter') return;

    this.cursorDataX = point.x;
    this.cursorDataIdx = point.dataIndex;
  }

  private paddedLogRange(min: number, max: number, padding: number): [number, number] {
    const safeMin = Math.max(min, 1e-10);
    const safeMax = Math.max(max, safeMin);
    if (safeMin === safeMax) return [safeMin / 10, safeMax * 10];
    const logMin = Math.log10(safeMin);
    const logMax = Math.log10(safeMax);
    const logPad = (logMax - logMin) * padding;
    return [10 ** (logMin - logPad), 10 ** (logMax + logPad)];
  }

  private shouldNiceAutoRange(scale: Scale, axis: AxisConfig, hasExactGeometry: boolean): boolean {
    if (hasExactGeometry || scale.type === 'time') return false;
    return axis.nice === true;
  }

  private scatterPointsInSelection(
    xRange: ScaleRange,
    yRange: ScaleRange,
  ) {
    const points = [];
    const palette = this.categoricalPalette();

    for (let si = 0; si < this.config.series.length; si++) {
      const series = this.config.series[si];
      if (series.visible === false || series.type !== 'scatter') continue;
      const xColumnIdx = scatterXDataIndex(series);
      const yColumnIdx = seriesYDataIndex(series);
      if (!this.isValidColumn(xColumnIdx) || !this.isValidColumn(yColumnIdx)) continue;

      const fallbackColor = series.stroke ?? palette[si % palette.length];
      const style = this.scatterResolvers(si, series, fallbackColor).logicalResolver;

      for (let i = 0; i < this.store.length; i++) {
        const x = this.store.valueAt(xColumnIdx, i);
        const y = this.store.valueAt(yColumnIdx, i);
        if (
          !Number.isFinite(x) ||
          !Number.isFinite(y) ||
          x < xRange.min ||
          x > xRange.max ||
          y < yRange.min ||
          y > yRange.max
        ) {
          continue;
        }
        points.push({
          seriesIndex: si,
          dataIndex: i,
          label: series.label,
          x,
          y,
          color: style.colorAt(i),
          meta: series.meta,
        });
      }
    }

    return points;
  }

  /** Re-run tooltip hit-test at current cursor position (called on data change) */
  private refreshCursor(): void {
    if (this.mouseX === null || this.mouseY === null || !this.cursorIsLocal) return;
    this.updateTooltipPoints();
    this.scheduler.markDirty(DirtyFlag.OVERLAY);
  }

  /**
   * Compute custom X-axis ticks for bar/histogram charts.
   * Bar charts: tick at each category X value.
   * Histograms: tick at each bin edge (thinned if too dense).
   */
  private computeCustomXTicks(): { values: number[]; format?: (v: number) => string } | undefined {
    const visibleSeries = this.config.series.filter(s => s.visible !== false);

    // User-provided formatter on the X axis wins over the default numeric
    // one for categorical bar / histogram charts.
    const xAxisCfg = this.config.axes?.x;
    const userFormat = xAxisCfg?.tickFormat;
    const defaultFormat = (v: number) =>
      Number.isInteger(v) ? String(v) : v.toFixed(1);

    // Histogram: X data = bin edges, use them as tick values
    const histSeries = visibleSeries.find(s => s.type === 'histogram');
    if (histSeries && this.store.length > 0) {
      // X column contains bin edges directly (pre-computed by user)
      let edgeValues = Array.from(this.store.x);
      const plotWidth = this.layout.plot.width;
      const maxLabels = Math.max(2, Math.floor(plotWidth / 65));
      if (edgeValues.length > maxLabels) {
        const step = Math.ceil(edgeValues.length / maxLabels);
        edgeValues = edgeValues.filter((_, i) => i % step === 0);
      }

      return { values: edgeValues, format: userFormat ?? defaultFormat };
    }

    // Bar chart: tick at each category X value
    const barSeries = visibleSeries.find(s => s.type === 'bar');
    if (barSeries && this.store.length > 0) {
      const values = Array.from(this.store.x);
      return { values, format: userFormat ?? defaultFormat };
    }

    return undefined;
  }

  private hasOnlyVisibleHistograms(): boolean {
    let hasVisibleSeries = false;
    for (const series of this.config.series) {
      if (series.visible === false) continue;
      hasVisibleSeries = true;
      if (series.type !== 'histogram') return false;
    }
    return hasVisibleSeries;
  }

  private resolveHistogramCursor(dataX: number): { dataIndex: number; dataX: number } | null {
    const dataIndex = this.histogramBinIndexForDataX(dataX);
    if (dataIndex === null) return null;

    const range = this.histogramBinRange(dataIndex);
    if (!range) return null;
    return {
      dataIndex,
      dataX: (range.min + range.max) / 2,
    };
  }

  private histogramBinIndexForDataX(dataX: number): number | null {
    if (this.store.length < 2) return null;

    const firstEdge = this.store.xAt(0);
    const lastEdge = this.store.xAt(this.store.length - 1);
    if (dataX < firstEdge || dataX > lastEdge) return null;

    let binIdx = this.store.upperBoundX(dataX);
    if (binIdx === this.store.length - 1 && dataX === lastEdge) {
      binIdx = this.store.length - 2;
    }

    if (binIdx < 0 || binIdx >= this.store.length - 1) return null;
    return binIdx;
  }

  private histogramBinRange(dataIndex: number): { min: number; max: number } | null {
    if (dataIndex < 0 || dataIndex >= this.store.length - 1) return null;
    return {
      min: this.store.xAt(dataIndex),
      max: this.store.xAt(dataIndex + 1),
    };
  }

  private formatHistogramBinRange(min: number, max: number): string {
    return `${min.toFixed(1)} \u2013 ${max.toFixed(1)}`;
  }

  private isInPlotArea(x: number, y: number): boolean {
    const { plot } = this.layout;
    return (
      x >= plot.left &&
      x <= plot.left + plot.width &&
      y >= plot.top &&
      y <= plot.top + plot.height
    );
  }

  private onResize(width: number, height: number): void {
    this.updateLayout();
    this.updateScalePixelRanges();
    this.scheduler.markDirty(DirtyFlag.ALL);
    this.emitEvent('resize', width, height);
  }

  private emitEvent(event: string, ...args: any[]): void {
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
