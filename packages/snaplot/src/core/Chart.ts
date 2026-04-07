import type {
  ChartInstance,
  ChartConfig,
  ChartEventMap,
  ColumnarData,
  DeepPartial,
  Layout,
  Scale,
  ScaleRange,
  ThemeConfig,
  TooltipPoint,
  SeriesConfig,
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
import { renderLine, renderArea } from '../renderers/LineRenderer';
import { renderScatter } from '../renderers/ScatterRenderer';
import { renderBars } from '../renderers/BarRenderer';
import { calculateBins, renderHistogram } from '../renderers/HistogramRenderer';
import { renderCrosshair, renderSelectionBox } from '../renderers/InteractionRenderer';

import { GestureManager } from '../interaction/GestureManager';
import { HitTester } from '../interaction/HitTester';
import { TooltipManager } from '../interaction/TooltipManager';

import { PluginManager } from '../plugins/PluginManager';

import { nearestIndex } from '../data/binarySearch';

/**
 * Chart — the composition root.
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
  /** Raw mouse position in CSS pixels (not snapped) — used for tooltip placement */
  private mouseX: number | null = null;
  private mouseY: number | null = null;
  /** Active selection box (shift+drag) */
  private selectionBox: { x1: number; y1: number; x2: number; y2: number } | null = null;
  /** True when the user has actively zoomed — suppresses auto-range X on data updates */
  private userHasZoomed = false;
  /** Cached histogram bins per series index (computed on data change) */
  private histogramBinsCache = new Map<number, import('../renderers/HistogramRenderer').HistogramBins>();

  // Event listeners
  private listeners = new Map<string, Set<Function>>();

  // Cleanup
  private destroyed = false;
  private syncKey: string | null = null;

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
    this.hitTester = new HitTester();
    this.tooltipManager = new TooltipManager(this.theme);

    this.gestureManager = new GestureManager(
      this.canvasManager.dataCanvas,
      this.eventBus,
      () => this.config.interaction ?? 'timeseries',
      () => this.layout,
      () => this.config.zoom ?? { enabled: true, x: true },
      () => this.config.pan ?? { enabled: true, x: true },
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

    // 12. Join sync group if configured
    if (this.config.cursor?.syncKey) {
      this.syncKey = this.config.cursor.syncKey;
      SyncGroup.join(this.syncKey, this);
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

    this.scheduler.markDirty(DirtyFlag.DATA | DirtyFlag.GRID);
    this.emitEvent('viewport:change', key, { min: scale.min, max: scale.max });
  }

  getAxis(key: string): Scale | undefined {
    return this.scales.get(key);
  }

  setOptions(partial: DeepPartial<ChartConfig>): void {
    this.config = deepMerge(
      this.config as unknown as Record<string, unknown>,
      partial as unknown as Record<string, unknown>,
    ) as unknown as ChartConfig;

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
  }

  use(plugin: any): void {
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
   * Called on data change (setData, appendData, init) — NOT on zoom.
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
      if (ac.min !== undefined && ac.max !== undefined) continue;

      const xMin = this.store.x[0];
      const xMax = this.store.x[this.store.length - 1];
      const hasBarSeries = this.config.series.some(
        s => s.visible !== false && (s.type === 'bar' || s.type === 'histogram'),
      );

      if (xMin === xMax) {
        scale.min = xMin - 1;
        scale.max = xMax + 1;
      } else if (hasBarSeries && this.store.length > 1) {
        // Bar/histogram: pad by half a category width so edge bars aren't clipped
        const categoryPad = (xMax - xMin) / (this.store.length - 1) * 0.5;
        scale.min = xMin - categoryPad;
        scale.max = xMax + categoryPad;
      } else {
        scale.min = xMin;
        scale.max = xMax;
      }

      // nice() gives clean tick boundaries for scatter/line.
      // Skip for time (data extent is natural) and bar (category padding is exact).
      if (scale.type !== 'time' && !hasBarSeries) {
        scale.nice(DEFAULT_TICK_COUNT);
      }
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
      if (ac.min !== undefined && ac.max !== undefined) continue;
      if (ac.auto === false) continue;

      // Find series bound to this axis
      const seriesIndices = this.config.series
        .filter(s => (s.yAxisKey ?? 'y') === key && s.visible !== false)
        .map(s => s.dataIndex - 1);

      if (seriesIndices.length === 0) continue;

      // Get viewport indices for visible X range
      const xScale = this.scales.get('x');
      let startIdx = 0;
      let endIdx = this.store.length - 1;
      if (xScale) {
        [startIdx, endIdx] = this.store.getViewportIndices(xScale.min, xScale.max);
      }

      const [yMin, yMax] = this.store.yRange(seriesIndices, startIdx, endIdx);
      const pad = (yMax - yMin) * AUTO_RANGE_PADDING;

      if (ac.min === undefined) scale.min = yMin - pad;
      if (ac.max === undefined) scale.max = yMax + pad;

      scale.nice(DEFAULT_TICK_COUNT);
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
        // Drag started on a specific axis — only pan that axis
        const scale = this.scales.get(axis);
        if (scale) {
          const pos = inferPosition(axis, axisConfigs[axis]?.position);
          const isHoriz = pos === 'bottom' || pos === 'top';
          const delta = isHoriz ? dx : dy;
          const dataD = scale.pixelToData(0) - scale.pixelToData(delta);
          this.applyViewportChange(axis, scale.min + dataD, scale.max + dataD);
        }
      } else {
        // Drag in plot area — pan all enabled axes
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

  /** Apply a viewport change — shared by pan, zoom, box-end, and sync */
  private applyViewportChange(scaleKey: string, min: number, max: number): void {
    const scale = this.scales.get(scaleKey);
    if (!scale) return;

    const ac = this.config.axes?.[scaleKey];
    const pos = inferPosition(scaleKey, ac?.position);
    const isHoriz = pos === 'bottom' || pos === 'top';

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

    // Count bar-type series for grouped width calculation
    const barSeries = this.config.series.filter(
      s => s.visible !== false && (s.type === 'bar'),
    );
    let barIdx = 0;

    for (let si = 0; si < this.config.series.length; si++) {
      const series = this.config.series[si];
      if (series.visible === false) continue;

      const color = series.stroke ?? palette[si % palette.length];
      const xScale = this.scales.get(series.xAxisKey ?? 'x')!;
      const yScale = this.scales.get(series.yAxisKey ?? 'y')!;
      if (!xScale || !yScale) continue;

      const colIdx = series.dataIndex;
      if (colIdx < 1 || colIdx > this.store.seriesCount) continue;

      // Viewport culling via binary search
      const [startIdx, endIdx] = this.store.getViewportIndices(xScale.min, xScale.max);

      const xData = this.store.x;
      const yData = this.store.y(colIdx - 1);

      const type = series.type ?? 'line';

      switch (type) {
        case 'line':
          renderLine(ctx, xData, yData, startIdx, endIdx, xScale, yScale, this.layout, series, color);
          break;

        case 'area':
          renderArea(ctx, xData, yData, startIdx, endIdx, xScale, yScale, this.layout, series, color);
          break;

        case 'scatter':
          renderScatter(ctx, xData, yData, startIdx, endIdx, xScale, yScale, this.layout, series, color);
          break;

        case 'bar':
          renderBars(ctx, xData, yData, startIdx, endIdx, xScale, yScale, this.layout, series, color, barIdx, barSeries.length);
          barIdx++;
          break;

        case 'histogram': {
          // Bins and scales already computed in computeCustomXTicks() before axes render
          const bins = this.histogramBinsCache.get(si) ?? calculateBins(yData, series.binMethod, series.binCount);
          this.histogramBinsCache.set(si, bins);

          if (bins.edges.length > 0) {
            renderHistogram(ctx, bins, xScale, yScale, this.layout, series, color);
          }
          break;
        }
      }
    }
  }

  private renderOverlay(): void {
    const ctx = this.canvasManager.overlayCtx;
    const cursorEnabled = this.config.cursor?.show !== false;
    const isSelecting = this.selectionBox !== null;

    // During active selection, hide crosshair/tooltip/dots — only show the selection box
    if (!isSelecting && cursorEnabled && this.cursorX !== null && this.cursorY !== null) {
      // Draw crosshair — skip for scatter-only charts
      const isScatterOnly = this.config.series.every(
        s => s.visible === false || s.type === 'scatter',
      );
      if (!isScatterOnly) {
        renderCrosshair(
          ctx,
          this.cursorX,
          this.cursorY,
          this.layout,
          this.config.cursor ?? { show: true },
          this.theme.crosshairColor,
        );
      }

      // Draw data point indicators
      this.drawPointIndicators(ctx);
    }

    // Show tooltip — hide during selection or when cursor is disabled
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
  }

  private drawPointIndicators(ctx: CanvasRenderingContext2D): void {
    // Clip all indicators to the plot area
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.layout.plot.left, this.layout.plot.top, this.layout.plot.width, this.layout.plot.height);
    ctx.clip();

    // Determine ring color based on theme luminance (white ring on dark, dark ring on light)
    const bg = this.theme.backgroundColor;
    const isDark = this.isThemeDark(bg);
    const ringColor = isDark ? '#ffffff' : '#333333';
    const ringAlpha = isDark ? 0.15 : 0.1;

    for (const point of this.tooltipPoints) {
      const sc = this.config.series[point.seriesIndex];
      if (!sc) continue;

      const xScale = this.scales.get(sc.xAxisKey ?? 'x');
      const yScale = this.scales.get(sc.yAxisKey ?? 'y');
      if (!xScale || !yScale) continue;

      if (sc.type === 'histogram') {
        const bins = this.histogramBinsCache.get(point.seriesIndex);
        if (bins && point.dataIndex < bins.counts.length) {
          const binIdx = point.dataIndex;
          const x1 = xScale.dataToPixel(bins.edges[binIdx]);
          const x2 = xScale.dataToPixel(bins.edges[binIdx + 1]);
          const yTop = yScale.dataToPixel(bins.counts[binIdx]);
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

      // Scatter (non-heatmap) and line/area — unified dot style
      if (sc.type === 'scatter' && sc.heatmap) continue;

      const px = xScale.dataToPixel(point.x);
      const py = yScale.dataToPixel(point.y);
      const r = sc.type === 'scatter' ? (sc.pointRadius ?? 3) : 4;

      // Filled center
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = point.color;
      ctx.fill();

      // Ring directly around the dot (no gap)
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.restore();
  }

  /** Quick luminance check — is the background dark? */
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
    if (!xScale || this.cursorX === null) return points;

    const dataX = xScale.pixelToData(this.cursorX);

    for (let si = 0; si < this.config.series.length; si++) {
      const series = this.config.series[si];
      if (series.visible === false || series.type !== 'histogram') continue;

      const bins = this.histogramBinsCache.get(si);
      if (!bins || bins.edges.length === 0) continue;

      const color = series.stroke ?? this.theme.palette[si % this.theme.palette.length];

      // Find which bin the cursor X falls into
      for (let b = 0; b < bins.counts.length; b++) {
        if (dataX >= bins.edges[b] && dataX < bins.edges[b + 1]) {
          const binMin = bins.edges[b];
          const binMax = bins.edges[b + 1];
          const count = bins.counts[b];

          points.push({
            seriesIndex: si,
            dataIndex: b,
            label: series.label,
            x: (binMin + binMax) / 2, // bin center
            y: count,
            color,
            formattedX: `${binMin.toFixed(1)} – ${binMax.toFixed(1)}`,
            formattedY: String(count),
          });
          break;
        }
      }
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

    // Histogram: use bin edges
    const histSeries = visibleSeries.find(s => s.type === 'histogram');
    if (histSeries) {
      const si = this.config.series.indexOf(histSeries);
      // Compute bins now (before data render) so we have edges for axis labels
      const colIdx = histSeries.dataIndex;
      if (colIdx >= 1 && colIdx <= this.store.seriesCount) {
        const yData = this.store.y(colIdx - 1);
        const bins = calculateBins(yData, histSeries.binMethod, histSeries.binCount);
        this.histogramBinsCache.set(si, bins);

        if (bins.edges.length > 0) {
          // Set histogram scales so axis renders at correct range
          const xScale = this.scales.get(histSeries.xAxisKey ?? 'x');
          const yScale = this.scales.get(histSeries.yAxisKey ?? 'y');
          if (xScale && yScale) {
            xScale.min = bins.edges[0];
            xScale.max = bins.edges[bins.edges.length - 1];
            yScale.min = 0;
            yScale.max = bins.maxCount * 1.1;
            yScale.nice();
            this.updateScalePixelRanges();
          }

          // Thin edges evenly if too many to fit as labels.
          // No special-casing of first/last — even spacing looks cleanest.
          let edgeValues = Array.from(bins.edges);
          const plotWidth = this.layout.plot.width;
          const maxLabels = Math.max(2, Math.floor(plotWidth / 65));
          if (edgeValues.length > maxLabels) {
            const step = Math.ceil(edgeValues.length / maxLabels);
            edgeValues = edgeValues.filter((_, i) => i % step === 0);
          }

          return {
            values: edgeValues,
            format: (v) => Number.isInteger(v) ? String(v) : v.toFixed(1),
          };
        }
      }
    }

    // Bar chart: tick at each category X value
    const barSeries = visibleSeries.find(s => s.type === 'bar');
    if (barSeries && this.store.length > 0) {
      const values = Array.from(this.store.x);
      return {
        values,
        format: (v) => Number.isInteger(v) ? String(v) : v.toFixed(1),
      };
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
    if (handlers) {
      for (const handler of handlers) {
        (handler as Function)(...args);
      }
    }
  }
}
