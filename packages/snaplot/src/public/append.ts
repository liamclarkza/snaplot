/**
 * appendData() planning and commits (plan D23): every target source is
 * validated and its columns built before anything changes; the commit then
 * grows the retained rows, ids and categories and evicts from the front.
 */
import { fail } from '../engine/errors';
import type { AxisSpec, ColumnarData } from '../engine/spec';
import { categoryAxisSpec } from './ingest';
import type { NormalizedOptions } from './normalize';
import {
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
} from './sources';
import type { AppendOptions, ColumnData, DataSource, RowId } from './types';

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
  /** New category labels, in code order. */
  newLabels: string[];
  /** The colorBy and tooltip label lists with this append's new labels, set on commit. */
  encodings?: Map<string, string[]>;
  /** The scatter source must be stored unsorted before this append fits. */
  demote?: true;
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
  // Label lists with this append's new labels, shared by its targets and set on commit.
  const encodings = new Map<string, string[]>();
  for (const target of targets) {
    const source = ingested.sources[target];
    const path = `appendData() to series "${ingested.seriesIds[source.series[0]]}"`;
    if (source.kind === 'bins' || isBins(data))
      fail('histogram bins cannot be appended; pass new histogram() bins with update({ series }).');
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
        ? planRows(ingested, n, target, data as Row[], options, path, lastX, length, encodings)
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
): SourceAppend<Row> {
  const source = ingested.sources[target];
  const count = batch.length;
  const start = source.nextIndex - (options.updateLast && length(target) > 0 ? 1 : 0);
  const registry = ingested.categories.get(source.axis);
  const newLabels: string[] = [];
  const pending = new Map<string, number>();
  let nextCode = registry?.nextCode ?? 0;
  const code = (label: string, where: string) => {
    const known = registry!.codes.get(label);
    if (known !== undefined) return known;
    if (registry!.explicit) registry!.unknown(where, label);
    let c = pending.get(label);
    if (c === undefined) {
      c = nextCode++;
      pending.set(label, c);
      newLabels.push(label);
    }
    return c;
  };
  // X, in the source's kind.
  const x = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const value = read(source.x!, batch[i], start + i, `${path} x`);
    const where = `${path}: x of appended row ${i}`;
    if (source.xKind === 'category') {
      if (typeof value !== 'string')
        fail(
          `${where} is ${describe(value)}, but axis "${source.axis}" is a category axis of labels.`,
        );
      x[i] = code(value, where);
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
          `${where} is ${describe(value)}, but axis "${source.axis}" is a time axis: append Dates, epoch milliseconds or ISO-8601 strings.`,
        );
      x[i] = ms;
    } else {
      if (typeof value !== 'number' || !Number.isFinite(value))
        fail(
          `${where} is ${describe(value)}, but axis "${source.axis}" is a numeric axis: append finite numbers.`,
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
  // Row ids: present when the source has them, unique in the batch and the window.
  let rowIds: RowId[] | undefined;
  if (source.rowIds) {
    if (source.rowIdField === undefined)
      fail(`${path}: this data has row ids; append { columns, rowIds } with one id per row.`);
    rowIds = rows.map((row, i) => {
      const value = read(source.rowIdField!, row, index[i], `${path} rowId`);
      if (!isRowId(value))
        fail(
          `${path}: appended row ${i} has rowId ${describe(value)}; this data needs a unique rowId on every row.`,
        );
      return value;
    });
    checkNewIds(source, rowIds, options, path);
  }
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
      for (let i = 0; i < count; i++)
        out[i] = numeric(
          read(reader, rows[i], index[i], path),
          `${path}: ${fieldLabel(reader)} of appended row ${i}`,
        );
    } else if (field.kind === 'encoding') {
      let labels = encodings.get(field.key);
      if (!labels) {
        labels = [...(ingested.encodings.get(field.key) ?? [])];
        encodings.set(field.key, labels);
      }
      const codes = new Map(labels.map((label, i) => [label, i]));
      for (let i = 0; i < count; i++) {
        const value = read(field.read, rows[i], index[i], path);
        if (value == null || (typeof value === 'number' && Number.isNaN(value)))
          out[i] = Number.NaN;
        else if (typeof value !== 'string')
          fail(`${path}: ${fieldLabel(field.read)} of appended row ${i} mixes labels and numbers.`);
        else {
          let c = codes.get(value);
          if (c === undefined) {
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
    ...(encodings.size ? { encodings } : {}),
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
    newLabels: [],
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
 */
export function commitAppend<Row>(
  ingested: Ingested<Row>,
  plan: SourceAppend<Row>,
  options: AppendOptions,
  evicted: number,
  evictedCodes: number[],
): boolean {
  const source = ingested.sources[plan.source];
  const count = plan.columns[0].length;
  const replace =
    !!options.updateLast && (source.rows?.length ?? source.rowIds?.length ?? 1) > source.head;
  if (replace) {
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
  source.nextIndex += count - (options.updateLast ? 1 : 0);
  source.streamed = true;
  for (const [key, labels] of plan.encodings ?? []) ingested.encodings.set(key, labels);
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
  for (const label of plan.newLabels) {
    registry.code(label);
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
