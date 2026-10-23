import { ChartCore } from '../core/Chart';
import { inferPosition } from '../core/Layout';
import { createReferenceLinesPlugin } from '../plugins/builtins/referenceLinesPlugin';
import { createReferenceRegionsPlugin } from '../plugins/builtins/referenceRegionsPlugin';
import type {
  CursorSnapshotOptions,
  Plugin,
  ScaleRange,
  SelectionRange,
  TooltipPoint,
} from '../engine/spec';
import { prepareChart, type PreparedChart } from './prepare';
import { equivalent, patchOptions } from './options';
import type {
  AppendOptions,
  ChartEvents,
  ChartGroup,
  ChartGroupOptions,
  ChartHandle,
  ChartOptions,
  ChartPatch,
  ChartPlugin,
  ChartPoint,
  ChartState,
  CursorSnapshot,
  DataSource,
  SeriesOptions,
  ViewportRanges,
} from '../public/types';

export interface ChartControls {
  viewport?: ViewportRanges;
  selection?: SelectionRange | null;
  hiddenSeries?: readonly string[];
  onViewportChange?: (viewport: ViewportRanges) => void;
  onSelectionChange?: (selection: SelectionRange | null) => void;
  onHiddenSeriesChange?: (hiddenSeries: readonly string[]) => void;
}

interface GroupMember {
  getState(): Pick<ChartState, 'viewport' | 'highlightedSeries' | 'hiddenSeries'>;
  getOptions(): { axes?: ChartOptions['axes']; group?: ChartGroup };
  getAxis(key: string): Readonly<{ type: string; min: number; max: number }> | undefined;
  getLayout(): ReturnType<ChartHandle['getLayout']>;
  syncViewport(key: string, range: ScaleRange, reset: boolean): void;
  setCursor(x: number | Date | string | null): void;
  setHighlight(id: string | null): void;
  coordinatePadding(left: number | undefined, right: number | undefined): void;
  naturalRange(key: string): { min: number; max: number } | undefined;
  coordinateRange(key: string, range: { min: number; max: number }): void;
  groupCategories(): ReadonlyMap<string, readonly string[]>;
  detachGroup(group: ChartGroup): void;
}
interface GroupRecord {
  members: Set<GroupMember>;
  broadcasting: boolean;
  destroyed: boolean;
}
const groups = new WeakMap<ChartGroup, GroupRecord>();

/**
 * Link charts: pass the group as each chart's `group` option. Members share their cursor and
 * highlight and, with `viewport: true`, their horizontal viewport.
 *
 * @example
 * ```ts
 * const group = createChartGroup({ viewport: true });
 * createChart(a, { ...latency, group });
 * createChart(b, { ...errors, group });
 * ```
 */
export function createChartGroup(options: ChartGroupOptions = {}): ChartGroup {
  const record: GroupRecord = { members: new Set(), broadcasting: false, destroyed: false };
  const group: ChartGroup = {
    options: Object.freeze({ cursor: true, highlight: true, ...options }),
    setCursor(value) {
      broadcast(group, (member) => member.setCursor(value));
    },
    setHighlight(id) {
      broadcast(group, (member) => member.setHighlight(id));
    },
    destroy() {
      if (record.destroyed) return;
      record.destroyed = true;
      for (const member of record.members) member.detachGroup(group);
      record.members.clear();
    },
  };
  groups.set(group, record);
  return group;
}

function broadcast(
  group: ChartGroup | undefined,
  apply: (member: GroupMember) => void,
  source?: GroupMember,
): void {
  if (!group) return;
  const record = groups.get(group);
  if (!record || record.destroyed || record.broadcasting) return;
  record.broadcasting = true;
  try {
    for (const member of record.members) if (member !== source) apply(member);
  } finally {
    record.broadcasting = false;
  }
}

function validateGroup(
  group: ChartGroup | undefined,
  candidate: PreparedChart<unknown>,
  source?: GroupMember,
): void {
  if (!group) return;
  const record = groups.get(group);
  if (record?.destroyed && source?.getOptions().group === group) return;
  if (!record || record.destroyed)
    throw new Error('Snaplot: group must be a live createChartGroup() result.');
  for (const member of record.members) {
    if (member === source) continue;
    const keys = group.options.yRange ? ['x', group.options.yAxis ?? 'y'] : ['x'];
    for (const key of keys) {
      const axis = member.getAxis(key);
      const type = candidate.categories.has(key)
        ? 'category'
        : (candidate.config.axes?.[key]?.type ?? 'linear');
      if (axis && axis.type !== type)
        throw new Error(
          `Snaplot: group axis "${key}" has incompatible types (${axis.type} and ${type}).`,
        );
      if (
        type === 'category' &&
        !equivalent(member.groupCategories().get(key), candidate.categories.get(key))
      ) {
        throw new Error(
          `Snaplot: group axis "${key}" requires the same category order in every chart. Set axes.${key}.categories explicitly.`,
        );
      }
    }
  }
}

/**
 * Re-coordinate a group: align plot padding (`alignPlots`), then share Y
 * (`yRange`). Runs on mount, update, visibility and resize. Horizontal
 * viewport changes pass `shareY` only: they move no Y gutter, and the
 * padding pass costs two `setOptions` per member on every wheel or drag
 * event.
 */
function coordinate(group: ChartGroup | undefined, only?: 'shareY'): void {
  if (!group) return;
  const record = groups.get(group);
  if (!record || record.destroyed || record.broadcasting) return;
  record.broadcasting = true;
  try {
    if (only !== 'shareY' && group.options.alignPlots && record.members.size) {
      // Measure each member's own gutters, not the previous group's maximum.
      for (const member of record.members) member.coordinatePadding(undefined, undefined);
      const layouts = [...record.members].map((member) => member.getLayout());
      const left = Math.max(...layouts.map((layout) => layout.plot.left));
      const right = Math.max(
        ...layouts.map((layout) => layout.width - layout.plot.left - layout.plot.width),
      );
      for (const member of record.members) member.coordinatePadding(left, right);
    }
    if (group.options.yRange) {
      const key = group.options.yAxis ?? 'y';
      const domains = [...record.members]
        .map((member) => member.naturalRange(key))
        .filter((axis) => !!axis);
      if (domains.length) {
        const range = {
          min: Math.min(...domains.map((axis) => axis.min)),
          max: Math.max(...domains.map((axis) => axis.max)),
        };
        for (const member of record.members) member.coordinateRange(key, range);
      }
    }
  } finally {
    record.broadcasting = false;
  }
}

class Controller<Row> implements ChartHandle<Row>, GroupMember {
  readonly container: HTMLElement;
  private engine: ChartCore;
  private options: ChartOptions<Row>;
  private optionsSnapshot?: ChartOptions<Row>;
  private prepared: PreparedChart<Row>;
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
  private identityHeads: number[] = [];
  private nextIndices: number[] = [];
  private streamedSources = new Set<number>();

  constructor(element: HTMLElement, options: ChartOptions<Row>) {
    this.container = element;
    this.options = options;
    this.prepared = prepareChart(options);
    this.cloneIdentities(this.prepared);
    validateGroup(options.group, this.prepared);
    this.resetIdentityTracking();
    const config = this.configFor(this.prepared, options);
    // User plugin install hooks need the completed public handle, not a half-built engine,
    // so plugins are installed below, and the engine's first paint waits for them.
    this.engine = new ChartCore(
      element,
      { ...config, plugins: [] },
      this.prepared,
      /* deferFirstPaint */ true,
    );
    // Plan D31: untyped debug counters for tests and the bench, never part of
    // ChartHandle. Non-enumerable so nothing that walks the handle sees it.
    Object.defineProperty(this, Symbol.for('snaplot.debug'), {
      get: () => this.engine.debugSnapshot(),
    });
    this.applyAccessibleName();
    this.state = this.readState();
    this.bindEngine();
    this.installGuards();
    this.lines.setLines(this.prepared.referenceLines);
    this.regions.setRegions(this.prepared.referenceRegions);
    for (const plugin of config.plugins ?? []) this.engine.use(plugin);
    // The mount paint: nothing repaints an unchanged box after it, so it must
    // draw the annotations and plugins (gap-annotations-extensibility-06:mount).
    this.engine.paint();
    groups.get(options.group!)?.members.add(this);
    coordinate(options.group);
    this.state = this.readState();
  }

  private configFor(prepared: PreparedChart<Row>, options: ChartOptions<Row>) {
    const plugins = [
      this.regions,
      this.lines,
      ...(options.plugins ?? []).map((plugin) => this.bridge(plugin)),
    ];
    const tooltipOptions = typeof options.tooltip === 'object' ? options.tooltip : undefined;
    const renderTooltip = tooltipOptions?.render;
    const formatTooltipX = tooltipOptions?.xFormat;
    return {
      ...prepared.config,
      tooltip: {
        ...prepared.config.tooltip,
        ...(formatTooltipX
          ? {
              xFormat: (value: number) =>
                formatTooltipX(this.prepared.categories.get('x')?.[Math.round(value)] ?? value),
            }
          : {}),
        ...(renderTooltip
          ? {
              render: (points: TooltipPoint[]) =>
                renderTooltip(
                  points.map((point) => this.point(point.seriesIndex, point.dataIndex, point)),
                ),
            }
          : {}),
      },
      series: prepared.config.series.map((series, index) => {
        const fill = (options.series[index] as { fill?: unknown }).fill;
        return {
          ...series,
          visible: !this.hidden.has(prepared.seriesIds[index]),
          ...(typeof fill === 'function'
            ? {
                fill: (value: number, rowIndex: number) => {
                  const currentIndex = this.prepared.seriesIds.indexOf(prepared.seriesIds[index]);
                  const identity = this.prepared.identities[currentIndex];
                  const position = rowIndex + (this.identityHeads[currentIndex] ?? 0);
                  return (fill as (value: number, index: number, row?: Row) => string)(
                    value,
                    identity.sourceIndices[position],
                    identity.rows?.[position],
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
        console.error(`Snaplot: plugin "${plugin.id}" ${hook} hook failed.`, error);
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
    this.reconcile(patchOptions(this.options, patch), Object.hasOwn(patch, 'data'));
  }

  reconcile(next: ChartOptions<Row>, forceData = false, controls?: ChartControls): void {
    if (this.destroyed) return;
    if (!forceData && equivalent(this.options, next)) {
      if (controls) this.setControls(controls);
      return;
    }
    const live = this.withLiveData(next, forceData);
    const previousAxisTypes = new Map(
      Object.entries(this.prepared.config.axes ?? {})
        .filter(([key]) => this.options.axes?.[key]?.type === undefined)
        .map(([key, axis]) => [key, axis.type ?? 'linear'] as const),
    );
    const prepared = prepareChart(live, this.prepared.categories, {
      previousAxisTypes,
      previousEncodingCategories: this.prepared.encodingCategories,
    });
    this.cloneIdentities(prepared);
    if (controls) this.validateControls(controls, prepared);
    validateGroup(next.group, prepared, this);
    const previous = {
      prepared: this.prepared,
      options: this.options,
      hidden: this.hidden,
      optionsSnapshot: this.optionsSnapshot,
    };
    const preservedSources = new Map<number, number>();
    // Live inputs are temporary ingestion snapshots. Keep declared input references
    // separately (this.options), and carry original source positions through re-ingestion.
    prepared.seriesIds.forEach((id, si) => {
      const nextSeries = next.series[si];
      const nextInput = nextSeries.data ?? next.data;
      let oldIndex = previous.prepared.seriesIds.indexOf(id);
      if (oldIndex < 0)
        oldIndex = previous.options.series.findIndex(
          (series, index) =>
            (series.data ?? previous.options.data) === nextInput &&
            this.streamedSources.has(previous.prepared.seriesSources[index]),
        );
      if (oldIndex < 0) return;
      const oldSource = previous.prepared.seriesSources[oldIndex];
      if (!this.streamedSources.has(oldSource)) return;
      const oldSeries = previous.options.series[oldIndex];
      const oldInput = oldSeries.data ?? previous.options.data;
      if (oldInput !== nextInput || (forceData && nextSeries.data === undefined)) return;
      const oldIdentity = previous.prepared.identities[oldIndex];
      const head = this.identityHeads[oldIndex] ?? 0;
      prepared.identities[si].sourceIndices = prepared.identities[si].sourceIndices.map(
        (index) => oldIdentity.sourceIndices[index + head],
      );
      preservedSources.set(prepared.seriesSources[si], oldSource);
    });
    const previousNextIndices = this.nextIndices.slice();
    const highlighted = this.state.highlightedSeries;
    this.hidden = new Set([...this.hidden].filter((id) => prepared.seriesIds.includes(id)));
    this.mutating = true;
    try {
      this.prepared = prepared;
      this.options = next;
      this.optionsSnapshot = undefined;
      this.engine.replaceSources(
        this.configFor(prepared, live),
        prepared.sources,
        prepared.seriesSources,
      );
      this.lines.setLines(prepared.referenceLines);
      this.regions.setRegions(prepared.referenceRegions);
      this.engine.setHighlight(highlighted ? prepared.seriesIds.indexOf(highlighted) : null);
      this.resetIdentityTracking();
      for (const [source, oldSource] of preservedSources) {
        this.streamedSources.add(source);
        this.nextIndices[source] = previousNextIndices[oldSource];
      }
      this.applyAccessibleName();
      if (controls) this.setControls(controls);
      if (previous.options.group !== next.group) {
        if (previous.options.group) this.detachGroup(previous.options.group);
        groups.get(previous.options.group!)?.members.delete(this);
        groups.get(next.group!)?.members.add(this);
      }
    } catch (error) {
      this.prepared = previous.prepared;
      this.options = previous.options;
      this.optionsSnapshot = previous.optionsSnapshot;
      this.hidden = previous.hidden;
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

  private withLiveData(next: ChartOptions<Row>, forceData: boolean): ChartOptions<Row> {
    if (!this.streamedSources.size) return next;
    const replacement = new Map<DataSource<Row> | undefined, DataSource<Row>>();
    for (const source of this.streamedSources) {
      const input = this.prepared.sourceInputs[source];
      const si = this.prepared.seriesSources.indexOf(source);
      const declaredInput = (this.options.series[si]?.data ?? this.options.data) as
        | DataSource<Row>
        | undefined;
      const identity = this.prepared.identities[si];
      if (Array.isArray(input)) {
        const head = this.identityHeads[si] ?? 0;
        replacement.set(declaredInput, identity.rows!.slice(head));
      } else if ('columns' in input) {
        const columns: Record<string, Float64Array> = {};
        const data = this.engine.getSourceData(source);
        // Preparation reuses named columns; locate their original normalized index.
        for (const name of Object.keys(input.columns)) {
          const index = this.prepared.sourceFields[source].indexOf(name);
          if (index >= 0) columns[name] = data[index];
        }
        replacement.set(declaredInput, {
          columns,
          ...(identity.rowIds
            ? { rowIds: identity.rowIds.slice(this.identityHeads[si] ?? 0) }
            : {}),
        });
      }
    }
    return {
      ...next,
      data:
        !forceData && next.data === this.options.data
          ? (replacement.get(next.data!) ?? next.data)
          : next.data,
      series: next.series.map((series) => {
        const old = this.options.series.find(
          (candidate) =>
            candidate.id === series.id &&
            ('y' in candidate ? candidate.y : undefined) === ('y' in series ? series.y : undefined),
        );
        const own = series.data as DataSource<Row> | undefined;
        return own && old?.data === series.data
          ? ({ ...series, data: replacement.get(own) ?? own } as typeof series)
          : series;
      }),
    };
  }

  private cloneIdentities(prepared: PreparedChart<Row>): void {
    prepared.identities = prepared.identities.map((identity) => ({
      sourceIndices: identity.sourceIndices.slice(),
      ...(identity.rows ? { rows: identity.rows.slice() } : {}),
      ...(identity.rowIds ? { rowIds: identity.rowIds.slice() } : {}),
    }));
  }

  private resetIdentityTracking(): void {
    this.identityHeads = this.prepared.identities.map((_identity, si) => {
      const length = this.prepared.sources[this.prepared.seriesSources[si]][0].length;
      return Math.max(0, length - (this.options.streaming?.maxPoints ?? length));
    });
    this.nextIndices = this.prepared.sources.map((data, source) => {
      const si = this.prepared.seriesSources.indexOf(source);
      return (
        this.prepared.identities[si]?.sourceIndices.reduce(
          (max, index) => Math.max(max, index + 1),
          data[0].length,
        ) ?? data[0].length
      );
    });
    this.streamedSources.clear();
  }

  appendData(data: DataSource<Row>, options: AppendOptions = {}): void {
    if (this.destroyed) return;
    const id = options.seriesId;
    const si = id === undefined ? -1 : this.prepared.seriesIds.indexOf(id);
    if (id !== undefined && si < 0) throw new Error(`Snaplot: unknown series "${id}".`);
    const sources = new Set<number>();
    if (si >= 0) sources.add(this.prepared.seriesSources[si]);
    else
      this.options.series.forEach((series, index) => {
        if (series.data === undefined) sources.add(this.prepared.seriesSources[index]);
      });
    if (!sources.size) throw new Error('Snaplot: appending independent data requires a seriesId.');
    const selected = this.options.series.filter((_series, index) =>
      sources.has(this.prepared.seriesSources[index]),
    );
    const appendSeries = selected.map((series) => {
      if (series.type === 'histogram')
        throw new Error(
          'Snaplot: update histogram bins atomically with update(); bins are not streaming observations.',
        );
      return { ...series, data } as SeriesOptions<Row>;
    });
    const batch = prepareChart(
      { ...this.options, data, series: appendSeries },
      this.prepared.categories,
      { sortRows: false, previousEncodingCategories: this.prepared.encodingCategories },
    );
    const sourceMap = new Map<number, number>();
    batch.seriesIds.forEach((seriesId, index) => {
      sourceMap.set(
        batch.seriesSources[index],
        this.prepared.seriesSources[this.prepared.seriesIds.indexOf(seriesId)],
      );
    });
    // Preflight every source before the first append: failed batches cannot partly commit.
    for (const [batchSource, source] of sourceMap) {
      const columns = batch.sources[batchSource];
      const currentLength = this.engine.getSourceLength(source);
      if (!equivalent(batch.sourceFields[batchSource], this.prepared.sourceFields[source]))
        throw new Error('Snaplot: append fields must match the current source schema.');
      const seriesIndices = batch.seriesSources.flatMap((value, index) =>
        value === batchSource ? [index] : [],
      );
      if (
        seriesIndices.every(
          (index) =>
            batch.config.series[index].type === 'scatter' &&
            (batch.config.series[index].xColumn ?? 0) !== 0,
        )
      ) {
        const offset = currentLength
          ? this.engine.getSourceValue(source, 0, currentLength - 1) + (options.updateLast ? 0 : 1)
          : 0;
        columns[0] = Float64Array.from(columns[0], (value) => value + offset);
      }
      const previousIndex = currentLength - (options.updateLast ? 2 : 1);
      if (
        columns[0].length &&
        previousIndex >= 0 &&
        columns[0][0] < this.engine.getSourceValue(source, 0, previousIndex)
      ) {
        throw new Error(
          'Snaplot: streaming X must be ordered after the existing source; append batches are never sorted automatically.',
        );
      }
      const hasCategoryBars = seriesIndices.some(
        (index) =>
          batch.config.series[index].type === 'bar' &&
          batch.categories.has(batch.config.series[index].xAxis ?? 'x'),
      );
      if (
        hasCategoryBars &&
        columns[0].length &&
        previousIndex >= 0 &&
        columns[0][0] === this.engine.getSourceValue(source, 0, previousIndex)
      ) {
        throw new Error(
          'Snaplot: bar series cannot append a duplicate category; use updateLast to correct its latest observation.',
        );
      }
    }
    const categoriesChanged = !equivalent([...batch.categories], [...this.prepared.categories]);
    if (categoriesChanged)
      validateGroup(this.options.group, { ...this.prepared, categories: batch.categories }, this);
    const encodingsChanged = !equivalent(
      [...batch.encodingCategories],
      [...this.prepared.encodingCategories],
    );
    this.optionsSnapshot = undefined;
    this.mutating = true;
    try {
      for (const [batchSource, source] of sourceMap) {
        const count = batch.sources[batchSource][0].length;
        if (!count) continue;
        const oldLength = this.engine.getSourceLength(source);
        this.engine.appendToSource(source, batch.sources[batchSource], options);
        const newLength = this.engine.getSourceLength(source);
        const replace = !!options.updateLast && oldLength > 0;
        const removed = Math.max(0, oldLength + count - (replace ? 1 : 0) - newLength);
        batch.seriesIds.forEach((seriesId, bi) => {
          if (batch.seriesSources[bi] !== batchSource) return;
          const index = this.prepared.seriesIds.indexOf(seriesId);
          const identity = this.prepared.identities[index];
          const incoming = batch.identities[bi];
          const rows = identity.rows as Row[] | undefined;
          if (replace) {
            identity.sourceIndices.pop();
            rows?.pop();
            identity.rowIds?.pop();
          }
          const start = this.nextIndices[source] - (replace ? 1 : 0);
          for (let row = 0; row < count; row++) {
            identity.sourceIndices.push(start + incoming.sourceIndices[row]);
            if (rows && incoming.rows) rows.push(incoming.rows[row]);
            if (identity.rowIds && incoming.rowIds) identity.rowIds.push(incoming.rowIds[row]);
          }
          this.identityHeads[index] += removed;
          if (this.identityHeads[index] > Math.max(256, newLength)) {
            const head = this.identityHeads[index];
            identity.sourceIndices.splice(0, head);
            rows?.splice(0, head);
            identity.rowIds?.splice(0, head);
            this.identityHeads[index] = 0;
          }
        });
        this.nextIndices[source] += count - (replace ? 1 : 0);
        this.streamedSources.add(source);
      }
      this.prepared.encodingCategories = batch.encodingCategories;
      if (encodingsChanged) {
        batch.seriesIds.forEach((id, bi) => {
          const index = this.prepared.seriesIds.indexOf(id);
          const incoming = batch.config.series[bi];
          this.prepared.config.series[index] = {
            ...this.prepared.config.series[index],
            colorBy: incoming.colorBy,
            sizeBy: incoming.sizeBy,
            tooltipFields: incoming.tooltipFields,
          };
        });
        this.engine.setOptions({ series: this.configFor(this.prepared, this.options).series });
      }
      if (categoriesChanged) {
        this.prepared.categories = batch.categories;
        const axes = Object.fromEntries(
          [...batch.categories.keys()].map((key) => [key, batch.config.axes![key]]),
        );
        this.prepared.config.axes = { ...this.prepared.config.axes, ...axes };
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
    if (this.mutating) return this.withLiveData(this.options, false);
    return (this.optionsSnapshot ??= this.withLiveData(this.options, false));
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
        throw new Error(
          `Snaplot: viewport "${key}" requires an existing axis and finite min < max.`,
        );
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
    const index = this.prepared.seriesIds.indexOf(id);
    if (index < 0) throw new Error(`Snaplot: unknown series "${id}".`);
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
        visible: !hidden.has(this.prepared.seriesIds[si]),
      })),
    });
    this.publish();
    this.emit('visibility:change', this.state.hiddenSeries);
    if (!this.applyingControls) this.controls.onHiddenSeriesChange?.(this.state.hiddenSeries);
    coordinate(this.options.group);
  }
  setHighlight(id: string | null): void {
    const index = id === null ? -1 : this.prepared.seriesIds.indexOf(id);
    this.engine.setHighlight(index < 0 ? null : index);
  }
  setCursor(x: number | Date | string | null): void {
    const categories = this.prepared.categories.get('x');
    const value =
      typeof x === 'string' ? (categories?.indexOf(x) ?? -1) : x instanceof Date ? x.getTime() : x;
    this.engine.setCursorDataX(value === -1 ? null : value);
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
    const source = this.prepared.seriesSources[si];
    const series = this.prepared.config.series[si];
    const identity = this.prepared.identities[si];
    const position = index + (this.identityHeads[si] ?? 0);
    const x = values?.x ?? this.engine.getSourceValue(source, series.xColumn ?? 0, index);
    const y = values?.y ?? this.engine.getSourceValue(source, series.yColumn ?? 1, index);
    const axis = series.xAxis ?? 'x';
    const actualX = this.prepared.categories.get(axis)?.[Math.round(x)] ?? x;
    const fieldIndices = values?.fields
      ? [
          ...new Set(
            [series.colorBy, series.sizeBy, ...(series.tooltipFields ?? [])]
              .filter((field) => field !== undefined)
              .map((field) => (typeof field === 'number' ? field : field!.column)),
          ),
        ].filter((column) => column >= 0 && column < this.prepared.sourceFields[source].length)
      : [];
    const fields = values?.fields?.map((field, index) => {
      const descriptor = this.prepared.sourceFields[source][fieldIndices[index]];
      const labels =
        typeof descriptor === 'string' && descriptor.startsWith('encoding:')
          ? this.prepared.encodingCategories.get(descriptor.slice('encoding:'.length))
          : undefined;
      return { ...field, value: labels?.[field.value] ?? field.value };
    });
    const point: ChartPoint<Row> = {
      seriesId: this.prepared.seriesIds[si],
      label: series.label,
      row: identity.rows?.[position],
      rowIndex: identity.sourceIndices[position] ?? index,
      rowId: identity.rowIds?.[position],
      x: actualX,
      y,
      formattedX: values?.formattedX ?? this.format(axis, x),
      formattedY: values?.formattedY ?? this.readout(series.yAxis ?? 'y', y),
      color: values?.color ?? this.engine.getLegendItems()[si]?.color ?? '',
      meta: series.meta,
      ...(values?.xRange ? { xRange: { ...values.xRange } } : {}),
      ...(values?.radius !== undefined ? { radius: values.radius } : {}),
      ...(fields ? { fields } : {}),
    };
    const formatter = this.options.series[si]?.format as
      | ((value: number, point?: ChartPoint<Row>) => string)
      | undefined;
    const tooltipOptions =
      typeof this.options.tooltip === 'object' ? this.options.tooltip : undefined;
    if (!tooltipOptions?.yFormat && typeof formatter === 'function')
      point.formattedY = formatter(y, point);
    return point;
  }
  /** A value readout at value precision (plan P9); the axis format still wins here. */
  private readout(axis: string, value: number): string {
    if (!Number.isFinite(value)) return '';
    const formatter = this.prepared.config.axes?.[axis]?.format;
    return formatter ? formatter(value) : this.engine.formatReadout(axis, value);
  }
  private format(axis: string, value: number): string {
    if (!Number.isFinite(value)) return '';
    const formatter = this.prepared.config.axes?.[axis]?.format;
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
          : (this.prepared.categories.get('x')?.[Math.round(snapshot.dataX)] ?? snapshot.dataX),
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
          : this.prepared.seriesIds[snapshot.activeSeriesIndex],
    });
  }
  getLegendItems() {
    return this.engine.getLegendItems().map(({ seriesIndex: _index, ...item }, index) => ({
      ...item,
      id: this.prepared.seriesIds[index],
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
  getAxis(key: string) {
    const axis = this.engine.getAxis(key);
    return axis
      ? Object.freeze({
          type: this.prepared.categories.has(key) ? 'category' : axis.type,
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
  groupCategories() {
    return this.prepared.categories;
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
      const key = group.options.yAxis ?? 'y';
      const ownRange = this.naturalRange(key);
      if (ownRange) this.engine.setCoordinatedAxis(key, ownRange);
    }
    this.publish();
  }
  coordinatePadding(left: number | undefined, right: number | undefined): void {
    const padding = this.options.padding as { left?: number; right?: number } | undefined;
    this.engine.setOptions({
      padding: {
        ...padding,
        left: left ?? padding?.left ?? 56,
        right: right ?? padding?.right ?? 24,
      },
    });
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
      highlightedSeries: this.prepared.seriesIds[this.engine.getHighlight() ?? -1] ?? null,
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
        if (this.options.group?.options.cursor)
          broadcast(this.options.group, (member) => member.setCursor(this.state.cursor.x), this);
      }),
      this.engine.on('viewport:change', (key, range) => {
        if (this.mutating) return;
        this.publish();
        this.emit('viewport:change', this.state.viewport);
        if (!this.applyingControls) this.controls.onViewportChange?.(this.state.viewport);
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
        if (this.options.group?.options.highlight)
          broadcast(
            this.options.group,
            (member) => member.setHighlight(this.state.highlightedSeries),
            this,
          );
      }),
      this.engine.on('selection:change', (selection) => {
        if (this.mutating) return;
        this.publish();
        this.emit('selection:change', selection);
        if (!this.applyingControls) this.controls.onSelectionChange?.(selection);
      }),
      this.engine.on('select', (selection) => {
        const result = {
          ...selection,
          points: selection.points?.map((point) =>
            this.point(point.seriesIndex, point.dataIndex, point),
          ),
        };
        this.options.onSelect?.(result);
        this.emit('select', result);
      }),
      this.engine.on('follow:change', (following) => {
        this.publish();
        this.emit('follow:change', following);
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
      this.options.onPointClick?.(result);
      this.emit('point:click', result);
    };
    this.off.push(this.engine.on('point:click', onPoint));
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
  private validateControls(controls: ChartControls, prepared = this.prepared): void {
    for (const [key, range] of Object.entries(controls.viewport ?? {})) {
      if (
        (key !== 'x' && key !== 'y' && !(key in (prepared.config.axes ?? {}))) ||
        (prepared.config.axes?.[key]?.type === 'log' && range.min <= 0) ||
        !Number.isFinite(range.min) ||
        !Number.isFinite(range.max) ||
        range.max <= range.min
      ) {
        throw new Error(
          `Snaplot: viewport "${key}" requires an existing axis and finite min < max.`,
        );
      }
    }
    const selection = controls.selection;
    if (selection && (!Number.isFinite(selection.x.min) || !Number.isFinite(selection.x.max)))
      throw new Error('Snaplot: selection requires finite bounds.');
    for (const id of controls.hiddenSeries ?? []) {
      if (!prepared.seriesIds.includes(id))
        throw new Error(`Snaplot: unknown hidden series "${id}".`);
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
        for (const id of this.prepared.seriesIds) this.setSeriesVisible(id, !hidden.has(id));
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
  if (!(chart instanceof Controller))
    throw new Error('Snaplot: expected a chart created by createChart().');
  chart.reconcile(options, false, controls);
}

/** Framework-only controlled state bridge. */
export function setChartControls<Row>(chart: ChartHandle<Row>, controls: ChartControls): void {
  if (!(chart instanceof Controller))
    throw new Error('Snaplot: expected a chart created by createChart().');
  chart.setControls(controls);
}
