/**
 * The createChart facade: normalize → ingest → the engine, with today's
 * handle (plan §3.1, §12 M7). It still re-ingests on every option change other
 * than the state options; the diff classifier and the final handle are M8.
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
import {
  broadcast,
  coordinate,
  createChartGroup,
  type GroupCandidate,
  type GroupMember,
  groups,
  validateGroup,
} from './group';
import { categoryLabels, commitAppend, planAppend, refreshCategoryAxis } from './append';
import { ingest } from './ingest';
import {
  type Ingested,
  type IngestContext,
  type Retained,
  parseIso,
  type SourceState,
  sourceKey,
} from './sources';
import { type NormalizedOptions, type NormalizedState, normalize } from './normalize';
import { equivalent, patchOptions } from './options';
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
  Viewport,
  ViewportRanges,
} from './types';

export { createChartGroup };

/** The React and Solid controlled state (veto-style; M8 replaces it with the D3 options). */
export interface ChartControls {
  viewport?: ViewportRanges;
  selection?: SelectionRange | null;
  hiddenSeries?: readonly string[];
  onViewportChange?: (viewport: ViewportRanges) => void;
  onSelectionChange?: (selection: SelectionRange | null) => void;
  onHiddenSeriesChange?: (hiddenSeries: readonly string[]) => void;
}

/** The state options (plan D3): applied to the chart, never re-ingested. */
const STATE_KEYS = ['viewport', 'selection', 'hiddenSeries', 'highlight'] as const;
type StateKey = (typeof STATE_KEYS)[number];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
}

/** Options without the state options, for deciding whether a change needs a re-ingest. */
function withoutState<Row>(options: ChartOptions<Row>): Record<string, unknown> {
  const {
    viewport: _viewport,
    hiddenSeries: _hidden,
    ...rest
  } = options as unknown as Record<string, unknown>;
  if (rest.highlight === null || typeof rest.highlight === 'string') delete rest.highlight;
  if (rest.selection === null || (isPlainObject(rest.selection) && 'x' in rest.selection))
    delete rest.selection;
  return rest;
}

/** Like `equivalent`, but any two functions count as equal. */
function sameIgnoringFunctions(a: unknown, b: unknown): boolean {
  if (Object.is(a, b) || (typeof a === 'function' && typeof b === 'function')) return true;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((value, i) => sameIgnoringFunctions(value, b[i]));
  if (!isPlainObject(a) || !isPlainObject(b)) return false;
  const keys = Object.keys(a).filter((key) => a[key] !== undefined);
  const other = Object.keys(b).filter((key) => b[key] !== undefined);
  return (
    keys.length === other.length &&
    keys.every((key) =>
      key === 'data' || key === 'group' ? a[key] === b[key] : sameIgnoringFunctions(a[key], b[key]),
    )
  );
}

/** The accessor fields of a series whose function identity can churn. */
const ACCESSOR_FIELDS = ['x', 'y', 'lower', 'upper', 'rowId'] as const;

/** The first series and field whose accessor is a new function while nothing else changed (D16). */
function accessorOnlyChange<Row>(
  previous: NormalizedOptions<Row>,
  next: NormalizedOptions<Row>,
): { id: string; field: string } | undefined {
  if (!sameIgnoringFunctions(withoutState(previous.options), withoutState(next.options))) return;
  for (const series of next.series) {
    const old = previous.series.find((candidate) => candidate.id === series.id);
    if (!old) continue;
    for (const field of ACCESSOR_FIELDS) {
      const shared = field === 'x' || field === 'rowId';
      const a = old[field] ?? (shared ? previous[field] : undefined);
      const b = series[field] ?? (shared ? next[field] : undefined);
      if (typeof a === 'function' && typeof b === 'function' && a !== b)
        return { id: series.id, field };
    }
  }
  return undefined;
}

/** Sources of at least this many rows warn about accessor churn (plan D16). */
const CHURN_ROWS = 10_000;

/** Axis ranges as the `[from, to]` viewport `onViewportChange` reports. */
function toViewport(ranges: ViewportRanges): Viewport {
  return Object.fromEntries(
    Object.entries(ranges).map(([key, range]) => [key, [range.min, range.max] as const]),
  );
}

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
  private churn = { streak: 0, times: [] as number[] };
  /** The one X pass per source and append batch (plan §3.4), for the debug symbol. */
  private counters = { xValidations: 0 };
  /** Scatter sources stored unsorted after an append broke their X order. */
  private unsorted = new Set<string>();
  private hidden = new Set<string>();
  private state!: ChartState<Row>;
  private subscribers = new Set<() => void>();
  private events = new Map<keyof ChartEvents<Row>, Set<(value: never) => void>>();
  private off: Array<() => void> = [];
  private controls: ChartControls = {};
  private applyingControls = false;
  private mutating = false;
  private destroyed = false;
  private lines = createReferenceLinesPlugin({ lines: [] });
  private regions = createReferenceRegionsPlugin({ regions: [] });
  private bridges = new WeakMap<ChartPlugin<Row>, Plugin>();

  constructor(element: HTMLElement, options: ChartOptions<Row>) {
    this.container = element;
    const normalized = normalize(options);
    this.normalized = normalized;
    this.options = normalized.options;
    this.ingested = ingest(normalized, this.context(normalized, false));
    validateGroup(normalized.group, this.candidate(this.ingested));
    this.validateState(normalized.state, this.ingested);
    if (normalized.state.hiddenSeries) {
      this.hidden = new Set(normalized.state.hiddenSeries);
      this.appliedState.hiddenSeries = normalized.state.hiddenSeries;
    }
    const config = this.configFor(this.ingested, normalized);
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
    try {
      this.applyAccessibleName();
      this.state = this.readState();
      this.bindEngine();
      this.installGuards();
      this.lines.setLines(this.ingested.referenceLines);
      this.regions.setRegions(this.ingested.referenceRegions);
      for (const plugin of config.plugins ?? []) this.engine.use(plugin);
      this.applyState(normalized.state, ['viewport', 'selection', 'highlight']);
      // The mount paint: nothing repaints an unchanged box after it, so it must
      // draw the annotations and plugins (gap-annotations-extensibility-06:mount).
      this.engine.paint();
      groups.get(normalized.group!)?.members.add(this);
      coordinate(normalized.group);
      this.state = this.readState();
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
    const previousTypes = new Map(
      Object.entries(previous?.spec.axes ?? {})
        .filter(([key]) => normalized.axes[key]?.type === undefined)
        .map(([key, axis]) => [key, axis.type ?? 'linear'] as const),
    );
    return {
      counters: this.counters,
      previousEncodings: previous?.encodings,
      previousTypes,
      unsorted: this.unsorted,
      retained: (input, axis, x) => {
        if (!previous || (forceData && input === normalized.data)) return undefined;
        const exact = previous.sources.findIndex(
          (s) => s.streamed && s.declared === input && s.axis === axis && s.x === x,
        );
        const at =
          exact >= 0
            ? exact
            : previous.sources.findIndex(
                (s) => s.streamed && s.declared === input && s.axis === axis,
              );
        return at < 0 ? undefined : this.retained(previous.sources[at], at);
      },
    };
  }

  /** What a streamed source retains, to ingest again instead of its declared input. */
  private retained(source: SourceState<Row>, index: number): Retained<Row> {
    const base = {
      evicted: source.evicted,
      nextIndex: source.nextIndex,
      // Ids read from a column are read from the retained column again.
      ...(source.rowIds && !source.rowIdColumn ? { rowIds: source.rowIds.slice(source.head) } : {}),
    };
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
    return { ...base, columns };
  }

  /**
   * Check the state options against an ingest before anything changes (plan D3, D23), as
   * validateControls() checks the framework controls. normalize() has checked the ranges and
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
   * Apply state options (plan D3) without emitting: `keys` are applied when
   * present in `state`; a value equal to the one last applied is skipped unless
   * `always` (an update() names the key, so it always applies). validateState()
   * has checked `state` against the engine's axes, so nothing here throws.
   */
  private applyState(state: NormalizedState, keys: readonly StateKey[], always = true): void {
    const wasMutating = this.mutating;
    this.mutating = true;
    try {
      for (const key of keys) {
        if (!Object.hasOwn(state, key)) continue;
        if (!always && equivalent(state[key], this.appliedState[key])) continue;
        if (key === 'viewport') {
          for (const [axis, range] of Object.entries(state.viewport ?? {}))
            this.engine.setAxis(axis, range);
        } else if (key === 'selection') {
          this.engine.setSelection(state.selection ?? null);
        } else if (key === 'hiddenSeries') {
          const hidden = new Set(state.hiddenSeries ?? []);
          if (!equivalent([...hidden], [...this.hidden])) {
            this.hidden = hidden;
            this.engine.setOptions({
              series: this.engine.getOptions().series.map((series, si) => ({
                ...series,
                visible: !hidden.has(this.ingested.seriesIds[si]),
              })),
            });
          }
        } else {
          const index = state.highlight ? this.ingested.seriesIds.indexOf(state.highlight) : -1;
          this.engine.setHighlight(index < 0 ? null : index);
        }
        (this.appliedState as Record<string, unknown>)[key] = state[key];
      }
    } finally {
      this.mutating = wasMutating;
    }
  }

  private configFor(ingested: Ingested<Row>, normalized: NormalizedOptions<Row>) {
    const plugins = [
      this.regions,
      this.lines,
      ...normalized.plugins.map((plugin) => this.bridge(plugin)),
    ];
    const renderTooltip = normalized.tooltip.render;
    return {
      ...ingested.spec,
      tooltip: {
        ...ingested.spec.tooltip,
        ...(renderTooltip
          ? {
              render: (points: TooltipPoint[]) =>
                renderTooltip(
                  points.map((point) => this.point(point.seriesIndex, point.dataIndex, point)),
                ),
            }
          : {}),
      },
      series: (ingested.spec.series ?? []).map((series, index) => {
        const pointColor = normalized.series[index]?.pointColor;
        const id = ingested.seriesIds[index];
        return {
          ...series,
          visible: !this.hidden.has(id),
          ...(pointColor
            ? {
                fill: (value: number, rowIndex: number) => {
                  const si = this.ingested.seriesIds.indexOf(id);
                  const source = this.ingested.sources[this.ingested.seriesSources[si]];
                  const at = source.head + rowIndex;
                  return pointColor(
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
    this.reconcile(
      patchOptions(this.options, patch),
      Object.hasOwn(patch, 'data'),
      undefined,
      STATE_KEYS.filter((key) => Object.hasOwn(patch, key)),
    );
  }

  /**
   * Apply complete options. `stateKeys` are the state options an update()
   * named, which always apply; any other state option applies when it
   * differs from the value last applied (plan D3).
   */
  reconcile(
    input: ChartOptions<Row>,
    forceData = false,
    controls?: ChartControls,
    stateKeys?: readonly StateKey[],
  ): void {
    if (this.destroyed) return;
    const normalized = normalize(input);
    const next = normalized.options;
    this.noteAccessorChurn(normalized);
    const applyState = () => {
      if (stateKeys) this.applyState(normalized.state, stateKeys);
      this.applyState(
        normalized.state,
        STATE_KEYS.filter((key) => !stateKeys?.includes(key)),
        false,
      );
    };
    if (!forceData && equivalent(withoutState(this.options), withoutState(next))) {
      // Check first and keep the new options only once they apply, so a rejected
      // call leaves the chart and its options as they were (D23).
      this.validateState(normalized.state, this.ingested);
      if (controls) this.validateControls(controls);
      applyState();
      if (controls) this.setControls(controls);
      this.options = next;
      this.normalized = normalized;
      this.optionsSnapshot = undefined;
      this.publish();
      return;
    }
    const ingested = ingest(normalized, this.context(normalized, forceData));
    this.validateState(normalized.state, ingested);
    if (controls) this.validateControls(controls, ingested);
    validateGroup(next.group, this.candidate(ingested), this);
    this.commit(normalized, ingested, () => {
      applyState();
      if (controls) this.setControls(controls);
    });
  }

  /**
   * Swap in a new ingest as one transaction. Callers check the options, the state options and
   * the controls against `ingested` first, so nothing after replaceSources() throws; if the
   * engine rejects the candidate, everything is restored.
   */
  private commit(
    normalized: NormalizedOptions<Row>,
    ingested: Ingested<Row>,
    after?: () => void,
  ): void {
    const previous = {
      ingested: this.ingested,
      options: this.options,
      normalized: this.normalized,
      hidden: this.hidden,
      optionsSnapshot: this.optionsSnapshot,
    };
    const next = normalized.options;
    const highlighted = this.state.highlightedSeries;
    this.hidden = new Set([...this.hidden].filter((id) => ingested.seriesIds.includes(id)));
    this.mutating = true;
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
      after?.();
      if (previous.options.group !== next.group) {
        if (previous.options.group) this.detachGroup(previous.options.group);
        groups.get(previous.options.group!)?.members.delete(this);
        groups.get(next.group!)?.members.add(this);
      }
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
    } finally {
      this.mutating = false;
    }
    this.publish();
    this.emit('options:update', this.options);
    this.emit('data:update', undefined);
    if (previous.options.group !== next.group) coordinate(previous.options.group);
    coordinate(this.options.group);
  }

  /**
   * Warn once when a source of at least 10,000 rows is re-read because an
   * accessor function got a new identity and nothing else changed, three
   * times in a row or more than ten times a second (plan D16).
   */
  private noteAccessorChurn(next: NormalizedOptions<Row>): void {
    const change = accessorOnlyChange(this.normalized, next);
    if (!change) {
      this.churn.streak = 0;
      return;
    }
    const si = this.ingested.seriesIds.indexOf(change.id);
    const source = si < 0 ? undefined : this.ingested.sources[this.ingested.seriesSources[si]];
    const rows = source?.columns[0].length ?? 0;
    if (rows < CHURN_ROWS) return;
    const now = Date.now();
    this.churn.streak++;
    this.churn.times = [...this.churn.times.filter((time) => now - time < 1000), now];
    if (this.churn.streak >= 3 || this.churn.times.length > 10)
      warnOnce(
        'accessor-churn',
        `series "${change.id}" keeps getting a new ${change.field} function, and each one re-reads its ${formatValue(rows)} rows. Memoise the function, or use a field name.`,
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
    const plans = planAppend(
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
    const demoted = plans.filter((plan) => plan.demote);
    if (demoted.length) {
      // A scatter source whose X was sorted gets an append that is not: store it unsorted.
      for (const plan of demoted)
        this.unsorted.add(sourceKey(plan.source, sources[plan.source].axis));
      this.commit(this.normalized, ingest(this.normalized, this.context(this.normalized, false)));
      this.appendData(data, options);
      return;
    }
    for (const plan of plans) {
      const source = sources[plan.source];
      const bars = source.series.some((index) => this.normalized.series[index].type === 'bar');
      const length = this.engine.getSourceLength(plan.source);
      const previousIndex = length - (options.updateLast ? 2 : 1);
      if (
        bars &&
        source.xKind === 'category' &&
        plan.columns[0].length &&
        previousIndex >= 0 &&
        plan.columns[0][0] === this.engine.getSourceValue(plan.source, 0, previousIndex)
      )
        fail(
          'a bar series cannot append a category it already has; pass { updateLast: true } to correct the latest bar.',
        );
    }
    const newLabels = plans.some((plan) => plan.newLabels.length);
    if (newLabels) {
      const categories = categoryLabels(this.ingested);
      for (const plan of plans) {
        const axis = sources[plan.source].axis;
        categories.set(axis, [...(categories.get(axis) ?? []), ...plan.newLabels]);
      }
      validateGroup(this.options.group, { categories, axes: this.ingested.spec.axes ?? {} }, this);
    }
    const maxPoints = this.normalized.engine.streaming?.maxPoints;
    const changedAxes = new Set<string>();
    this.optionsSnapshot = undefined;
    this.mutating = true;
    try {
      for (const plan of plans) {
        const source = sources[plan.source];
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
      if (plans.some((plan) => plan.rows) && this.ingested.encodings.size) {
        // String encodings may have new categories: refresh their colour codes.
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
    } finally {
      this.mutating = false;
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
    let listeners = this.events.get(event);
    if (!listeners) {
      listeners = new Set();
      this.events.set(event, listeners);
    }
    listeners.add(listener as (value: never) => void);
    return () => listeners.delete(listener as (value: never) => void);
  }
  private emit<K extends keyof ChartEvents<Row>>(event: K, value: ChartEvents<Row>[K]): void {
    if (this.mutating || this.destroyed) return;
    for (const listener of this.events.get(event) ?? []) listener(value as never);
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
    if (!this.applyingControls && Object.hasOwn(this.controls, 'viewport')) {
      this.controls.onViewportChange?.({ ...this.state.viewport, ...viewport });
      return;
    }
    for (const [key, range] of Object.entries(viewport)) this.engine.setAxis(key, range);
    this.publish();
  }
  resetViewport(): void {
    this.engine.resetZoom();
    this.publish();
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
    this.engine.scrollToLatest();
    this.publish();
  }
  setSelection(selection: SelectionRange | null): void {
    this.engine.setSelection(selection);
  }
  setSeriesVisible(id: string, visible: boolean): void {
    const ids = this.ingested.seriesIds;
    if (!ids.includes(id)) unknownSeries('setSeriesVisible()', id, ids);
    const hidden = new Set(this.hidden);
    if (visible) hidden.delete(id);
    else hidden.add(id);
    if (equivalent([...hidden], [...this.hidden])) return;
    if (!this.applyingControls && Object.hasOwn(this.controls, 'hiddenSeries')) {
      this.controls.onHiddenSeriesChange?.([...hidden]);
      return;
    }
    this.hidden = hidden;
    this.engine.setOptions({
      series: this.engine.getOptions().series.map((series, si) => ({
        ...series,
        visible: !hidden.has(this.ingested.seriesIds[si]),
      })),
    });
    this.publish();
    this.emit('visibility:change', this.state.hiddenSeries);
    if (!this.applyingControls) {
      this.controls.onHiddenSeriesChange?.(this.state.hiddenSeries);
      this.callback('onHiddenSeriesChange', this.state.hiddenSeries);
    }
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
    this.engine.setHighlight(index < 0 ? null : index);
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
    const viewport: Record<string, ScaleRange> = {};
    for (const key of Object.keys(this.engine.getOptions().axes ?? {})) {
      const axis = this.engine.getAxis(key);
      if (axis) viewport[key] = Object.freeze({ min: axis.min, max: axis.max });
    }
    const selection = this.engine.getSelection();
    if (selection) {
      Object.freeze(selection.x);
      Object.freeze(selection);
    }
    return Object.freeze({
      viewport: Object.freeze(viewport),
      selection,
      hiddenSeries: Object.freeze([...this.hidden]),
      highlightedSeries: this.ingested.seriesIds[this.engine.getHighlight() ?? -1] ?? null,
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
      this.engine.on('cursor:move', () => {
        if (this.mutating) return;
        this.publish();
        this.emit('cursor:change', this.state.cursor);
        this.callback('onCursorChange', this.state.cursor);
        if (this.options.group?.options.cursor)
          broadcast(this.options.group, (member) => member.syncCursor(this.state.cursor.x), this);
      }),
      this.engine.on('viewport:change', (key, range) => {
        if (this.mutating) return;
        this.publish();
        this.emit('viewport:change', this.state.viewport);
        if (!this.applyingControls) {
          this.controls.onViewportChange?.(this.state.viewport);
          this.callback('onViewportChange', toViewport(this.state.viewport));
        }
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
        if (this.mutating) return;
        this.publish();
        this.emit('highlight:change', this.state.highlightedSeries);
        this.callback('onHighlightChange', this.state.highlightedSeries);
        if (this.options.group?.options.highlight)
          broadcast(
            this.options.group,
            (member) => member.syncHighlight(this.state.highlightedSeries),
            this,
          );
      }),
      this.engine.on('selection:change', (selection) => {
        if (this.mutating) return;
        this.publish();
        this.emit('selection:change', selection);
        if (!this.applyingControls) {
          this.controls.onSelectionChange?.(selection);
          this.callback(
            'onSelectionChange',
            selection && {
              x: [selection.x.min, selection.x.max] as const,
              ...(selection.y ? { y: [selection.y.min, selection.y.max] as const } : {}),
            },
          );
        }
      }),
      this.engine.on('select', (selection) => {
        const result = {
          ...selection,
          points: selection.points?.map((point) =>
            this.point(point.seriesIndex, point.dataIndex, point),
          ),
        };
        this.emit('select', result);
      }),
      this.engine.on('follow:change', (following) => {
        this.publish();
        this.emit('follow:change', following);
        this.callback('onFollowingChange', following);
      }),
      this.engine.on('theme:update', (theme) => {
        this.publish();
        this.emit('theme:update', theme);
      }),
      this.engine.on('resize', (width, height) => {
        this.publish();
        this.emit('resize', { width, height });
        coordinate(this.options.group);
      }),
    );
    // The internal engine emits a hit-tested point only after a non-drag click.
    const onPoint = (point: TooltipPoint) => {
      const result = this.point(point.seriesIndex, point.dataIndex, point);
      this.callback('onPointClick', result);
      this.emit('point:click', result);
    };
    this.off.push(this.engine.on('point:click', onPoint));
  }

  /** Call an on<Key>Change option with the current options' function. */
  private callback(name: keyof NormalizedOptions<Row>['callbacks'], value: unknown): void {
    (this.normalized.callbacks[name] as ((value: unknown) => void) | undefined)?.(value);
  }

  private installGuards(): void {
    this.engine.setInteractionGuards({
      viewport: (key, range) => {
        if (this.mutating || this.applyingControls || !Object.hasOwn(this.controls, 'viewport'))
          return true;
        this.controls.onViewportChange?.({ ...this.state.viewport, [key]: range });
        return false;
      },
      selection: (selection) => {
        if (this.mutating || this.applyingControls || !Object.hasOwn(this.controls, 'selection'))
          return true;
        this.controls.onSelectionChange?.(selection);
        return false;
      },
    });
  }
  private validateControls(controls: ChartControls, ingested = this.ingested): void {
    for (const [key, range] of Object.entries(controls.viewport ?? {})) {
      if (
        (key !== 'x' && key !== 'y' && !(key in (ingested.spec.axes ?? {}))) ||
        (ingested.spec.axes?.[key]?.type === 'log' && range.min <= 0) ||
        !Number.isFinite(range.min) ||
        !Number.isFinite(range.max) ||
        range.max <= range.min
      ) {
        fail(`the viewport of axis "${key}" needs an axis the chart has and finite min < max.`);
      }
    }
    const selection = controls.selection;
    if (selection && (!Number.isFinite(selection.x.min) || !Number.isFinite(selection.x.max)))
      fail('a selection needs finite bounds.');
    for (const id of controls.hiddenSeries ?? []) {
      if (!ingested.seriesIds.includes(id)) unknownSeries('hiddenSeries', id, ingested.seriesIds);
    }
  }

  setControls(controls: ChartControls): void {
    this.validateControls(controls);
    this.controls = controls;
    this.applyingControls = true;
    try {
      if (controls.viewport) this.setViewport(controls.viewport);
      if (Object.hasOwn(controls, 'selection')) this.setSelection(controls.selection ?? null);
      if (controls.hiddenSeries) {
        const hidden = new Set(controls.hiddenSeries);
        for (const id of this.ingested.seriesIds) this.setSeriesVisible(id, !hidden.has(id));
      }
    } finally {
      this.applyingControls = false;
    }
    this.publish();
  }
  private applyAccessibleName(): void {
    if (this.options.ariaLabel) {
      this.container.setAttribute('aria-label', this.options.ariaLabel);
      this.container.setAttribute('role', 'group');
    } else this.container.removeAttribute('aria-label');
  }
  destroy(): void {
    if (this.destroyed) return;
    groups.get(this.options.group!)?.members.delete(this);
    for (const off of this.off) off();
    this.engine.destroy();
    this.destroyed = true;
    this.subscribers.clear();
    this.events.clear();
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

/** Framework-only complete-prop reconciliation; applications use update(). */
export function reconcileChart<Row>(
  chart: ChartHandle<Row>,
  options: ChartOptions<Row>,
  controls?: ChartControls,
): void {
  if (!(chart instanceof Controller)) fail('expected a chart created by createChart().');
  chart.reconcile(options, false, controls);
}

/** Framework-only controlled state bridge. */
export function setChartControls<Row>(chart: ChartHandle<Row>, controls: ChartControls): void {
  if (!(chart instanceof Controller)) fail('expected a chart created by createChart().');
  chart.setControls(controls);
}

// The stores only skip validation inside ColumnarStore.trusted; keep the import live.
void ColumnarStore;
