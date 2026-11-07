/**
 * appendData() planning and commits (plan D23): every target source is
 * validated and its columns built before anything changes; the commit then
 * grows the retained rows, ids and categories and evicts from the front.
 */
import type { ChartCore } from '../engine/Engine';
import { fail } from '../engine/errors';
import type { AxisSpec, ChartSpec, ColumnarData } from '../engine/spec';
import { coordinate, type GroupMember, validateGroup } from './group';
import { categoryAxisSpec, refreshColorCodes } from './describe';
import { ingest } from './ingest';
import type { AccessorLike, NormalizedOptions } from './normalize';
import {
  cellValue,
  describe,
  fieldLabel,
  type Ingested,
  type IngestContext,
  indexColumn,
  isBins,
  isColumns,
  isRowId,
  numeric,
  parseIso,
  read,
  type SourceState,
  sourceKey,
} from './sources';
import type { AppendOptions, ChartOptions, ColumnData, DataSource, RowId } from './types';

// ─── The append path ─────────────────────────────────────────────────

/** What an append reads and calls on its chart (the controller in chart.ts). */
export interface AppendHost<Row> extends GroupMember {
  readonly engine: ChartCore;
  readonly options: ChartOptions<Row>;
  readonly ingested: Ingested<Row>;
  readonly normalized: NormalizedOptions<Row>;
  context(normalized: NormalizedOptions<Row>, forceData: boolean): IngestContext<Row>;
  commit(
    normalized: NormalizedOptions<Row>,
    ingested: Ingested<Row>,
    after?: () => void,
    quiet?: boolean,
  ): void;
  configFor(ingested: Ingested<Row>, normalized: NormalizedOptions<Row>): Partial<ChartSpec>;
  publish(): void;
}

/**
 * `appendData()` (plan D23): the target sources, a plan for each (every check runs first), then
 * the commit: rows into the engine, retained rows and categories, and the options they change.
 */
export function appendRows<Row>(
  chart: AppendHost<Row>,
  data: DataSource<Row>,
  options: AppendOptions,
): void {
  const { seriesIds, seriesSources, sources } = chart.ingested;
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
    chart.normalized.series.forEach((series, index) => {
      if (series.data === undefined) targets.add(seriesSources[index]);
    });
  }
  if (!targets.size)
    fail(
      'appendData() without a seriesId extends the chart data, but every series has its own data. Pass { seriesId }.',
    );
  const plan = () =>
    planAppend(
      chart.ingested,
      chart.normalized,
      [...targets],
      data,
      options,
      chart.context(chart.normalized, false),
      (source, back) => {
        const length = chart.engine.getSourceLength(source);
        return chart.engine.getSourceValue(source, 0, length - back);
      },
      (source) => chart.engine.getSourceLength(source),
    );
  let plans = plan();
  const newLabels = plans.some((plan) => plan.newLabels.size);
  if (newLabels) {
    const categories = categoryLabels(chart.ingested);
    for (const plan of plans) {
      const axis = sources[plan.source].axis;
      categories.set(axis, [...(categories.get(axis) ?? []), ...plan.newLabels.keys()]);
    }
    validateGroup(chart.options.group, { categories, axes: chart.ingested.spec.axes ?? {} }, chart);
  }
  // Every check has run. A scatter source whose X was sorted gets an append that is not: store
  // it unsorted (the same data, so no event), then plan again, which passes the same checks.
  const demoted = plans.filter((plan) => plan.demote);
  if (demoted.length) {
    const unsorted = new Set(
      demoted.map((plan) => sourceKey(plan.source, sources[plan.source].axis)),
    );
    chart.commit(
      chart.normalized,
      ingest(chart.normalized, { ...chart.context(chart.normalized, false), unsorted }),
      undefined,
      /* quiet */ true,
    );
    plans = plan();
  }
  // Plans share their encoding lists, which hold only the lists this append adds labels to.
  const newEncodingLabels = plans.some((plan) => plan.encodings?.size);
  const maxPoints = chart.normalized.engine.streaming?.maxPoints;
  const changedAxes = new Set<string>();
  for (const plan of plans) {
    const source = chart.ingested.sources[plan.source];
    const count = plan.columns[0].length;
    if (!count) continue;
    const length = chart.engine.getSourceLength(plan.source);
    // updateLast replaces the latest row if there is one; on empty data it appends.
    const replace = options.updateLast && length > 0 ? 1 : 0;
    const evicted = maxPoints === undefined ? 0 : Math.max(0, length + count - replace - maxPoints);
    const evictedCodes: number[] = [];
    if (source.xKind === 'category') {
      const xi = source.sortedX ? 0 : source.fields.findIndex((field) => field.kind === 'x');
      for (let i = 0; i < Math.min(evicted, length - replace); i++)
        evictedCodes.push(chart.engine.getSourceValue(plan.source, xi, i));
      if (replace) evictedCodes.push(chart.engine.getSourceValue(plan.source, xi, length - 1));
      const fromBatch = evicted - Math.min(evicted, length - replace);
      for (let i = 0; i < fromBatch; i++) evictedCodes.push(plan.codes![i]);
    }
    chart.engine.appendToSource(plan.source, plan.columns, options, /* trusted */ true);
    if (commitAppend(chart.ingested, plan, replace > 0, evicted, evictedCodes))
      changedAxes.add(source.axis);
  }
  if (newEncodingLabels) {
    // New colorBy or tooltip labels: the series specs list them now (refreshColorCodes).
    // Known labels change no series, so the append repaints only the data layer.
    chart.engine.setOptions({ series: chart.configFor(chart.ingested, chart.normalized).series });
  }
  if (changedAxes.size) {
    const axes = Object.fromEntries(
      [...changedAxes].map((key) => [
        key,
        refreshCategoryAxis(chart.ingested, chart.normalized, key),
      ]),
    );
    chart.engine.setOptions({ axes });
  }
  chart.publish();
  coordinate(chart.options.group);
}

// ─── Appends ─────────────────────────────────────────────────────────

/** A validated append to one source, ready to commit. */
export interface SourceAppend<Row> {
  source: number;
  columns: ColumnarData;
  rows?: Row[];
  index?: number[];
  rowIds?: RowId[];
  /** X category codes per appended row, when the axis is a category axis. */
  codes?: number[];
  /** The new category labels this plan introduces, with the codes it gave them, in code order. */
  newLabels: Map<string, number>;
  /**
   * The string encoding label lists (colorBy, tooltipFields) this append adds labels to, by
   * key, with the new labels at their end; set on commit. Shared by the append's row plans.
   */
  encodings?: Map<string, string[]>;
  /** The scatter source must be stored unsorted before this append fits. */
  demote?: true;
}

/** New X category labels of one append on one axis, shared by the sources on that axis. */
interface PendingCategories {
  codes: Map<string, number>;
  next: number;
}

/**
 * Validate an append to the given sources and build its columns, changing
 * nothing (D23): one kind per source, X order, row ids and X kinds checked
 * before any commit.
 */
export function planAppend<Row>(
  ingested: Ingested<Row>,
  n: NormalizedOptions<Row>,
  targets: number[],
  data: DataSource<Row>,
  options: AppendOptions,
  ctx: IngestContext<Row>,
  lastX: (source: number, back: number) => number,
  length: (source: number) => number,
): SourceAppend<Row>[] {
  const out: SourceAppend<Row>[] = [];
  // Copies of the label lists this append adds to, shared by its targets and set on commit.
  const encodings = new Map<string, string[]>();
  // New X categories by axis, shared too: two sources on one axis give a new label one code.
  const categories = new Map<string, PendingCategories>();
  for (const target of targets) {
    const source = ingested.sources[target];
    const path = `appendData() to series "${ingested.seriesIds[source.series[0]]}"`;
    if (source.kind === 'bins' || isBins(data))
      fail('histogram bins cannot be appended; pass new histogram() bins with update({ series }).');
    if (source.kind === 'grid')
      fail(
        `${path}: a heatmap grid cannot be appended; pass a new grid with update({ series }), or give the heatmap rows.`,
      );
    if (source.kind === 'rows' && !Array.isArray(data))
      fail(
        `${path}: this data is rows, so append rows, not { columns }. A source is either rows or columns.`,
      );
    if (source.kind === 'columns' && !isColumns(data))
      fail(
        `${path}: this data is { columns }, so append { columns }, not rows. A source is either rows or columns.`,
      );
    ctx.counters.xValidations++;
    out.push(
      source.kind === 'rows'
        ? planRows(
            ingested,
            n,
            target,
            data as Row[],
            options,
            path,
            lastX,
            length,
            encodings,
            categories,
          )
        : planColumns(ingested, target, data as ColumnData, options, path, lastX, length),
    );
  }
  return out;
}

function checkOrder(
  target: number,
  first: number,
  options: AppendOptions,
  path: string,
  lastX: (source: number, back: number) => number,
  length: (source: number) => number,
): void {
  const back = options.updateLast ? 2 : 1;
  if (length(target) - back < 0) return;
  const last = lastX(target, back);
  if (first < last)
    fail(
      `${path} starts at x ${first}, before the last x the chart holds (${last}). Append rows in x order, or replace the data with update({ data }).`,
    );
}

function planRows<Row>(
  ingested: Ingested<Row>,
  n: NormalizedOptions<Row>,
  target: number,
  batch: Row[],
  options: AppendOptions,
  path: string,
  lastX: (source: number, back: number) => number,
  length: (source: number) => number,
  encodings: Map<string, string[]>,
  categories: Map<string, PendingCategories>,
): SourceAppend<Row> {
  const source = ingested.sources[target];
  const count = batch.length;
  const start = source.nextIndex - (options.updateLast && length(target) > 0 ? 1 : 0);
  const registry = ingested.categories.get(source.axis);
  const newLabels = new Map<string, number>();
  // Messages are built only for a row that fails: the loops below run once per row.
  const where = (i: number) => `${path}: x of appended row ${i}`;
  const code = (label: string, row: number) => {
    const known = registry!.codes.get(label);
    if (known !== undefined) return known;
    if (registry!.explicit) registry!.unknown(where(row), label);
    let pending = categories.get(source.axis);
    if (!pending) {
      pending = { codes: new Map(), next: registry!.nextCode };
      categories.set(source.axis, pending);
    }
    let c = pending.codes.get(label);
    if (c === undefined) {
      c = pending.next++;
      pending.codes.set(label, c);
      newLabels.set(label, c);
    }
    return c;
  };
  // X, in the source's kind.
  const x = new Float64Array(count);
  const xPath = `${path} x`;
  for (let i = 0; i < count; i++) {
    const value = read(source.x!, batch[i], start + i, xPath);
    if (source.xKind === 'category') {
      if (typeof value !== 'string')
        fail(
          `${where(i)} is ${describe(value)}, but axis "${source.axis}" is a category axis of labels.`,
        );
      x[i] = code(value, i);
    } else if (source.xKind === 'date') {
      const ms =
        value instanceof Date
          ? value.getTime()
          : typeof value === 'number'
            ? value
            : typeof value === 'string'
              ? parseIso(value, n.engine.timeZone)
              : Number.NaN;
      if (!Number.isFinite(ms))
        fail(
          `${where(i)} is ${describe(value)}, but axis "${source.axis}" is a time axis: append Dates, epoch milliseconds or ISO-8601 strings.`,
        );
      x[i] = ms;
    } else {
      if (typeof value !== 'number' || !Number.isFinite(value))
        fail(
          `${where(i)} is ${describe(value)}, but axis "${source.axis}" is a numeric axis: append finite numbers.`,
        );
      x[i] = value;
    }
  }
  // A row batch is sorted first (stable); an unsorted scatter source keeps its order.
  let order: number[] | undefined;
  if (source.sortedX || source.ordered) {
    let sorted = true;
    for (let i = 1; i < count; i++) if (x[i] < x[i - 1]) sorted = false;
    if (!sorted) {
      order = Array.from({ length: count }, (_, i) => i);
      order.sort((a, b) => x[a] - x[b] || a - b);
    }
  }
  const rows = order ? order.map((i) => batch[i]) : batch.slice();
  const index = order
    ? order.map((i) => start + i)
    : Array.from({ length: count }, (_, i) => start + i);
  const sortedXValues = order ? Float64Array.from(order, (i) => x[i]) : x;
  let demote: true | undefined;
  if (count > 0) {
    if (source.sortedX && !source.ordered) {
      const back = options.updateLast ? 2 : 1;
      if (length(target) - back >= 0 && sortedXValues[0] < lastX(target, back)) demote = true;
    } else if (source.sortedX) {
      checkOrder(target, sortedXValues[0], options, path, lastX, length);
    }
  }
  // A bar series holds one bar per category, as ingest requires: the sorted batch may not
  // repeat one, nor start at the latest bar's unless updateLast replaces that bar.
  const bar =
    source.xKind === 'category' && count > 0
      ? source.series.find((index) => n.series[index].type === 'bar')
      : undefined;
  if (bar !== undefined) {
    const pending = categories.get(source.axis)?.codes ?? new Map<string, number>();
    const label = (c: number) =>
      registry!.labels.get(c) ?? [...pending].find(([, code]) => code === c)?.[0];
    const twice = (c: number) =>
      `${path}: bar series "${n.series[bar].id}" has the same category twice ("${label(c)}")`;
    for (let i = 1; i < count; i++)
      if (sortedXValues[i] === sortedXValues[i - 1])
        fail(`${twice(sortedXValues[i])}. Aggregate the rows first, or use a scatter series.`);
    const back = options.updateLast ? 2 : 1;
    if (length(target) - back >= 0 && sortedXValues[0] === lastX(target, back))
      fail(
        options.updateLast
          ? `${twice(sortedXValues[0])}: the batch replaces the latest bar with the category of the bar before it.`
          : `${twice(sortedXValues[0])}: the batch starts at the latest bar. Pass { updateLast: true } to correct the latest bar.`,
      );
  }
  // Row ids: present when the source has them, unique in the batch and the window.
  let rowIds: RowId[] | undefined;
  if (source.rowIds) {
    if (source.rowIdField === undefined)
      fail(`${path}: this data has row ids; append { columns, rowIds } with one id per row.`);
    const idPath = `${path} rowId`;
    rowIds = rows.map((row, i) => {
      const value = read(source.rowIdField!, row, index[i], idPath);
      if (!isRowId(value))
        fail(
          `${path}: appended row ${i} has rowId ${describe(value)}; this data needs a unique rowId on every row.`,
        );
      return value;
    });
    checkNewIds(source, rowIds, options, path);
  }
  // A heatmap row's array, read once per row for all of its bins.
  const arrays = new Map<AccessorLike, unknown[]>();
  const arrayOf = (field: AccessorLike) => {
    let values = arrays.get(field);
    if (!values) {
      values = rows.map((row, i) => read(field, row, index[i], `${path} values`));
      arrays.set(field, values);
    }
    return values;
  };
  // Value columns, in the source's schema.
  const columns: Float64Array[] = source.fields.map((field, c) => {
    const out = new Float64Array(count);
    if (field.kind === 'x') out.set(sortedXValues);
    else if (field.kind === 'index') {
      const base = length(target) > 0 ? lastX(target, 1) + (options.updateLast ? 0 : 1) : 0;
      for (let i = 0; i < count; i++) out[i] = base + i;
      void c;
    } else if (field.kind === 'field' || field.kind === 'accessor') {
      const reader = field.kind === 'field' ? field.name : field.read;
      for (let i = 0; i < count; i++) {
        const value = read(reader, rows[i], index[i], path);
        out[i] =
          typeof value === 'number' && Number.isFinite(value)
            ? value
            : numeric(value, `${path}: ${fieldLabel(reader)} of appended row ${i}`);
      }
    } else if (field.kind === 'cell') {
      const values = arrayOf(field.read);
      for (let i = 0; i < count; i++)
        out[i] = cellValue(values[i], field.bin, `${path}: values of appended row ${i}`);
    } else if (field.kind === 'encoding') {
      // The list is copied only when a label is new, so known labels change nothing.
      const known = ingested.encodings.get(field.key) ?? [];
      let labels = encodings.get(field.key);
      const codes = new Map((labels ?? known).map((label, i) => [label, i]));
      for (let i = 0; i < count; i++) {
        const value = read(field.read, rows[i], index[i], path);
        if (value == null || (typeof value === 'number' && Number.isNaN(value)))
          out[i] = Number.NaN;
        else if (typeof value !== 'string')
          fail(`${path}: ${fieldLabel(field.read)} of appended row ${i} mixes labels and numbers.`);
        else {
          let c = codes.get(value);
          if (c === undefined) {
            if (!labels) {
              labels = [...known];
              encodings.set(field.key, labels);
            }
            c = labels.length;
            labels.push(value);
            codes.set(value, c);
          }
          out[i] = c;
        }
      }
    }
    return out;
  });
  return {
    source: target,
    columns: columns as unknown as ColumnarData,
    rows,
    index,
    ...(rowIds ? { rowIds } : {}),
    ...(source.xKind === 'category' ? { codes: Array.from(sortedXValues) } : {}),
    newLabels,
    encodings,
    ...(demote ? { demote } : {}),
  };
}

function checkNewIds(
  source: SourceState<unknown>,
  ids: RowId[],
  options: AppendOptions,
  path: string,
): void {
  const seen = new Set<RowId>();
  const replaced =
    options.updateLast && source.rowIds && source.rowIds.length > source.head
      ? source.rowIds[source.rowIds.length - 1]
      : undefined;
  for (const id of ids) {
    if (seen.has(id) || (source.idSet?.has(id) && id !== replaced))
      fail(`${path}: rowId ${describe(id)} is already in the chart. Row ids must be unique.`);
    seen.add(id);
  }
}

function planColumns<Row>(
  ingested: Ingested<Row>,
  target: number,
  batch: ColumnData,
  options: AppendOptions,
  path: string,
  lastX: (source: number, back: number) => number,
  length: (source: number) => number,
): SourceAppend<Row> {
  const source = ingested.sources[target];
  const named = batch.columns;
  const x = named?.[source.x as string];
  if (!(x instanceof Float64Array))
    fail(`${path}: the batch has no Float64Array column "${source.x}" for x.`);
  const count = x.length;
  const expected = source.fields.flatMap((f) => (f.kind === 'field' ? [f.name] : []));
  const given = Object.keys(named).filter((key) => key !== source.x);
  if (
    given.length !== expected.length ||
    expected.some((key) => !(named[key] instanceof Float64Array))
  )
    fail(
      `${path}: append the same columns as the data (${[source.x as string, ...expected].join(', ')}), got ${[...Object.keys(named)].join(', ')}.`,
    );
  for (const key of expected)
    if (named[key].length !== count)
      fail(`${path}: column "${key}" has ${named[key].length} values; x has ${count}.`);
  for (let i = 0; i < count; i++) {
    if (!Number.isFinite(x[i]))
      fail(`${path}: x is ${x[i]} in appended row ${i}; x values must be finite.`);
    if (i > 0 && x[i] < x[i - 1] && source.sortedX) fail(`${path}: columns must be sorted by x.`);
  }
  let demote: true | undefined;
  if (count > 0 && source.sortedX) {
    if (!source.ordered) {
      const back = options.updateLast ? 2 : 1;
      if (length(target) - back >= 0 && x[0] < lastX(target, back)) demote = true;
    } else checkOrder(target, x[0], options, path, lastX, length);
  }
  let rowIds: RowId[] | undefined;
  const idColumn = source.rowIdColumn;
  if (idColumn !== undefined) {
    // Checked with the other columns above: present, a Float64Array, `count` long.
    if (batch.rowIds)
      fail(
        `${path}: this data's row ids come from column "${idColumn}"; append them in that column, without rowIds.`,
      );
    rowIds = Array.from(named[idColumn]);
    for (const id of rowIds) if (!isRowId(id)) fail(`${path}: column "${idColumn}" holds ${id}.`);
    checkNewIds(source, rowIds, options, path);
  } else if (source.rowIds) {
    if (!batch.rowIds)
      fail(`${path}: this data has row ids; append { columns, rowIds } with one id per row.`);
    if (batch.rowIds.length !== count)
      fail(`${path}: rowIds has ${batch.rowIds.length} ids for ${count} rows.`);
    rowIds = [...batch.rowIds];
    for (const id of rowIds) if (!isRowId(id)) fail(`${path}: rowIds hold ${describe(id)}.`);
    checkNewIds(source, rowIds, options, path);
  } else if (batch.rowIds) {
    fail(`${path}: this data has no row ids, so the appended rows cannot have them.`);
  }
  const columns = source.fields.map((field) => {
    if (field.kind === 'x') return x;
    if (field.kind === 'index') {
      const base = length(target) > 0 ? lastX(target, 1) + (options.updateLast ? 0 : 1) : 0;
      return indexColumn(count, base);
    }
    if (field.kind === 'field') return named[field.name];
    return fail(`${path}: cannot append to this source.`);
  });
  return {
    source: target,
    columns: columns as unknown as ColumnarData,
    ...(rowIds ? { rowIds } : {}),
    newLabels: new Map(),
    ...(demote ? { demote } : {}),
  };
}

/** Append in place without spreading: `push(...items)` overflows the stack on large batches. */
function pushAll<T>(target: T[], items: readonly T[]): void {
  for (const item of items) target.push(item);
}

/**
 * Record a committed append: retained rows, indices and ids grow, `evicted`
 * rows leave from the front, and category labels follow their rows. Returns
 * whether an X category registry changed. It runs after the engine has taken
 * the batch, so nothing here may throw: every check belongs in the plan.
 *
 * `replaced` says whether the engine replaced its latest row: an `updateLast`
 * append to a source that held one. On an empty source it appends, so the
 * retained arrays and the next row index grow by the whole batch.
 */
export function commitAppend<Row>(
  ingested: Ingested<Row>,
  plan: SourceAppend<Row>,
  replaced: boolean,
  evicted: number,
  evictedCodes: number[],
): boolean {
  const source = ingested.sources[plan.source];
  const count = plan.columns[0].length;
  if (replaced) {
    source.rows?.pop();
    source.index?.pop();
    const id = source.rowIds?.pop();
    if (id !== undefined) source.idSet?.delete(id);
  }
  if (plan.rows) pushAll(source.rows!, plan.rows);
  if (plan.index) pushAll(source.index!, plan.index);
  if (plan.rowIds) {
    pushAll(source.rowIds!, plan.rowIds);
    for (const id of plan.rowIds) source.idSet!.add(id);
  }
  source.nextIndex += count - (replaced ? 1 : 0);
  source.streamed = true;
  source.appended = (source.appended ?? 0) + count - (replaced ? 1 : 0);
  // New encoding labels (the plans of one append share their lists): every series that reads
  // the list must colour and name them.
  let encodings = false;
  for (const [key, labels] of plan.encodings ?? []) {
    if (ingested.encodings.get(key) === labels) continue;
    ingested.encodings.set(key, labels);
    encodings = true;
  }
  if (encodings) refreshColorCodes(ingested);
  // Eviction from the front.
  if (evicted > 0) {
    for (let i = 0; i < evicted; i++) {
      const id = source.rowIds?.[source.head + i];
      if (id !== undefined) source.idSet?.delete(id);
    }
    source.head += evicted;
    source.evicted += evicted;
    if (source.head > Math.max(256, (source.rows ?? source.rowIds ?? []).length / 2)) {
      source.rows?.splice(0, source.head);
      source.index?.splice(0, source.head);
      source.rowIds?.splice(0, source.head);
      source.head = 0;
    }
  }
  // Categories: new labels in, evicted labels out.
  const registry = ingested.categories.get(source.axis);
  if (!registry || source.xKind !== 'category') return false;
  let changed = false;
  for (const [label, code] of plan.newLabels) {
    registry.define(label, code);
    changed = true;
  }
  for (const code of plan.codes ?? []) registry.count(code, 1);
  for (const code of evictedCodes) registry.count(code, -1);
  if (evictedCodes.length && registry.prune()) changed = true;
  return changed;
}

/** The category axis spec after a registry change. */
export function refreshCategoryAxis<Row>(
  ingested: Ingested<Row>,
  n: NormalizedOptions<Row>,
  key: string,
): AxisSpec {
  const base = { ...n.axes[key]?.spec };
  const spec = categoryAxisSpec(base, ingested.categories.get(key)!, n, key);
  ingested.spec.axes = { ...ingested.spec.axes, [key]: spec };
  return spec;
}

/** Category labels by axis, for group checks and readouts. */
export function categoryLabels(ingested: Ingested<unknown>): Map<string, string[]> {
  return new Map(Array.from(ingested.categories, ([key, registry]) => [key, registry.list()]));
}
