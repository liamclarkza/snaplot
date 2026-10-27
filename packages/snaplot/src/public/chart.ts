/**
 * The createChart facade: normalize → classify → ingest or describe → the engine (plan §3.1,
 * D3, D16). State options and every notification go through one dispatcher (`./state.ts`).
 */
import { ChartCore } from '../engine/Engine';
import { inferPosition } from '../engine/layout';
import { ColumnarStore } from '../engine/data/ColumnarStore';
import { fail, hint } from '../engine/errors';
import type { ScaleRange, SelectionRange, TooltipPoint } from '../engine/spec';
import { createReferenceLinesPlugin, createReferenceRegionsPlugin } from '../engine/annotations';
import { settleRange } from '../engine/ranging';
import { appendRows, categoryLabels } from './append';
import { classify, sameData, STATE_KEYS, type StateKey, type Work } from './classify';
import {
  broadcast,
  coordinate,
  createChartGroup,
  type GroupCandidate,
  type GroupMember,
  groupOptions,
  membership,
  paletteIndex,
  validateGroup,
} from './group';
import { type Churn, noteChurn, noteReplacedStreams } from './churn';
import { companions } from './companion';
import { accessibleName } from '../adapters/name';
import { describeOptions } from './describe';
import { ingest } from './ingest';
import { mountLegend } from './legend';
import { chartScale, cursorValue } from './axes';
import { categoryItems, chartPoint, cursorSnapshot, selectionWithPoints } from './points';
import { type NormalizedOptions, type NormalizedState, normalize } from './normalize';
import { equivalent, patchOptions } from './options';
import { type Ingested, type IngestContext, retainedSource } from './sources';
import { publicHandle } from './handle';
import { Dispatcher, EVENTS, OPTION_OF, type ReportedKey } from './state';
import type {
  AppendOptions,
  ChartEvents,
  ChartGroup,
  ChartHandle,
  ChartOptions,
  ChartPatch,
  ChartPoint,
  ChartScale,
  ChartState,
  CursorSnapshot,
  DataSource,
  Selection,
  SeriesState,
  CursorOptions,
  Viewport,
} from './types';

export { createChartGroup };

/** Each state option's value when it is not given (plan D3). */
const DEFAULTS: { [K in StateKey]-?: NonNullable<NormalizedState[K]> | null } = {
  viewport: {},
  selection: null,
  hiddenSeries: [],
  highlight: null,
};

type Interval = readonly [number, number];
const interval = (range: ScaleRange): Interval => Object.freeze([range.min, range.max] as const);

class Controller<Row> implements ChartHandle<Row>, GroupMember {
  readonly container: HTMLElement;
  /** The public handle: the fourteen members of plan §4.4 and the debug symbol. */
  readonly handle: ChartHandle<Row>;
  // The engine and the options as normalized and ingested: internal, read by the sibling
  // modules (points.ts, append.ts) that hold parts of the controller.
  engine: ChartCore;
  options: ChartOptions<Row>;
  normalized: NormalizedOptions<Row>;
  ingested: Ingested<Row>;
  /** The state options last applied from options (plan D3). */
  private appliedState: NormalizedState = {};
  /** Identity-only accessor changes in a row, and their times (plan D16). */
  private churn: Churn = { streak: 0, times: [], ingests: [] };
  /** The one X pass per source and append batch (plan §3.4), for the debug symbol. */
  private counters = { xValidations: 0 };
  private hidden = new Set<string>();
  /** getState()'s snapshot, taken at its revision. */
  private cold?: ChartState;
  private events: Dispatcher<ChartEvents<Row>>;
  private off: Array<() => void> = [];
  private mutating = false;
  private destroyed = false;
  private regions = createReferenceRegionsPlugin({ regions: [] });
  private lines = createReferenceLinesPlugin({
    lines: [],
    avoid: (chart, ctx) => this.regions.labelBoxes(chart, ctx),
  });
  /** The built-in legend: its placement and how to unmount it. */
  private legend?: { position: 'top' | 'bottom'; unmount: () => void };

  constructor(element: HTMLElement, options: ChartOptions<Row>) {
    this.container = element;
    this.handle = publicHandle(this);
    const normalized = normalize(options);
    this.normalized = normalized;
    this.options = normalized.options;
    this.ingested = ingest(normalized, this.context(normalized, false));
    validateGroup(normalized.group, this.candidate(this.ingested));
    this.validateState(normalized.state, this.ingested);
    if (normalized.state.hiddenSeries) this.hidden = new Set(normalized.state.hiddenSeries);
    const config = this.configFor(this.ingested, normalized);
    this.events = new Dispatcher<ChartEvents<Row>>(
      EVENTS,
      (key) => this.read(key),
      (event, value) => this.callback(event, value),
      (key, value) =>
        key === 'selection' && value ? selectionWithPoints(this, value as Selection) : value,
    );
    // User plugin install hooks need the completed public handle, not a half-built engine,
    // so plugins are installed below, and the engine's first paint waits for them.
    this.engine = new ChartCore(
      element,
      config,
      { sources: this.columns(), seriesSources: this.ingested.seriesSources },
      /* deferFirstPaint */ true,
      /* trusted: ingest validated every source */ true,
    );
    // Plan D31: untyped debug counters for tests and the bench, never part of
    // ChartHandle. Non-enumerable so nothing that walks the handle sees it.
    Object.defineProperty(this.handle, Symbol.for('snaplot.debug'), {
      get: () =>
        Object.freeze(
          Object.defineProperties(
            {},
            {
              ...Object.getOwnPropertyDescriptors(this.engine.debugSnapshot()),
              xValidations: { value: this.counters.xValidations, enumerable: true },
            },
          ),
        ),
    });
    companions.set(this.handle, {
      toggle: (id) => this.toggleSeries(id),
      highlight: (id) => this.syncHighlight(id),
      highlighted: () => this.read('highlight') as string | null,
      series: () => this.getState().series,
      cursor: (fallback) => this.getCursor({ fallback }),
      xTitle: () => this.ingested.spec.axes?.x?.title,
      observe: (listener) => this.events.observe(listener),
      categories: () => categoryItems(this),
      reserve: (side, px) => this.engine.reserveChrome(side, px),
    });
    try {
      this.applyAccessibleName();
      this.bindEngine();
      this.lines.setLines(this.ingested.referenceLines);
      this.regions.setRegions(this.ingested.referenceRegions);
      // Built-in annotations first, then the user's plugins, which install with the handle.
      this.engine.use(this.regions);
      this.engine.use(this.lines);
      this.engine.setPlugins(normalized.plugins, this.handle);
      this.mutating = true;
      try {
        this.applyState(this.stateChanges(normalized));
      } finally {
        this.mutating = false;
      }
      this.syncLegend();
      // Join the group first, so the shared gutters and Y range are in place for the one mount
      // paint (gap-scale-longevity-05).
      membership(normalized.group, this, true);
      coordinate(normalized.group);
      // The mount paint: nothing repaints an unchanged box after it, so it must
      // draw the annotations, plugins and the legend's space (gap-annotations-extensibility-06:mount).
      this.engine.paint();
      this.events.reset();
    } catch (error) {
      // Every option is checked before the engine exists. Should anything here throw anyway,
      // the caller gets no handle to destroy, so leave the container as it was.
      this.destroy();
      throw error;
    }
  }

  private columns() {
    return this.ingested.sources.map((source) => source.columns);
  }

  private candidate(ingested: Ingested<Row>): GroupCandidate {
    return { categories: categoryLabels(ingested), axes: ingested.spec.axes ?? {} };
  }

  /**
   * The ingest context: streamed sources are re-read from what the chart retains, and sources
   * whose input and readers are unchanged are reused (plan D16), unless `forceData` replaces
   * the chart data.
   */
  context(normalized: NormalizedOptions<Row>, forceData: boolean): IngestContext<Row> {
    const previous = this.ingested as Ingested<Row> | undefined;
    const previousTypes = previous ? this.previousTypes(normalized) : new Map();
    return {
      counters: this.counters,
      previousEncodings: previous?.encodings,
      previousCategories: previous?.categories,
      previousTypes,
      ...(previous ? { previous: { sources: previous.sources, options: this.normalized } } : {}),
      ...(forceData ? { replace: normalized.data } : {}),
      retained: (input, axis, x) => {
        if (!previous || (forceData && input === normalized.data)) return undefined;
        const exact = previous.sources.findIndex(
          (s) => s.streamed && sameData(s.declared, input) && s.axis === axis && s.x === x,
        );
        const at =
          exact >= 0
            ? exact
            : previous.sources.findIndex(
                (s) => s.streamed && sameData(s.declared, input) && s.axis === axis,
              );
        return at < 0
          ? undefined
          : retainedSource(previous.sources[at], this.engine.getSourceData(at));
      },
    };
  }

  /** The axis types to keep for inferred axes that hold no data (as ingest keeps them). */
  private previousTypes(normalized: NormalizedOptions<Row>) {
    return new Map(
      Object.entries(this.ingested.spec.axes ?? {})
        .filter(([key]) => normalized.axes[key]?.type === undefined)
        .map(([key, axis]) => [key, axis.type ?? 'linear'] as const),
    );
  }

  /**
   * Check the state options against an ingest before anything changes (plan D3, D23).
   * normalize() has checked the ranges and
   * the series ids; this checks what needs the axes: each viewport key names an axis the
   * engine builds (`x`, `y` or an axis of the spec), and a log axis takes bounds above 0.
   */
  private validateState(state: NormalizedState, ingested: Ingested<Row>): void {
    const axes = ingested.spec.axes ?? {};
    for (const [key, range] of Object.entries(state.viewport ?? {})) {
      if (key !== 'x' && key !== 'y' && !Object.hasOwn(axes, key))
        fail(
          `viewport names axis "${key}", which this chart does not have.${hint(key, new Set(['x', 'y', ...Object.keys(axes)]))}`,
        );
      if (axes[key]?.type === 'log' && range.min <= 0)
        fail(
          `viewport.${key} is [${range.min}, ${range.max}], but axis "${key}" is a log axis: give bounds above 0.`,
        );
    }
  }

  /**
   * The state options to apply (plan D3): every state key an update() names, even with the
   * value it already has (`undefined` is the default); for complete options, each one that
   * differs from the value last applied from options (an absent key is its default).
   */
  private stateChanges(
    normalized: NormalizedOptions<Row>,
    named?: ReadonlySet<string>,
  ): Array<[StateKey, NormalizedState[StateKey]]> {
    const changes: Array<[StateKey, NormalizedState[StateKey]]> = [];
    for (const key of STATE_KEYS) {
      const value = normalized.state[key];
      if (named ? named.has(key) : !equivalent(value, this.appliedState[key]))
        changes.push([key, value]);
    }
    return changes;
  }

  /**
   * Apply state options (plan D3). They change the chart at once and silently: the value is
   * the caller's, so no event reports it. validateState() has checked them.
   */
  private applyState(changes: Array<[StateKey, NormalizedState[StateKey]]>): void {
    for (const [key, given] of changes) {
      (this.appliedState as Record<string, unknown>)[key] = given;
      const value = given ?? DEFAULTS[key];
      this.events.quiet(key);
      if (key === 'viewport') {
        this.engine.applyViewport(value as Record<string, ScaleRange>);
      } else if (key === 'selection') {
        this.engine.setSelection(value as SelectionRange | null);
      } else if (key === 'hiddenSeries') {
        this.setHidden(new Set(value as string[]));
      } else {
        const index = value ? this.ingested.seriesIds.indexOf(value as string) : -1;
        this.engine.setHighlight(index < 0 ? null : index);
      }
    }
  }

  /** Show and hide series (hidden ids the chart does not have are dropped). */
  private setHidden(hidden: Set<string>): void {
    if (equivalent([...hidden], [...this.hidden])) return;
    this.hidden = hidden;
    this.engine.setOptions({
      series: this.engine.getOptions().series.map((series, si) => ({
        ...series,
        visible: !hidden.has(this.ingested.seriesIds[si]),
      })),
    });
    this.events.mark('hiddenSeries');
  }

  configFor(ingested: Ingested<Row>, normalized: NormalizedOptions<Row>) {
    // Render functions are read through the latest options when called (plan D16): a new
    // identity is a repaint, and these wrappers stay the same.
    return {
      ...ingested.spec,
      tooltip: {
        ...ingested.spec.tooltip,
        ...(normalized.tooltip.render
          ? {
              render: (points: TooltipPoint[]) =>
                this.normalized.tooltip.render!(
                  points.map((point) => this.point(point.seriesIndex, point.dataIndex, point)),
                ),
            }
          : {}),
      },
      series: (ingested.spec.series ?? []).map((series, index) => {
        const id = ingested.seriesIds[index];
        const slot = paletteIndex(normalized.group, id);
        return {
          ...series,
          ...(slot === undefined ? {} : { paletteIndex: slot }),
          visible: !this.hidden.has(id),
          ...(normalized.series[index]?.pointColor
            ? {
                fill: (value: number, rowIndex: number) => {
                  const si = this.ingested.seriesIds.indexOf(id);
                  const source = this.ingested.sources[this.ingested.seriesSources[si]];
                  const at = source.head + rowIndex;
                  return this.normalized.series[si]!.pointColor!(
                    value,
                    source.rows?.[at],
                    source.index ? source.index[at] : source.evicted + rowIndex,
                  );
                },
              }
            : {}),
        };
      }),
    };
  }

  update(patch: ChartPatch<Row>): void {
    // State options apply once; a later update() carries only the ones it names (plan D3).
    const current = { ...this.options };
    for (const key of STATE_KEYS) delete current[key];
    this.apply(patchOptions(current, patch), new Set(Object.keys(patch)));
  }

  setOptions(options: ChartOptions<Row>): void {
    this.apply(options);
  }

  /**
   * Apply options through the diff classifier (plan D16). `named` lists the keys an update()
   * patch names, each of which counts as changed; without it every key is compared with the
   * last applied options (setOptions). State options follow plan D3 (stateChanges()).
   */
  private apply(input: ChartOptions<Row>, named?: ReadonlySet<string>) {
    if (this.destroyed) return;
    this.events.batch(() => {
      const normalized = normalize(input);
      const work = classify(this.normalized, normalized, named);
      const state = this.stateChanges(normalized, named);
      const applyState = () => this.applyState(state);
      const checked = Object.fromEntries(state) as NormalizedState;
      if (work.data || work.accessor) {
        noteChurn(this.churn, this.ingested, normalized, work);
        const ingested = ingest(normalized, this.context(normalized, named?.has('data') ?? false));
        this.validateState(checked, ingested);
        validateGroup(normalized.group, this.candidate(ingested), this);
        noteReplacedStreams(this.ingested, ingested);
        this.commit(normalized, ingested, applyState);
        return;
      }
      this.churn.streak = 0;
      // Presentation only: describe the new options over the data the chart holds, check
      // everything, then apply; a rejected call leaves the chart and its options as they were.
      const ingested =
        work.engine || work.annotations
          ? {
              ...this.ingested,
              ...describeOptions(normalized, this.ingested, this.previousTypes(normalized)),
            }
          : this.ingested;
      this.validateState(checked, ingested);
      if (work.group) validateGroup(normalized.group, this.candidate(ingested), this);
      this.present(normalized, ingested, work, applyState, state.length > 0);
    });
  }

  /**
   * Apply a change that reads no data: engine options, annotations, plugins, group and name.
   * Options equal to the last applied ones (or differing only in callbacks, read through the
   * latest options) commit nothing, so the revision stays and no subscriber is called.
   */
  private present(
    normalized: NormalizedOptions<Row>,
    ingested: Ingested<Row>,
    work: Work,
    after: () => void,
    stateChanged: boolean,
  ): void {
    const previous = this.options;
    this.ingested = ingested;
    this.options = normalized.options;
    this.normalized = normalized;
    // A group change moves the palette slots of series without a colour (plan D17).
    if (work.engine || work.group) this.engine.replaceOptions(this.configFor(ingested, normalized));
    // Plugins are reconciled by id: an inline object with a known id only repaints (D21).
    if (work.plugins) this.engine.setPlugins(normalized.plugins, this.handle);
    if (work.annotations) {
      this.lines.setLines(ingested.referenceLines);
      this.regions.setRegions(ingested.referenceRegions);
    }
    if (work.aria) this.applyAccessibleName();
    if (work.engine) this.syncLegend();
    after();
    if (work.group) this.moveGroup(previous.group, normalized.options.group);
    if (work.engine || work.annotations || work.plugins || work.group || work.aria || stateChanged)
      this.publish();
    if (work.group) coordinate(previous.group);
    if (work.engine || work.group) coordinate(this.options.group);
  }

  private moveGroup(from: ChartGroup | undefined, to: ChartGroup | undefined): void {
    if (from === to) return;
    membership(from, this, false);
    if (from) this.detachGroup(from);
    membership(to, this, true);
  }

  /**
   * Swap in a new ingest as one transaction. Callers check the options and the state options
   * against `ingested` first, so nothing after replaceSources() throws; if the
   * engine rejects the candidate, everything is restored. `quiet` re-stores the same data
   * (appendData() storing a scatter unsorted), which publishes and emits nothing.
   */
  commit(
    normalized: NormalizedOptions<Row>,
    ingested: Ingested<Row>,
    after?: () => void,
    quiet = false,
  ): void {
    const previous = {
      ingested: this.ingested,
      options: this.options,
      normalized: this.normalized,
      hidden: this.hidden,
    };
    const next = normalized.options;
    const highlighted = this.read('highlight') as string | null;
    this.hidden = new Set([...this.hidden].filter((id) => ingested.seriesIds.includes(id)));
    let replaced = false;
    try {
      this.ingested = ingested;
      this.options = next;
      this.normalized = normalized;
      this.engine.replaceSources(
        this.configFor(ingested, normalized),
        this.columns(),
        ingested.seriesSources,
        /* trusted */ true,
      );
      replaced = true;
      this.engine.setPlugins(normalized.plugins, this.handle);
      this.lines.setLines(ingested.referenceLines);
      this.regions.setRegions(ingested.referenceRegions);
      this.engine.setHighlight(highlighted ? ingested.seriesIds.indexOf(highlighted) : null);
      this.applyAccessibleName();
      this.syncLegend();
      after?.();
      this.moveGroup(previous.options.group, next.group);
    } catch (error) {
      // replaceSources() checks its candidate before it replaces a store. Once the engine holds
      // the new sources, the facade keeps the ingest that matches them: restoring the previous
      // one would report its rows and ids for the new points.
      if (!replaced) {
        this.ingested = previous.ingested;
        this.options = previous.options;
        this.normalized = previous.normalized;
        this.hidden = previous.hidden;
      }
      throw error;
    }
    if (quiet) return;
    this.events.mark('hiddenSeries');
    this.publish();
    if (previous.options.group !== next.group) coordinate(previous.options.group);
    coordinate(this.options.group);
  }

  /** Rows added to the sources, as one batch of notifications (`public/append.ts`). */
  appendData(data: DataSource<Row>, options: AppendOptions = {}): void {
    if (this.destroyed) return;
    this.events.batch(() => appendRows(this, data, options));
  }

  /** The cold state: one frozen snapshot per revision (plan §3.2). */
  getState(): ChartState {
    if (this.cold?.revision !== this.events.revision) this.cold = this.readState();
    return this.cold;
  }
  subscribe(listener: () => void): () => void {
    return this.events.subscribe(listener);
  }
  on<K extends keyof ChartEvents<Row>>(
    event: K,
    listener: (value: ChartEvents<Row>[K]) => void,
  ): () => void {
    return this.events.on(event, listener);
  }
  private emit<K extends keyof ChartEvents<Row>>(event: K, value: ChartEvents<Row>[K]): void {
    if (this.destroyed) return;
    this.events.emit(event, value);
  }

  /** Call the on<Key>Change option of an event, through the latest options (plan D16). */
  private callback(event: keyof ChartEvents<Row>, value: unknown): void {
    const name = OPTION_OF[event as keyof typeof OPTION_OF];
    if (name) (this.normalized.callbacks[name] as ((value: unknown) => void) | undefined)?.(value);
  }

  /** The current value of a reported state key. */
  private read(key: ReportedKey): unknown {
    switch (key) {
      case 'viewport':
        return this.viewport();
      case 'selection':
        return this.selection();
      case 'hiddenSeries':
        return Object.freeze([...this.hidden]);
      case 'highlight':
        return this.ingested.seriesIds[this.engine.getHighlight() ?? -1] ?? null;
      default:
        return this.engine.isFollowing();
    }
  }

  /** The pinned axes, as `[from, to]` (plan D3). */
  private viewport(): Viewport {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(this.engine.pinnedAxes()).map(([key, range]) => [key, interval(range)]),
      ),
    );
  }

  private selection(): (Selection & { readonly x: Interval }) | null {
    const selection = this.engine.getSelection();
    return selection
      ? Object.freeze({
          x: interval(selection.x),
          ...(selection.y ? { y: interval(selection.y) } : {}),
        })
      : null;
  }

  /**
   * Show or hide the built-in legend as the `legend` option asks (plan D6, §5.6): `'auto'` shows
   * it for two or more series, or for a series coloured by category. It takes its space from the
   * chart's own layout (`reserveChrome`), so any container height works.
   */
  private syncLegend(): void {
    if (this.destroyed) return;
    const option = this.normalized.engine.legend ?? 'auto';
    const show =
      option === true ||
      typeof option === 'object' ||
      (option === 'auto' &&
        (this.ingested.seriesIds.length >= 2 || categoryItems(this).length > 0));
    const position = typeof option === 'object' ? (option.position ?? 'top') : 'top';
    if (this.legend && (!show || this.legend.position !== position)) {
      this.legend.unmount();
      this.legend = undefined;
    } else if (this.legend || !show) return;
    if (show)
      this.legend = { position, unmount: mountLegend(this.handle, this.engine.root, { position }) };
  }

  /** A legend click: show or hide one series, reported as `hiddenSeries:change`. */
  private toggleSeries(id: string): void {
    if (this.destroyed || !this.ingested.seriesIds.includes(id)) return;
    const hidden = new Set(this.hidden);
    if (hidden.has(id)) hidden.delete(id);
    else hidden.add(id);
    this.events.batch(() => this.setHidden(hidden));
    coordinate(this.options.group);
  }

  /** Return every axis to its automatic range; reports `{}` once if anything was pinned. */
  resetViewport(): void {
    if (this.destroyed) return;
    this.events.batch(() => this.engine.resetZoom());
  }
  /** A group peer's horizontal viewport: pin the same axis, or reset with `null` (plan D17). */
  syncViewport(key: string, range: ScaleRange | null): void {
    if (this.destroyed) return;
    if (range === null) this.resetViewport();
    else if (this.engine.getAxis(key)) this.events.batch(() => this.engine.setAxis(key, range));
  }
  axisKind(key: string): string | undefined {
    const axis = this.engine.getAxis(key);
    if (!axis) return undefined;
    return this.ingested.categories.has(key) ? 'category' : axis.type;
  }
  private isHorizontal(key: string): boolean {
    const position = inferPosition(key, this.engine.getOptions().axes?.[key]?.position);
    return position === 'bottom' || position === 'top';
  }
  resumeFollow(): void {
    if (this.destroyed) return;
    this.events.batch(() => this.engine.scrollToLatest());
  }
  /** A group's highlight: a series this chart lacks clears its highlight. */
  syncHighlight(id: string | null): void {
    const index = id === null ? -1 : this.ingested.seriesIds.indexOf(id);
    this.events.batch(() => this.engine.setHighlight(index < 0 ? null : index));
  }
  seriesIds(): readonly string[] {
    return this.ingested.seriesIds;
  }
  setCursor(x: number | Date | string | null): void {
    this.engine.setCursorDataX(this.cursorX(x));
  }
  /** A group's cursor: a value this chart cannot read hides its cursor. */
  syncCursor(x: number | Date | string | null): void {
    let value: number | null = null;
    try {
      value = this.cursorX(x);
    } catch {}
    this.engine.setCursorDataX(value);
  }
  /**
   * The data X of a cursor value. A string is a category label, or an ISO-8601 date on a time
   * axis; anything else the X axis cannot read throws (dataapi-22).
   */
  cursorX(x: number | Date | string | null): number | null {
    return cursorValue(this, x);
  }

  private point(
    si: number,
    index: number,
    values?: Parameters<typeof chartPoint<Row>>[3],
  ): ChartPoint<Row> {
    return chartPoint(this, si, index, values);
  }
  /** The values under the cursor, or at a fallback position, computed when asked. */
  getCursor(options?: CursorOptions): CursorSnapshot<Row> {
    return cursorSnapshot(this, options);
  }
  /** Repaint a layer on the next frame; `'all'` (the default) also resolves the theme again. */
  redraw(layer: 'overlay' | 'data' | 'all' = 'all'): void {
    if (this.destroyed) return;
    if (layer !== 'overlay' && layer !== 'data' && layer !== 'all')
      fail(`redraw() takes 'overlay', 'data' or 'all', not ${String(layer)}.`);
    this.engine.redraw(layer);
  }

  /**
   * An axis' kind, horizontal or not, current range and pixel mapping, as plugins draw with it
   * (plan D21). Pixels are CSS pixels from the canvases' top-left corner; a category axis maps
   * its labels (and slot positions), a time axis Dates and ISO-8601 strings. A snapshot: read
   * it again after the viewport moves.
   */
  scale(key: string): ChartScale | undefined {
    settleRange(this.engine);
    return chartScale(this, key);
  }
  groupCategories(): ReadonlyMap<string, readonly string[]> {
    return categoryLabels(this.ingested);
  }
  naturalRange(key: string) {
    return this.engine.getNaturalRange(key);
  }
  coordinateRange(key: string, range: { min: number; max: number }): void {
    const axis = this.engine.getAxis(key);
    if (axis && axis.min === range.min && axis.max === range.max) return;
    this.engine.setCoordinatedAxis(key, range);
  }
  naturalGutters(): { left: number; right: number } {
    return this.engine.naturalGutters();
  }
  /** Apply a group's side gutters, or (undefined) this chart's own; unchanged ones cost nothing. */
  setPlotInsets(insets: { left: number; right: number } | undefined): void {
    this.engine.setPlotInsets(insets ?? {});
  }
  detachGroup(group: ChartGroup): void {
    this.setPlotInsets(undefined);
    if (groupOptions(group)?.yRange) {
      const ownRange = this.naturalRange('y');
      if (ownRange) this.engine.setCoordinatedAxis('y', ownRange);
    }
    this.publish();
  }
  private readState(): ChartState {
    settleRange(this.engine);
    return Object.freeze({
      revision: this.events.revision,
      viewport: this.viewport(),
      selection: this.selection(),
      hiddenSeries: Object.freeze([...this.hidden]),
      highlight: this.read('highlight') as string | null,
      following: this.engine.isFollowing(),
      series: this.seriesStates(),
    });
  }
  /** Each series' colour, mark and visibility, as `getState().series` reports them. */
  private seriesStates(): readonly SeriesState[] {
    return Object.freeze(
      this.engine.getLegendItems().map(({ seriesIndex: _index, meta: _meta, ...item }, index) =>
        Object.freeze({
          ...item,
          dash: Object.freeze(item.dash),
          id: this.ingested.seriesIds[index],
        }),
      ),
    );
  }
  /** A data, option or state commit: bump the revision (subscribers hear once per frame). */
  publish(): void {
    if (this.mutating || this.destroyed) return;
    this.events.commit();
  }
  /** The cursor's X as the axis reads it: a category label, else the data value. */
  private cursorLabel(): number | string | null {
    const x = this.engine.getCursorX();
    if (x === null) return null;
    return this.ingested.categories.get('x')?.labels.get(Math.round(x)) ?? x;
  }
  private bindEngine(): void {
    this.off.push(
      this.engine.on('action', (start) => this.events.bracket(start)),
      this.engine.on('cursor:move', () => {
        if (this.mutating) return;
        // The hot channel: a snapshot only when something listens (plan §3.2).
        if (this.events.listened('cursor:change') || this.normalized.callbacks.onCursorChange)
          this.emit('cursor:change', this.getCursor());
        if (groupOptions(this.options.group)?.cursor) {
          const x = this.cursorLabel();
          broadcast(this.options.group, (member) => member.syncCursor(x), this);
        }
      }),
      this.engine.on('viewport:change', (key, range) => {
        this.events.mark('viewport');
        const group = this.options.group;
        const linked = groupOptions(group);
        if (!linked?.viewport || !this.isHorizontal(key)) return;
        // Plan D17: link horizontal axes only, and only axes a peer has, so a
        // peer's Y is never copied or pinned. A change that leaves this chart
        // following its data is a reset: peers return to their own range.
        const reset = this.engine.isFollowing();
        broadcast(group, (member) => member.syncViewport(key, reset ? null : range), this);
        // Keep the shared Y after the sync (a reset returns each peer to its own).
        if (linked.yRange) coordinate(group, 'shareY');
      }),
      this.engine.on('highlight:change', () => {
        this.events.mark('highlight');
        if (groupOptions(this.options.group)?.highlight)
          broadcast(
            this.options.group,
            (member) => member.syncHighlight(this.read('highlight') as string | null),
            this,
          );
      }),
      this.engine.on('selection:change', () => this.events.mark('selection')),
      this.engine.on('follow:change', () => this.events.mark('following')),
      // Series colours come from the theme.
      this.engine.on('theme:update', () => this.publish()),
      this.engine.on('resize', () => {
        this.syncLegend();
        coordinate(this.options.group);
      }),
    );
    // The internal engine emits a hit-tested point only after a non-drag click.
    const onPoint = (point: TooltipPoint) => {
      this.emit('point:click', this.point(point.seriesIndex, point.dataIndex, point));
    };
    this.off.push(this.engine.on('point:click', onPoint));
  }

  /**
   * The host is a figure named by `ariaLabel` or a summary of the series (plan D20). A role or
   * name the host already had (a component renders its own) is never overwritten; `destroy`
   * removes only what the chart added. The interactive element inside carries the same name.
   */
  private applyAccessibleName(): void {
    const name = accessibleName(this.options);
    this.engine.setAccessibleName(name);
    if (!this.added) {
      this.added = {
        role: !this.container.hasAttribute('role'),
        label: !this.container.hasAttribute('aria-label'),
      };
      if (this.added.role) this.container.setAttribute('role', 'figure');
    }
    if (this.added.label) this.container.setAttribute('aria-label', name);
  }
  /** The host attributes the chart added, which `destroy` removes. */
  private added: { role: boolean; label: boolean } | undefined;
  destroy(): void {
    if (this.destroyed) return;
    if (this.added?.role) this.container.removeAttribute('role');
    if (this.added?.label) this.container.removeAttribute('aria-label');
    this.legend?.unmount();
    this.legend = undefined;
    companions.delete(this.handle);
    membership(this.options.group, this, false);
    for (const off of this.off) off();
    this.engine?.destroy();
    this.destroyed = true;
    this.events?.clear();
    coordinate(this.options.group);
  }
}

/**
 * Create a chart in `element`. The chart fills the element's width and height.
 *
 * @example
 * ```ts
 * const chart = createChart(document.getElementById('cpu')!, {
 *   data: rows,
 *   x: 'time',
 *   series: [{ y: 'cpu', label: 'CPU' }],
 *   axes: { y: { format: { suffix: '%' } } },
 * });
 * ```
 */
export function createChart<Row = Record<string, any>>(
  element: HTMLElement,
  options: ChartOptions<Row>,
): ChartHandle<Row> {
  return new Controller(element, options).handle;
}

// The stores only skip validation inside ColumnarStore.trusted; keep the import live.
void ColumnarStore;
