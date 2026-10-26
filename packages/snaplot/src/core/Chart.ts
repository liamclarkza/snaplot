import type {
  ChartSpec,
  ChartEventMap,
  ChartStats,
  AppendDataOptions,
  AxisSpec,
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
  ZoomBoundsSpec,
} from '../engine/spec';
import { DirtyFlag } from '../engine/spec';

import { CanvasManager } from './CanvasManager';
import { RenderScheduler } from './RenderScheduler';
import { EventBus } from './EventBus';
import { computeLayout, inferPosition } from './Layout';

import type { ColumnarSegment, DataStore } from '../data/DataStore';
import { validateMaxLen } from '../data/DataStore';
import { ColumnarStore } from '../data/ColumnarStore';
import { ColumnRangeIndex, ScatterColumnRangeIndex } from '../data/columnRangeIndex';
import { RingColumnarStore } from '../data/RingColumnarStore';
import { createScale } from '../scales/createScale';
import { niceStep } from '../scales/niceNumbers';
import {
  AUTO_RANGE_PADDING,
  BRUSH_EDGE_GRAB_PX,
  DEFAULT_INTERACTION_SAMPLING,
  DEFAULT_TICK_COUNT,
  INTERACTION_REFINE_MS,
  MIN_TOUCH_INTERACTION_SAMPLING,
  MIN_DRAG_DISTANCE,
  TOUCH_INTERACTION_POINTS_PER_PIXEL,
} from '../constants';

import { formatValue, scaleStepDecimals } from '../engine/format';
import { deepMerge } from '../config/merge';
import { DEFAULT_CONFIG } from '../config/defaults';
import { applyThemeToElement, resolveTheme } from '../config/theme';

import {
  type AxesRenderResult,
  renderAxes,
  thinTicks,
  updateDOMLabels,
} from '../renderers/AxesRenderer';
import {
  renderLineSegments,
  renderAreaSegments,
  renderBandSegments,
  type LineRenderSegment,
} from '../renderers/LineRenderer';
import { m4 } from '../data/downsampling/m4';
import {
  isDensityScatterSeries,
  renderScatterSegments,
  ScatterSeriesCache,
} from '../renderers/ScatterRenderer';
import {
  buildScatterEncodingState,
  normalizeScatterColorBy,
  normalizeScatterSizeBy,
  resolverFromEncodingState,
  type ScatterStyleResolver,
  seriesYColumn,
  scatterXColumn,
  type ScatterPalettes,
} from '../renderers/scatterEncoding';
import { renderBarsSegments } from '../renderers/BarRenderer';
import { barRectForCategory, categoryWidthFromData } from '../renderers/barGeometry';
import { renderHistogramSegments } from '../renderers/HistogramRenderer';
import {
  renderBrushSelection,
  renderCrosshair,
  renderSelectionBox,
  renderTapRing,
} from '../renderers/InteractionRenderer';

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

type CustomXTicks = {
  values: number[];
  gridValues?: number[];
  format?: (value: number) => string;
};

type BarXAxisPlan = {
  values: number[];
  gridValues: number[];
  domainMin: number;
  domainMax: number;
};

function tickFormatId(fn: ((value: number) => string) | undefined): number {
  if (!fn) return 0;
  let id = tickFormatIds.get(fn);
  if (id === undefined) {
    id = nextTickFormatId++;
    tickFormatIds.set(fn, id);
  }
  return id;
}

// ─── Debug counters (plan D31) ──────────────────────────────
// Tests and the bench read these through `chart[Symbol.for('snaplot.debug')]`
// on the public handle; they are not part of any public type. Instrumentation
// only: a data pass records O(series) facts, and point counts are computed
// when a snapshot is read, never on the render path.

/** One visible series in the most recent data-layer pass. */
interface DataPassSeries {
  type: NonNullable<SeriesSpec['type']>;
  xData: Float64Array;
  yData: Float64Array;
  /** Physical index runs handed to the mark, before any sampling. */
  runs: readonly ColumnarSegment[];
  /** The M4-decimated runs a line or area stroked, when decimation ran. */
  decimated?: readonly LineRenderSegment[];
  /** Scatter interaction-sampling stride (1 draws every point). */
  stride: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

/** An axis label as last laid out: its text and anchor point in CSS pixels. */
export interface DebugLabelBox {
  axis: string;
  kind: 'tick' | 'title';
  text: string;
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
}

/** A point-in-time read of the debug counters. Read it again after acting. */
export interface DebugSnapshot {
  /** Full data ingests: the initial sources and every `replaceSources`. Appends do not count. */
  readonly ingestCount: number;
  /** Per-layer paint counts (a vetoed paint does not count). */
  readonly renderCount: { grid: number; data: number; overlay: number };
  /** The three canvas layers, for pixel hashing. */
  readonly layers: {
    grid: HTMLCanvasElement;
    data: HTMLCanvasElement;
    overlay: HTMLCanvasElement;
  };
  /** Points the last data pass drew inside the viewport, after M4 decimation or scatter sampling. */
  readonly drawnPoints: number;
  /** Points inside the viewport in the last data pass (X range; X and Y for scatter). */
  readonly inViewPoints: number;
  /** Times a ring store rebuilt its logical columns (`RingColumnarStore.materialize` cache misses). */
  readonly materializeCount: number;
  /** Axis labels from the last grid paint, in paint order. */
  labelBoxes(): DebugLabelBox[];
}

function countDataPass(pass: readonly DataPassSeries[]): { drawn: number; inView: number } {
  let drawn = 0;
  let inView = 0;
  for (const series of pass) {
    const scatter = series.type === 'scatter';
    const visible = (x: number, y: number) =>
      x >= series.xMin &&
      x <= series.xMax &&
      Number.isFinite(y) &&
      (!scatter || (y >= series.yMin && y <= series.yMax));
    let seriesInView = 0;
    for (const run of series.runs) {
      for (let i = run.physicalStart; i <= run.physicalEnd; i++) {
        if (visible(series.xData[i], series.yData[i])) seriesInView++;
      }
    }
    inView += seriesInView;
    if (series.decimated) {
      for (const run of series.decimated) {
        for (let i = run.startIdx; i <= run.endIdx; i++) {
          if (visible(run.xData[i], run.yData[i])) drawn++;
        }
      }
    } else if (series.stride > 1) {
      // Mirrors renderScatterSegments: the (fractional) stride restarts at every run.
      for (const run of series.runs) {
        const start = run.physicalStart;
        for (
          let k = 0, i = start;
          i <= run.physicalEnd;
          i = start + Math.floor(++k * series.stride)
        ) {
          if (visible(series.xData[i], series.yData[i])) drawn++;
        }
      }
    } else {
      drawn += seriesInView;
    }
  }
  return { drawn, inView };
}

function debugLabelBoxes(labels: AxesRenderResult['labels'] | null): DebugLabelBox[] {
  const boxes: DebugLabelBox[] = [];
  for (const [axis, list] of labels ?? []) {
    for (const label of list) {
      boxes.push({
        axis,
        kind: label.kind ?? 'tick',
        text: label.text,
        x: label.x,
        y: label.y,
        anchor: label.anchor,
      });
    }
  }
  return boxes;
}

/**
 * Chart, the composition root.
 *
 * Wires together: CanvasManager, RenderScheduler, EventBus, ColumnarStore,
 * Scales, Layout, Renderers, Interaction handlers, Plugins.
 *
 * Render pipeline follows the exact order from §2.3 of the plan.
 */
export interface InteractionGuards {
  viewport?: (axisKey: string, range: ScaleRange) => boolean;
  selection?: (range: SelectionRange | null) => boolean;
}

export class ChartCore implements EngineHost {
  private interactionGuards: InteractionGuards = {};
  private coordinatingAxis = false;

  setInteractionGuards(guards: InteractionGuards): void {
    this.interactionGuards = guards;
  }

  // Public
  readonly container: HTMLElement;

  // Internal modules
  private canvasManager: CanvasManager;
  private scheduler: RenderScheduler;
  private eventBus: EventBus;
  private sourceStores: DataStore[] = [];
  private seriesSources: readonly number[] = [];
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
  private columnRangeIndexes = new Map<string, ColumnRangeIndex>();
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
      series: SeriesSpec;
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
  private config: ChartSpec;

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
  private pendingTouchCursor: { x: number; y: number; pointerType: 'touch' | 'pen' } | null = null;
  private touchCursorFrame: number | null = null;
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
  private selectionBox: { x1: number; y1: number; x2: number; y2: number } | null = null;
  /** Persistent brush selection in data space (selection.mode: 'brush'). */
  private selection: SelectionRange | null = null;
  /** Selection value at the last emitted selection:change, to skip no-op emits. */
  private lastEmittedSelection: SelectionRange | null = null;
  /** In-progress brush drag interaction. */
  private brushDrag: {
    mode: 'create' | 'move' | 'resize-min' | 'resize-max';
    anchorDataX: number;
    orig: ScaleRange;
  } | null = null;
  /** Transient tap-feedback ring, cleared automatically once its lifetime expires. */
  private tapFeedback: { x: number; y: number; startTime: number } | null = null;
  /**
   * Axis keys the user has actively zoomed. Suppresses auto-range on those
   * axes during data updates so a zoomed Y (or X) doesn't snap back on the
   * next data replacement or append. Cleared by resetZoom().
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
  // D31 debug counters; see DebugSnapshot. Ring stores share this object.
  private debugCounters = { ingestCount: 0, materializeCount: 0 };
  private lastDataPass: DataPassSeries[] = [];
  private lastAxisLabels: AxesRenderResult['labels'] | null = null;

  // Readout precision per axis (plan P9), recomputed when the domain or the
  // tick settings change; read on the cursor hot path.
  private readoutSteps = new Map<
    string,
    { scale: Scale; min: number; max: number; ticks?: number[]; count?: number; decimals: number }
  >();
  private readonly readoutY = (value: number, seriesIndex: number): string =>
    this.formatReadout(this.config.series[seriesIndex]?.yAxis ?? 'y', value);

  /**
   * Per-axis "reset-zoom" extent, the scale's min/max after the last
   * `autoRange*` pass (including axis-config pins and any explicit
   * `nice: true` expansion). Used by `zoom.bounds: 'data'` so zoom-out stops
   * at the same range `resetZoom()` would produce.
   */
  private naturalExtent = new Map<string, [number, number]>();
  private barXAxisPlans = new Map<string, BarXAxisPlan>();

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
      if (!reallocated && !this.layoutIsStale()) return;
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
      () => this.config.mode ?? 'timeseries',
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
    this.updateLayout();
    this.updateScalePixelRanges();
    this.scheduler.markDirty(DirtyFlag.ALL);
    if (!deferFirstPaint) this.scheduler.flush();
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
    this.invalidateRangeCache();
    this.unpinMissedAxes(resolved);
    this.stats.dataVersion++;
    this.stats.setDataCount++;
    this.debugCounters.ingestCount++;
    this.replaceOptions(config);
    this.reconcileSelectionForDataChange();
    this.refreshCursor();
    this.dispatchDataUpdate();
  }

  /**
   * Replaced data that does not reach a pinned horizontal range unpins that axis (plan D23,
   * dataapi-14): a viewport kept from the old data would show nothing.
   */
  private unpinMissedAxes(config: ChartSpec): void {
    let unpinned = false;
    for (const key of [...this.userZoomedAxes]) {
      const scale = this.scales.get(key);
      const position = inferPosition(key, config.axes?.[key]?.position);
      if (!scale || (position !== 'bottom' && position !== 'top')) continue;
      let min = Infinity;
      let max = -Infinity;
      config.series.forEach((series, si) => {
        const store = this.sourceStores[this.seriesSources[si] ?? 0];
        if ((series.xAxis ?? 'x') !== key || !store?.length) return;
        min = Math.min(min, store.xAt(0));
        max = Math.max(max, store.xAt(store.length - 1));
      });
      if (min === Infinity || max < scale.min || min > scale.max) {
        this.userZoomedAxes.delete(key);
        unpinned = true;
      }
    }
    if (unpinned && ![...this.userZoomedAxes].some((key) => this.isHorizontalAxis(key)))
      this.setFollowing(true);
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

  private storeForSeries(seriesIndex: number): DataStore {
    return this.sourceStores[this.seriesSources[seriesIndex] ?? 0] ?? this.sourceStores[0];
  }

  private hasData(): boolean {
    return this.sourceStores.some((store) => store.length > 0);
  }

  private sourceExtent(axisKey?: string): [number, number] | null {
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

    this.stats.dataVersion++;
    this.stats.appendDataCount++;
    const gridDirty = this.rangeForDataChange();
    this.reconcileSelectionForDataChange();
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
    if (this.following && this.followWindow() !== undefined && this.hasData()) {
      return this.applyFollowWindow();
    }
    return this.autoRangeTracked();
  }

  private followWindow(): number | undefined {
    const follow = (this.config.streaming as StreamingSpec | undefined)?.followWindow;
    if (follow === undefined) return undefined;
    // A non-positive window is meaningless; treat it as "no window" so the
    // chart follows the full extent rather than collapsing to a zero span.
    return follow > 0 ? follow : undefined;
  }

  /**
   * Pin every horizontal axis to `[latestX - window, latestX]` (clamped to
   * the data) and re-fit Y over that window. Returns whether any scale bound
   * moved (X or the follow-driven Y auto-range), so the caller knows if the
   * grid must repaint.
   *
   * This does not publish to zoom sync: a follow scroll is a local,
   * data-driven motion, and syncing it would fight peers that have their own
   * data or a paused viewport. Manual pan/zoom (applyViewportChange) and the
   * explicit resume actions (resetZoom/scrollToLatest) are what sync.
   */
  private applyFollowWindow(): boolean {
    const window = this.followWindow();
    if (window === undefined || !this.hasData()) return false;
    const before = this.scaleSignature();
    const axisConfigs = this.config.axes ?? {};
    const proposals: Array<{ key: string; scale: Scale; min: number; max: number }> = [];
    for (const [key, scale] of this.scales) {
      const pos = inferPosition(key, axisConfigs[key]?.position);
      if (pos !== 'bottom' && pos !== 'top') continue;
      const extent = this.sourceExtent(key);
      if (!extent) continue;
      // The window has its full width from the first sample (dxtrial-19).
      const lastX = extent[1];
      const min = lastX - window;
      const max = lastX;
      if (this.interactionGuards.viewport?.(key, { min, max }) === false) return false;
      proposals.push({ key, scale, min, max });
    }
    for (const { key, scale, min, max } of proposals) {
      scale.min = min;
      scale.max = max;
      this.naturalExtent.set(key, [min, max]);
    }
    if (!this.config.zoom?.y) this.autoRangeVertical(true);
    return this.scaleSignature() !== before;
  }

  /** Join every scale's key and bounds; used to detect any domain change. */
  private scaleSignature(): string {
    let sig = '';
    for (const [key, scale] of this.scales) sig += key + ':' + scale.min + ':' + scale.max + '|';
    return sig;
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

    const before = this.scaleSignature();
    this.autoRange();
    return this.scaleSignature() !== before;
  }

  setAxis(key: string, range: Partial<ScaleRange>): void {
    if (this.destroyed) return;
    const scale = this.scales.get(key);
    if (!scale) return;

    const proposed = { min: range.min ?? scale.min, max: range.max ?? scale.max };
    if (this.interactionGuards.viewport?.(key, proposed) === false) return;
    if (range.min !== undefined) scale.min = range.min;
    if (range.max !== undefined) scale.max = range.max;

    // A peer-applied viewport must survive the next data update the same way a
    // local zoom does. Without marking the axis user-zoomed, this receiving
    // chart's next data replacement or append would auto-range back to the full extent
    // and snap out of sync with the chart that drove the zoom.
    if (!this.coordinatingAxis) this.userZoomedAxes.add(key);

    // When X axis changes (e.g. from a zoom sync peer), re-fit Y axis
    // to the new visible X range, otherwise the band/data may clip.
    const ac = this.config.axes?.[key];
    const pos = inferPosition(key, ac?.position);
    const isHoriz = pos === 'bottom' || pos === 'top';
    // A received horizontal viewport means a peer took manual control; pause
    // live-follow so this chart pins to the synced window instead of scrolling
    // its own follow window back over the driver on the next data tick.
    if (isHoriz && !this.coordinatingAxis) this.setFollowing(false);
    if (isHoriz && !this.config.zoom?.y) {
      this.autoRangeVertical(true);
    }

    // Group peers relay a gesture in flight on another chart, so they get
    // the same interaction-pass sampling the originating chart does.
    this.markViewportActive();

    this.scheduler.markDirty(DirtyFlag.DATA | DirtyFlag.GRID | DirtyFlag.OVERLAY);
    this.emitEvent('viewport:change', key, { min: scale.min, max: scale.max });
  }

  getNaturalRange(key: string): ScaleRange | undefined {
    const range = this.naturalExtent.get(key);
    return range ? { min: range[0], max: range[1] } : undefined;
  }

  setCoordinatedAxis(key: string, range: ScaleRange): void {
    this.coordinatingAxis = true;
    try {
      this.setAxis(key, range);
    } finally {
      this.coordinatingAxis = false;
    }
  }

  getAxis(key: string): Scale | undefined {
    return this.scales.get(key);
  }

  /** Whether an axis is drawn along the bottom or top edge. */
  isHorizontalAxis(key: string): boolean {
    const position = inferPosition(key, this.config.axes?.[key]?.position);
    return position === 'bottom' || position === 'top';
  }

  /** The pinned axes and their ranges: the viewport state (plan D3). */
  pinnedAxes(): Record<string, ScaleRange> {
    const pinned: Record<string, ScaleRange> = {};
    for (const key of this.userZoomedAxes) {
      const scale = this.scales.get(key);
      if (scale) pinned[key] = { min: scale.min, max: scale.max };
    }
    return pinned;
  }

  /**
   * Pin exactly the axes `viewport` names, at its ranges, and return every other axis to its
   * automatic range (plan D3: a viewport names only the axes it pins, and `{}` pins none).
   * Pinning a horizontal axis pauses following; a viewport without one follows again.
   */
  applyViewport(viewport: Readonly<Record<string, ScaleRange>>): void {
    if (this.destroyed) return;
    const previous = new Map(
      [...this.scales].map(([key, scale]) => [key, [scale.min, scale.max] as const]),
    );
    const keys = Object.keys(viewport).filter((key) => this.scales.has(key));
    this.userZoomedAxes = new Set(keys);
    for (const key of keys) {
      const scale = this.scales.get(key)!;
      scale.min = viewport[key].min;
      scale.max = viewport[key].max;
    }
    const horizontal = keys.some((key) => this.isHorizontalAxis(key));
    this.setFollowing(!horizontal);
    this.autoRangeHorizontal();
    if (!horizontal) this.applyFollowWindow();
    this.autoRangeVertical(horizontal);
    this.refreshCursor();
    this.scheduler.markDirty(DirtyFlag.ALL);
    this.publishResetViewport(previous);
  }

  setOptions(partial: DeepPartial<ChartSpec>): void {
    if (this.destroyed) return;
    // Plugins are object instances, deep-merge would corrupt them.
    // Handle plugin updates separately: destroy old, install new.
    const newPlugins = (partial as Partial<ChartSpec>).plugins;
    if (newPlugins) {
      this.pluginManager.destroyAll(this);
      // Remove plugins from the merge input to avoid deep-merging instances
      const { plugins: _, ...rest } = partial as Partial<ChartSpec>;
      this.config = deepMerge(
        this.config as unknown as Record<string, unknown>,
        rest as unknown as Record<string, unknown>,
      ) as unknown as ChartSpec;
      this.config.plugins = newPlugins;
      for (const plugin of newPlugins) {
        this.pluginManager.register(plugin);
      }
      this.pluginManager.installAll(this);
    } else {
      this.config = deepMerge(
        this.config as unknown as Record<string, unknown>,
        partial as unknown as Record<string, unknown>,
      ) as unknown as ChartSpec;
    }

    this.applyConfigSideEffects(partial, false);
  }

  replaceOptions(config: ChartSpec): void {
    if (this.destroyed) return;
    const previousPlugins = this.config.plugins ?? [];
    this.config = deepMerge(
      DEFAULT_CONFIG as unknown as Record<string, unknown>,
      config as unknown as Record<string, unknown>,
    ) as unknown as ChartSpec;

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
    this.updateLayout();
    this.updateScalePixelRanges();
    this.autoRange();
    // Reapply the follow window that autoRange just overwrote with the full
    // extent, so a config update does not knock a following chart off its
    // trailing window (matches initAxes).
    if (this.following) this.applyFollowWindow();
    this.scheduler.markDirty(DirtyFlag.ALL);
    this.emitEvent('options:update', this.config);
    if (themeChanged) this.emitEvent('theme:update', this.theme);
    this.pluginManager.dispatch('onSetOptions', this);
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
      const color = series.color ?? palette[seriesIndex % palette.length];
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

  redraw(): void {
    this.scheduler.markDirty(DirtyFlag.ALL);
  }

  /** Reset zoom to full data extent (double-click handler) */
  resetZoom(): void {
    if (this.destroyed || !this.allowResetViewport()) return;
    const previous = new Map(
      [...this.scales].map(([key, scale]) => [key, [scale.min, scale.max] as const]),
    );
    this.userZoomedAxes.clear();
    this.setFollowing(true);
    this.autoRangeHorizontal();
    // Follow window (if configured) takes precedence over full-extent X.
    this.applyFollowWindow();
    this.autoRangeVertical();
    this.scheduler.markDirty(DirtyFlag.ALL);

    this.publishResetViewport(previous);
  }

  scrollToLatest(): void {
    if (this.destroyed || !this.allowResetViewport()) return;
    const previous = new Map(
      [...this.scales].map(([key, scale]) => [key, [scale.min, scale.max] as const]),
    );
    this.userZoomedAxes.clear();
    this.setFollowing(true);
    if (this.followWindow() !== undefined && this.hasData()) {
      this.applyFollowWindow();
    } else {
      this.autoRangeHorizontal();
      this.autoRangeVertical();
    }
    this.refreshCursor();
    this.scheduler.markDirty(DirtyFlag.ALL);
    this.publishResetViewport(previous);
  }

  private allowResetViewport(): boolean {
    const guard = this.interactionGuards.viewport;
    if (!guard) return true;
    const current = [...this.scales].map(([key, scale]) => [key, scale.min, scale.max] as const);
    const zoomed = new Set(this.userZoomedAxes);
    const extents = new Map(this.naturalExtent);
    const plans = new Map(this.barXAxisPlans);
    const savedGuards = this.interactionGuards;
    let proposed: Array<readonly [string, number, number]>;
    try {
      this.interactionGuards = {};
      this.userZoomedAxes.clear();
      this.autoRangeHorizontal();
      this.applyFollowWindow();
      this.autoRangeVertical();
      proposed = [...this.scales].map(([key, scale]) => [key, scale.min, scale.max] as const);
    } finally {
      for (const [key, min, max] of current) {
        const scale = this.scales.get(key)!;
        scale.min = min;
        scale.max = max;
      }
      this.userZoomedAxes = zoomed;
      this.naturalExtent = extents;
      this.barXAxisPlans = plans;
      this.interactionGuards = savedGuards;
    }
    let allowed = true;
    for (const [key, min, max] of proposed) {
      if (guard(key, { min, max }) === false) allowed = false;
    }
    return allowed;
  }

  /** Report every scale a reset action moved. */
  private publishResetViewport(previous: ReadonlyMap<string, readonly [number, number]>): void {
    for (const [scaleKey, scale] of this.scales) {
      const before = previous.get(scaleKey);
      if (!before || before[0] !== scale.min || before[1] !== scale.max) {
        this.emitEvent('viewport:change', scaleKey, { min: scale.min, max: scale.max });
      }
    }
  }

  isFollowing(): boolean {
    return this.following;
  }

  getSelection(): SelectionRange | null {
    // Return a copy so callers cannot mutate internal state.
    if (!this.selection) return null;
    return {
      x: { min: this.selection.x.min, max: this.selection.x.max },
      ...(this.selection.y ? { y: { min: this.selection.y.min, max: this.selection.y.max } } : {}),
    };
  }

  setSelection(selection: SelectionRange | null): void {
    if (this.destroyed) return;
    if (this.interactionGuards.selection?.(selection) === false) return;
    if (selection === null) {
      if (this.selection === null) return;
      this.selection = null;
    } else {
      const min = Math.min(selection.x.min, selection.x.max);
      const max = Math.max(selection.x.min, selection.x.max);
      this.selection = { x: { min, max } };
    }
    this.scheduler.markDirty(DirtyFlag.OVERLAY);
    this.emitSelectionChange();
  }

  private reconcileSelectionForDataChange(): void {
    if (!this.selection) return;
    const policy = this.config.selection?.dataChange ?? 'clear-if-outside';
    if (policy === 'preserve') return;
    if (policy === 'clear' || !this.hasData()) {
      this.setSelection(null);
      return;
    }

    const [first, last] = this.sourceExtent()!;
    const dataMin = Math.min(first, last);
    const dataMax = Math.max(first, last);
    const { min, max } = this.selection.x;
    if (max < dataMin || min > dataMax) {
      this.setSelection(null);
    } else if (policy === 'clamp') {
      this.setSelection({ x: { min: Math.max(min, dataMin), max: Math.min(max, dataMax) } });
    }
  }

  private isBrushMode(): boolean {
    return this.config.selection?.mode === 'brush';
  }

  /** Fire selection:change / onBrush only when the selection actually changed. */
  private emitSelectionChange(): void {
    const cur = this.selection;
    const prev = this.lastEmittedSelection;
    const same =
      (cur === null && prev === null) ||
      (cur !== null && prev !== null && cur.x.min === prev.x.min && cur.x.max === prev.x.max);
    if (same) return;
    this.lastEmittedSelection = this.getSelection();
    const payload = this.getSelection();
    this.emitEvent('selection:change', payload);
    this.config.selection?.onBrush?.(payload);
  }

  /** Pixel x of a data-space X value on the default axis, or null. */
  private brushPixelRange(): { min: number; max: number } | null {
    if (!this.selection) return null;
    const xScale = this.scales.get('x');
    if (!xScale) return null;
    return {
      min: xScale.dataToPixel(this.selection.x.min),
      max: xScale.dataToPixel(this.selection.x.max),
    };
  }

  private brushStart(px: number): void {
    const xScale = this.scales.get('x');
    if (!xScale) return;
    const dataX = xScale.pixelToData(px);
    const rect = this.brushPixelRange();
    // Decide the interaction from where the drag begins relative to the
    // existing band: near an edge resizes it, inside moves it, elsewhere
    // starts a fresh selection.
    if (this.selection && rect) {
      const lo = Math.min(rect.min, rect.max);
      const hi = Math.max(rect.min, rect.max);
      if (Math.abs(px - lo) <= BRUSH_EDGE_GRAB_PX) {
        this.brushDrag = { mode: 'resize-min', anchorDataX: dataX, orig: { ...this.selection.x } };
        return;
      }
      if (Math.abs(px - hi) <= BRUSH_EDGE_GRAB_PX) {
        this.brushDrag = { mode: 'resize-max', anchorDataX: dataX, orig: { ...this.selection.x } };
        return;
      }
      if (px > lo && px < hi) {
        this.brushDrag = { mode: 'move', anchorDataX: dataX, orig: { ...this.selection.x } };
        return;
      }
    }
    this.brushDrag = { mode: 'create', anchorDataX: dataX, orig: { min: dataX, max: dataX } };
    const proposed = { x: { min: dataX, max: dataX } };
    if (this.interactionGuards.selection?.(proposed) !== false) this.selection = proposed;
  }

  private brushUpdate(px: number): void {
    const xScale = this.scales.get('x');
    if (!xScale || !this.brushDrag) return;
    const dataX = xScale.pixelToData(px);
    const { mode, anchorDataX, orig } = this.brushDrag;

    let proposed: SelectionRange;
    if (mode === 'create') {
      proposed = { x: { min: Math.min(anchorDataX, dataX), max: Math.max(anchorDataX, dataX) } };
    } else if (mode === 'move') {
      const delta = dataX - anchorDataX;
      proposed = { x: { min: orig.min + delta, max: orig.max + delta } };
    } else if (mode === 'resize-min') {
      proposed = { x: { min: Math.min(dataX, orig.max), max: Math.max(dataX, orig.max) } };
    } else {
      proposed = { x: { min: Math.min(orig.min, dataX), max: Math.max(orig.min, dataX) } };
    }
    if (this.interactionGuards.selection?.(proposed) !== false) this.selection = proposed;
  }

  private brushEnd(): void {
    if (!this.brushDrag) return;
    const wasCreate = this.brushDrag.mode === 'create';
    this.brushDrag = null;
    // A create gesture that never moved (a click) clears the selection
    // rather than leaving a zero-width band.
    if (wasCreate && this.selection && this.selection.x.min === this.selection.x.max) {
      if (this.interactionGuards.selection?.(null) !== false) this.selection = null;
    }
    this.emitSelectionChange();
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
    this.themeObserver?.disconnect();
    this.themeObserver = null;
    this.colorSchemeQuery?.removeEventListener?.('change', this.boundSchemeChange);
    this.colorSchemeQuery = null;

    this.scheduler.destroy();
    this.gestureManager.detach();
    this.tooltipManager.destroy();
    this.eventBus.destroy();
    this.pluginManager.destroyAll(this);
    this.canvasManager.destroy();
    this.listeners.clear();
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
    this.cursorIsLocal = false; // Group- or application-driven cursor

    if (dataX === null) {
      this.cursorX = null;
      this.cursorY = null;
      this.cursorDataX = null;
      this.cursorDataIdx = null;
      this.tooltipPoints = [];
      this.tooltipManager.hide();
      this.scheduler.markDirty(DirtyFlag.OVERLAY);
      this.emitEvent('cursor:move', null, null, origin);
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
        const store = this.sourceStores[0];
        this.cursorDataIdx = store.nearestXIndex(dataX);
        // Snap to nearest actual data point's X for accurate crosshair placement
        if (this.cursorDataIdx < store.length) {
          const snappedX = store.xAt(this.cursorDataIdx);
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
    for (let si = 0; si < this.config.series.length; si++) {
      const sc = this.config.series[si];
      const store = this.storeForSeries(si);
      if (sc.visible === false || !store.length) continue;
      const colIdx = seriesYColumn(sc);
      const yScale = this.scales.get(sc.yAxis ?? 'y');
      if (!yScale || colIdx < 1 || colIdx > store.seriesCount) continue;
      const yVal = store.yAt(colIdx - 1, store.nearestXIndex(dataX));
      if (Number.isFinite(yVal)) {
        this.cursorY = yScale.dataToPixel(yVal);
        break;
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
  }

  // ─── Cursor snapshot (legend table data source) ─────────────

  /** Allocates and returns a fresh snapshot. */
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

  // ─── Highlight (series highlight + dim) ─────────────────────

  /**
   * Set the highlighted series (`null` clears). Non-highlighted series dim
   * per `highlight.dimOpacity`. No-op when the value is unchanged.
   */
  setHighlight(seriesIndex: number | null): void {
    const normalized = this.normalizeHighlightIndex(seriesIndex);

    // Equality guard: prevents redundant redraws and breaks group sync loops.
    if (this.highlightedSeries === normalized) return;

    this.highlightedSeries = normalized;
    this.scheduler.markDirty(DirtyFlag.DATA);
    this.emitEvent('highlight:change', normalized);
  }

  getHighlight(): number | null {
    return this.highlightedSeries;
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
   * Internal: the D31 debug counters, exposed on the public handle as
   * `chart[Symbol.for('snaplot.debug')]`. Point counts are computed lazily
   * from the last data pass when first read.
   */
  debugSnapshot(): DebugSnapshot {
    const pass = this.lastDataPass;
    const labels = this.lastAxisLabels;
    const canvases = this.canvasManager;
    let counts: { drawn: number; inView: number } | undefined;
    const count = () => (counts ??= countDataPass(pass));
    return Object.freeze({
      ingestCount: this.debugCounters.ingestCount,
      renderCount: { ...this.stats.renderCount },
      layers: {
        grid: canvases.gridCanvas,
        data: canvases.dataCanvas,
        overlay: canvases.overlayCanvas,
      },
      get drawnPoints() {
        return count().drawn;
      },
      get inViewPoints() {
        return count().inView;
      },
      materializeCount: this.debugCounters.materializeCount,
      labelBoxes: () => debugLabelBoxes(labels),
    });
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

  private normalizeHighlightIndex(seriesIndex: number | null): number | null {
    if (seriesIndex === null) return null;
    if (!Number.isInteger(seriesIndex)) return null;
    if (seriesIndex < 0 || seriesIndex >= this.config.series.length) return null;
    if (this.config.series[seriesIndex]?.visible === false) return null;
    return seriesIndex;
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
          this.invalidateRangeCache();
          return new RingColumnarStore(store.getData(), maxLen, this.debugCounters);
        }
        if (!(store instanceof RingColumnarStore)) return store;
        this.invalidateRangeCache();
        return new ColumnarStore(store.getData());
      }),
    );
  }

  private streamingMaxLen(): number | undefined {
    const maxLen = (this.config.streaming as StreamingSpec | undefined)?.maxPoints;
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
    const data = this.sourceStores[0].getData();

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

    this.autoRange();
    // A configured follow window overrides full-extent X on first paint and
    // after a config replace, as long as the user has not paused following.
    if (this.following) this.applyFollowWindow();
  }

  /**
   * Auto-range both horizontal and vertical axes to fit data.
   * Called on data change (replacement, append, init), NOT on zoom.
   */
  private autoRange(): void {
    this.autoRangeHorizontal();
    this.autoRangeVertical();
  }

  /** Auto-range horizontal (bottom/top) axes to full data extent. Skipped per-axis when the user has actively zoomed that axis. */
  private autoRangeHorizontal(): void {
    this.barXAxisPlans.clear();
    if (!this.hasData()) return;

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
      const visitedColumns = new Map<DataStore, Set<number>>();
      const includeXColumn = (columnIdx: number, store: DataStore) => {
        if (!this.isValidColumn(columnIdx, store)) return;
        let visited = visitedColumns.get(store);
        if (!visited) {
          visited = new Set();
          visitedColumns.set(store, visited);
        }
        if (visited.has(columnIdx)) return;
        visited.add(columnIdx);
        for (let i = 0; i < store.length; i++) {
          const value = store.valueAt(columnIdx, i);
          if (!Number.isFinite(value)) continue;
          hasXValue = true;
          if (value < xMin) xMin = value;
          if (value > xMax) xMax = value;
          if (value > 0 && value < xPositiveMin) xPositiveMin = value;
        }
      };
      let hasBoundSeries = false;
      for (const [si, s] of this.config.series.entries()) {
        if ((s.xAxis ?? 'x') !== key || s.visible === false) continue;
        hasBoundSeries = true;
        includeXColumn(s.type === 'scatter' ? scatterXColumn(s) : 0, this.storeForSeries(si));
      }
      if (!hasBoundSeries) includeXColumn(0, this.sourceStores[0]);
      if (!hasXValue) continue;
      if (scale.type === 'log') {
        if (xMax <= 0 || xPositiveMin === Infinity) continue;
        xMin = xPositiveMin;
      }
      const hasBarSeries = this.config.series.some(
        (s) =>
          s.visible !== false &&
          (s.xAxis ?? 'x') === key &&
          (s.type === 'bar' || s.type === 'histogram'),
      );
      const hasHistogramSeries = this.config.series.some(
        (s) => s.visible !== false && (s.xAxis ?? 'x') === key && s.type === 'histogram',
      );
      const barStores = [
        ...new Set(
          this.config.series.flatMap((series, si) =>
            series.visible !== false &&
            (series.xAxis ?? 'x') === key &&
            (series.type === 'bar' || series.type === 'histogram')
              ? [this.storeForSeries(si)]
              : [],
          ),
        ),
      ];
      const barX =
        barStores.length === 1
          ? barStores[0].x
          : Float64Array.from(
              [...new Set(barStores.flatMap((store) => Array.from(store.x)))].sort((a, b) => a - b),
            );
      // Scatter/heatmap clouds default to a 5% pad so the data fills the plot
      // with just enough breathing room before continuous-domain nicening.
      const isScatterOnly =
        !hasBarSeries &&
        this.config.series.length > 0 &&
        this.config.series.every((s) => s.visible === false || s.type === 'scatter');

      if (scale.type === 'log') {
        const [min, max] = this.paddedLogRange(xMin, xMax, ac.padding ?? AUTO_RANGE_PADDING);
        scale.min = ac.min ?? min;
        scale.max = ac.max ?? max;
      } else if (xMin === xMax) {
        scale.min = xMin - 1;
        scale.max = xMax + 1;
      } else if (hasBarSeries && !hasHistogramSeries && barX.length > 1) {
        const canPlanBarTicks =
          scale.type === 'linear' &&
          ac.nice !== false &&
          ac.min === undefined &&
          ac.max === undefined &&
          (!ac.ticks || ac.ticks.length === 0);
        const barPlan = canPlanBarTicks
          ? this.planBarXAxis(Array.from(barX), xMin, xMax, ac.tickCount ?? DEFAULT_TICK_COUNT)
          : null;
        if (barPlan) {
          scale.min = barPlan.domainMin;
          scale.max = barPlan.domainMax;
          this.barXAxisPlans.set(key, barPlan);
        } else {
          const firstPad = categoryWidthFromData((idx) => barX[idx], 0, barX.length) * 0.5;
          const lastPad =
            categoryWidthFromData((idx) => barX[idx], barX.length - 1, barX.length) * 0.5;
          scale.min = xMin - firstPad;
          scale.max = xMax + lastPad;
        }
      } else if (hasBarSeries && barX.length > 1) {
        const firstPad = categoryWidthFromData((idx) => barX[idx], 0, barX.length) * 0.5;
        const lastPad =
          categoryWidthFromData((idx) => barX[idx], barX.length - 1, barX.length) * 0.5;
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

      // Linear continuous domains use regular 1/2/5 tick intervals by default.
      // Bar X axes use their own slot plan above; histogram bounds stay exact.
      // `nice: false` opts out.
      if (this.shouldNiceAutoRange(scale, ac, hasBarSeries)) {
        this.niceAutoRange(scale, ac.tickCount ?? DEFAULT_TICK_COUNT);
      }

      // Nicening may expand either side, but an explicitly pinned side must
      // remain exactly where the caller put it.
      if (ac.min !== undefined) scale.min = ac.min;
      if (ac.max !== undefined) scale.max = ac.max;

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
    if (!this.hasData()) return;

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

      const includeColumnRange = (
        columnIdx: number,
        startIdx: number,
        endIdx: number,
        store: DataStore,
      ) => {
        includeRange(
          this.columnRange(columnIdx, startIdx, endIdx, scale.type, fromViewport, store),
        );
      };
      const includeColumnForScatterViewport = (
        yColumnIdx: number,
        xColumnIdx: number,
        xScale: Scale | undefined,
        store: DataStore,
      ) => {
        includeRange(
          this.scatterViewportColumnRange(
            yColumnIdx,
            xColumnIdx,
            xScale,
            scale.type,
            fromViewport,
            store,
          ),
        );
      };

      for (const [si, s] of this.config.series.entries()) {
        if ((s.yAxis ?? 'y') !== key || s.visible === false) continue;

        const store = this.storeForSeries(si);
        const xScale = this.scales.get(s.xAxis ?? 'x') ?? this.scales.get('x');
        const xColumnIdx = s.type === 'scatter' ? scatterXColumn(s) : 0;
        let startIdx = 0;
        let endIdx = store.length - 1;
        if (xScale && xColumnIdx === 0) {
          [startIdx, endIdx] = store.getViewportIndices(xScale.min, xScale.max);
        }

        const yColumnIdx = seriesYColumn(s) - 1;
        if (s.type === 'scatter' && xColumnIdx !== 0 && this.isValidColumn(xColumnIdx, store)) {
          includeColumnForScatterViewport(yColumnIdx, xColumnIdx, xScale, store);
        } else {
          includeColumnRange(yColumnIdx, startIdx, endIdx, store);
        }
        if (s.type === 'band') {
          if (s.upperColumn != null) includeColumnRange(s.upperColumn - 1, startIdx, endIdx, store);
          if (s.lowerColumn != null) includeColumnRange(s.lowerColumn - 1, startIdx, endIdx, store);
        }
      }

      // For bar/histogram series, always include 0 as the baseline
      const hasBarOrHist = this.config.series.some(
        (s) =>
          (s.yAxis ?? 'y') === key &&
          s.visible !== false &&
          (s.type === 'bar' || s.type === 'histogram'),
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
        const equalSpan = yMin === yMax ? (yMin === 0 ? 1 : Math.abs(yMin) * 0.1) : 0;
        if (ac.min === undefined) {
          const min = yMin - (equalSpan || pad);
          scale.min = hasBarOrHist ? Math.min(0, min) : min;
        }
        if (ac.max === undefined) {
          const max = yMax + (equalSpan || pad);
          scale.max = hasBarOrHist ? Math.max(0, max) : max;
        }
      }

      if (this.shouldNiceAutoRange(scale, ac, false)) {
        this.niceAutoRange(scale, ac.tickCount ?? DEFAULT_TICK_COUNT);
        // nice() can push min below 0, clamp back for bar/histogram baseline
        if (hasBarOrHist && yMin >= 0 && scale.min < 0) scale.min = 0;
      }

      // Preserve one-sided explicit domains after automatic nicening.
      if (ac.min !== undefined) scale.min = ac.min;
      if (ac.max !== undefined) scale.max = ac.max;

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

  /**
   * The most scatter points drawn per frame during a gesture, or null when sampling is off.
   * `culledByX`: the series' X is the store's X, so its segments hold the in-view points only.
   */
  private interactionSamplingBudget(culledByX = false): number | null {
    const configured = this.config.performance?.interactionSampling;
    if (configured === false) return null;
    if (typeof configured === 'number') return configured > 0 ? configured : null;
    // Plan §3.4's budget, max(400, 1.5 × plot width), counts in-view points. A source culled
    // by X (a sorted scatter) is sampled over the view, so it gets that budget for every
    // pointer. A source that is not culled is strided over its whole length, so the mouse
    // and programmatic changes keep 10,000 until M11 counts its in-view points
    // (gap-perf-gate-01:sampling); touch and pen already had the width-scaled budget.
    if (!culledByX && this.lastPointerType !== 'touch' && this.lastPointerType !== 'pen')
      return DEFAULT_INTERACTION_SAMPLING;
    return Math.min(
      DEFAULT_INTERACTION_SAMPLING,
      Math.max(
        MIN_TOUCH_INTERACTION_SAMPLING,
        Math.round(this.layout.plot.width * TOUCH_INTERACTION_POINTS_PER_PIXEL),
      ),
    );
  }

  /** True while a gesture is moving the viewport and reduced-fidelity drawing is enabled. */
  private interactionActive(): boolean {
    return (
      this.interactionSamplingBudget() !== null && performance.now() < this.viewportActiveUntil
    );
  }

  /**
   * During an active viewport gesture, replace line/area render segments with
   * an M4-decimated copy (first/last/min/max per pixel column) so a wide line
   * strokes ~4 points per column instead of every visible sample. M4 is
   * shape-preserving (the vertical envelope is exact) and gap-aware, and the
   * full data repaints on gesture settle. Returns the segments unchanged when
   * decimation is off, the gesture is idle, or the series already fits the
   * pixel budget. Sets sampledLastDataRender so the settle timer refines.
   */
  private decimateLineSegments(segments: LineRenderSegment[], xScale: Scale): LineRenderSegment[] {
    if (!this.interactionActive()) return segments;
    const pixelWidth = Math.max(1, Math.round(this.layout.plot.width));
    const budget = pixelWidth * 4;

    let total = 0;
    for (const s of segments) total += s.endIdx - s.startIdx + 1;
    if (total <= budget) return segments;

    const out: LineRenderSegment[] = [];
    for (const s of segments) {
      const [dx, dy] = m4(
        s.xData.subarray(s.startIdx, s.endIdx + 1),
        s.yData.subarray(s.startIdx, s.endIdx + 1),
        pixelWidth,
        xScale.min,
        xScale.max,
      );
      if (dx.length === 0) continue;
      out.push({ xData: dx, yData: dy, startIdx: 0, endIdx: dx.length - 1 });
    }
    if (out.length === 0) return segments;
    this.sampledLastDataRender = true;
    return out;
  }

  private scatterResolvers(si: number, series: SeriesSpec, fallbackColor: string) {
    const store = this.storeForSeries(si);
    const cached = this.scatterEncodingCache.get(si);
    if (
      cached &&
      cached.series === series &&
      cached.theme === this.theme &&
      cached.version === this.stats.dataVersion
    ) {
      return cached;
    }

    const logicalValueAt = (columnIdx: number, index: number) => store.valueAt(columnIdx, index);
    const state = buildScatterEncodingState({
      series,
      fallbackColor,
      fallbackRadius: series.pointRadius ?? (store.length > 10_000 ? 1.5 : 3),
      palettes: this.scatterPalettes(),
      columnCount: store.seriesCount + 1,
      ranges: [{ startIdx: 0, endIdx: store.length - 1 }],
      valueAt: logicalValueAt,
    });

    const physicalColumns = new Map<number, Float64Array>();
    const physicalValueAt = (columnIdx: number, index: number) => {
      let column = physicalColumns.get(columnIdx);
      if (!column) {
        column = store.getPhysicalColumn(columnIdx);
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
    store: DataStore,
  ): [number, number] | null {
    if (columnIdx < 0 || columnIdx >= store.seriesCount) return null;
    const start = Math.max(0, startIdx);
    const end = Math.min(store.length - 1, endIdx);
    if (end < start) return null;
    const positiveOnly = scaleType === 'log';

    if (useIndex) {
      this.ensureRangeIndexesFresh();
      const cacheKey = this.sourceStores.indexOf(store) + ':' + columnIdx;
      let index = this.columnRangeIndexes.get(cacheKey);
      if (!index) {
        // Physical column columnIdx + 1: column 0 is X, series are 1-based.
        index = new ColumnRangeIndex(store.getPhysicalColumn(columnIdx + 1));
        this.columnRangeIndexes.set(cacheKey, index);
      }
      // Segments map the logical range onto live physical ranges, so ring
      // buffers never query dead slots between head and tail.
      let min = Infinity;
      let max = -Infinity;
      for (const segment of store.getSegments(start, end)) {
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
      const v = store.yAt(columnIdx, i);
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
    store: DataStore,
  ): [number, number] | null {
    if (yColumnIdx < 0 || yColumnIdx >= store.seriesCount) return null;
    if (!this.isValidColumn(xColumnIdx, store)) return null;

    const xMin = xScale?.min ?? -Infinity;
    const xMax = xScale?.max ?? Infinity;
    const positiveOnly = scaleType === 'log';

    // The sorted-permutation index assumes physical position == logical
    // position, which only holds for the plain columnar store. Ring buffers
    // fall back to the direct scan.
    if (useIndex && store instanceof ColumnarStore) {
      this.ensureRangeIndexesFresh();
      const key = this.sourceStores.indexOf(store) + ':' + xColumnIdx + ':' + yColumnIdx;
      let index = this.scatterRangeIndexes.get(key);
      if (!index) {
        index = new ScatterColumnRangeIndex(
          store.getPhysicalColumn(xColumnIdx),
          store.getPhysicalColumn(yColumnIdx + 1),
        );
        this.scatterRangeIndexes.set(key, index);
      }
      return index.query(xMin, xMax, positiveOnly);
    }

    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < store.length; i++) {
      const x = store.valueAt(xColumnIdx, i);
      if (!Number.isFinite(x)) continue;
      if (x < xMin || x > xMax) continue;
      const v = store.yAt(yColumnIdx, i);
      if (!Number.isFinite(v) || (positiveOnly && v <= 0)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    return min === Infinity ? null : [min, max];
  }

  /** Whether the layout was computed for another box, options or scales than the current ones. */
  private layoutIsStale(): boolean {
    const w = this.canvasManager.cssWidth || 600;
    const h = this.canvasManager.cssHeight || 400;
    return !this.layout || this.createLayoutCacheKey(w, h) !== this.layoutCacheKey;
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
      w,
      h,
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
    this.canvasManager.setInteractionRect(
      axisControls
        ? { left: 0, top: 0, width: this.layout.width, height: this.layout.height }
        : this.layout.plot,
    );
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
        tickFormatId(ac?.format),
        ac?.title ?? '',
        // Tick config changes what layout measures for the gutter.
        ac?.tickCount ?? '',
        ac?.ticks ? ac.ticks.join(',') : '',
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

  private queueTouchCursor(x: number, y: number, pointerType: 'touch' | 'pen'): void {
    this.pendingTouchCursor = { x, y, pointerType };
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
    this.updateLocalCursorFromPoint(pending.x, pending.y, pending.pointerType);
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
        this.queueTouchCursor(x, y, pointerType);
        return;
      }
      this.cancelPendingTouchCursor();
      this.updateLocalCursorFromPoint(x, y, pointerType);
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

      // Notify listeners that the cursor is gone, without this, a fast
      // mouse-leave skips the "cursor outside plot area" path in
      // action:cursor and the legend table never blanks its values.
      this.emitEvent('cursor:move', null, null, 'local');
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
      if (this.isBrushMode()) {
        this.brushStart(x);
        this.scheduler.markDirty(DirtyFlag.OVERLAY);
        return;
      }
      this.selectionBox = { x1: x, y1: y, x2: x, y2: y };
      this.updateLocalCursorFromPoint(x, y, this.lastPointerType);
      this.scheduler.markDirty(DirtyFlag.OVERLAY);
    });

    this.eventBus.on('action:box-update', ({ x, y }) => {
      if (this.isBrushMode()) {
        this.brushUpdate(x);
        this.scheduler.markDirty(DirtyFlag.OVERLAY);
        return;
      }
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
      if (this.isBrushMode()) {
        this.brushEnd();
        this.scheduler.markDirty(DirtyFlag.OVERLAY);
        return;
      }
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
      x1 = clampX(x1);
      x2 = clampX(x2);
      y1 = clampY(y1);
      y2 = clampY(y2);

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
      const selectionY =
        yScale && zoom.y
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
      this.updateLocalCursorFromPoint(x, y, pointerType);
      if (inPlot) this.emitPointClick(x, y);
      if (inPlot && pointerType !== 'mouse') {
        // Leave a short-lived ring so the user can see the tap landed.
        this.tapFeedback = { x, y, startTime: performance.now() };
      }
    });
  }

  private emitPointClick(pixelX: number, pixelY: number): void {
    const palette = this.categoricalPalette();
    const pointSeries = this.config.series.map((series) =>
      series.type === 'bar' || series.type === 'histogram' ? { ...series, visible: false } : series,
    );
    const points = this.hitTester.findPoints(
      this.sourceStores[0],
      this.scales,
      pointSeries,
      pixelX,
      pixelY,
      'nearest',
      palette,
      this.lastPointerType,
      this.scatterPalettes(),
      this.stats.dataVersion,
      (si) =>
        this.scatterResolvers(si, this.config.series[si], palette[si % palette.length])
          .logicalResolver,
      // The tooltip's readout, so a clicked point reads like its tooltip.
      { ...this.tooltipFormatters(), readout: this.readoutY },
      (si) => this.storeForSeries(si),
    );
    const bars = this.config.series.filter(
      (series) => series.visible !== false && series.type === 'bar',
    );
    for (const point of [...this.findBarTooltipPoints(), ...this.findHistogramTooltipPoints()]) {
      const series = this.config.series[point.seriesIndex];
      const store = this.storeForSeries(point.seriesIndex);
      const xScale = this.scales.get(series.xAxis ?? 'x');
      const yScale = this.scales.get(series.yAxis ?? 'y');
      if (!xScale || !yScale || !Number.isFinite(point.y)) continue;
      const top = yScale.dataToPixel(point.y);
      const base = yScale.dataToPixel(yScale.type === 'log' ? yScale.min : 0);
      if (pixelY < Math.min(top, base) || pixelY > Math.max(top, base)) continue;
      let left: number;
      let right: number;
      if (series.type === 'histogram' && point.xRange) {
        left = xScale.dataToPixel(point.xRange.min);
        right = xScale.dataToPixel(point.xRange.max);
      } else {
        const rect = barRectForCategory({
          centerX: xScale.dataToPixel(point.x),
          categoryWidth: categoryWidthFromData(
            (index) => xScale.dataToPixel(store.xAt(index)),
            point.dataIndex,
            store.length,
            this.layout.plot.width * 0.5,
          ),
          series,
          barSeriesIndex: bars.indexOf(series),
          totalBarSeries: bars.length,
        });
        left = rect.left;
        right = rect.left + rect.width;
      }
      if (pixelX >= Math.min(left, right) && pixelX <= Math.max(left, right)) points.unshift(point);
    }
    const point = points[0];
    if (point) this.emitEvent('point:click', point);
  }

  private zoomedScaleRange(scale: Scale, anchorPx: number, factor: number): [number, number] {
    const anchor = scale.pixelToData(anchorPx);
    if (scale.type !== 'log') {
      return [anchor - (anchor - scale.min) * factor, anchor + (scale.max - anchor) * factor];
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
    axisConfigs: NonNullable<ChartSpec['axes']>,
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
    const targets: Array<{
      key: string;
      scale: Scale;
      pos: 'top' | 'bottom' | 'left' | 'right';
      anchorPx: number;
    }> = [];

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
      const [newMin, newMax] = this.zoomedScaleRange(
        target.scale,
        target.anchorPx,
        effectiveFactor,
      );
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

  /** Apply a viewport change, shared by pan, zoom and box-end */
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
    if (this.interactionGuards.viewport?.(scaleKey, { min, max }) === false) return;

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
  }

  /**
   * Every visible series bound to this Y axis is a scatter. Used to
   * default `zoom.bounds.y` to `'data'` on scatter-only charts where
   * there is no viewport-driven Y auto-range to take up the slack.
   */
  private isScatterOnlyAxis(scaleKey: string): boolean {
    const bound = this.config.series.filter(
      (s) => (s.yAxis ?? 'y') === scaleKey && s.visible !== false,
    );
    return bound.length > 0 && bound.every((s) => s.type === 'scatter');
  }

  /**
   * Resolve the `zoom.bounds` config for a specific axis.
   *
   * Returns `null` when no clamping should happen, or `{ min, max }` with
   * either bound potentially `undefined` (half-open). The `'data'` literal
   * is resolved here from the source extents / Y-range over the visible X window.
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
    } else if (
      typeof raw === 'string' ||
      (typeof raw === 'object' && ('min' in raw || 'max' in raw))
    ) {
      // Top-level scalar spec applies to every axis.
      spec = raw as ZoomBoundsSpec;
    } else {
      const perAxis = raw as { x?: ZoomBoundsSpec; y?: ZoomBoundsSpec };
      spec = (isHoriz ? perAxis.x : perAxis.y) ?? (isHoriz ? 'data' : yDefault);
    }

    if (spec === 'unbounded' || spec === undefined) return null;

    if (typeof spec === 'object') return { ...spec };

    // spec === 'data', use the cached natural extent (output of autoRange,
    // which already honors axis pins and any explicit `nice: true` expansion).
    // Falls back to the raw data range if autoRange hasn't run yet for this axis.
    const natural = this.naturalExtent.get(scaleKey);
    if (natural) return { min: natural[0], max: natural[1] };

    if (!this.hasData()) return null;
    if (isHoriz) {
      const extent = this.sourceExtent();
      return extent ? { min: extent[0], max: extent[1] } : null;
    }
    let min = Infinity;
    let max = -Infinity;
    this.config.series.forEach((series, si) => {
      if ((series.yAxis ?? 'y') !== scaleKey || series.visible === false) return;
      const store = this.storeForSeries(si);
      const range = this.columnRange(
        seriesYColumn(series) - 1,
        0,
        store.length - 1,
        'linear',
        false,
        store,
      );
      if (range) {
        min = Math.min(min, range[0]);
        max = Math.max(max, range[1]);
      }
    });
    return min === Infinity ? null : { min, max };
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
      this.lastAxisLabels = labels.labels;
      this.pluginManager.dispatch('afterDrawGrid', this, this.canvasManager.gridCtx);
      this.statsEnd('grid', start);
    }

    // Step 4b: Data layer (series marks)
    if (flags & DirtyFlag.DATA) {
      const start = this.statsStart();
      // Count only actual paints: a beforeDrawData plugin that returns false
      // vetoes the clear/draw, so it must not bump renderCount.
      if (this.pluginManager.dispatch('beforeDrawData', this, this.canvasManager.dataCtx)) {
        this.canvasManager.clear('data');
        this.renderAllSeries();
        this.pluginManager.dispatch('afterDrawData', this, this.canvasManager.dataCtx);
        this.statsEnd('data', start);
      }
    }

    // Step 4c: Overlay layer (crosshair, tooltip)
    if (flags & DirtyFlag.OVERLAY) {
      const start = this.statsStart();
      this.canvasManager.clear('overlay');
      this.renderOverlay();
      this.pluginManager.dispatch('afterDrawOverlay', this, this.canvasManager.overlayCtx);
      this.statsEnd('overlay', start);
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
      // Ring stores wrap: per-datum callbacks (bar fill) receive logical
      // indices, so carry the logical origin of each physical run.
      logicalStartIdx: segment.logicalStart,
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
    const pass: DataPassSeries[] = [];
    this.lastDataPass = pass;

    // Count bar-type series for grouped width calculation. This mapping is
    // position-based (which slot a bar occupies in each group), so it must
    // be computed from config order, not affected by the highlight draw-last pass.
    const barSeries = this.config.series.filter((s) => s.visible !== false && s.type === 'bar');
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
    const highlightActive = highlightedSi !== null && highlightCfg?.enabled !== false;
    const dimOpacity = highlightCfg?.dimOpacity ?? 0.2;

    // Draw order: when a highlight is active, draw every other series first
    // (dimmed), then the highlighted series on top. Otherwise, draw in config
    // order. This prevents the focused line from being visually composited
    // under later dimmed series.
    const drawOne = (si: number) => {
      const store = this.storeForSeries(si);
      const series = this.config.series[si];
      if (!series || series.visible === false) return;

      const color = series.color ?? palette[si % palette.length];
      const xScale = this.scales.get(series.xAxis ?? 'x')!;
      const yScale = this.scales.get(series.yAxis ?? 'y')!;
      if (!xScale || !yScale) return;

      const colIdx = seriesYColumn(series);
      if (colIdx < 1 || colIdx > store.seriesCount) return;

      const type = series.type ?? 'line';
      const xColumnIdx = type === 'scatter' ? scatterXColumn(series) : 0;
      if (!this.isValidColumn(xColumnIdx, store)) return;
      const canCullByGlobalX = xColumnIdx === 0;
      const [startIdx, endIdx] = canCullByGlobalX
        ? store.getViewportIndices(xScale.min, xScale.max)
        : [0, store.length - 1];
      const segments = store.getSegments(startIdx, endIdx);
      if (segments.length === 0) return;
      const xData = store.getPhysicalColumn(xColumnIdx);
      const yData = store.getPhysicalColumn(colIdx);
      const colorBy = normalizeScatterColorBy(series.colorBy);
      const sizeBy = normalizeScatterSizeBy(series.sizeBy);
      const renderSegments = this.renderSegments(
        segments,
        xData,
        yData,
        colorBy && this.isValidColumn(colorBy.column, store)
          ? store.getPhysicalColumn(colorBy.column)
          : undefined,
        sizeBy && this.isValidColumn(sizeBy.column, store)
          ? store.getPhysicalColumn(sizeBy.column)
          : undefined,
      );
      const renderSeries =
        type === 'scatter' && series.heatmap && !series.heatmapGradient
          ? { ...series, heatmapGradient: this.heatmapGradient() }
          : series;

      const opacityMul = highlightActive && si !== highlightedSi ? dimOpacity : 1;
      const record: DataPassSeries = {
        type,
        xData,
        yData,
        runs: segments,
        stride: 1,
        xMin: xScale.min,
        xMax: xScale.max,
        yMin: yScale.min,
        yMax: yScale.max,
      };
      pass.push(record);

      switch (type) {
        case 'line': {
          const drawn = this.decimateLineSegments(renderSegments, xScale);
          if (drawn !== renderSegments) record.decimated = drawn;
          renderLineSegments(
            ctx,
            drawn,
            xScale,
            yScale,
            this.layout,
            renderSeries,
            color,
            opacityMul,
          );
          break;
        }
        case 'area': {
          const drawn = this.decimateLineSegments(renderSegments, xScale);
          if (drawn !== renderSegments) record.decimated = drawn;
          renderAreaSegments(
            ctx,
            drawn,
            xScale,
            yScale,
            this.layout,
            renderSeries,
            color,
            opacityMul,
          );
          break;
        }
        case 'band': {
          const upperIdx = series.upperColumn;
          const lowerIdx = series.lowerColumn;
          if (
            upperIdx != null &&
            lowerIdx != null &&
            upperIdx >= 1 &&
            lowerIdx >= 1 &&
            upperIdx <= store.seriesCount &&
            lowerIdx <= store.seriesCount
          ) {
            const upperYData = store.getPhysicalColumn(upperIdx);
            const lowerYData = store.getPhysicalColumn(lowerIdx);
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
          const budget = this.interactionSamplingBudget(canCullByGlobalX);
          if (budget !== null && this.interactionActive()) {
            let visible = 0;
            for (const segment of renderSegments) {
              visible += segment.endIdx - segment.startIdx + 1;
            }
            if (visible > budget) {
              sampleStride = visible / budget;
              this.sampledLastDataRender = true;
            }
          }
          record.stride = sampleStride;
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
            this.interactionActive(),
          );
          break;
        }
        case 'bar':
          renderBarsSegments(
            ctx,
            renderSegments,
            xScale,
            yScale,
            this.layout,
            renderSeries,
            color,
            barIdxFor.get(si) ?? 0,
            barSeries.length,
            opacityMul,
          );
          break;
        case 'histogram':
          renderHistogramSegments(
            ctx,
            renderSegments,
            xScale,
            yScale,
            this.layout,
            renderSeries,
            color,
            opacityMul,
          );
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
        (s) => s.visible === false || s.type === 'scatter',
      );
      if (!isScatterOnly) {
        const visibleSeries = this.config.series.filter((s) => s.visible !== false);
        const hasOnlyDiscreteMarks =
          visibleSeries.length > 0 &&
          visibleSeries.every((s) => s.type === 'bar' || s.type === 'histogram');
        const cursorCfg = {
          ...this.config.cursor,
          // A vertical line reads as an extra mark on grouped bars. The
          // highlighted group already supplies a stronger positional cue.
          xLine: this.config.cursor?.xLine ?? !hasOnlyDiscreteMarks,
        };
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

    // Draw the persistent brush selection band (anchored in data space, so it
    // stays put as the viewport pans/zooms), then edge handles.
    if (this.selection) {
      const rect = this.brushPixelRange();
      if (rect) {
        renderBrushSelection(ctx, rect.min, rect.max, this.layout, this.theme.crosshairColor);
      }
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
    ctx.roundRect(
      this.layout.plot.left,
      this.layout.plot.top,
      this.layout.plot.width,
      this.layout.plot.height,
      4,
    );
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
    const hlActive = this.highlightedSeries !== null && this.config.highlight?.enabled !== false;

    for (const point of this.tooltipPoints) {
      if (hlActive && point.seriesIndex !== this.highlightedSeries) continue;

      const store = this.storeForSeries(point.seriesIndex);
      const sc = this.config.series[point.seriesIndex];
      if (!sc) continue;

      const xScale = this.scales.get(sc.xAxis ?? 'x');
      const yScale = this.scales.get(sc.yAxis ?? 'y');
      if (!xScale || !yScale) continue;

      if (sc.type === 'histogram') {
        // Highlight hovered bin, edges from X data, counts from Y data
        const colIdx = seriesYColumn(sc);
        const binIdx = point.dataIndex;
        if (colIdx >= 1 && colIdx <= store.seriesCount && binIdx < store.length - 1) {
          const x1 = xScale.dataToPixel(store.xAt(binIdx));
          const x2 = xScale.dataToPixel(store.xAt(binIdx + 1));
          const yTop = yScale.dataToPixel(store.yAt(colIdx - 1, binIdx));
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
        const barSeries = this.config.series.filter((s) => s.visible !== false && s.type === 'bar');
        const barIdx = barSeries.indexOf(sc);
        const totalBars = barSeries.length;
        if (barIdx >= 0 && idx < store.length) {
          const centerX = xScale.dataToPixel(store.xAt(idx));
          const categoryWidth = categoryWidthFromData(
            (dataIndex) => xScale.dataToPixel(store.xAt(dataIndex)),
            idx,
            store.length,
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
          if (!Number.isFinite(centerX) || !Number.isFinite(barTop) || !Number.isFinite(baselineY))
            continue;
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
      if (sc.type === 'scatter' && isDensityScatterSeries(sc, store.length)) continue;

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

  private updateLocalCursorFromPoint(x: number, y: number, pointerType: string): void {
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
        this.cursorDataIdx = this.canUseGlobalXCursor()
          ? this.sourceStores[0].nearestXIndex(this.cursorDataX)
          : null;
      }

      if (
        !hasOnlyHistograms &&
        this.config.cursor?.snap !== false &&
        this.cursorDataIdx !== null &&
        this.canUseGlobalXCursor()
      ) {
        const snappedX = this.sourceStores[0].xAt(this.cursorDataIdx);
        this.cursorX = xScale.dataToPixel(snappedX);
        this.cursorDataX = snappedX;
      }

      this.updateTooltipPoints();
      this.applyNearestScatterCursor();
      this.applyProximityHighlight();
    } else {
      this.cursorX = null;
      this.cursorY = null;
      this.cursorDataX = null;
      this.cursorDataIdx = null;
      this.tooltipPoints = [];
      this.tooltipManager.hide();
      this.clearProximityHighlight();
    }

    this.scheduler.markDirty(DirtyFlag.OVERLAY);
    this.emitEvent('cursor:move', this.cursorDataX, this.cursorDataIdx, 'local');
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
      const yScale = this.scales.get(sc.yAxis ?? 'y');
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
    if (!this.hasData() || this.cursorX === null || this.cursorY === null) {
      this.tooltipPoints = [];
      return;
    }

    // Use chart-type-specific hit-testing for bar/histogram (they need geometry awareness),
    // fall back to generic HitTester for line/scatter/area.
    const hasHistogram = this.config.series.some(
      (s) => s.type === 'histogram' && s.visible !== false,
    );
    const hasBar = this.config.series.some((s) => s.type === 'bar' && s.visible !== false);

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
        this.sourceStores[0],
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
          const fallback = series.color ?? palette[si % palette.length];
          return this.scatterResolvers(si, series, fallback).logicalResolver;
        },
        { ...this.tooltipFormatters(), readout: this.readoutY },
        (si) => this.storeForSeries(si),
      );
    }
  }

  /** tooltip.xFormat / tooltip.yFormat, when configured. */
  private tooltipFormatters():
    | { x?: (x: number) => string; y?: (y: number, seriesIndex: number) => string }
    | undefined {
    const t = this.config.tooltip;
    if (!t?.xFormat && !t?.yFormat) return undefined;
    return { x: t.xFormat, y: t.yFormat };
  }

  /**
   * Hit-test histogram bins: find which bin the cursor X falls into
   * and return a tooltip point showing the bin range and count.
   */
  private findHistogramTooltipPoints(): TooltipPoint[] {
    const points: TooltipPoint[] = [];
    if (this.cursorX === null || !this.hasData()) return points;
    const palette = this.categoricalPalette();

    for (let si = 0; si < this.config.series.length; si++) {
      const series = this.config.series[si];
      const store = this.storeForSeries(si);
      if (store.length === 0) continue;
      if (series.visible === false || series.type !== 'histogram') continue;

      const xScale = this.scales.get(series.xAxis ?? 'x');
      if (!xScale) continue;
      const dataX = xScale.pixelToData(this.cursorX);

      const colIdx = seriesYColumn(series);
      if (colIdx < 1 || colIdx > store.seriesCount) continue;

      const color = series.color ?? palette[si % palette.length];

      // Find which bin the cursor X falls into. Edges are sorted, so
      // `upperBound` gives the largest b with edges[b] <= dataX in O(log n).
      // Bins are left-edge inclusive. The exact final edge maps to the
      // final bin so a click on the right border still selects that bar.
      const b = this.histogramBinIndexForDataX(dataX, store);
      if (b === null) continue;

      const binMin = store.xAt(b);
      const binMax = store.xAt(b + 1);
      const count = store.yAt(colIdx - 1, b);

      const fmt = this.tooltipFormatters();
      points.push({
        seriesIndex: si,
        dataIndex: b,
        label: series.label,
        x: (binMin + binMax) / 2,
        xRange: { min: binMin, max: binMax },
        y: count,
        color,
        formattedX: this.formatHistogramBinRange(binMin, binMax, si),
        formattedY: fmt?.y ? fmt.y(count, si) : this.formatAxisReadout(series.yAxis ?? 'y', count),
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
    if (this.cursorX === null || !this.hasData()) return points;
    const palette = this.categoricalPalette();

    for (let si = 0; si < this.config.series.length; si++) {
      const series = this.config.series[si];
      const store = this.storeForSeries(si);
      if (store.length === 0) continue;
      if (series.visible === false || series.type !== 'bar') continue;

      const xScale = this.scales.get(series.xAxis ?? 'x');
      if (!xScale) continue;

      const dataX = xScale.pixelToData(this.cursorX);
      const idx = store.nearestXIndex(dataX);
      const xVal = store.xAt(idx);
      const categoryWidth = categoryWidthFromData(
        (dataIndex) => store.xAt(dataIndex),
        idx,
        store.length,
      );
      if (Math.abs(dataX - xVal) > categoryWidth * 0.6) continue;

      const colIdx = seriesYColumn(series);
      if (colIdx < 1 || colIdx > store.seriesCount) continue;

      const yVal = store.yAt(colIdx - 1, idx);
      if (!Number.isFinite(yVal)) continue;

      const color = series.color ?? palette[si % palette.length];
      const fmt = this.tooltipFormatters();

      points.push({
        seriesIndex: si,
        dataIndex: idx,
        label: series.label,
        x: xVal,
        y: yVal,
        color,
        formattedX: fmt?.x ? fmt.x(xVal) : this.formatAxisValue(series.xAxis ?? 'x', xVal),
        formattedY: fmt?.y ? fmt.y(yVal, si) : this.formatReadout(series.yAxis ?? 'y', yVal),
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
    if (this.sourceStores.length > 1 || !this.canUseGlobalXCursor())
      return this.fillIndependentSnapshot(target, opts);
    const store = this.sourceStores[0];
    const fallback = opts?.fallback ?? 'hide';
    const length = store.length;

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
      ? this.histogramBinRange(idx, store)
      : null;
    const xVal = histogramRange ? (histogramRange.min + histogramRange.max) / 2 : store.xAt(idx);
    const xScale = this.scales.get('x');

    target.dataIndex = idx;
    target.dataX = xVal;
    target.formattedX = histogramRange
      ? this.formatHistogramBinRange(histogramRange.min, histogramRange.max)
      : xScale
        ? xScale.tickFormat(xVal)
        : String(xVal);
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

      const colIdx = seriesYColumn(s);
      if (colIdx < 1 || colIdx > store.seriesCount) continue;

      const value = store.yAt(colIdx - 1, idx);
      const yScale = this.scales.get(s.yAxis ?? 'y');
      const formattedValue = Number.isFinite(value)
        ? this.formatReadout(s.yAxis ?? 'y', value)
        : '';
      const color = s.color ?? palette[si % palette.length];

      let row = points[writeIdx];
      if (!row) {
        row = {
          seriesIndex: si,
          dataIndex: idx,
          dataX: xVal,
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
        row.dataX = xVal;
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

  private fillIndependentSnapshot(
    target: CursorSnapshot,
    opts?: CursorSnapshotOptions,
  ): CursorSnapshot {
    const fallback = opts?.fallback ?? 'hide';
    const active = this.cursorDataX !== null && this.cursorX !== null;
    const source: CursorSnapshot['source'] = active
      ? 'cursor'
      : this.hasData() && fallback !== 'hide'
        ? fallback
        : 'none';
    target.source = source;
    target.dataIndex = null;
    target.dataX = active ? this.cursorDataX : null;
    target.formattedX = '';
    target.activeSeriesIndex = null;
    if (source === 'none') {
      target.points.length = 0;
      return target;
    }
    const palette = this.categoricalPalette();
    let count = 0;
    let nearestDist = Infinity;
    for (let si = 0; si < this.config.series.length; si++) {
      const series = this.config.series[si];
      const store = this.storeForSeries(si);
      const column = seriesYColumn(series);
      if (series.visible === false || !store.length || !this.isValidColumn(column, store)) continue;
      const seriesX = this.scales.get(series.xAxis ?? 'x');
      const targetX =
        active && seriesX && this.cursorX !== null
          ? seriesX.pixelToData(this.cursorX)
          : this.cursorDataX!;
      let dataIndex =
        source === 'latest'
          ? Math.max(0, store.length - (series.type === 'histogram' ? 2 : 1))
          : source === 'first'
            ? 0
            : series.type === 'histogram'
              ? this.histogramBinIndexForDataX(targetX, store)
              : store.nearestXIndex(targetX);
      const xColumn = series.type === 'scatter' ? scatterXColumn(series) : 0;
      if (active && xColumn !== 0) {
        let distance = Infinity;
        dataIndex = null;
        for (let i = 0; i < store.length; i++) {
          const delta = Math.abs(store.valueAt(xColumn, i) - targetX);
          if (delta < distance) {
            distance = delta;
            dataIndex = i;
          }
        }
      }
      if (dataIndex === null) continue;
      const range = series.type === 'histogram' ? this.histogramBinRange(dataIndex, store) : null;
      const dataX = range ? (range.min + range.max) / 2 : store.valueAt(xColumn, dataIndex);
      const value = store.valueAt(column, dataIndex);
      const yScale = this.scales.get(series.yAxis ?? 'y');
      const formattedValue = Number.isFinite(value)
        ? this.formatAxisReadout(series.yAxis ?? 'y', value)
        : '';
      const point =
        target.points[count] ??
        (target.points[count] = {
          seriesIndex: si,
          dataIndex,
          label: series.label,
          color: '',
          value,
          formattedValue,
        });
      point.seriesIndex = si;
      point.dataIndex = dataIndex;
      point.dataX = dataX;
      point.label = series.label;
      point.color = series.color ?? palette[si % palette.length];
      point.value = value;
      point.formattedValue = formattedValue;
      point.meta = series.meta;
      if (count === 0) {
        target.dataIndex = dataIndex;
        target.dataX ??= dataX;
        target.formattedX = this.formatAxisValue(series.xAxis ?? 'x', target.dataX);
      }
      count++;
      if (active && this.cursorY !== null && yScale && Number.isFinite(value)) {
        const distance = Math.abs(yScale.dataToPixel(value) - this.cursorY);
        if (distance < nearestDist) {
          nearestDist = distance;
          target.activeSeriesIndex = si;
        }
      }
    }
    target.points.length = count;
    if (count === 0) {
      target.source = 'none';
      target.dataX = null;
      target.dataIndex = null;
    }
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

  private isValidColumn(columnIdx: number, store: DataStore): boolean {
    return Number.isInteger(columnIdx) && columnIdx >= 0 && columnIdx <= store.seriesCount;
  }

  private canUseGlobalXCursor(): boolean {
    if (this.sourceStores.length > 1) return false;
    return !this.config.series.some(
      (series) =>
        series.visible !== false && series.type === 'scatter' && scatterXColumn(series) !== 0,
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

  private shouldNiceAutoRange(scale: Scale, axis: AxisSpec, hasExactGeometry: boolean): boolean {
    if (hasExactGeometry || scale.type === 'time') return false;
    // Linear axes get clean 1/2/5 bounds by default. Log axes retain their
    // existing opt-in behavior because their padded powers-of-ten extent is
    // already meaningful; `nice: true` still rounds it to full decades.
    return scale.type === 'linear' ? axis.nice !== false : axis.nice === true;
  }

  /**
   * Expand a linear domain until the tick step selected from that domain is
   * stable. One pass can widen the range enough to select the next 1/2/5
   * interval, leaving a non-tick boundary behind (for example [-100, -85]
   * selecting a 10-unit step). A bounded loop keeps the range deterministic
   * while avoiding any renderer-specific endpoint insertion.
   */
  private niceAutoRange(scale: Scale, tickCount: number): void {
    // niceRange treats one or two requested ticks as a two-reference
    // fallback. Reapplying that fallback can keep widening the domain, so
    // leave those intentionally sparse ranges at their first result.
    const maxPasses = tickCount <= 2 ? 1 : 8;
    for (let pass = 0; pass < maxPasses; pass++) {
      const previousMin = scale.min;
      const previousMax = scale.max;
      scale.nice(tickCount);
      if (scale.min === previousMin && scale.max === previousMax) break;
    }
  }

  private scatterPointsInSelection(xRange: ScaleRange, yRange: ScaleRange) {
    const points = [];
    const palette = this.categoricalPalette();

    for (let si = 0; si < this.config.series.length; si++) {
      const series = this.config.series[si];
      const store = this.storeForSeries(si);
      if (store.length === 0) continue;
      if (series.visible === false || series.type !== 'scatter') continue;
      const xColumnIdx = scatterXColumn(series);
      const yColumnIdx = seriesYColumn(series);
      if (!this.isValidColumn(xColumnIdx, store) || !this.isValidColumn(yColumnIdx, store))
        continue;

      const fallbackColor = series.color ?? palette[si % palette.length];
      const style = this.scatterResolvers(si, series, fallbackColor).logicalResolver;

      for (let i = 0; i < store.length; i++) {
        const x = store.valueAt(xColumnIdx, i);
        const y = store.valueAt(yColumnIdx, i);
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
   * Plan automatic numeric bar centers and cell boundaries together, so
   * category padding cannot leave partial cells after tick thinning.
   */
  private planBarXAxis(
    rawValues: number[],
    xMin: number,
    xMax: number,
    tickCount: number,
  ): BarXAxisPlan | null {
    const values = Array.from(new Set(rawValues.filter((value) => Number.isFinite(value)))).sort(
      (a, b) => a - b,
    );
    if (values.length < 2 || !(xMax > xMin)) return null;

    let minimumGap = Infinity;
    for (let i = 1; i < values.length; i++) {
      const gap = values[i] - values[i - 1];
      if (gap > 0 && gap < minimumGap) minimumGap = gap;
    }
    if (!Number.isFinite(minimumGap)) return null;

    // Keep the interval readable at the requested density, but never let it
    // be narrower than the closest category spacing. The lower bound avoids
    // introducing multiple ticks inside a single category slot.
    const targetCount = Math.max(3, Math.floor(tickCount));
    const suggested = niceStep(xMin, xMax, targetCount);
    const minimumNice = this.niceIntervalAtLeast(minimumGap);
    const interval = Math.max(suggested, minimumNice);
    if (!(interval > 0) || !Number.isFinite(interval)) return null;

    const roundingEpsilon = 1e-12;
    let centerMin = Math.floor(xMin / interval + roundingEpsilon) * interval;
    let centerMax = Math.ceil(xMax / interval - roundingEpsilon) * interval;

    // BarRenderer sizes each category from its nearest local neighbor. For
    // irregular spacing, the outermost bar can therefore extend beyond a
    // simple half-interval edge. Keep expanding by whole tick intervals until
    // every category slot fits while retaining a regular grid.
    let geometryMin = Infinity;
    let geometryMax = -Infinity;
    for (let i = 0; i < rawValues.length; i++) {
      const value = rawValues[i];
      if (!Number.isFinite(value)) continue;
      const width = categoryWidthFromData((index) => rawValues[index], i, rawValues.length);
      geometryMin = Math.min(geometryMin, value - width * 0.5);
      geometryMax = Math.max(geometryMax, value + width * 0.5);
    }
    if (!Number.isFinite(geometryMin) || !Number.isFinite(geometryMax)) return null;
    const leftGap = (centerMin - interval * 0.5 - geometryMin) / interval;
    const rightGap = (geometryMax - centerMax - interval * 0.5) / interval;
    const leftSteps = leftGap > roundingEpsilon ? Math.ceil(leftGap - roundingEpsilon) : 0;
    const rightSteps = rightGap > roundingEpsilon ? Math.ceil(rightGap - roundingEpsilon) : 0;
    if (
      !Number.isSafeInteger(leftSteps) ||
      !Number.isSafeInteger(rightSteps) ||
      leftSteps > 10_000 ||
      rightSteps > 10_000
    )
      return null;
    centerMin -= leftSteps * interval;
    centerMax += rightSteps * interval;
    if (!Number.isFinite(centerMin) || !Number.isFinite(centerMax)) return null;

    const count = Math.round((centerMax - centerMin) / interval) + 1;
    // A malformed or extremely fine input should fall back to the existing
    // category path instead of allocating an unbounded tick list.
    if (count < 2 || count > 10_000) return null;

    const centers: number[] = [];
    const gridValues: number[] = [];
    const clean = (value: number) => Number(value.toPrecision(15));
    for (let i = 0; i < count; i++) {
      centers.push(clean(centerMin + i * interval));
      gridValues.push(clean(centerMin - interval / 2 + i * interval));
    }
    gridValues.push(clean(centerMax + interval / 2));
    return {
      values: centers,
      gridValues,
      domainMin: gridValues[0],
      domainMax: gridValues[gridValues.length - 1],
    };
  }

  private niceIntervalAtLeast(value: number): number {
    if (!(value > 0) || !Number.isFinite(value)) return 0;
    const magnitude = 10 ** Math.floor(Math.log10(value));
    const fraction = value / magnitude;
    const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
    return niceFraction * magnitude;
  }

  private axisMarkCoordinates(type: 'bar' | 'histogram'): number[] {
    const stores = new Set(
      this.config.series.flatMap((series, si) =>
        series.visible !== false && series.type === type && (series.xAxis ?? 'x') === 'x'
          ? [this.storeForSeries(si)]
          : [],
      ),
    );
    if (stores.size === 1) return Array.from([...stores][0].x);
    return [...new Set([...stores].flatMap((store) => Array.from(store.x)))].sort((a, b) => a - b);
  }

  private computeCustomXTicks(): CustomXTicks | undefined {
    const visibleSeries = this.config.series.filter((s) => s.visible !== false);

    // User-provided formatter on the X axis wins over the default numeric
    // one for categorical bar / histogram charts.
    const xAxisCfg = this.config.axes?.x;
    const userFormat = xAxisCfg?.format;
    const defaultFormat = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

    // Category ticks are capped to what the plot width can label legibly
    // (and to an explicit axes.x.tickCount when set): a year of daily bars
    // used to tick every day, smearing labels and gridlines into a band.
    const maxCategoryTicks = Math.min(
      Math.max(2, Math.floor(this.layout.plot.width / 65)),
      xAxisCfg?.tickCount ?? Number.POSITIVE_INFINITY,
    );

    // Histogram: X data = bin edges, use them as tick values
    const histSeries = visibleSeries.find((s) => s.type === 'histogram');
    if (histSeries && this.hasData()) {
      // X column contains bin edges directly (pre-computed by user)
      const edgeValues = thinTicks(this.axisMarkCoordinates('histogram'), maxCategoryTicks);
      return { values: edgeValues, format: userFormat ?? defaultFormat };
    }

    const xScale = this.scales.get('x');
    const barPlan = xScale ? this.barXAxisPlans.get('x') : undefined;
    const hasVisibleBar = visibleSeries.some((series) => series.type === 'bar');
    if (
      barPlan &&
      hasVisibleBar &&
      xScale?.type === 'linear' &&
      Math.abs(xScale.min - barPlan.domainMin) <=
        Math.abs(barPlan.domainMax - barPlan.domainMin) * 1e-12 &&
      Math.abs(xScale.max - barPlan.domainMax) <=
        Math.abs(barPlan.domainMax - barPlan.domainMin) * 1e-12 &&
      xAxisCfg?.nice !== false &&
      (!xAxisCfg?.ticks || xAxisCfg.ticks.length === 0) &&
      xAxisCfg?.min === undefined &&
      xAxisCfg?.max === undefined
    ) {
      return {
        values: barPlan.values,
        gridValues: barPlan.gridValues,
        format: userFormat ?? defaultFormat,
      };
    }

    // Bar chart: tick at each category X value
    const barSeries = visibleSeries.find((s) => s.type === 'bar');
    if (barSeries && this.hasData()) {
      const values = thinTicks(this.axisMarkCoordinates('bar'), maxCategoryTicks);
      return { values, format: userFormat ?? defaultFormat };
    }

    return undefined;
  }

  private hasOnlyVisibleHistograms(): boolean {
    if (this.sourceStores.length > 1) return false;
    let hasVisibleSeries = false;
    for (const series of this.config.series) {
      if (series.visible === false) continue;
      hasVisibleSeries = true;
      if (series.type !== 'histogram') return false;
    }
    return hasVisibleSeries;
  }

  /** The histogram bin under `dataX` (only-histogram charts, which have one source). */
  private resolveHistogramCursor(dataX: number): { dataIndex: number; dataX: number } | null {
    const store = this.sourceStores[0];
    const dataIndex = this.histogramBinIndexForDataX(dataX, store);
    if (dataIndex === null) return null;

    const range = this.histogramBinRange(dataIndex, store);
    if (!range) return null;
    return {
      dataIndex,
      dataX: (range.min + range.max) / 2,
    };
  }

  private histogramBinIndexForDataX(dataX: number, store: DataStore): number | null {
    if (store.length < 2) return null;

    const firstEdge = store.xAt(0);
    const lastEdge = store.xAt(store.length - 1);
    if (dataX < firstEdge || dataX > lastEdge) return null;

    let binIdx = store.upperBoundX(dataX);
    if (binIdx === store.length - 1 && dataX === lastEdge) {
      binIdx = store.length - 2;
    }

    if (binIdx < 0 || binIdx >= store.length - 1) return null;
    return binIdx;
  }

  private histogramBinRange(
    dataIndex: number,
    store: DataStore,
  ): { min: number; max: number } | null {
    if (dataIndex < 0 || dataIndex >= store.length - 1) return null;
    return {
      min: store.xAt(dataIndex),
      max: store.xAt(dataIndex + 1),
    };
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
  private formatAxisReadout(axisKey: string, value: number): string {
    const axisFormat = this.config.axes?.[axisKey]?.format;
    return axisFormat ? axisFormat(value) : this.formatReadout(axisKey, value);
  }

  private formatAxisValue(axisKey: string, value: number): string {
    const axisFormat = this.config.axes?.[axisKey]?.format;
    if (axisFormat) return axisFormat(value);
    return this.scales.get(axisKey)?.tickFormat(value) ?? String(value);
  }

  private formatHistogramBinRange(min: number, max: number, seriesIndex = 0): string {
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

  private isInPlotArea(x: number, y: number): boolean {
    const { plot } = this.layout;
    return (
      x >= plot.left && x <= plot.left + plot.width && y >= plot.top && y <= plot.top + plot.height
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
