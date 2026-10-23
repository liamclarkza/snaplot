/**
 * What ingest and appends share (plan §3.2, D18, D23): the X kinds, ISO-8601
 * parsing, the category registry, the retained source state and the small
 * readers that turn row fields into numbers with public errors.
 */
import { fail } from '../engine/errors';
import type { AxisSpec, ChartSpec, ColumnarData } from '../engine/spec';
import type { AccessorLike } from './normalize';
import type { ColumnData, HistogramBins, RowId } from './types';

// ─── Kinds, ISO dates and categories ─────────────────────────────────

/** What an X axis holds. */
export type XKind = 'number' | 'date' | 'category';

export const ISO =
  /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?(Z|[+-]\d{2}:?\d{2})?$/;

/**
 * Epoch milliseconds of an ISO-8601 string (D18), or NaN. A string with `Z` or
 * an offset is an instant; one without is a wall time in `timeZone`, and a
 * date alone is that calendar day's midnight there.
 */
export function parseIso(text: string, timeZone: 'local' | 'UTC' = 'local'): number {
  const m = ISO.exec(text);
  if (!m) return Number.NaN;
  const [, y, mo, d, h = '0', mi = '0', s = '0', frac = '', zone] = m;
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  const second = Number(s);
  // The last day of the month too: 2026-02-31 is not a date, not 3 March.
  const days = new Date(Date.UTC(Number(y), month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > days || hour > 23 || minute > 59 || second > 59)
    return Number.NaN;
  const ms = frac ? Math.round(Number(`0.${frac.padEnd(3, '0').slice(0, 3)}`) * 1000) : 0;
  const wall = Date.UTC(Number(y), month - 1, day, hour, minute, second, ms);
  if (zone === 'Z') return wall;
  if (zone) {
    const sign = zone[0] === '-' ? -1 : 1;
    const digits = zone.slice(1).replace(':', '');
    const offset = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4)));
    return wall - offset * 60_000;
  }
  if (timeZone === 'UTC') return wall;
  return new Date(Number(y), month - 1, day, hour, minute, second, ms).getTime();
}

/** The categories of one X axis: codes increase forever, labels leave with their last row. */
export class CategoryAxis {
  readonly codes = new Map<string, number>();
  readonly labels = new Map<number, string>();
  private readonly refs = new Map<number, number>();
  private next = 0;

  /** The code the next new label gets. */
  get nextCode(): number {
    return this.next;
  }

  constructor(
    readonly key: string,
    readonly explicit: readonly string[] | undefined,
  ) {
    for (const label of explicit ?? []) this.code(label);
  }

  /** The error for a label that is not one of the explicit categories. */
  unknown(path: string, label: string): never {
    return fail(
      `${path} is "${label}", which is not one of axes.${this.key}.categories (${JSON.stringify(this.explicit)}). Add it to the categories, or remove them to infer the labels from the data.`,
    );
  }

  /** The code of `label`, adding it unless the categories are explicit. */
  code(label: string, path?: string): number {
    let code = this.codes.get(label);
    if (code !== undefined) return code;
    if (this.explicit && path) this.unknown(path, label);
    code = this.next++;
    this.codes.set(label, code);
    this.labels.set(code, label);
    return code;
  }

  count(code: number, delta: number): void {
    this.refs.set(code, (this.refs.get(code) ?? 0) + delta);
  }

  /** Drop inferred labels no retained row uses. Returns whether any left. */
  prune(): boolean {
    if (this.explicit) return false;
    let changed = false;
    for (const [code, label] of this.labels) {
      if ((this.refs.get(code) ?? 0) > 0) continue;
      this.labels.delete(code);
      this.codes.delete(label);
      this.refs.delete(code);
      changed = true;
    }
    return changed;
  }

  /** Labels in code order. */
  list(): string[] {
    return [...this.labels.values()];
  }
}

// ─── Sources ─────────────────────────────────────────────────────────

/** How one engine column is made from a row or a column batch. */
export type ColumnField =
  | { kind: 'x' }
  | { kind: 'index' }
  | { kind: 'field'; name: string }
  | { kind: 'accessor'; read: (row: unknown, index: number) => unknown }
  | { kind: 'encoding'; key: string; read: AccessorLike }
  | { kind: 'counts' };

/** One ingested source and the identity retained beside its engine columns. */
export interface SourceState<Row> {
  /** The input the options named, by reference. */
  declared: unknown;
  x?: AccessorLike;
  axis: string;
  kind: 'rows' | 'columns' | 'bins';
  /** Indices of the series that read it. */
  series: number[];
  /** A line-like series reads it, so X must be ascending. */
  ordered: boolean;
  /** Column 0 is the real X, ascending. */
  sortedX: boolean;
  xKind: XKind;
  columns: ColumnarData;
  fields: ColumnField[];
  /** The row-id accessor of row sources. */
  rowIdField?: AccessorLike;
  /** The column a typed-column source reads its row ids from (`rowId: '<column>'`). */
  rowIdColumn?: string;
  /** Retained rows (row sources), from `head`. */
  rows?: Row[];
  /** The original index of each retained row (row sources), from `head`. */
  index?: number[];
  /** Retained row ids, from `head`. */
  rowIds?: RowId[];
  idSet?: Set<RowId>;
  /** Entries at the front of rows, index and rowIds that the window has evicted. */
  head: number;
  /** Rows evicted so far (a column source's original index is evicted + position). */
  evicted: number;
  /** The original index the next appended row gets. */
  nextIndex: number;
  /** The source received appends since its last full ingest. */
  streamed: boolean;
}

/** Everything a chart needs from one ingest. */
export interface Ingested<Row> {
  spec: Omit<ChartSpec, 'plugins'>;
  sources: SourceState<Row>[];
  seriesSources: number[];
  seriesIds: string[];
  /** X category registries by axis key. */
  categories: Map<string, CategoryAxis>;
  /** Category labels of string encodings, by registry key. */
  encodings: Map<string, string[]>;
  /** X kinds by axis key. */
  kinds: Map<string, XKind>;
  referenceLines: EngineLine[];
  referenceRegions: EngineRegion[];
}

/** A reference line with engine fields. */
export interface EngineLine {
  axis: 'x' | 'y';
  axisKey: string;
  value: number;
  label?: string;
  color?: string;
  dash?: number[];
  lineWidth?: number;
}
/** A reference region with engine fields. */
export interface EngineRegion {
  axis: 'x' | 'y';
  axisKey: string;
  from: number;
  to: number;
  label?: string;
  fill?: string;
  opacity?: number;
  edges?: boolean;
  edgeColor?: string;
  edgeDash?: number[];
}

/** What ingest reuses from the chart's previous state. */
export interface IngestContext<Row> {
  /** One X pass per source and per append batch (plan §3.4). */
  counters: { xValidations: number };
  /** Retained rows or columns of a streamed source with this input and axis. */
  retained?: (
    input: unknown,
    axis: string,
    x: AccessorLike | undefined,
  ) => Retained<Row> | undefined;
  previousEncodings?: ReadonlyMap<string, readonly string[]>;
  /** Axis types to keep for inferred axes that now hold no data. */
  previousTypes?: ReadonlyMap<string, AxisSpec['type']>;
  /** Scatter sources (by input and axis) to store unsorted even if X is sorted. */
  unsorted?: ReadonlySet<string>;
}

/** A streamed source's retained data, to ingest instead of its declared input. */
export interface Retained<Row> {
  rows?: Row[];
  index?: number[];
  columns?: Record<string, Float64Array>;
  rowIds?: RowId[];
  evicted: number;
  nextIndex: number;
}

export const EMPTY: readonly unknown[] = [];

export function isBins(input: unknown): input is HistogramBins {
  return (
    !!input &&
    typeof input === 'object' &&
    'edges' in input &&
    'counts' in input &&
    !Array.isArray(input)
  );
}
export function isColumns(input: unknown): input is ColumnData {
  return !!input && typeof input === 'object' && 'columns' in input && !Array.isArray(input);
}

export const describe = (value: unknown): string =>
  value === null
    ? 'null'
    : value === undefined
      ? 'undefined'
      : value instanceof Date
        ? 'a Date'
        : typeof value === 'string'
          ? `"${value}"`
          : typeof value === 'number'
            ? String(value)
            : Array.isArray(value)
              ? 'an array'
              : typeof value;

export function fieldLabel(field: AccessorLike): string {
  return typeof field === 'string' ? `field "${field}"` : 'accessor';
}

export function read(field: AccessorLike, row: unknown, index: number, path: string): unknown {
  if (typeof field === 'function') return field(row, index);
  if (row === null || typeof row !== 'object')
    fail(`${path}: row ${index} is ${describe(row)}; rows must be objects with named fields.`);
  return (row as Record<string, unknown>)[field];
}

/** A missing value (gap) or a finite number; anything else throws. */
export function numeric(value: unknown, path: string): number {
  if (value == null || (typeof value === 'number' && Number.isNaN(value))) return Number.NaN;
  if (typeof value !== 'number' || !Number.isFinite(value))
    fail(`${path} is ${describe(value)}; values must be finite numbers, or null for a gap.`);
  return value;
}

/** A source key for `IngestContext.unsorted`. */
export function sourceKey(index: number, axis: string): string {
  return `${axis}#${index}`;
}

export function isRowId(value: unknown): value is RowId {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
}

export function indexColumn(count: number, start = 0): Float64Array {
  const column = new Float64Array(count);
  for (let i = 0; i < count; i++) column[i] = start + i;
  return column;
}
