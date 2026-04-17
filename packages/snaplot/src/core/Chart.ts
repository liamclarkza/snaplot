import type {
  ChartInstance,
  ChartConfig,
  ChartEventMap,
  ColumnarData,
  CursorSnapshot,
  CursorSnapshotOptions,
  DeepPartial,
  Layout,
  Plugin,
  Scale,
  ScaleRange,
  ThemeConfig,
  TooltipPoint,
  ZoomBoundsSpec,
} from '../types';
import { DirtyFlag } from '../types';

import { CanvasManager } from './CanvasManager';
import { RenderScheduler } from './RenderScheduler';
import { EventBus, SyncGroup } from './EventBus';
import { computeLayout, inferPosition } from './Layout';

import { ColumnarStore } from '../data/ColumnarStore';
import { createScale } from '../scales/createScale';
import { AUTO_RANGE_PADDING, DEFAULT_TICK_COUNT, MIN_DRAG_DISTANCE } from '../constants';

import { deepMerge } from '../config/merge';
import { DEFAULT_CONFIG } from '../config/defaults';
import { resolveTheme } from '../config/theme';

import { renderAxes, updateDOMLabels } from '../renderers/AxesRenderer';
import { renderLine, renderArea, renderBand } from '../renderers/LineRenderer';
import { renderScatter } from '../renderers/ScatterRenderer';
import { renderBars } from '../renderers/BarRenderer';
import { renderHistogram } from '../renderers/HistogramRenderer';
import { renderCrosshair, renderSelectionBox, renderTapRing } from '../renderers/InteractionRenderer';

import { GestureManager } from '../interaction/GestureManager';
import { HitTester } from '../interaction/HitTester';
import { TooltipManager } from '../interaction/TooltipManager';

import { PluginManager } from '../plugins/PluginManager';

import { nearestIndex, upperBound } from '../data/binarySearch';

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
  private store: ColumnarStore;
  private scales: Map<string, Scale> = new Map();
  private layout!: Layout;
  private theme!: ThemeConfig;

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
  /** Active selection box (shift+drag) */
  private selectionBox: { x1: number; y1: number; x2: number; y2: number } | null = null;
  /** Transient tap-feedback ring, cleared automatically once its lifetime expires. */
  private tapFeedback: { x: number; y: number; startTime: number } | null = null;
  /** True when the user has actively zoomed, suppresses auto-range X on data updates */
  private userHasZoomed = false;

  // Event listeners. Handlers have per-event signatures (see ChartEventMap);
  // the storage is a contravariant-friendly callable so every event's
  // handler shape assigns in without a cast (Function is banned by lint).
  private listeners = new Map<string, Set<(...args: never[]) => unknown>>();

  // Cleanup
  private destroyed = false;
  private syncKey: string | null = null;
  private highlightSyncKey: string | null = null;
  private zoomSyncKey: string | null = null;
  /** Guard to suppress zoom sync publishing when applying a peer's broadcast */
  private suppressZoomSync = false;

  // Highlight state
  private highlightedSeries: number | null = null;

  /**
   * Per-axis "reset-zoom" extent, the scale's min/max after the last
   * `autoRange*` pass (including axis-config pins and `nice()` expansion).
   * Used by `zoom.bounds: 'data'` so zoom-out stops at the same range
   * `resetZoom()` would produce, not a tighter raw-data extent that would
   * visually clip the niced initial view.
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
    this.applyModePresets();

    // 2. Create canvas layers
    this.canvasManager = new CanvasManager(parent, (w, h) => {
      this.onResize(w, h);
    });

    // 3. Resolve theme
    this.theme = resolveTheme(parent, this.config.theme);

    // 4. Create data store
    const initialData = data ?? [new Float64Array(0)];
    this.store = new ColumnarStore(initialData);

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
      this.canvasManager.dataCanvas,
      this.eventBus,
      () => this.config.interaction ?? 'timeseries',
      () => this.layout,
      () => this.config.zoom ?? { enabled: true, x: true },
      this.config.touch?.longPressMs,
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
    if (this.config.cursor?.syncKey) {
      this.syncKey = this.config.cursor.syncKey;
      SyncGroup.join(this.syncKey, this);
    }
    if (this.config.highlight?.syncKey) {
      this.highlightSyncKey = this.config.highlight.syncKey;
      // Cursor and highlight may share the same key, only join once.
      if (this.highlightSyncKey !== this.syncKey) {
        SyncGroup.join(this.highlightSyncKey, this);
      }
    }
    if (this.config.zoom?.syncKey) {
      this.zoomSyncKey = this.config.zoom.syncKey;
      if (this.zoomSyncKey !== this.syncKey && this.zoomSyncKey !== this.highlightSyncKey) {
        SyncGroup.join(this.zoomSyncKey, this);
      }
    }

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
    this.store.setData(data);
    this.autoRange();
    this.refreshCursor();
    this.scheduler.markDirty(DirtyFlag.DATA | DirtyFlag.GRID);
    this.pluginManager.dispatch('onSetData', this, data);
    this.emitEvent('data:update', data);
  }

  appendData(data: ColumnarData, maxLen?: number): void {
    this.store.append(data, maxLen);
    this.autoRange();
    this.refreshCursor();
    this.scheduler.markDirty(DirtyFlag.DATA | DirtyFlag.GRID);
  }

  getData(): ColumnarData {
    return this.store.getData();
  }

  setAxis(key: string, range: Partial<ScaleRange>): void {
    const scale = this.scales.get(key);
    if (!scale) return;

    if (range.min !== undefined) scale.min = range.min;
    if (range.max !== undefined) scale.max = range.max;

    // When X axis changes (e.g. from a zoom sync peer), re-fit Y axis
    // to the new visible X range, otherwise the band/data may clip.
    const ac = this.config.axes?.[key];
    const pos = inferPosition(key, ac?.position);
    const isHoriz = pos === 'bottom' || pos === 'top';
    if (isHoriz && !this.config.zoom?.y) {
      this.autoRangeVertical();
    }

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

    if (partial.interaction) {
      this.applyModePresets();
      this.gestureManager.updateTouchAction();
    }

    if (partial.theme) {
      this.theme = resolveTheme(this.container, this.config.theme);
      this.tooltipManager.applyTheme(this.theme);
    }

    this.initAxes();
    this.updateLayout();
    this.updateScalePixelRanges();
    this.autoRange();
    this.scheduler.markDirty(DirtyFlag.ALL);
    this.pluginManager.dispatch('onSetOptions', this);
  }

  getOptions(): ChartConfig {
    return this.config;
  }

  getLayout(): Layout {
    return this.layout;
  }

  redraw(): void {
    this.scheduler.markDirty(DirtyFlag.ALL);
  }

  /** Reset zoom to full data extent (double-click handler) */
  resetZoom(): void {
    this.userHasZoomed = false;
    this.autoRangeHorizontal();
    this.autoRangeVertical();
    this.scheduler.markDirty(DirtyFlag.ALL);
  }

  resize(width: number, height: number): void {
    this.canvasManager.resize(width, height);
    this.onResize(width, height);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    this.scheduler.destroy();
    this.gestureManager.detach();
    this.tooltipManager.destroy();
    this.eventBus.destroy();
    this.pluginManager.destroyAll(this);
    this.canvasManager.destroy();
    this.listeners.clear();

    if (this.syncKey) {
      SyncGroup.leave(this.syncKey, this);
    }
    if (this.highlightSyncKey && this.highlightSyncKey !== this.syncKey) {
      SyncGroup.leave(this.highlightSyncKey, this);
    }
    if (this.zoomSyncKey && this.zoomSyncKey !== this.syncKey && this.zoomSyncKey !== this.highlightSyncKey) {
      SyncGroup.leave(this.zoomSyncKey, this);
    }
  }

  use(plugin: Plugin): void {
    this.pluginManager.register(plugin);
    plugin.install?.(this);
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

  setCursorDataX(dataX: number | null): void {
    this.cursorIsLocal = false; // Sync-driven cursor

    if (dataX === null) {
      this.cursorX = null;
      this.cursorY = null;
      this.cursorDataX = null;
      this.cursorDataIdx = null;
      this.tooltipPoints = [];
      this.tooltipManager.hide();
      this.scheduler.markDirty(DirtyFlag.OVERLAY);
      return;
    }

    const xScale = this.scales.get('x');
    if (!xScale) return;

    this.cursorDataX = dataX;
    this.cursorDataIdx = nearestIndex(this.store.x, dataX);

    // Snap to nearest actual data point's X for accurate crosshair placement
    if (this.cursorDataIdx < this.store.length) {
      const snappedX = this.store.x[this.cursorDataIdx];
      this.cursorX = xScale.dataToPixel(snappedX);
    } else {
      this.cursorX = xScale.dataToPixel(dataX);
    }

    // Find Y position from first visible series at this index
    this.cursorY = this.layout.plot.top + this.layout.plot.height / 2; // default to plot center
    const yScale = this.scales.get('y');
    if (yScale && this.cursorDataIdx !== null && this.cursorDataIdx < this.store.length) {
      for (const sc of this.config.series) {
        if (sc.visible === false) continue;
        const colIdx = sc.dataIndex;
        const yVal = this.store.y(colIdx - 1)?.[this.cursorDataIdx];
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
    // Equality guard: prevents redundant redraws and breaks sync loops.
    if (this.highlightedSeries === seriesIndex) return;

    this.highlightedSeries = seriesIndex;
    this.scheduler.markDirty(DirtyFlag.DATA);
    this.emitEvent('highlight:change', seriesIndex);

    if (this.highlightSyncKey) {
      SyncGroup.publishHighlight(this.highlightSyncKey, this, seriesIndex);
    }
  }

  getHighlight(): number | null {
    return this.highlightedSeries;
  }

  // ─── Private: Initialization ────────────────────────────────

  /**
   * Apply interaction mode presets to zoom/pan config.
   * When a mode is set, it always overrides zoom/pan axes settings
   * (the mode IS the intent). Users can still override after via setOptions
   * with explicit zoom/pan config without setting a mode.
   */
  private applyModePresets(): void {
    const mode = this.config.interaction;
    if (!mode) return;

    if (mode === 'analytical') {
      this.config.zoom = { ...this.config.zoom, enabled: true, x: true, y: true };
      this.config.pan = { ...this.config.pan, enabled: true, x: true, y: true };
    } else if (mode === 'timeseries') {
      this.config.zoom = { ...this.config.zoom, enabled: true, x: true, y: false };
      this.config.pan = { ...this.config.pan, enabled: true, x: true, y: false };
    } else if (mode === 'readonly') {
      this.config.zoom = { enabled: false };
      this.config.pan = { enabled: false };
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
  }

  /**
   * Auto-range both horizontal and vertical axes to fit data.
   * Called on data change (setData, appendData, init), NOT on zoom.
   */
  private autoRange(): void {
    this.autoRangeHorizontal();
    this.autoRangeVertical();
  }

  /** Auto-range horizontal (bottom/top) axes to full data extent. Skipped if the user has actively zoomed. */
  private autoRangeHorizontal(): void {
    if (this.store.length === 0) return;
    if (this.userHasZoomed) return;

    const axisConfigs = this.config.axes ?? {};
    for (const [key, ac] of Object.entries(axisConfigs)) {
      const pos = inferPosition(key, ac.position);
      if (pos !== 'bottom' && pos !== 'top') continue;

      const scale = this.scales.get(key);
      if (!scale) continue;
      if (ac.auto === false) continue;
      // Both bounds pinned → restore to those values. Skipping here would
      // leave zoomed state intact after `resetZoom()`.
      if (ac.min !== undefined && ac.max !== undefined) {
        scale.min = ac.min;
        scale.max = ac.max;
        continue;
      }

      const xMin = this.store.x[0];
      const xMax = this.store.x[this.store.length - 1];
      const hasBarSeries = this.config.series.some(
        s => s.visible !== false && (s.type === 'bar' || s.type === 'histogram'),
      );
      // Scatter/heatmap clouds don't benefit from nice() rounding, it pushes
      // the axis out to the next round number (e.g. 18..93 → 0..100), leaving
      // the cloud floating far from the frame edge. Default to a 5 % pad and
      // skip nice() so the data fills the plot with just enough breathing room.
      const isScatterOnly =
        !hasBarSeries &&
        this.config.series.length > 0 &&
        this.config.series.every(
          s => s.visible === false || s.type === 'scatter',
        );

      if (xMin === xMax) {
        scale.min = xMin - 1;
        scale.max = xMax + 1;
      } else if (hasBarSeries && this.store.length > 1) {
        // Bar/histogram: pad by half a category width so edge bars aren't clipped
        const categoryPad = (xMax - xMin) / (this.store.length - 1) * 0.5;
        scale.min = xMin - categoryPad;
        scale.max = xMax + categoryPad;
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

      // nice() gives clean tick boundaries for line/area where the curve
      // meets the frame. Skip for time (data extent is natural), bar
      // (category padding is exact), scatter (padding beats nice() on point
      // clouds), and whenever the user explicitly disables it per-axis.
      if (
        scale.type !== 'time' &&
        !hasBarSeries &&
        !isScatterOnly &&
        ac.nice !== false
      ) {
        scale.nice(DEFAULT_TICK_COUNT);
      }

      // Remember the "full" extent so zoom.bounds: 'data' knows how far
      // out reset-zoom would go.
      this.naturalExtent.set(key, [scale.min, scale.max]);
    }
  }

  /**
   * Auto-range vertical (left/right) axes to fit the data visible in the current X viewport.
   * Called on zoom/pan (viewport change) AND on data change.
   * This is the key to "zoom X, Y follows" behavior.
   */
  private autoRangeVertical(): void {
    if (this.store.length === 0) return;

    const axisConfigs = this.config.axes ?? {};
    for (const [key, scale] of this.scales) {
      const ac = axisConfigs[key];
      if (!ac) continue;
      const pos = inferPosition(key, ac.position);
      if (pos !== 'left' && pos !== 'right') continue;
      if (ac.auto === false) continue;
      // Both bounds pinned → restore to those values. Skipping here would
      // leave zoomed state intact after `resetZoom()`.
      if (ac.min !== undefined && ac.max !== undefined) {
        scale.min = ac.min;
        scale.max = ac.max;
        continue;
      }

      // Find data column indices bound to this axis.
      // Band series contribute their upper/lower columns in addition to dataIndex
      // so the auto-range encompasses the full band extent.
      const seriesIndices: number[] = [];
      for (const s of this.config.series) {
        if ((s.yAxisKey ?? 'y') !== key || s.visible === false) continue;
        seriesIndices.push(s.dataIndex - 1);
        if (s.type === 'band') {
          if (s.upperDataIndex != null) seriesIndices.push(s.upperDataIndex - 1);
          if (s.lowerDataIndex != null) seriesIndices.push(s.lowerDataIndex - 1);
        }
      }

      if (seriesIndices.length === 0) continue;

      // Get viewport indices for visible X range
      const xScale = this.scales.get('x');
      let startIdx = 0;
      let endIdx = this.store.length - 1;
      if (xScale) {
        [startIdx, endIdx] = this.store.getViewportIndices(xScale.min, xScale.max);
      }

      const [yMin, yMax] = this.store.yRange(seriesIndices, startIdx, endIdx);
      // Vertical auto-range defaults to 5% padding so line/area charts
      // don't touch the plot edges; users can override per-axis.
      const pad = (yMax - yMin) * (ac.padding ?? AUTO_RANGE_PADDING);

      // For bar/histogram series, always include 0 as the baseline
      const hasBarOrHist = this.config.series.some(
        s => (s.yAxisKey ?? 'y') === key && s.visible !== false && (s.type === 'bar' || s.type === 'histogram'),
      );
      // Scatter clouds: skip nice() on Y too, same reason as the X axis,
      // the padded extent keeps the cloud framed without round-number jumps.
      const isScatterOnlyAxis =
        !hasBarOrHist &&
        this.config.series
          .filter(s => (s.yAxisKey ?? 'y') === key && s.visible !== false)
          .every(s => s.type === 'scatter');

      if (ac.min === undefined) {
        scale.min = hasBarOrHist ? Math.min(0, yMin - pad) : yMin - pad;
      }
      if (ac.max === undefined) {
        scale.max = hasBarOrHist ? Math.max(0, yMax + pad) : yMax + pad;
      }

      if (ac.nice !== false && !isScatterOnlyAxis) {
        scale.nice(DEFAULT_TICK_COUNT);
        // nice() can push min below 0, clamp back for bar/histogram baseline
        if (hasBarOrHist && yMin >= 0 && scale.min < 0) scale.min = 0;
      }

      // Remember the "full" extent so zoom.bounds: 'data' knows how far
      // out reset-zoom would go.
      this.naturalExtent.set(key, [scale.min, scale.max]);
    }
  }

  private updateLayout(): void {
    const w = this.canvasManager.cssWidth || 600;
    const h = this.canvasManager.cssHeight || 400;

    this.layout = computeLayout(
      w, h,
      this.config,
      this.scales,
      this.canvasManager.dpr,
      this.theme.fontFamily,
      this.theme.fontSize,
    );
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

  // ─── Private: Event wiring ──────────────────────────────────

  private wireEvents(): void {
    // ── Cursor tracking ──
    this.eventBus.on('action:cursor', ({ x, y, pointerType }) => {
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
        this.cursorDataX = xScale.pixelToData(x);
        this.cursorDataIdx = nearestIndex(this.store.x, this.cursorDataX);

        const hasOnlyHistograms = this.config.series.every(
          s => s.visible === false || s.type === 'histogram',
        );
        if (!hasOnlyHistograms && this.config.cursor?.snap !== false && this.cursorDataIdx !== null) {
          const snappedX = this.store.x[this.cursorDataIdx];
          this.cursorX = xScale.dataToPixel(snappedX);
          this.cursorDataX = snappedX;
        }

        this.updateTooltipPoints();

        if (this.syncKey) {
          SyncGroup.publishCursor(this.syncKey, this, this.cursorDataX);
        }
      } else {
        this.cursorDataX = null;
        this.cursorDataIdx = null;
        this.tooltipPoints = [];
        this.tooltipManager.hide();
      }

      this.scheduler.markDirty(DirtyFlag.OVERLAY);
      this.emitEvent('cursor:move', this.cursorDataX, this.cursorDataIdx);
      this.pluginManager.dispatch('onCursorMove', this, this.cursorDataX, this.cursorDataIdx);
    });

    // ── Cursor leave ──
    this.eventBus.on('action:cursor-leave', () => {
      this.cursorX = null;
      this.cursorY = null;
      this.mouseX = null;
      this.mouseY = null;
      this.cursorDataX = null;
      this.cursorDataIdx = null;
      this.tooltipPoints = [];
      this.tooltipManager.hide();
      this.scheduler.markDirty(DirtyFlag.OVERLAY);

      // Notify listeners and plugins that the cursor is gone, without
      // this, a fast mouse-leave skips the "cursor outside plot area"
      // path in action:cursor and the legend table never blanks its values.
      this.emitEvent('cursor:move', null, null);
      this.pluginManager.dispatch('onCursorMove', this, null, null);

      if (this.syncKey) {
        SyncGroup.publishCursor(this.syncKey, this, null);
      }
    });

    // ── Pan (incremental pixel delta) ──
    this.eventBus.on('action:pan', ({ dx, dy, axis }) => {
      const pan = this.config.pan ?? { enabled: true, x: true };
      if (!pan.enabled) return;

      const axisConfigs = this.config.axes ?? {};

      if (axis) {
        // Drag started on a specific axis, only pan that axis
        const scale = this.scales.get(axis);
        if (scale) {
          const pos = inferPosition(axis, axisConfigs[axis]?.position);
          const isHoriz = pos === 'bottom' || pos === 'top';
          const delta = isHoriz ? dx : dy;
          const dataD = scale.pixelToData(0) - scale.pixelToData(delta);
          this.applyViewportChange(axis, scale.min + dataD, scale.max + dataD);
        }
      } else {
        // Drag in plot area, pan all enabled axes
        for (const [key, scale] of this.scales) {
          const pos = inferPosition(key, axisConfigs[key]?.position);
          const isHoriz = pos === 'bottom' || pos === 'top';
          if (isHoriz && pan.x !== false) {
            const dataD = scale.pixelToData(0) - scale.pixelToData(dx);
            this.applyViewportChange(key, scale.min + dataD, scale.max + dataD);
          } else if (!isHoriz && pan.y) {
            const dataD = scale.pixelToData(0) - scale.pixelToData(dy);
            this.applyViewportChange(key, scale.min + dataD, scale.max + dataD);
          }
        }
      }
    });

    // ── Zoom (factor at anchor point) ──
    this.eventBus.on('action:zoom', ({ factor, anchorX, anchorY, axis }) => {
      const zoom = this.config.zoom ?? { enabled: true, x: true };
      if (!zoom.enabled) return;

      const axisConfigs = this.config.axes ?? {};

      if (axis === 'xy') {
        // Zoom all enabled axes
        for (const [key, scale] of this.scales) {
          const pos = inferPosition(key, axisConfigs[key]?.position);
          const isHoriz = pos === 'bottom' || pos === 'top';
          if (isHoriz && zoom.x !== false) {
            const anchor = scale.pixelToData(anchorX);
            const newMin = anchor - (anchor - scale.min) * factor;
            const newMax = anchor + (scale.max - anchor) * factor;
            const range = newMax - newMin;
            if ((!zoom.minRange || range >= zoom.minRange) && (!zoom.maxRange || range <= zoom.maxRange)) {
              this.applyViewportChange(key, newMin, newMax);
            }
          } else if (!isHoriz && zoom.y) {
            const anchor = scale.pixelToData(anchorY);
            const newMin = anchor - (anchor - scale.min) * factor;
            const newMax = anchor + (scale.max - anchor) * factor;
            this.applyViewportChange(key, newMin, newMax);
          }
        }
      } else {
        // Zoom a specific axis by key
        const scale = this.scales.get(axis);
        if (scale) {
          const pos = inferPosition(axis, axisConfigs[axis]?.position);
          const isHoriz = pos === 'bottom' || pos === 'top';
          const anchorPx = isHoriz ? anchorX : anchorY;
          const anchor = scale.pixelToData(anchorPx);
          const newMin = anchor - (anchor - scale.min) * factor;
          const newMax = anchor + (scale.max - anchor) * factor;
          const range = newMax - newMin;
          if (isHoriz) {
            if (zoom.x !== false && (!zoom.minRange || range >= zoom.minRange) && (!zoom.maxRange || range <= zoom.maxRange)) {
              this.applyViewportChange(axis, newMin, newMax);
            }
          } else {
            this.applyViewportChange(axis, newMin, newMax);
          }
        }
      }
    });

    // ── Box selection (start/update/end) ──
    this.eventBus.on('action:box-start', ({ x, y }) => {
      this.selectionBox = { x1: x, y1: y, x2: x, y2: y };
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

      if (zoom.x !== false) {
        const xScale = this.scales.get('x');
        if (xScale) {
          this.applyViewportChange('x',
            xScale.pixelToData(Math.min(x1, x2)),
            xScale.pixelToData(Math.max(x1, x2)),
          );
        }
      }
      if (zoom.y) {
        const yScale = this.scales.get('y');
        if (yScale) {
          this.applyViewportChange('y',
            yScale.pixelToData(Math.max(y1, y2)),
            yScale.pixelToData(Math.min(y1, y2)),
          );
        }
      }

      const sel = this.config.selection;
      if (sel?.onSelect && dx >= MIN_DRAG_DISTANCE) {
        const xScale = this.scales.get('x');
        if (xScale) {
          sel.onSelect({ x: {
            min: xScale.pixelToData(Math.min(x1, x2)),
            max: xScale.pixelToData(Math.max(x1, x2)),
          }});
        }
      }
    });

    // ── Reset zoom ──
    this.eventBus.on('action:reset-zoom', () => {
      this.resetZoom();
      // Broadcast the reset X range to zoom sync peers
      if (this.zoomSyncKey) {
        const xScale = this.scales.get('x');
        if (xScale) {
          SyncGroup.publishScale(this.zoomSyncKey, this, 'x', { min: xScale.min, max: xScale.max });
        }
      }
    });

    // ── Tap (touch: show/persist tooltip) ──
    this.eventBus.on('action:tap', ({ x, y }) => {
      this.cursorIsLocal = true;
      this.cursorX = x;
      this.cursorY = y;
      this.mouseX = x;
      this.mouseY = y;

      const xScale = this.scales.get('x');
      if (xScale && this.isInPlotArea(x, y)) {
        this.cursorDataX = xScale.pixelToData(x);
        this.cursorDataIdx = nearestIndex(this.store.x, this.cursorDataX);
        if (this.config.cursor?.snap !== false && this.cursorDataIdx !== null) {
          const snappedX = this.store.x[this.cursorDataIdx];
          this.cursorX = xScale.dataToPixel(snappedX);
          this.cursorDataX = snappedX;
        }
        this.updateTooltipPoints();

        // Leave a short-lived ring so the user can see the tap landed.
        this.tapFeedback = { x, y, startTime: performance.now() };
      } else {
        // Tap outside plot → dismiss tooltip
        this.tooltipPoints = [];
        this.tooltipManager.hide();
      }

      this.scheduler.markDirty(DirtyFlag.OVERLAY);
    });

    // ── Legacy viewport:change (still used by sync) ──
    this.eventBus.on('viewport:change', ({ scaleKey, min, max }) => {
      this.applyViewportChange(scaleKey, min, max);
    });
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

    if (isHoriz) this.userHasZoomed = true;

    scale.min = min;
    scale.max = max;

    if (isHoriz && !this.config.zoom?.y) {
      this.autoRangeVertical();
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
    // which already honors axis pins and nice() expansion). Falls back to
    // the raw data range if autoRange hasn't run yet for this axis.
    const natural = this.naturalExtent.get(scaleKey);
    if (natural) return { min: natural[0], max: natural[1] };

    if (this.store.length === 0) return null;
    if (isHoriz) {
      return { min: this.store.x[0], max: this.store.x[this.store.length - 1] };
    }
    const seriesIndices = this.config.series
      .filter((s) => (s.yAxisKey ?? 'y') === scaleKey && s.visible !== false)
      .map((s) => s.dataIndex - 1);
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
    const span = max - min;

    if (bMin !== undefined && bMax !== undefined) {
      const boundedSpan = bMax - bMin;
      if (span >= boundedSpan) {
        // User is trying to see more than the full range, clamp to it.
        return [bMin, bMax];
      }
    }
    if (bMin !== undefined && min < bMin) {
      min = bMin;
      max = min + span;
    }
    if (bMax !== undefined && max > bMax) {
      max = bMax;
      min = max - span;
    }
    // After shifting, the opposite edge may have crossed its bound.
    if (bMin !== undefined && min < bMin) min = bMin;
    if (bMax !== undefined && max > bMax) max = bMax;
    return [min, max];
  }

  // ─── Private: Render pipeline ───────────────────────────────

  /**
   * Main render method. Called by RenderScheduler via rAF.
   * Follows the exact pipeline from §2.3.
   */
  private render(flags: DirtyFlag): void {
    if (this.destroyed) return;

    this.updateLayout();
    this.updateScalePixelRanges();

    // Step 4a: Grid layer (axes, gridlines)
    if (flags & DirtyFlag.GRID) {
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
      }
    }

    // Step 4b: Data layer (series marks)
    if (flags & DirtyFlag.DATA) {
      if (this.pluginManager.dispatch('beforeDrawData', this, this.canvasManager.dataCtx)) {
        this.canvasManager.clear('data');
        this.renderAllSeries();
        this.pluginManager.dispatch('afterDrawData', this, this.canvasManager.dataCtx);
        this.emitEvent('drawData', this.canvasManager.dataCtx, this.layout);
      }
    }

    // Step 4c: Overlay layer (crosshair, tooltip)
    if (flags & DirtyFlag.OVERLAY) {
      if (this.pluginManager.dispatch('beforeDrawOverlay', this, this.canvasManager.overlayCtx)) {
        this.canvasManager.clear('overlay');
        this.renderOverlay();
        this.pluginManager.dispatch('afterDrawOverlay', this, this.canvasManager.overlayCtx);
        this.emitEvent('drawOverlay', this.canvasManager.overlayCtx, this.layout);
      }
    }
  }

  private renderAllSeries(): void {
    const ctx = this.canvasManager.dataCtx;
    const palette = this.theme.palette;

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

      const colIdx = series.dataIndex;
      if (colIdx < 1 || colIdx > this.store.seriesCount) return;

      const [startIdx, endIdx] = this.store.getViewportIndices(xScale.min, xScale.max);
      const xData = this.store.x;
      const yData = this.store.y(colIdx - 1);
      const type = series.type ?? 'line';

      const opacityMul = highlightActive && si !== highlightedSi ? dimOpacity : 1;

      switch (type) {
        case 'line':
          renderLine(ctx, xData, yData, startIdx, endIdx, xScale, yScale, this.layout, series, color, opacityMul);
          break;
        case 'area':
          renderArea(ctx, xData, yData, startIdx, endIdx, xScale, yScale, this.layout, series, color, opacityMul);
          break;
        case 'band': {
          const upperIdx = series.upperDataIndex;
          const lowerIdx = series.lowerDataIndex;
          if (upperIdx != null && lowerIdx != null) {
            const upperYData = this.store.y(upperIdx - 1);
            const lowerYData = this.store.y(lowerIdx - 1);
            renderBand(ctx, xData, yData, upperYData, lowerYData, startIdx, endIdx, xScale, yScale, this.layout, series, color, opacityMul);
          }
          break;
        }
        case 'scatter':
          renderScatter(ctx, xData, yData, startIdx, endIdx, xScale, yScale, this.layout, series, color, opacityMul);
          break;
        case 'bar':
          renderBars(ctx, xData, yData, startIdx, endIdx, xScale, yScale, this.layout, series, color, barIdxFor.get(si) ?? 0, barSeries.length, opacityMul);
          break;
        case 'histogram':
          renderHistogram(ctx, xData, yData, startIdx, endIdx, xScale, yScale, this.layout, series, color, opacityMul);
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
    const isDark = this.isThemeDark(bg);
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
        const edges = this.store.x;
        const colIdx = sc.dataIndex;
        const counts = colIdx >= 1 && colIdx <= this.store.seriesCount ? this.store.y(colIdx - 1) : null;
        const binIdx = point.dataIndex;
        if (counts && binIdx < edges.length - 1) {
          const x1 = xScale.dataToPixel(edges[binIdx]);
          const x2 = xScale.dataToPixel(edges[binIdx + 1]);
          const yTop = yScale.dataToPixel(counts[binIdx]);
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
          const outerPadding = 0.2;
          const innerPadding = 0.1;
          const widthRatio = sc.barWidthRatio ?? 0.8;
          let categoryWidth: number;
          if (this.store.length > 1) {
            const xRange = xScale.dataToPixel(this.store.x[this.store.length - 1]) - xScale.dataToPixel(this.store.x[0]);
            categoryWidth = xRange / (this.store.length - 1);
          } else { categoryWidth = this.layout.plot.width * 0.5; }
          const groupWidth = categoryWidth * (1 - outerPadding) * widthRatio;
          const barWidth = groupWidth / totalBars;
          const barGap = barWidth * innerPadding;
          const effectiveBarWidth = barWidth - barGap;
          const centerX = xScale.dataToPixel(this.store.x[idx]);
          const groupLeft = centerX - groupWidth / 2;
          const barLeft = groupLeft + barIdx * barWidth + barGap / 2;
          const barTop = yScale.dataToPixel(point.y);
          const baselineY = yScale.dataToPixel(0);
          const rectY = Math.min(barTop, baselineY);
          const rectH = Math.abs(barTop - baselineY);
          ctx.fillStyle = `rgba(255, 255, 255, ${ringAlpha})`;
          ctx.fillRect(barLeft, rectY, effectiveBarWidth, rectH);
          ctx.strokeStyle = `rgba(255, 255, 255, ${ringAlpha * 2})`;
          ctx.lineWidth = 1;
          ctx.strokeRect(barLeft, rectY, effectiveBarWidth, rectH);
        }
        continue;
      }

      // Scatter (non-heatmap) and line/area, unified dot style
      if (sc.type === 'scatter' && sc.heatmap) continue;

      const px = xScale.dataToPixel(point.x);
      const py = yScale.dataToPixel(point.y);
      const r = sc.type === 'scatter' ? (sc.pointRadius ?? 3) : 4;

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

  /** Quick luminance check, is the background dark? */
  private isThemeDark(bg: string): boolean {
    // Parse hex
    if (bg.startsWith('#')) {
      const r = parseInt(bg.slice(1, 3), 16);
      const g = parseInt(bg.slice(3, 5), 16);
      const b = parseInt(bg.slice(5, 7), 16);
      return (r * 0.299 + g * 0.587 + b * 0.114) < 128;
    }
    // Parse rgb/rgba
    const m = bg.match(/\d+/g);
    if (m && m.length >= 3) {
      return (Number(m[0]) * 0.299 + Number(m[1]) * 0.587 + Number(m[2]) * 0.114) < 128;
    }
    return true; // default to dark
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
      this.tooltipPoints = this.hitTester.findPoints(
        this.store,
        this.scales,
        this.config.series,
        this.cursorX,
        this.cursorY,
        this.config.tooltip?.mode ?? 'index',
        this.theme.palette,
        this.lastPointerType,
      );
    }
  }

  /**
   * Hit-test histogram bins: find which bin the cursor X falls into
   * and return a tooltip point showing the bin range and count.
   */
  private findHistogramTooltipPoints(): TooltipPoint[] {
    const points: TooltipPoint[] = [];
    const xScale = this.scales.get('x');
    if (!xScale || this.cursorX === null || this.store.length < 2) return points;

    const dataX = xScale.pixelToData(this.cursorX);
    const edges = this.store.x; // X column = bin edges

    for (let si = 0; si < this.config.series.length; si++) {
      const series = this.config.series[si];
      if (series.visible === false || series.type !== 'histogram') continue;

      const colIdx = series.dataIndex;
      if (colIdx < 1 || colIdx > this.store.seriesCount) continue;

      const counts = this.store.y(colIdx - 1);
      const color = series.stroke ?? this.theme.palette[si % this.theme.palette.length];

      // Find which bin the cursor X falls into. Edges are sorted, so
      // `upperBound` gives the largest b with edges[b] <= dataX in O(log n).
      // Reject dataX at or past the final edge (bin is [edges[b], edges[b+1])).
      const b = upperBound(edges, dataX);
      if (b < 0 || b >= edges.length - 1) continue;

      const binMin = edges[b];
      const binMax = edges[b + 1];
      const count = counts[b];

      points.push({
        seriesIndex: si,
        dataIndex: b,
        label: series.label,
        x: (binMin + binMax) / 2,
        y: count,
        color,
        formattedX: `${binMin.toFixed(1)} \u2013 ${binMax.toFixed(1)}`,
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
    const xScale = this.scales.get('x');
    if (!xScale || this.cursorX === null || this.store.length === 0) return points;

    const dataX = xScale.pixelToData(this.cursorX);

    // Find nearest category index
    const idx = nearestIndex(this.store.x, dataX);
    const xVal = this.store.x[idx];

    // Check proximity: cursor must be within half a category width
    const categoryWidth = this.store.length > 1
      ? (this.store.x[this.store.length - 1] - this.store.x[0]) / (this.store.length - 1)
      : 1;
    if (Math.abs(dataX - xVal) > categoryWidth * 0.6) return points;

    for (let si = 0; si < this.config.series.length; si++) {
      const series = this.config.series[si];
      if (series.visible === false || series.type !== 'bar') continue;

      const colIdx = series.dataIndex;
      if (colIdx < 1 || colIdx > this.store.seriesCount) continue;

      const yVal = this.store.y(colIdx - 1)[idx];
      if (yVal !== yVal) continue; // NaN

      const color = series.stroke ?? this.theme.palette[si % this.theme.palette.length];
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
        idx = length - 1;
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

    const xVal = this.store.x[idx];
    const xScale = this.scales.get('x');

    target.dataIndex = idx;
    target.dataX = xVal;
    target.formattedX = xScale ? xScale.tickFormat(xVal) : String(xVal);
    target.source = source;

    const palette = this.theme.palette;
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

      const colIdx = s.dataIndex;
      if (colIdx < 1 || colIdx > this.store.seriesCount) continue;

      const yArr = this.store.y(colIdx - 1);
      const value = yArr ? yArr[idx] : NaN;
      const yScale = this.scales.get(s.yAxisKey ?? 'y');
      const formattedValue = (value === value)
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
