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

import { CanvasManager } from './render/surface';
import { RenderScheduler } from './render/scheduler';
import { EventBus } from './interaction/bus';
import { computeLayout, inferPosition, type PlotInsets } from './layout';

import type { ColumnarSegment, DataStore } from './data/DataStore';
import { validateMaxLen } from './data/DataStore';
import { ColumnarStore } from './data/ColumnarStore';
import type { ColumnRangeIndex, ScatterColumnRangeIndex } from './data/columnRangeIndex';
import { RingColumnarStore } from './data/RingColumnarStore';
import { createScale } from './scales/createScale';
import {
  DEFAULT_INTERACTION_SAMPLING,
  MIN_TOUCH_INTERACTION_SAMPLING,
  MIN_DRAG_DISTANCE,
  TOUCH_INTERACTION_POINTS_PER_PIXEL,
} from '../constants';

import { formatValue, scaleStepDecimals } from './format';
import { deepMerge } from './merge';
import { DEFAULT_CONFIG } from './defaults';
import { applyThemeToElement, resolveTheme } from './theme/resolve';

import { type AxesRenderResult, renderAxes, thinTicks, updateDOMLabels } from './axes/render';
import {
  renderLineSegments,
  renderAreaSegments,
  renderBandSegments,
  type LineRenderSegment,
} from './marks/line';
import { m4 } from './data/m4';
import { isDensityScatterSeries, renderScatterSegments, ScatterSeriesCache } from './marks/scatter';
import {
  buildScatterEncodingState,
  normalizeScatterColorBy,
  normalizeScatterSizeBy,
  resolverFromEncodingState,
  type ScatterStyleResolver,
  seriesYColumn,
  scatterXColumn,
  type ScatterPalettes,
} from './marks/scatterEncoding';
import { renderBarsSegments } from './marks/bar';
import { barRectForCategory, categoryWidthFromData } from './marks/barGeometry';
import { renderHistogramSegments } from './marks/histogram';
import {
  renderBrushSelection,
  renderCrosshair,
  renderSelectionBox,
  renderTapRing,
} from './render/overlay';

import { GestureManager } from './interaction/gestures';
import { HitTester } from './hit';
import { TooltipManager } from '../interaction/TooltipManager';

import { type HostedPlugin, PluginHost } from './plugins';
import { isDarkColor } from '../utils/color';
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
  zoomedScaleRange,
  canZoomFromAnchor,
  applyUniformZoom,
  scaleDomainSpan,
  pannedScaleRange,
  applyViewportChange,
} from './viewport';
import {
  getSelection,
  setSelection,
  reconcileSelectionForDataChange,
  isBrushMode,
  brushPixelRange,
  brushStart,
  brushUpdate,
  brushEnd,
  scatterPointsInSelection,
} from './selection';

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
  /** The plot rectangle in CSS pixels from the canvases' top-left corner (replaces getLayout()). */
  readonly plot: { left: number; top: number; width: number; height: number };
  /** The last layout: the canvas size, the plot and each axis' side and area (replaces getLayout()). */
  readonly layout: Layout;
  /** The resolved theme roles (replaces getTheme()). */
  readonly theme: Readonly<ThemeConfig>;
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
export class ChartCore implements EngineHost {
  coordinatingAxis = false;

  // Public
  readonly container: HTMLElement;

  // Internal modules
  private canvasManager: CanvasManager;
  scheduler: RenderScheduler;
  private eventBus: EventBus;
  sourceStores: DataStore[] = [];
  seriesSources: readonly number[] = [];
  scales: Map<string, Scale> = new Map();
  layout!: Layout;
  private layoutCacheKey = '';
  private theme!: ThemeConfig;
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
  private hitTester: HitTester;
  private tooltipManager: TooltipManager;
  private plugins = new PluginHost<unknown>();

  // Config
  config: ChartSpec;

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
  private tapFeedback: { x: number; y: number; startTime: number } | null = null;
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
  private highlightedSeries: number | null = null;

  /** Bumped by every data change: the range index and the hit and density caches key on it. */
  dataVersion = 0;
  // D31 debug counters; see DebugSnapshot. Ring stores share this object.
  private debugCounters = {
    ingestCount: 0,
    materializeCount: 0,
    renderCount: { grid: 0, data: 0, overlay: 0 },
  };
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
  naturalExtent = new Map<string, [number, number]>();
  barXAxisPlans = new Map<string, BarXAxisPlan>();
  /** A chart group's minimum side gutters (`setPlotInsets`). */
  private plotInsets: PlotInsets = {};
  /** naturalGutters()'s cache, keyed by the layout inputs. */
  private natural?: { key: string; left: number; right: number };

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

    // 9. Plugins are added after construction: the built-in annotations through use(), the
    // user's through setPlugins() once the owner's handle exists (plan D21).

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
   * The side gutters a chart group's `alignPlots` asks for (plan D17): the widest of its
   * members'. Applied only when they change, as a relayout: no options pass, no ingest.
   */
  setPlotInsets(insets: PlotInsets): void {
    if (this.destroyed) return;
    if (insets.left === this.plotInsets.left && insets.right === this.plotInsets.right) return;
    this.plotInsets = { ...insets };
    this.updateLayout();
    this.updateScalePixelRanges();
    this.refreshCursor();
    this.scheduler.markDirty(DirtyFlag.ALL);
  }

  /**
   * The side gutters this chart needs on its own, without any group's insets: what its
   * measured axes take. Cached with the layout inputs.
   */
  naturalGutters(): { left: number; right: number } {
    const width = this.canvasManager.cssWidth || 600;
    const height = this.canvasManager.cssHeight || 400;
    const key = `${this.createLayoutCacheKey(width, height)}|natural`;
    if (this.natural?.key !== key) {
      const layout = computeLayout(
        width,
        height,
        this.config,
        this.scales,
        this.canvasManager.dpr,
        this.theme.fontFamily,
        this.theme.fontSize,
      );
      this.natural = {
        key,
        left: layout.plot.left,
        right: layout.width - layout.plot.left - layout.plot.width,
      };
    }
    return { left: this.natural.left, right: this.natural.right };
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
    this.refreshCursor();
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
    this.refreshCursor();
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
    this.updateLayout();
    this.updateScalePixelRanges();
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

  /** The data X of the cursor, or `null` when there is none. */
  getCursorX(): number | null {
    return this.cursorDataX;
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
      renderCount: { ...this.debugCounters.renderCount },
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
      plot: Object.freeze({ ...this.layout.plot }),
      layout: this.layout,
      theme: Object.freeze({ ...this.theme }),
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

    autoRange(this);
    // A configured follow window overrides full-extent X on first paint and
    // after a config replace, as long as the user has not paused following.
    if (this.following) applyFollowWindow(this);
  }

  /**
   * The most scatter points drawn per frame during a gesture, or null when sampling is off.
   * `culledByX`: the series' X is the store's X, so its segments hold the in-view points only.
   */
  interactionSamplingBudget(culledByX = false): number | null {
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

  scatterResolvers(si: number, series: SeriesSpec, fallbackColor: string) {
    const store = this.storeForSeries(si);
    const cached = this.scatterEncodingCache.get(si);
    if (
      cached &&
      cached.series === series &&
      cached.theme === this.theme &&
      cached.version === this.dataVersion
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
      version: this.dataVersion,
      renderResolver: resolverFromEncodingState(state, physicalValueAt),
      logicalResolver: resolverFromEncodingState(state, logicalValueAt),
    };
    this.scatterEncodingCache.set(si, entry);
    return entry;
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
      this.plotInsets,
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
    return [
      width,
      height,
      this.canvasManager.dpr,
      this.theme.fontFamily,
      this.theme.fontSize,
      this.plotInsets.left,
      this.plotInsets.right,
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
          const [min, max] = pannedScaleRange(scale, delta);
          applyViewportChange(this, axis, min, max);
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
            const [min, max] = pannedScaleRange(scale, dx);
            applyViewportChange(this, key, min, max);
          } else if (!isHoriz && (pan.y || userZoomed)) {
            const [min, max] = pannedScaleRange(scale, dy);
            applyViewportChange(this, key, min, max);
          }
        }
      }
    });

    // ── Zoom (factor at anchor point) ──
    this.eventBus.on('action:zoom', ({ factor, anchorX, anchorY, axis }) => {
      const zoom = this.config.zoom ?? { enabled: true, x: true };
      if (!zoom.enabled) return;

      const axisConfigs = this.config.axes ?? {};
      if (!canZoomFromAnchor(this, axis, anchorX, anchorY, zoom.axis === true, axisConfigs)) return;

      if (axis === 'xy') {
        applyUniformZoom(this, factor, anchorX, anchorY);
      } else {
        // Zoom a specific axis by key
        const scale = this.scales.get(axis);
        if (scale) {
          const pos = inferPosition(axis, axisConfigs[axis]?.position);
          const isHoriz = pos === 'bottom' || pos === 'top';
          const anchorPx = isHoriz ? anchorX : anchorY;
          const [newMin, newMax] = zoomedScaleRange(scale, anchorPx, factor);
          // minRange/maxRange are enforced in the scale's own span metric
          // (`scaleDomainSpan`): a data-unit span for linear/time axes, a
          // log10-decade span for log axes. Measuring in that metric keeps the
          // limit consistent with how `zoomedScaleRange` applies the factor,
          // and applies to vertical axes too, not just horizontal.
          const span = scaleDomainSpan(scale, newMin, newMax);
          if (zoom.minRange && span < zoom.minRange) return;
          if (zoom.maxRange && span > zoom.maxRange) return;
          if (isHoriz) {
            if (zoom.x !== false) applyViewportChange(this, axis, newMin, newMax);
          } else {
            applyViewportChange(this, axis, newMin, newMax);
          }
        }
      }
    });

    // ── Box selection (start/update/end) ──
    this.eventBus.on('action:box-start', ({ x, y }) => {
      if (isBrushMode(this)) {
        brushStart(this, x);
        this.scheduler.markDirty(DirtyFlag.OVERLAY);
        return;
      }
      this.selectionBox = { x1: x, y1: y, x2: x, y2: y };
      this.updateLocalCursorFromPoint(x, y, this.lastPointerType);
      this.scheduler.markDirty(DirtyFlag.OVERLAY);
    });

    this.eventBus.on('action:box-update', ({ x, y }) => {
      if (isBrushMode(this)) {
        brushUpdate(this, x);
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
      if (isBrushMode(this)) {
        brushEnd(this);
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
          points: selectionY ? scatterPointsInSelection(this, selectionX, selectionY) : undefined,
        };
        this.emitEvent('select', selection);
        this.config.selection?.onSelect?.(selection);
      }

      if (zoom.enabled !== false) {
        if (zoom.x !== false && selectionX) {
          applyViewportChange(this, 'x', selectionX.min, selectionX.max);
        }
        if (zoom.y && selectionY) {
          applyViewportChange(this, 'y', selectionY.min, selectionY.max);
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
      this.dataVersion,
      (si) =>
        this.scatterResolvers(
          si,
          this.config.series[si],
          palette[(this.config.series[si]?.paletteIndex ?? si) % palette.length],
        ).logicalResolver,
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
      this.plugins.draw('below', this.canvasManager.gridCtx, this, this.layout.plot);
      this.debugCounters.renderCount.grid++;
    }

    // Step 4b: Data layer (series marks)
    if (flags & DirtyFlag.DATA) {
      this.canvasManager.clear('data');
      this.renderAllSeries();
      this.plugins.draw('above', this.canvasManager.dataCtx, this, this.layout.plot);
      this.debugCounters.renderCount.data++;
    }

    // Step 4c: Overlay layer (crosshair, tooltip)
    if (flags & DirtyFlag.OVERLAY) {
      this.canvasManager.clear('overlay');
      this.renderOverlay();
      this.plugins.draw('overlay', this.canvasManager.overlayCtx, this, this.layout.plot);
      this.debugCounters.renderCount.overlay++;
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

      const color = series.color ?? palette[(series.paletteIndex ?? si) % palette.length];
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
      const rect = brushPixelRange(this);
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
        this.dataVersion,
        (si) => {
          const series = this.config.series[si];
          const fallback = series.color ?? palette[(series.paletteIndex ?? si) % palette.length];
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

      const color = series.color ?? palette[(series.paletteIndex ?? si) % palette.length];

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

      const color = series.color ?? palette[(series.paletteIndex ?? si) % palette.length];
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
      const color = s.color ?? palette[(s.paletteIndex ?? si) % palette.length];

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
      point.color = series.color ?? palette[(series.paletteIndex ?? si) % palette.length];
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

  categoricalPalette(): string[] {
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

  isValidColumn(columnIdx: number, store: DataStore): boolean {
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

  /** Re-run tooltip hit-test at current cursor position (called on data change) */
  refreshCursor(): void {
    if (this.mouseX === null || this.mouseY === null || !this.cursorIsLocal) return;
    this.updateTooltipPoints();
    this.scheduler.markDirty(DirtyFlag.OVERLAY);
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

  isInPlotArea(x: number, y: number): boolean {
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
