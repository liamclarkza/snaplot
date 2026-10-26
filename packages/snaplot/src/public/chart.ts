/**
 * The createChart facade: normalize → classify → ingest or describe → the engine (plan §3.1,
 * D3, D16). State options and every notification go through one dispatcher (`./state.ts`).
 */
import { ChartCore } from '../core/Chart';
import { inferPosition } from '../core/Layout';
import { ColumnarStore } from '../data/ColumnarStore';
import { fail, hint, unknownSeries, warnOnce } from '../engine/errors';
import { formatValue } from '../engine/format';
import type {
  CursorSnapshotOptions,
  Plugin,
  ScaleRange,
  SelectionRange,
  TooltipPoint,
} from '../engine/spec';
import { createReferenceLinesPlugin } from '../plugins/builtins/referenceLinesPlugin';
import { createReferenceRegionsPlugin } from '../plugins/builtins/referenceRegionsPlugin';
import { categoryLabels, commitAppend, planAppend, refreshCategoryAxis } from './append';
import { classify, sameData, STATE_KEYS, type StateKey, type Work } from './classify';
import {
  broadcast,
  coordinate,
  createChartGroup,
  type GroupCandidate,
  type GroupMember,
  groups,
  validateGroup,
} from './group';
import { companions } from './companion';
import { describeOptions, ingest } from './ingest';
import { mountLegend } from './legend';
import { type NormalizedOptions, type NormalizedState, normalize } from './normalize';
import { equivalent, patchOptions } from './options';
import {
  type Ingested,
  type IngestContext,
  parseIso,
  type Retained,
  type SourceState,
  sourceKey,
} from './sources';
import { Dispatcher, type ReportedKey } from './state';
import type {
  AppendOptions,
  AxisState,
  ChartEvents,
  ChartGroup,
  ChartHandle,
  ChartOptions,
  ChartPatch,
  ChartPlugin,
  ChartPoint,
  ChartState,
  CursorSnapshot,
  DataSource,
  Selection,
  Viewport,
  ViewportRanges,
} from './types';

export { createChartGroup };

/** Sources of at least this many rows warn about accessor churn and re-ingest churn (plan D16). */
const CHURN_ROWS = 10_000;

/** The container height from which `legend: 'auto'` shows the legend (CSS pixels). */
const LEGEND_MIN_HEIGHT = 160;

/** The events, in plan §4.4's order, then the 0.12 events the final handle removes. */
const EVENTS: readonly (keyof ChartEvents)[] = [
  'cursor:change',
  'viewport:change',
  'selection:change',
  'hiddenSeries:change',
  'highlight:change',
  'following:change',
  'point:click',
  'state:change',
  'select',
  'data:update',
  'options:update',
  'theme:update',
  'resize',
];

/** The on<Key>Change option of each event (plan §4.5: a 1:1 alias). */
const OPTION_OF = {
  'cursor:change': 'onCursorChange',
  'viewport:change': 'onViewportChange',
  'selection:change': 'onSelectionChange',
  'hiddenSeries:change': 'onHiddenSeriesChange',
  'highlight:change': 'onHighlightChange',
  'following:change': 'onFollowingChange',
  'point:click': 'onPointClick',
} as const;

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
  private engine: ChartCore;
  private options: ChartOptions<Row>;
  private optionsSnapshot?: ChartOptions<Row>;
  private normalized: NormalizedOptions<Row>;
  private ingested: Ingested<Row>;
  /** The state options last applied from options (plan D3). */
  private appliedState: NormalizedState = {};
  /** Identity-only accessor changes in a row, and their times (plan D16). */
  private churn = { streak: 0, times: [] as number[], ingests: [] as number[] };
  /** The one X pass per source and append batch (plan §3.4), for the debug symbol. */
  private counters = { xValidations: 0 };
  private hidden = new Set<string>();
  private state!: ChartState<Row>;
  private subscribers = new Set<() => void>();
  private events: Dispatcher<ChartEvents<Row>>;
  private off: Array<() => void> = [];
  private mutating = false;
  private destroyed = false;
  private lines = createReferenceLinesPlugin({ lines: [] });
  private regions = createReferenceRegionsPlugin({ regions: [] });
  private bridges = new WeakMap<ChartPlugin<Row>, Plugin>();
  /** The built-in legend: its placement and how to unmount it. */
  private legend?: { position: 'top' | 'bottom'; unmount: () => void };

  constructor(element: HTMLElement, options: ChartOptions<Row>) {
    this.container = element;
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
      () => this.publish(),
    );
    // User plugin install hooks need the completed public handle, not a half-built engine,
    // so plugins are installed below, and the engine's first paint waits for them.
    this.engine = new ChartCore(
      element,
      { ...config, plugins: [] },
      { sources: this.columns(), seriesSources: this.ingested.seriesSources },
      /* deferFirstPaint */ true,
      /* trusted: ingest validated every source */ true,
    );
    // Plan D31: untyped debug counters for tests and the bench, never part of
    // ChartHandle. Non-enumerable so nothing that walks the handle sees it.
    Object.defineProperty(this, Symbol.for('snaplot.debug'), {
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
    companions.set(this, {
      toggle: (id) => this.toggleSeries(id),
      highlight: (id) => this.syncHighlight(id),
      highlighted: () => this.read('highlight') as string | null,
      series: () => this.getLegendItems(),
      cursor: (fallback) => this.getCursorSnapshot({ fallback }),
      xTitle: () => this.ingested.spec.axes?.x?.title,
    });
    try {
      this.applyAccessibleName();
      this.state = this.readState();
      this.bindEngine();
      this.lines.setLines(this.ingested.referenceLines);
      this.regions.setRegions(this.ingested.referenceRegions);
      for (const plugin of config.plugins ?? []) this.engine.use(plugin);
      this.mutating = true;
      try {
        this.applyState(this.stateChanges(normalized));
      } finally {
        this.mutating = false;
      }
      this.syncLegend();
      // The mount paint: nothing repaints an unchanged box after it, so it must
      // draw the annotations, plugins and the legend's space (gap-annotations-extensibility-06:mount).
      this.engine.paint();
      groups.get(normalized.group!)?.members.add(this);
      coordinate(normalized.group);
      this.state = this.readState();
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
   * The ingest context: streamed sources are re-read from what the chart
   * retains, unless `forceData` replaces the chart data.
   */
  private context(normalized: NormalizedOptions<Row>, forceData: boolean): IngestContext<Row> {
    const previous = this.ingested as Ingested<Row> | undefined;
    const previousTypes = previous ? this.previousTypes(normalized) : new Map();
    return {
      counters: this.counters,
      previousEncodings: previous?.encodings,
      previousCategories: previous?.categories,
      previousTypes,
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
        return at < 0 ? undefined : this.retained(previous.sources[at], at);
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

  /** What a streamed source retains, to ingest again instead of its declared input. */
  private retained(source: SourceState<Row>, index: number): Retained<Row> {
    const base = {
      evicted: source.evicted,
      nextIndex: source.nextIndex,
      appended: source.appended,
      ...(source.unsorted ? { unsorted: true as const } : {}),
    };
    // A row source reads its ids with the current rowId again (it is an accessor, D16).
    if (source.kind === 'rows')
      return {
        ...base,
        rows: source.rows!.slice(source.head),
        index: source.index!.slice(source.head),
      };
    const data = this.engine.getSourceData(index);
    const columns: Record<string, Float64Array> = {};
    source.fields.forEach((field, c) => {
      if (field.kind === 'x') columns[source.x as string] = data[c];
      else if (field.kind === 'field') columns[field.name] = data[c];
    });
    // { columns, rowIds } has no accessor, so its ids are kept; ids read from a column
    // (rowId: '<column>') are read from the retained column again.
    return {
      ...base,
      columns,
      ...(source.rowIds && !source.rowIdColumn ? { rowIds: source.rowIds.slice(source.head) } : {}),
    };
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

  private configFor(ingested: Ingested<Row>, normalized: NormalizedOptions<Row>) {
    const plugins = [
      this.regions,
      this.lines,
      ...normalized.plugins.map((plugin) => this.bridge(plugin)),
    ];
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
        return {
          ...series,
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
      plugins,
    };
  }

  private bridge(plugin: ChartPlugin<Row>): Plugin {
    let bridge = this.bridges.get(plugin);
    if (bridge) return bridge;
    const invoke = <Result>(
      hook: keyof ChartPlugin<Row>,
      callback: () => Result,
    ): Result | undefined => {
      try {
        return callback();
      } catch (error) {
        console.error(`snaplot: plugin "${plugin.id}" ${hook} hook failed.`, error);
      }
    };
    bridge = {
      id: plugin.id,
      install: () => invoke('install', () => plugin.install?.(this)),
      destroy: () => invoke('destroy', () => plugin.destroy?.(this)),
      beforeDrawData: () => invoke('beforeDraw', () => plugin.beforeDraw?.(this)),
      afterDrawGrid: (_chart, context) =>
        invoke('afterDrawGrid', () => plugin.afterDrawGrid?.(this, context)),
      afterDrawData: (_chart, context) =>
        invoke('afterDrawData', () => plugin.afterDrawData?.(this, context)),
      afterDrawOverlay: (_chart, context) =>
        invoke('afterDrawOverlay', () => plugin.afterDrawOverlay?.(this, context)),
      onSetData: () => invoke('onDataUpdate', () => plugin.onDataUpdate?.(this)),
      onSetOptions: () => invoke('onOptionsUpdate', () => plugin.onOptionsUpdate?.(this)),
    };
    this.bridges.set(plugin, bridge);
    return bridge;
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
        this.noteChurn(normalized, work);
        const ingested = ingest(normalized, this.context(normalized, named?.has('data') ?? false));
        this.validateState(checked, ingested);
        validateGroup(normalized.group, this.candidate(ingested), this);
        this.noteReplacedStreams(ingested);
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
      this.present(normalized, ingested, work, applyState);
    });
  }

  /** Apply a change that reads no data: engine options, annotations, plugins, group and name. */
  private present(
    normalized: NormalizedOptions<Row>,
    ingested: Ingested<Row>,
    work: Work,
    after: () => void,
  ): void {
    const previous = this.options;
    this.ingested = ingested;
    this.options = normalized.options;
    this.normalized = normalized;
    this.optionsSnapshot = undefined;
    if (work.engine || work.plugins)
      this.engine.replaceOptions(this.configFor(ingested, normalized));
    if (work.annotations) {
      this.lines.setLines(ingested.referenceLines);
      this.regions.setRegions(ingested.referenceRegions);
    }
    if (work.aria) this.applyAccessibleName();
    if (work.engine) this.syncLegend();
    after();
    if (work.group) this.moveGroup(previous.group, normalized.options.group);
    this.publish();
    if (work.engine || work.plugins) this.emit('options:update', this.options);
    if (work.group) coordinate(previous.group);
    if (work.engine || work.group) coordinate(this.options.group);
  }

  private moveGroup(from: ChartGroup | undefined, to: ChartGroup | undefined): void {
    if (from === to) return;
    if (from) this.detachGroup(from);
    groups.get(from!)?.members.delete(this);
    groups.get(to!)?.members.add(this);
  }

  /**
   * Swap in a new ingest as one transaction. Callers check the options and the state options
   * against `ingested` first, so nothing after replaceSources() throws; if the
   * engine rejects the candidate, everything is restored. `quiet` re-stores the same data
   * (appendData() storing a scatter unsorted), which publishes and emits nothing.
   */
  private commit(
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
      optionsSnapshot: this.optionsSnapshot,
    };
    const next = normalized.options;
    const highlighted = this.read('highlight') as string | null;
    this.hidden = new Set([...this.hidden].filter((id) => ingested.seriesIds.includes(id)));
    let replaced = false;
    try {
      this.ingested = ingested;
      this.options = next;
      this.normalized = normalized;
      this.optionsSnapshot = undefined;
      this.engine.replaceSources(
        this.configFor(ingested, normalized),
        this.columns(),
        ingested.seriesSources,
        /* trusted */ true,
      );
      replaced = true;
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
        this.optionsSnapshot = previous.optionsSnapshot;
        this.hidden = previous.hidden;
      }
      throw error;
    }
    if (quiet) return;
    this.events.mark('hiddenSeries');
    this.publish();
    this.emit('options:update', this.options);
    this.emit('data:update', undefined);
    if (previous.options.group !== next.group) coordinate(previous.options.group);
    coordinate(this.options.group);
  }

  /**
   * Warn once when a source of at least 10,000 rows keeps being read again (plan D16, §5.9): by an
   * accessor whose identity changes while nothing else does, three times in a row or more than
   * ten times a second, or by data replaced more than ten times a second.
   */
  private noteChurn(next: NormalizedOptions<Row>, work: Work): void {
    const now = Date.now();
    const rows = (si: number) => {
      const source = si < 0 ? undefined : this.ingested.sources[this.ingested.seriesSources[si]];
      return source?.columns[0].length ?? 0;
    };
    if (work.accessor && !work.data) {
      const change = work.accessor;
      const count = rows(this.ingested.seriesIds.indexOf(change.id));
      if (count < CHURN_ROWS) return;
      this.churn.streak++;
      this.churn.times = [...this.churn.times.filter((time) => now - time < 1000), now];
      if (this.churn.streak >= 3 || this.churn.times.length > 10)
        warnOnce(
          'accessor-churn',
          `series "${change.id}" keeps getting a new ${change.field} function, and each one re-reads its ${formatValue(count)} rows. Memoise the function, or use a field name.`,
        );
      return;
    }
    this.churn.streak = 0;
    const largest = next.series.reduce(
      (best, s) => {
        const count = rows(this.ingested.seriesIds.indexOf(s.id));
        return count > best.count ? { id: s.id, count } : best;
      },
      { id: '', count: 0 },
    );
    if (largest.count < CHURN_ROWS) return;
    this.churn.ingests = [...this.churn.ingests.filter((time) => now - time < 1000), now];
    if (this.churn.ingests.length > 10)
      warnOnce(
        'reingest-churn',
        `series "${largest.id}" re-read its ${formatValue(largest.count)} rows more than 10 times in a second. Use appendData() for new rows, or memoise data so it keeps its identity.`,
      );
  }

  /** Warn once when new data replaces a source that appendData() extended (plan D16). */
  private noteReplacedStreams(next: Ingested<Row>): void {
    let discarded = 0;
    for (const source of this.ingested.sources) {
      if (!source.streamed || !source.appended) continue;
      const kept = next.sources.some(
        (other) => other.streamed && sameData(other.declared, source.declared),
      );
      if (!kept) discarded += source.appended;
    }
    if (discarded > 0)
      warnOnce(
        'streamed-replaced',
        `data replaced on a streamed source; ${formatValue(discarded)} appended rows were discarded. Pass data once (useState/createSignal) or omit it.`,
      );
  }

  /** The options with streamed sources' retained data in place of their declared inputs. */
  private liveOptions(): ChartOptions<Row> {
    const streamed = this.ingested.sources.filter((source) => source.streamed);
    if (!streamed.length) return this.options;
    const replacement = new Map<unknown, DataSource<Row>>();
    for (const source of streamed) {
      const index = this.ingested.sources.indexOf(source);
      const retained = this.retained(source, index);
      replacement.set(
        source.declared,
        retained.rows ?? {
          columns: retained.columns!,
          ...(retained.rowIds ? { rowIds: retained.rowIds } : {}),
        },
      );
    }
    return {
      ...this.options,
      data: (this.options.data && replacement.get(this.options.data)) ?? this.options.data,
      series: this.options.series.map((series) =>
        series.data && replacement.has(series.data)
          ? ({ ...series, data: replacement.get(series.data) } as typeof series)
          : series,
      ),
    };
  }

  appendData(data: DataSource<Row>, options: AppendOptions = {}): void {
    if (this.destroyed) return;
    this.events.batch(() => this.append(data, options));
  }

  private append(data: DataSource<Row>, options: AppendOptions): void {
    const { seriesIds, seriesSources, sources } = this.ingested;
    const id = options.seriesId;
    const si = id === undefined ? -1 : seriesIds.indexOf(id);
    if (id !== undefined && si < 0)
      fail(`appendData() names series "${id}", which this chart does not have.`);
    const targets = new Set<number>();
    if (si >= 0) {
      const source = seriesSources[si];
      const sharing = seriesIds.filter(
        (_other, index) => index !== si && seriesSources[index] === source,
      );
      if (sharing.length)
        fail(
          `appendData({ seriesId: "${id}" }): series "${id}" shares its data with ${sharing.map((other) => `"${other}"`).join(', ')}. Append without a seriesId to extend the shared data, or give "${id}" its own data.`,
        );
      targets.add(source);
    } else {
      this.normalized.series.forEach((series, index) => {
        if (series.data === undefined) targets.add(seriesSources[index]);
      });
    }
    if (!targets.size)
      fail(
        'appendData() without a seriesId extends the chart data, but every series has its own data. Pass { seriesId }.',
      );
    const plan = () =>
      planAppend(
        this.ingested,
        this.normalized,
        [...targets],
        data,
        options,
        this.context(this.normalized, false),
        (source, back) => {
          const length = this.engine.getSourceLength(source);
          return this.engine.getSourceValue(source, 0, length - back);
        },
        (source) => this.engine.getSourceLength(source),
      );
    let plans = plan();
    const newLabels = plans.some((plan) => plan.newLabels.size);
    if (newLabels) {
      const categories = categoryLabels(this.ingested);
      for (const plan of plans) {
        const axis = sources[plan.source].axis;
        categories.set(axis, [...(categories.get(axis) ?? []), ...plan.newLabels.keys()]);
      }
      validateGroup(this.options.group, { categories, axes: this.ingested.spec.axes ?? {} }, this);
    }
    // Every check has run. A scatter source whose X was sorted gets an append that is not: store
    // it unsorted (the same data, so no event), then plan again, which passes the same checks.
    const demoted = plans.filter((plan) => plan.demote);
    if (demoted.length) {
      const unsorted = new Set(
        demoted.map((plan) => sourceKey(plan.source, sources[plan.source].axis)),
      );
      this.commit(
        this.normalized,
        ingest(this.normalized, { ...this.context(this.normalized, false), unsorted }),
        undefined,
        /* quiet */ true,
      );
      plans = plan();
    }
    // Plans share their encoding lists, which hold only the lists this append adds labels to.
    const newEncodingLabels = plans.some((plan) => plan.encodings?.size);
    const maxPoints = this.normalized.engine.streaming?.maxPoints;
    const changedAxes = new Set<string>();
    this.optionsSnapshot = undefined;
    for (const plan of plans) {
      const source = this.ingested.sources[plan.source];
      const count = plan.columns[0].length;
      if (!count) continue;
      const length = this.engine.getSourceLength(plan.source);
      // updateLast replaces the latest row if there is one; on empty data it appends.
      const replace = options.updateLast && length > 0 ? 1 : 0;
      const evicted =
        maxPoints === undefined ? 0 : Math.max(0, length + count - replace - maxPoints);
      const evictedCodes: number[] = [];
      if (source.xKind === 'category') {
        const xi = source.sortedX ? 0 : source.fields.findIndex((field) => field.kind === 'x');
        for (let i = 0; i < Math.min(evicted, length - replace); i++)
          evictedCodes.push(this.engine.getSourceValue(plan.source, xi, i));
        if (replace) evictedCodes.push(this.engine.getSourceValue(plan.source, xi, length - 1));
        const fromBatch = evicted - Math.min(evicted, length - replace);
        for (let i = 0; i < fromBatch; i++) evictedCodes.push(plan.codes![i]);
      }
      this.engine.appendToSource(plan.source, plan.columns, options, /* trusted */ true);
      if (commitAppend(this.ingested, plan, replace > 0, evicted, evictedCodes))
        changedAxes.add(source.axis);
    }
    if (newEncodingLabels) {
      // New colorBy or tooltip labels: the series specs list them now (refreshColorCodes).
      // Known labels change no series, so the append repaints only the data layer.
      this.engine.setOptions({ series: this.configFor(this.ingested, this.normalized).series });
    }
    if (changedAxes.size) {
      const axes = Object.fromEntries(
        [...changedAxes].map((key) => [
          key,
          refreshCategoryAxis(this.ingested, this.normalized, key),
        ]),
      );
      this.engine.setOptions({ axes });
    }
    this.publish();
    this.emit('data:update', undefined);
    coordinate(this.options.group);
  }

  getOptions(): Readonly<ChartOptions<Row>> {
    if (this.mutating) return this.liveOptions();
    return (this.optionsSnapshot ??= this.liveOptions());
  }
  getState(): ChartState<Row> {
    return this.state;
  }
  subscribe(listener: () => void): () => void {
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
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
   * Show or hide the built-in legend as the `legend` option asks (plan D6): `'auto'` shows it
   * for two or more series. A change of the space it takes resizes the plot before the next paint.
   */
  private syncLegend(): void {
    if (this.destroyed) return;
    const option = this.normalized.engine.legend ?? 'auto';
    // Until M12b reserves its space in the layout, 'auto' gives way in a container too short to
    // keep a usable plot below it (a 200 × 120 box shows only the chart).
    const show =
      option === true ||
      typeof option === 'object' ||
      (option === 'auto' &&
        this.ingested.seriesIds.length >= 2 &&
        this.container.clientHeight >= LEGEND_MIN_HEIGHT);
    const position = typeof option === 'object' ? (option.position ?? 'top') : 'top';
    if (this.legend && (!show || this.legend.position !== position)) {
      this.legend.unmount();
      this.legend = undefined;
    } else if (this.legend || !show) return;
    if (show)
      this.legend = { position, unmount: mountLegend(this, this.engine.root, { position }) };
    this.engine.fitToRoot();
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

  setViewport(viewport: ViewportRanges): void {
    for (const [key, range] of Object.entries(viewport)) {
      const axis = this.engine.getAxis(key);
      if (
        !axis ||
        (axis.type === 'log' && range.min <= 0) ||
        !Number.isFinite(range.min) ||
        !Number.isFinite(range.max) ||
        range.max <= range.min
      ) {
        fail(`the viewport of axis "${key}" needs an axis the chart has and finite min < max.`);
      }
    }
    this.events.batch(() => {
      for (const [key, range] of Object.entries(viewport)) this.engine.setAxis(key, range);
    });
  }
  /** Return every axis to its automatic range; reports `{}` once if anything was pinned. */
  resetViewport(): void {
    if (this.destroyed) return;
    this.events.batch(() => this.engine.resetZoom());
  }
  syncViewport(key: string, range: ScaleRange, reset: boolean): void {
    if (reset) this.resetViewport();
    else if (this.engine.getAxis(key)) this.setViewport({ [key]: range });
  }
  private isHorizontal(key: string): boolean {
    const position = inferPosition(key, this.engine.getOptions().axes?.[key]?.position);
    return position === 'bottom' || position === 'top';
  }
  resumeFollow(): void {
    if (this.destroyed) return;
    this.events.batch(() => this.engine.scrollToLatest());
  }
  setSelection(selection: SelectionRange | null): void {
    if (selection && (!Number.isFinite(selection.x.min) || !Number.isFinite(selection.x.max)))
      fail('a selection needs finite bounds.');
    this.events.batch(() => this.engine.setSelection(selection));
  }
  setSeriesVisible(id: string, visible: boolean): void {
    const ids = this.ingested.seriesIds;
    if (!ids.includes(id)) unknownSeries('setSeriesVisible()', id, ids);
    const hidden = new Set(this.hidden);
    if (visible) hidden.delete(id);
    else hidden.add(id);
    if (equivalent([...hidden], [...this.hidden])) return;
    this.events.batch(() => this.setHidden(hidden));
    coordinate(this.options.group);
  }
  setHighlight(id: string | null): void {
    const ids = this.ingested.seriesIds;
    if (id !== null && !ids.includes(id)) unknownSeries('setHighlight()', id, ids);
    this.syncHighlight(id);
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
    if (x === null || typeof x === 'number') return x;
    if (x instanceof Date) return x.getTime();
    if (typeof x !== 'string')
      fail('setCursor() takes a number, a Date, a category label or null.');
    const where = `setCursor() got "${x}"`;
    const registry = this.ingested.categories.get('x');
    if (registry) {
      const code = registry.codes.get(x);
      if (code === undefined)
        fail(`${where}, which is not a category of axis "x".${hint(x, registry.codes.keys())}`);
      return code;
    }
    if (this.ingested.kinds.get('x') === 'date' || this.ingested.spec.axes?.x?.type === 'time') {
      const ms = parseIso(x, this.normalized.engine.timeZone);
      if (Number.isFinite(ms)) return ms;
      fail(`${where}, which is not an ISO-8601 date for time axis "x".`);
    }
    return fail(`${where}, but axis "x" is numeric: give a number.`);
  }

  private point(
    si: number,
    index: number,
    values?: Partial<
      Pick<
        TooltipPoint,
        'x' | 'y' | 'formattedX' | 'formattedY' | 'color' | 'xRange' | 'radius' | 'fields'
      >
    >,
  ): ChartPoint<Row> {
    const sourceIndex = this.ingested.seriesSources[si];
    const source = this.ingested.sources[sourceIndex];
    const series = this.ingested.spec.series[si];
    const at = source.head + index;
    const x = values?.x ?? this.engine.getSourceValue(sourceIndex, series.xColumn ?? 0, index);
    const y = values?.y ?? this.engine.getSourceValue(sourceIndex, series.yColumn ?? 1, index);
    const axis = series.xAxis ?? 'x';
    const actualX = this.ingested.categories.get(axis)?.labels.get(Math.round(x)) ?? x;
    const fieldColumns = values?.fields
      ? [
          ...new Set(
            [series.colorBy, series.sizeBy, ...(series.tooltipFields ?? [])]
              .filter((field) => field !== undefined)
              .map((field) => (typeof field === 'number' ? field : field!.column)),
          ),
        ].filter((column) => column >= 0 && column < source.fields.length)
      : [];
    const fields = values?.fields?.map((field, i) => {
      const descriptor = source.fields[fieldColumns[i]];
      const labels =
        descriptor?.kind === 'encoding' ? this.ingested.encodings.get(descriptor.key) : undefined;
      return { ...field, value: labels?.[field.value] ?? field.value };
    });
    const point: ChartPoint<Row> = {
      seriesId: this.ingested.seriesIds[si],
      label: series.label,
      row: source.rows?.[at],
      rowIndex: source.index ? (source.index[at] ?? index) : source.evicted + index,
      rowId: source.rowIds?.[at],
      x: actualX,
      y,
      formattedX: values?.formattedX ?? this.format(axis, x),
      formattedY: values?.formattedY ?? this.readout(series.yAxis ?? 'y', y),
      color: values?.color ?? this.engine.getLegendItems()[si]?.color ?? '',
      ...(values?.xRange ? { xRange: { ...values.xRange } } : {}),
      ...(values?.radius !== undefined ? { radius: values.radius } : {}),
      ...(fields ? { fields } : {}),
    };
    const formatter = this.normalized.series[si]?.format;
    if (formatter) point.formattedY = formatter(y, point);
    return point;
  }
  /** A value readout at value precision (plan P9); the axis format still wins here. */
  private readout(axis: string, value: number): string {
    if (!Number.isFinite(value)) return '';
    const formatter = this.ingested.spec.axes?.[axis]?.format;
    return formatter ? formatter(value) : this.engine.formatReadout(axis, value);
  }
  private format(axis: string, value: number): string {
    if (!Number.isFinite(value)) return '';
    const formatter = this.ingested.spec.axes?.[axis]?.format;
    return formatter
      ? formatter(value)
      : (this.engine.getAxis(axis)?.tickFormat(value) ?? String(value));
  }
  getCursorSnapshot(options?: CursorSnapshotOptions): CursorSnapshot<Row> {
    return this.getCursor(options);
  }
  /** The values under the cursor, or at a fallback position, computed when asked. */
  getCursor(options?: CursorSnapshotOptions): CursorSnapshot<Row> {
    const snapshot = this.engine.getCursorSnapshot(options);
    return Object.freeze({
      x:
        snapshot.dataX === null
          ? null
          : (this.ingested.categories.get('x')?.labels.get(Math.round(snapshot.dataX)) ??
            snapshot.dataX),
      formattedX: snapshot.formattedX,
      source: snapshot.source,
      points: Object.freeze(
        snapshot.points.map((point) =>
          Object.freeze(
            this.point(point.seriesIndex, point.dataIndex, {
              x: point.dataX,
              y: point.value,
              formattedY: point.formattedValue,
              color: point.color,
            }),
          ),
        ),
      ),
      activeSeriesId:
        snapshot.activeSeriesIndex === null
          ? null
          : this.ingested.seriesIds[snapshot.activeSeriesIndex],
    });
  }
  getLegendItems() {
    return this.engine
      .getLegendItems()
      .map(({ seriesIndex: _index, meta: _meta, ...item }, index) => ({
        ...item,
        id: this.ingested.seriesIds[index],
      }));
  }
  getTheme() {
    return this.engine.getTheme();
  }
  getLayout() {
    return this.engine.getLayout();
  }
  getStats() {
    return this.engine.getStats();
  }
  getAxis(key: string): Readonly<AxisState> | undefined {
    const axis = this.engine.getAxis(key);
    return axis
      ? Object.freeze({
          type: this.ingested.categories.has(key) ? ('category' as const) : axis.type,
          min: axis.min,
          max: axis.max,
        })
      : undefined;
  }
  refreshTheme(): void {
    this.engine.refreshTheme();
  }
  resize(width: number, height: number): void {
    this.engine.resize(width, height);
  }
  redraw(): void {
    this.engine.redraw();
  }
  groupCategories(): ReadonlyMap<string, readonly string[]> {
    return categoryLabels(this.ingested);
  }
  naturalRange(key: string) {
    return this.engine.getNaturalRange(key);
  }
  coordinateRange(key: string, range: { min: number; max: number }): void {
    this.engine.setCoordinatedAxis(key, range);
  }
  detachGroup(group: ChartGroup): void {
    this.coordinatePadding(undefined, undefined);
    if (group.options.yRange) {
      const ownRange = this.naturalRange('y');
      if (ownRange) this.engine.setCoordinatedAxis('y', ownRange);
    }
    this.publish();
  }
  /** Pin the plot's side gutters for alignPlots, or (undefined) return to the defaults. */
  coordinatePadding(left: number | undefined, right: number | undefined): void {
    this.engine.setOptions({ padding: { left: left ?? 56, right: right ?? 24 } });
  }
  private readState(): ChartState<Row> {
    return Object.freeze({
      viewport: this.viewport(),
      selection: this.selection(),
      hiddenSeries: Object.freeze([...this.hidden]),
      highlight: this.read('highlight') as string | null,
      following: this.engine.isFollowing(),
      cursor: this.getCursorSnapshot(),
    });
  }
  private publish(): void {
    if (this.mutating || this.destroyed) return;
    const next = this.readState();
    if (equivalent(this.state, next)) return;
    this.state = next;
    for (const listener of this.subscribers) listener();
    this.emit('state:change', this.state);
  }
  private bindEngine(): void {
    this.off.push(
      this.engine.on('action', (start) => this.events.bracket(start)),
      this.engine.on('cursor:move', () => {
        if (this.mutating) return;
        this.publish();
        this.emit('cursor:change', this.state.cursor);
        if (this.options.group?.options.cursor)
          broadcast(this.options.group, (member) => member.syncCursor(this.state.cursor.x), this);
      }),
      this.engine.on('viewport:change', (key, range) => {
        this.events.mark('viewport');
        const group = this.options.group;
        if (!group?.options.viewport || !this.isHorizontal(key)) return;
        // Plan D17: link horizontal axes only, and only axes a peer has, so a
        // peer's Y is never copied or pinned. A change that leaves this chart
        // following its data is a reset: peers return to their own range.
        const reset = this.engine.isFollowing();
        broadcast(group, (member) => member.syncViewport(key, range, reset), this);
        // Keep the shared Y after the sync (a reset returns each peer to its own).
        if (group.options.yRange) coordinate(group, 'shareY');
      }),
      this.engine.on('highlight:change', () => {
        this.events.mark('highlight');
        if (this.options.group?.options.highlight)
          broadcast(
            this.options.group,
            (member) => member.syncHighlight(this.read('highlight') as string | null),
            this,
          );
      }),
      this.engine.on('selection:change', () => this.events.mark('selection')),
      this.engine.on('select', (selection) => {
        const result = {
          ...selection,
          points: selection.points?.map((point) =>
            this.point(point.seriesIndex, point.dataIndex, point),
          ),
        };
        this.emit('select', result);
      }),
      this.engine.on('follow:change', () => this.events.mark('following')),
      this.engine.on('theme:update', (theme) => {
        this.publish();
        this.emit('theme:update', theme);
      }),
      this.engine.on('resize', (width, height) => {
        this.syncLegend();
        this.publish();
        this.emit('resize', { width, height });
        coordinate(this.options.group);
      }),
    );
    // The internal engine emits a hit-tested point only after a non-drag click.
    const onPoint = (point: TooltipPoint) => {
      this.emit('point:click', this.point(point.seriesIndex, point.dataIndex, point));
    };
    this.off.push(this.engine.on('point:click', onPoint));
  }

  private applyAccessibleName(): void {
    if (this.options.ariaLabel) {
      this.container.setAttribute('aria-label', this.options.ariaLabel);
      this.container.setAttribute('role', 'group');
    } else this.container.removeAttribute('aria-label');
  }
  destroy(): void {
    if (this.destroyed) return;
    this.legend?.unmount();
    this.legend = undefined;
    companions.delete(this);
    groups.get(this.options.group!)?.members.delete(this);
    for (const off of this.off) off();
    this.engine?.destroy();
    this.destroyed = true;
    this.subscribers.clear();
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
  return new Controller(element, options);
}

// The stores only skip validation inside ColumnarStore.trusted; keep the import live.
void ColumnarStore;
