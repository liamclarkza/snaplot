/**
 * ingest(normalized) → engine sources (plan §3.2, D18, D23).
 *
 * A source is either object rows or named typed columns.
 * - Rows are read once: X in one pass, then each value field in storage
 *   order. Line-like series sort them by X with a stable index sort; the
 *   original index and the row itself stay attached to every point.
 * - Typed columns are used in place, with one X pass that checks they are
 *   finite and sorted. Y columns are not scanned: NaN is a gap.
 * - A scatter-only source keeps its order. When its X is already sorted it is
 *   stored by X (the sorted-X flag), so the renderer can cull and hit tests
 *   can search; otherwise column 0 is the row index.
 * - Rows, original indices and row ids are retained beside the engine's
 *   columns, bounded by `streaming.maxPoints`, so an accessor change
 *   re-reads retained rows and appended rows survive updates.
 * - String X builds a category registry per axis: rebuilt on every full
 *   ingest, and labels leave it with their last row.
 */
import { fail, suggest, warnOnce } from '../engine/errors';
import type { AxisSpec, ChartSpec, ColumnarData, SeriesSpec } from '../engine/spec';
import type { AccessorLike, NormalizedOptions, NormalizedSeries } from './normalize';
import {
  CategoryAxis,
  type ColumnField,
  describe,
  EMPTY,
  fieldLabel,
  type Ingested,
  type IngestContext,
  ISO,
  indexColumn,
  isBins,
  isColumns,
  isRowId,
  numeric,
  parseIso,
  read,
  type SourceState,
  sourceKey,
  type XKind,
} from './sources';
import type { ColumnData, HistogramBins, RowId } from './types';

// ─── ingest ──────────────────────────────────────────────────────────

interface Plan {
  input: unknown;
  x: AccessorLike | undefined;
  axis: string;
  series: number[];
  ordered: boolean;
}

/** Ingest every source of normalized options. Throws before returning anything on invalid data. */
export function ingest<Row>(n: NormalizedOptions<Row>, ctx: IngestContext<Row>): Ingested<Row> {
  const axisSpecs: Record<string, AxisSpec> = {};
  for (const [key, axis] of Object.entries(n.axes)) axisSpecs[key] = { ...axis.spec };
  const categories = new Map<string, CategoryAxis>();
  const kinds = new Map<string, XKind>();
  for (const [key, axis] of Object.entries(n.axes)) {
    if (axis.type === 'category' || axis.categories) {
      categories.set(key, new CategoryAxis(key, axis.categories));
      kinds.set(key, 'category');
    }
  }
  const encodings = new Map(
    Array.from(ctx.previousEncodings ?? [], ([key, labels]) => [key, [...labels]]),
  );

  // Group series into sources: one per (input, X, X axis).
  const plans: Plan[] = [];
  const seriesSources: number[] = [];
  for (const s of n.series) {
    const input = s.data ?? n.data ?? EMPTY;
    const x = s.x ?? n.x;
    if (!isBins(input) && x === undefined)
      fail(`series "${s.id}" needs an x: set the chart's x, or the series' own x.`);
    if (isBins(input) && s.type !== 'histogram')
      fail(`series "${s.id}" has histogram() bins as data, which need type: 'histogram'.`);
    if (s.xAxis !== 'x') axisSpecs[s.xAxis] = { position: 'bottom', ...axisSpecs[s.xAxis] };
    if (s.yAxis !== 'y') axisSpecs[s.yAxis] = { position: 'left', ...axisSpecs[s.yAxis] };
    let pi = plans.findIndex((p) => p.input === input && p.x === x && p.axis === s.xAxis);
    if (pi < 0) {
      pi = plans.length;
      plans.push({ input, x, axis: s.xAxis, series: [], ordered: false });
    }
    plans[pi].series.push(s.index);
    plans[pi].ordered ||= s.type !== 'scatter';
    seriesSources[s.index] = pi;
  }

  const sources = plans.map((plan, index) =>
    ingestSource(plan, index, n, ctx, categories, kinds, encodings),
  );
  // Count category references now that every source is read.
  for (const source of sources) {
    const registry = categories.get(source.axis);
    if (!registry || source.xKind !== 'category') continue;
    const xi = source.sortedX ? 0 : xColumnOf(source);
    for (const code of source.columns[xi]) registry.count(code, 1);
  }

  // Axis types: inferred kinds, category geometry, kept types for empty inferred axes.
  for (const [key, kind] of kinds) {
    const axis = axisSpecs[key] ?? {};
    if (kind === 'date') axisSpecs[key] = { ...axis, type: axis.type ?? 'time' };
    if (kind === 'category') axisSpecs[key] = categoryAxisSpec(axis, categories.get(key)!, n, key);
  }
  for (const [key, type] of ctx.previousTypes ?? []) {
    const own = sources.filter((source) => source.axis === key);
    if (
      n.axes[key]?.type === undefined &&
      !categories.has(key) &&
      own.length > 0 &&
      own.every((source) => source.columns[0].length === 0)
    )
      axisSpecs[key] = { ...axisSpecs[key], type };
  }
  epochWarning(sources, kinds, n);

  const seriesIds = n.series.map((s) => s.id);
  const seriesSpecs = n.series.map((s) =>
    seriesSpec(s, sources[seriesSources[s.index]], encodings),
  );
  for (const s of n.series) {
    const source = sources[seriesSources[s.index]];
    if (s.type === 'bar' && source.xKind === 'category') {
      const x = source.columns[source.sortedX ? 0 : xColumnOf(source)];
      if (new Set(x).size !== x.length)
        fail(
          `bar series "${s.id}" has the same category twice. Aggregate the rows first, or use a scatter series.`,
        );
    }
  }

  const spec: Omit<ChartSpec, 'plugins'> = {
    ...n.engine,
    axes: axisSpecs,
    series: seriesSpecs,
    tooltip: tooltipSpec(n, seriesSpecs),
  };
  return {
    spec,
    sources,
    seriesSources,
    seriesIds,
    categories,
    encodings,
    kinds,
    referenceLines: n.referenceLines.map((line, i) => ({
      ...line,
      axis: orientation(axisSpecs, line.axis),
      axisKey: line.axis,
      value: annotationValue(
        line.axis,
        line.value,
        `referenceLines[${i}].value`,
        axisSpecs,
        kinds,
        categories,
        n,
      ),
    })),
    referenceRegions: n.referenceRegions.map((region, i) => ({
      ...region,
      axis: orientation(axisSpecs, region.axis),
      axisKey: region.axis,
      from: annotationValue(
        region.axis,
        region.from,
        `referenceRegions[${i}].from`,
        axisSpecs,
        kinds,
        categories,
        n,
        true,
      ),
      to: annotationValue(
        region.axis,
        region.to,
        `referenceRegions[${i}].to`,
        axisSpecs,
        kinds,
        categories,
        n,
        true,
      ),
    })),
  };
}

function xColumnOf(source: SourceState<unknown>): number {
  const i = source.fields.findIndex((field) => field.kind === 'x');
  return i < 0 ? 0 : i;
}

function requestedType(n: NormalizedOptions<any>, axis: string) {
  return n.axes[axis]?.type;
}

function ingestSource<Row>(
  plan: Plan,
  index: number,
  n: NormalizedOptions<Row>,
  ctx: IngestContext<Row>,
  categories: Map<string, CategoryAxis>,
  kinds: Map<string, XKind>,
  encodings: Map<string, string[]>,
): SourceState<Row> {
  const name = n.series[plan.series[0]].id;
  const path = `series "${name}"`;
  const retained = ctx.retained?.(plan.input, plan.axis, plan.x);
  const forceUnsorted = ctx.unsorted?.has(sourceKey(index, plan.axis)) ?? false;

  if (isBins(plan.input)) return ingestBins(plan, plan.input, path, n, kinds);

  const input = retained?.columns
    ? { columns: retained.columns, rowIds: retained.rowIds }
    : plan.input;
  if (isColumns(input)) {
    const state = ingestColumns(plan, input, path, n, ctx, kinds, forceUnsorted);
    if (retained) {
      state.evicted = retained.evicted;
      state.nextIndex = retained.nextIndex;
      state.streamed = true;
    }
    addValueColumns(state, plan, n, encodings);
    return state;
  }
  if (!Array.isArray(input))
    fail(`${path}: data must be an array of rows, { columns } or histogram() bins.`);
  const rows = (retained?.rows ?? input) as Row[];
  const state = ingestRows(
    plan,
    rows,
    retained?.index,
    path,
    n,
    ctx,
    kinds,
    categories,
    forceUnsorted,
  );
  if (retained) {
    state.evicted = retained.evicted;
    state.nextIndex = retained.nextIndex;
    state.streamed = true;
  }
  // Row ids, read in storage order and checked for duplicates before anything commits.
  const rowIdField = n.series[plan.series[0]].rowId ?? n.rowId;
  if (retained?.rowIds) {
    state.rowIds = [...retained.rowIds];
  } else if (rowIdField !== undefined) {
    const ids = new Array<RowId>(state.rows!.length);
    for (let i = 0; i < ids.length; i++) {
      const value = read(rowIdField, state.rows![i], state.index![i], `${path} rowId`);
      if (!isRowId(value))
        fail(
          `${path}: the rowId of row ${state.index![i]} is ${describe(value)}; row ids must be strings or finite numbers.`,
        );
      ids[i] = value;
    }
    state.rowIds = ids;
  }
  if (rowIdField !== undefined) state.rowIdField = rowIdField;
  finishRowIds(state, path);
  addValueColumns(state, plan, n, encodings);
  return state;
}

function finishRowIds(state: SourceState<unknown>, path: string): void {
  if (!state.rowIds) return;
  const set = new Set<RowId>();
  for (const id of state.rowIds) {
    if (set.has(id)) fail(`${path}: rowId ${describe(id)} appears twice. Row ids must be unique.`);
    set.add(id);
  }
  state.idSet = set;
}

function ingestBins<Row>(
  plan: Plan,
  bins: HistogramBins,
  path: string,
  n: NormalizedOptions<Row>,
  kinds: Map<string, XKind>,
): SourceState<Row> {
  const { edges, counts } = bins;
  if (!(edges instanceof Float64Array) || !(counts instanceof Float64Array))
    fail(`${path}: histogram edges and counts must be Float64Arrays, as histogram() returns them.`);
  if (counts.length !== Math.max(0, edges.length - 1))
    fail(
      `${path}: histogram bins need one count per bin (${Math.max(0, edges.length - 1)} counts for ${edges.length} edges).`,
    );
  for (let i = 0; i < edges.length; i++) {
    if (!Number.isFinite(edges[i]))
      fail(`${path}: histogram edge ${i} is ${edges[i]}; edges must be finite.`);
    if (i > 0 && edges[i] <= edges[i - 1])
      fail(`${path}: histogram edges must be strictly increasing (edge ${i} is ${edges[i]}).`);
  }
  for (let i = 0; i < counts.length; i++)
    if (!Number.isFinite(counts[i]) || counts[i] < 0)
      fail(
        `${path}: histogram count ${i} is ${counts[i]}; counts must be finite and non-negative.`,
      );
  const padded = new Float64Array(edges.length);
  padded.set(counts);
  noteKind(kinds, plan.axis, requestedType(n, plan.axis) === 'time' ? 'date' : 'number', path);
  return {
    declared: plan.input,
    axis: plan.axis,
    kind: 'bins',
    series: plan.series,
    ordered: true,
    sortedX: true,
    xKind: 'number',
    columns: [edges, padded],
    fields: [{ kind: 'x' }, { kind: 'counts' }],
    head: 0,
    evicted: 0,
    nextIndex: edges.length,
    streamed: false,
  };
}

function noteKind(kinds: Map<string, XKind>, axis: string, kind: XKind, path: string): void {
  const prior = kinds.get(axis);
  if (prior && prior !== kind)
    fail(
      `${path}: axis "${axis}" would hold both ${kindWords(prior)} and ${kindWords(kind)}. Use one kind of X per axis.`,
    );
  kinds.set(axis, kind);
}

function kindWords(kind: XKind): string {
  return kind === 'category' ? 'category labels' : kind === 'date' ? 'times' : 'numbers';
}

function ingestColumns<Row>(
  plan: Plan,
  input: ColumnData,
  path: string,
  n: NormalizedOptions<Row>,
  ctx: IngestContext<Row>,
  kinds: Map<string, XKind>,
  forceUnsorted: boolean,
): SourceState<Row> {
  const named = input.columns;
  if (!named || typeof named !== 'object')
    fail(`${path}: { columns } must hold Float64Array columns by field name.`);
  if (typeof plan.x !== 'string')
    fail(`${path}: typed columns need x as a field name, not a function.`);
  const x = named[plan.x];
  if (!(x instanceof Float64Array))
    fail(
      `${path}: the data has no Float64Array column "${plan.x}" for x.${hint(plan.x, Object.keys(named))}`,
    );
  const count = x.length;
  const names = Object.keys(named).sort();
  for (const key of names) {
    if (!(named[key] instanceof Float64Array))
      fail(`${path}: column "${key}" must be a Float64Array.`);
    if (named[key].length !== count)
      fail(
        `${path}: column "${key}" has ${named[key].length} values; x has ${count}. All columns need the same length.`,
      );
  }
  // The one X pass: finite, and whether it is sorted.
  ctx.counters.xValidations++;
  let sorted = true;
  for (let i = 0; i < count; i++) {
    const v = x[i];
    if (!Number.isFinite(v)) fail(`${path}: x is ${v} in row ${i}; x values must be finite.`);
    if (i > 0 && v < x[i - 1]) sorted = false;
  }
  if (plan.ordered && !sorted)
    fail(`${path}: columns must be sorted by x; pass rows to have them sorted.`);
  const type = requestedType(n, plan.axis);
  if (type === 'category' || kinds.get(plan.axis) === 'category')
    fail(`${path}: typed columns cannot hold category labels; pass rows with string x.`);
  noteKind(kinds, plan.axis, type === 'time' ? 'date' : 'number', path);
  if (input.rowIds !== undefined && input.rowIds.length !== count)
    fail(`${path}: rowIds has ${input.rowIds.length} ids for ${count} rows.`);

  const sortedX = sorted && !forceUnsorted;
  const columns: Float64Array[] = [];
  const fields: ColumnField[] = [];
  if (sortedX) {
    columns.push(x);
    fields.push({ kind: 'x' });
  } else {
    columns.push(indexColumn(count));
    fields.push({ kind: 'index' });
    columns.push(x);
    fields.push({ kind: 'x' });
  }
  // Every named column, zero-copy and in name order, so a later series can read any of them.
  for (const key of names) {
    if (key === plan.x) continue;
    columns.push(named[key]);
    fields.push({ kind: 'field', name: key });
  }
  const state: SourceState<Row> = {
    declared: plan.input,
    x: plan.x,
    axis: plan.axis,
    kind: 'columns',
    series: plan.series,
    ordered: plan.ordered,
    sortedX,
    xKind: type === 'time' ? 'date' : 'number',
    columns: columns as unknown as ColumnarData,
    fields,
    head: 0,
    evicted: 0,
    nextIndex: count,
    streamed: false,
  };
  if (input.rowIds) {
    state.rowIds = [...input.rowIds];
    for (const id of state.rowIds)
      if (!isRowId(id))
        fail(`${path}: rowIds hold ${describe(id)}; row ids must be strings or finite numbers.`);
    finishRowIds(state, path);
  } else {
    const field = n.series[plan.series[0]].rowId ?? n.rowId;
    if (field !== undefined) {
      if (typeof field !== 'string')
        fail(`${path}: with typed columns, rowId must be a column name.`);
      const column = named[field];
      if (!(column instanceof Float64Array))
        fail(`${path}: the data has no column "${field}" for rowId.`);
      state.rowIds = Array.from(column);
      finishRowIds(state, path);
    }
  }
  return state;
}

function ingestRows<Row>(
  plan: Plan,
  rows: Row[],
  retainedIndex: number[] | undefined,
  path: string,
  n: NormalizedOptions<Row>,
  ctx: IngestContext<Row>,
  kinds: Map<string, XKind>,
  categories: Map<string, CategoryAxis>,
  forceUnsorted: boolean,
): SourceState<Row> {
  const count = rows.length;
  const xField = plan.x!;
  const original = (i: number) => (retainedIndex ? retainedIndex[i] : i);
  // The one X pass: read every X once, then decide its kind.
  ctx.counters.xValidations++;
  const raw = new Array<unknown>(count);
  let present = typeof xField !== 'string';
  let strings = 0;
  let iso = 0;
  let dates = 0;
  let numbers = 0;
  for (let i = 0; i < count; i++) {
    const row = rows[i];
    const value = read(xField, row, original(i), `${path} x`);
    raw[i] = value;
    if (!present && (value !== undefined || (row && (xField as string) in (row as object))))
      present = true;
    if (typeof value === 'string') {
      strings++;
      if (ISO.test(value)) iso++;
    } else if (value instanceof Date) dates++;
    else if (typeof value === 'number') numbers++;
  }
  if (!present && count > 0)
    fail(
      `${path}: no row has a field "${xField as string}" for x.${hint(xField as string, rowKeys(rows))}`,
    );
  const type = requestedType(n, plan.axis);
  const prior = kinds.get(plan.axis);
  let kind: XKind;
  if (type === 'time') kind = 'date';
  else if (type === 'category' || prior === 'category') kind = 'category';
  else if (type === 'linear' || type === 'log') kind = 'number';
  // D18: an X of only ISO-8601 strings (with Dates or alone) is a time axis.
  else if (strings > 0 && iso === strings && (dates > 0 || numbers === 0) && prior !== 'number')
    kind = 'date';
  else if (strings > 0) kind = 'category';
  else if (dates > 0) kind = 'date';
  else kind = prior ?? 'number';
  if (count > 0 || !prior) noteKind(kinds, plan.axis, kind, path);
  else kind = prior;

  const x = new Float64Array(count);
  let registry = categories.get(plan.axis);
  if (kind === 'category' && !registry) {
    registry = new CategoryAxis(plan.axis, undefined);
    categories.set(plan.axis, registry);
  }
  for (let i = 0; i < count; i++) {
    const value = raw[i];
    const where = `${path}: x of row ${original(i)}`;
    if (kind === 'category') {
      if (typeof value !== 'string')
        fail(
          `${where} is ${describe(value)}, but axis "${plan.axis}" is a category axis of labels.`,
        );
      x[i] = registry!.code(value, where);
    } else if (kind === 'date') {
      const ms =
        value instanceof Date
          ? value.getTime()
          : typeof value === 'number'
            ? value
            : typeof value === 'string'
              ? parseIso(value, n.timeZone)
              : Number.NaN;
      if (!Number.isFinite(ms))
        fail(
          typeof value === 'string'
            ? `${where} is "${value}", which is not an ISO-8601 date such as 2026-03-01 or 2026-03-01T09:30:00Z.`
            : `${where} is ${describe(value)}; a time axis takes Dates, epoch milliseconds or ISO-8601 strings.`,
        );
      x[i] = ms;
    } else {
      if (typeof value !== 'number' || !Number.isFinite(value))
        fail(`${where} is ${describe(value)}; x values must be finite numbers, Dates or labels.`);
      x[i] = value;
    }
  }

  // Order: line-like sources sort (stable); a scatter source keeps its order and is
  // flagged sorted when its X already is.
  let sorted = true;
  for (let i = 1; i < count; i++) if (x[i] < x[i - 1]) sorted = false;
  let order: number[] | undefined;
  if (plan.ordered && !sorted) {
    order = Array.from({ length: count }, (_, i) => i);
    order.sort((a, b) => x[a] - x[b] || a - b);
    sorted = true;
  }
  const storedRows = order ? order.map((i) => rows[i]) : rows.slice();
  const index = order
    ? order.map(original)
    : retainedIndex
      ? retainedIndex.slice()
      : Array.from({ length: count }, (_, i) => i);
  const storedX = order ? Float64Array.from(order, (i) => x[i]) : x;
  const sortedX = plan.ordered || (sorted && !forceUnsorted);
  const columns: Float64Array[] = [];
  const fields: ColumnField[] = [];
  if (sortedX) {
    columns.push(storedX);
    fields.push({ kind: 'x' });
  } else {
    columns.push(indexColumn(count));
    fields.push({ kind: 'index' });
    columns.push(storedX);
    fields.push({ kind: 'x' });
  }
  return {
    declared: plan.input,
    x: plan.x,
    axis: plan.axis,
    kind: 'rows',
    series: plan.series,
    ordered: plan.ordered,
    sortedX,
    xKind: kind,
    columns: columns as unknown as ColumnarData,
    fields,
    rows: storedRows,
    index,
    head: 0,
    evicted: 0,
    nextIndex: count,
    streamed: false,
  };
}

function rowKeys(rows: readonly unknown[]): string[] {
  const first = rows.find((row) => row && typeof row === 'object');
  return first ? Object.keys(first) : [];
}

function hint(name: string, candidates: Iterable<string>): string {
  const best = suggest(name, candidates);
  return best ? ` Did you mean "${best}"?` : '';
}

/** Add the value columns every series of the source reads. */
function addValueColumns<Row>(
  state: SourceState<Row>,
  plan: Plan,
  n: NormalizedOptions<Row>,
  encodings: Map<string, string[]>,
): void {
  for (const si of plan.series) {
    const s = n.series[si];
    for (const field of [s.y, s.lower, s.upper])
      if (field !== undefined) column(state, field, s, null);
    for (const [role, encoding] of [
      ['color', s.colorBy],
      ['size', s.sizeBy],
      ...(s.tooltipFields ?? []).map((field, i) => [`tooltip:${i}`, field] as const),
    ] as const) {
      if (encoding) column(state, encoding.field, s, { role, encodings, text: role !== 'size' });
    }
  }
}

/** The engine column of a field, adding it on first use. */
export function column<Row>(
  state: SourceState<Row>,
  field: AccessorLike,
  s: NormalizedSeries,
  encoding: { role: string; encodings: Map<string, string[]>; text: boolean } | null,
): number {
  const path = `series "${s.id}"`;
  if (encoding?.text && state.kind === 'rows') {
    const key = typeof field === 'string' ? `field:${field}` : `series:${s.id}:${encoding.role}`;
    const existing = state.fields.findIndex((f) => f.kind === 'encoding' && f.key === key);
    if (existing >= 0) return existing;
    const values = state.rows!.map((row, i) => read(field, row, state.index![i], path));
    if (encoding.encodings.has(key) || values.some((value) => typeof value === 'string')) {
      const labels = encoding.encodings.get(key) ?? [];
      encoding.encodings.set(key, labels);
      const codes = new Map(labels.map((label, i) => [label, i]));
      const out = Float64Array.from(values, (value, i) => {
        if (value == null || (typeof value === 'number' && Number.isNaN(value))) return Number.NaN;
        if (typeof value !== 'string')
          fail(`${path}: ${fieldLabel(field)} of row ${state.index![i]} mixes labels and numbers.`);
        let code = codes.get(value);
        if (code === undefined) {
          code = labels.length;
          labels.push(value);
          codes.set(value, code);
        }
        return code;
      });
      state.columns.push(out);
      state.fields.push({ kind: 'encoding', key, read: field });
      return state.columns.length - 1;
    }
  }
  if (state.kind === 'columns') {
    if (typeof field !== 'string') fail(`${path}: typed columns need field names, not functions.`);
    if (field === state.x) return xColumnIndex(state);
    const i = state.fields.findIndex((f) => f.kind === 'field' && f.name === field);
    if (i < 0) {
      const names = state.fields.flatMap((f) => (f.kind === 'field' ? [f.name] : []));
      fail(
        `${path}: the data has no column "${field}".${hint(field, [...names, state.x as string])}`,
      );
    }
    return i;
  }
  // Rows: one extracted column per distinct field or function.
  if (field === state.x && state.xKind === 'number') return xColumnIndex(state);
  const existing = state.fields.findIndex(
    (f) => (f.kind === 'field' && f.name === field) || (f.kind === 'accessor' && f.read === field),
  );
  if (existing >= 0) return existing;
  const rows = state.rows!;
  const values = new Float64Array(rows.length);
  let present = typeof field !== 'string';
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const value = read(field, row, state.index![i], path);
    if (!present && (value !== undefined || (row && (field as string) in (row as object))))
      present = true;
    values[i] = numeric(value, `${path}: ${fieldLabel(field)} of row ${state.index![i]}`);
  }
  if (!present && rows.length > 0)
    fail(
      `${path}: no row has a field "${field as string}".${hint(field as string, rowKeys(rows))}`,
    );
  state.columns.push(values);
  state.fields.push(
    typeof field === 'string'
      ? { kind: 'field', name: field }
      : { kind: 'accessor', read: field as (row: unknown, index: number) => unknown },
  );
  return state.columns.length - 1;
}

function xColumnIndex(state: SourceState<unknown>): number {
  return state.fields.findIndex((f) => f.kind === 'x');
}

function seriesSpec<Row>(
  s: NormalizedSeries,
  source: SourceState<Row>,
  encodings: Map<string, string[]>,
): SeriesSpec {
  const spec: SeriesSpec = { ...s.spec, label: s.label, type: s.type };
  if (s.xAxis !== 'x') spec.xAxis = s.xAxis;
  if (s.yAxis !== 'y') spec.yAxis = s.yAxis;
  if (s.type === 'histogram') {
    spec.yColumn = 1;
    return spec;
  }
  spec.yColumn = column(source, s.y!, s, null);
  if (s.type === 'band') {
    spec.lowerColumn = column(source, s.lower!, s, null);
    spec.upperColumn = column(source, s.upper!, s, null);
  }
  if (s.type === 'scatter') {
    spec.xColumn = source.sortedX ? 0 : xColumnIndex(source);
    const encode = (
      value: { field: AccessorLike; options: Record<string, unknown> },
      role: string,
      text: boolean,
    ) => {
      const index = column(source, value.field, s, { role, encodings, text });
      const field = source.fields[index];
      const label = typeof value.field === 'string' ? { label: value.field } : {};
      if (field.kind === 'encoding') {
        const labels = encodings.get(field.key) ?? [];
        return {
          type: 'category' as const,
          ...label,
          format: (code: number) => labels[code] ?? '',
          ...(role === 'color' ? { categoryValues: labels.map((_, i) => i) } : {}),
          ...value.options,
          column: index,
        };
      }
      return { ...label, ...value.options, column: index };
    };
    if (s.colorBy) spec.colorBy = encode(s.colorBy, 'color', true) as SeriesSpec['colorBy'];
    if (s.sizeBy) spec.sizeBy = encode(s.sizeBy, 'size', false) as SeriesSpec['sizeBy'];
    if (s.tooltipFields)
      spec.tooltipFields = s.tooltipFields.map((field, i) =>
        encode(field, `tooltip:${i}`, true),
      ) as SeriesSpec['tooltipFields'];
  }
  return spec;
}

export function categoryAxisSpec(
  axis: AxisSpec,
  registry: CategoryAxis,
  n: NormalizedOptions<any>,
  key: string,
): AxisSpec {
  if (n.axes[key]?.spec.format)
    fail(
      `axes.${key}.format is not accepted on a category axis: category labels are shown as they are.`,
    );
  const codes = [...registry.labels.keys()];
  const first = codes.length ? codes[0] : 0;
  const last = codes.length ? codes[codes.length - 1] : 0;
  const isBar = n.series.some((s) => s.xAxis === key && s.type === 'bar');
  const slots = isBar || codes.length < 2;
  return {
    ...axis,
    type: 'linear',
    nice: false,
    padding: 0,
    min: axis.min ?? (slots ? first - 0.5 : first),
    max: axis.max ?? (slots ? Math.max(first + 0.5, last + 0.5) : last),
    ticks: axis.ticks ?? codes,
    format: (code) => registry.labels.get(code) ?? '',
  };
}

/** One warning when an inferred linear X holds epoch-millisecond-like numbers (D18). */
function epochWarning(
  sources: SourceState<unknown>[],
  kinds: Map<string, XKind>,
  n: NormalizedOptions<any>,
): void {
  for (const source of sources) {
    if (source.kind === 'bins' || kinds.get(source.axis) !== 'number') continue;
    if (n.axes[source.axis]?.type !== undefined) continue;
    const x = source.columns[xColumnIndex(source)];
    if (x.length === 0) continue;
    const a = x[0];
    const b = x[x.length - 1];
    if (a >= 1e11 && a <= 1e13 && b >= 1e11 && b <= 1e13) {
      warnOnce(
        'epoch-x',
        `axis "${source.axis}" holds numbers like ${a}, which look like epoch milliseconds. Set axes.${source.axis}.type: 'time' to show them as dates.`,
      );
      return;
    }
  }
}

function tooltipSpec<Row>(n: NormalizedOptions<Row>, series: SeriesSpec[]): ChartSpec['tooltip'] {
  const tooltip: NonNullable<ChartSpec['tooltip']> = { ...n.engine.tooltip };
  if (n.series.some((s) => s.format)) {
    tooltip.yFormat = (value, index) => {
      const s = n.series[index];
      const axisFormat = n.axes[series[index]?.yAxis ?? 'y']?.spec.format;
      return s?.format?.(value) ?? axisFormat?.(value) ?? String(value);
    };
  }
  return tooltip;
}

function orientation(axes: Record<string, AxisSpec>, key: string): 'x' | 'y' {
  const position = axes[key]?.position;
  return position
    ? position === 'top' || position === 'bottom'
      ? 'x'
      : 'y'
    : key.startsWith('x')
      ? 'x'
      : 'y';
}

function annotationValue(
  axis: string,
  value: unknown,
  path: string,
  axes: Record<string, AxisSpec>,
  kinds: Map<string, XKind>,
  categories: Map<string, CategoryAxis>,
  n: NormalizedOptions<any>,
  openEnded = false,
): number {
  if (axis !== 'x' && axis !== 'y' && !axes[axis])
    fail(`${path}: the chart has no axis "${axis}".`);
  if (openEnded && (value === Number.POSITIVE_INFINITY || value === Number.NEGATIVE_INFINITY))
    return value as number;
  const kind = kinds.get(axis);
  if (typeof value === 'string') {
    const registry = categories.get(axis);
    if (registry) {
      const code = registry.codes.get(value);
      if (code === undefined)
        fail(`${path} is "${value}", which is not a category of axis "${axis}".`);
      return code;
    }
    if (kind === 'date' || axes[axis]?.type === 'time') {
      const ms = parseIso(value, n.timeZone);
      if (Number.isFinite(ms)) return ms;
      fail(`${path} is "${value}", which is not an ISO-8601 date for time axis "${axis}".`);
    }
    fail(`${path} is "${value}", but axis "${axis}" is numeric: give a number.`);
  }
  const ms = value instanceof Date ? value.getTime() : value;
  if (typeof ms !== 'number' || !Number.isFinite(ms))
    fail(
      `${path} is ${describe(value)}; give a finite number, a Date, an ISO-8601 string or a category label.`,
    );
  const time = kind === 'date' || axes[axis]?.type === 'time';
  if (value instanceof Date && !time)
    warnOnce(
      'annotation-date',
      `${path} is a Date, but axis "${axis}" is not a time axis, so it is read as ${ms} (epoch milliseconds). Set axes.${axis}.type: 'time'.`,
    );
  // A number on a category axis is a slot position; one beyond every slot draws nothing.
  const registry = categories.get(axis);
  if (registry && ![...registry.labels.keys()].some((code) => Math.abs(code - ms) <= 0.5))
    warnOnce(
      'annotation-category',
      `${path} is ${ms}, which is beyond the ${registry.labels.size} categories of axis "${axis}"; give a category label.`,
    );
  return ms;
}
