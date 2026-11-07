/**
 * The diff classifier (plan D16): which work an option change needs. Each class decides it:
 *
 * - data: a `data` reference (two empty arrays are equal), a field name, `x` or `rowId` →
 *   ingest, which reads again only the sources whose input, X or axis changed and, in the
 *   others, only the columns of new field names (`./ingest.ts`);
 * - accessor: a function of a row with a new identity → re-extract that series' column from the
 *   retained rows, without an X pass, with the churn warning;
 * - layout and paint: axes, legend, height, style, theme, formats, render functions → the
 *   engine's options, relaid out and repainted, without reading data;
 * - annotations: reference lines and regions → re-resolved and repainted;
 * - callbacks: none (they are read through the latest options when called);
 * - plugins: reconciled by id; group: membership; state: plan D3.
 *
 * `update(patch)` names the keys it changes and each named key counts as changed;
 * `setOptions(full)` compares every key with the last applied options. Functions compare by
 * identity, data by reference, everything else deeply.
 */
import type { AccessorLike, NormalizedOptions, NormalizedSeries } from './normalize';
import { CALLBACKS } from './option-keys';
import { equivalent } from './options';

/** The work an option change needs. */
export interface Work {
  data: boolean;
  /** Only a function's identity changed: the first such series and field, for the warning. */
  accessor?: { id: string; field: string };
  /** The engine's options (axes, series style, theme, tooltip, interaction…). */
  engine: boolean;
  /** Engine options that can change how the series draw (all but `PAINT_NEUTRAL`). */
  marks: boolean;
  annotations: boolean;
  plugins: boolean;
  group: boolean;
  aria: boolean;
}

export const STATE_KEYS = ['viewport', 'selection', 'hiddenSeries', 'highlight'] as const;
export type StateKey = (typeof STATE_KEYS)[number];

const CALLBACK_KEYS: ReadonlySet<string> = new Set(CALLBACKS);
/** Engine options no mark reads: the data layer keeps its pixels when only these change. */
const PAINT_NEUTRAL: ReadonlySet<string> = new Set([
  'tooltip',
  'cursor',
  'legend',
  'interaction',
  'locale',
]);
const STATE: ReadonlySet<string> = new Set(STATE_KEYS);
/** Series fields that read the data; the rest of a series is its style. */
const READERS = [
  'data',
  'x',
  'y',
  'lower',
  'upper',
  'rowId',
  'colorBy',
  'sizeBy',
  'tooltipFields',
  'values',
  'bins',
];

/** Two data inputs are the same data: the same reference, or both empty arrays. */
export function sameData(a: unknown, b: unknown): boolean {
  return a === b || (Array.isArray(a) && Array.isArray(b) && a.length === 0 && b.length === 0);
}

/** How a field reader changed: not at all, only a function's identity, or what it reads. */
function reader(a: AccessorLike | undefined, b: AccessorLike | undefined) {
  if (a === b) return 'same';
  return typeof a === 'function' && typeof b === 'function' ? 'accessor' : 'data';
}

function plain(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function withoutReaders(series: unknown): Record<string, unknown> {
  const style = { ...plain(series) };
  for (const key of READERS) delete style[key];
  // An encoding's options (palette, domain, label, format) are style; its field is a reader.
  for (const key of ['colorBy', 'sizeBy'] as const) {
    const encoding = plain(series)[key];
    if (encoding && typeof encoding === 'object') style[key] = { ...encoding, field: undefined };
  }
  const fields = plain(series).tooltipFields;
  if (Array.isArray(fields))
    style.tooltipFields = fields.map((field) =>
      field && typeof field === 'object' ? { ...field, field: undefined } : undefined,
    );
  return style;
}

function encodingFields(s: NormalizedSeries): Array<AccessorLike | undefined> {
  return [s.colorBy?.field, s.sizeBy?.field, ...(s.tooltipFields ?? []).map((f) => f.field)];
}

/** The work of a series change: compared field by field, whichever call named it. */
function seriesWork(
  previous: NormalizedOptions<unknown>,
  next: NormalizedOptions<unknown>,
  work: Work,
) {
  const a = previous.series;
  const b = next.series;
  if (a.length !== b.length) {
    work.data = true;
    return;
  }
  for (let i = 0; i < a.length; i++) {
    const sa = a[i];
    const sb = b[i];
    if (
      sa.id !== sb.id ||
      sa.type !== sb.type ||
      sa.xAxis !== sb.xAxis ||
      sa.yAxis !== sb.yAxis ||
      !sameData(sa.data, sb.data) ||
      Boolean(sa.colorBy) !== Boolean(sb.colorBy) ||
      Boolean(sa.sizeBy) !== Boolean(sb.sizeBy) ||
      (sa.tooltipFields?.length ?? 0) !== (sb.tooltipFields?.length ?? 0) ||
      // A heatmap's rows' axis and its number of bins shape its source's columns.
      sa.heatmap?.rows !== sb.heatmap?.rows ||
      sa.heatmap?.bins?.lo.length !== sb.heatmap?.bins?.lo.length
    ) {
      work.data = true;
      return;
    }
    const fa = [
      sa.x,
      sa.y,
      sa.lower,
      sa.upper,
      sa.rowId,
      sa.heatmap?.values,
      ...encodingFields(sa),
    ];
    const fb = [
      sb.x,
      sb.y,
      sb.lower,
      sb.upper,
      sb.rowId,
      sb.heatmap?.values,
      ...encodingFields(sb),
    ];
    const names = ['x', 'y', 'lower', 'upper', 'rowId', 'values', 'colorBy', 'sizeBy'];
    for (let f = 0; f < fa.length; f++) {
      const change = reader(fa[f], fb[f]);
      if (change === 'data') {
        work.data = true;
        return;
      }
      if (change === 'accessor')
        work.accessor ??= { id: sb.id, field: names[f] ?? 'tooltipFields' };
    }
    const raw = (n: NormalizedOptions<unknown>) => (n.options.series as readonly unknown[])[i];
    if (!equivalent(withoutReaders(raw(previous)), withoutReaders(raw(next)))) work.engine = true;
  }
}

/**
 * Classify the change from `previous` to `next`. `named` lists the keys an update() patch
 * names (each counts as changed); without it every key is compared (setOptions).
 */
export function classify<Row>(
  previous: NormalizedOptions<Row>,
  next: NormalizedOptions<Row>,
  named?: ReadonlySet<string>,
): Work {
  const work: Work = {
    data: false,
    engine: false,
    marks: false,
    annotations: false,
    plugins: false,
    group: false,
    aria: false,
  };
  const a = previous.options as unknown as Record<string, unknown>;
  const b = next.options as unknown as Record<string, unknown>;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const p = previous as NormalizedOptions<unknown>;
  const n = next as NormalizedOptions<unknown>;
  for (const key of keys) {
    if (STATE.has(key) || CALLBACK_KEYS.has(key)) continue;
    const forced = named?.has(key) ?? false;
    if (named && !forced) continue;
    if (key === 'series') {
      seriesWork(p, n, work);
      if (forced) work.engine = true;
      work.marks ||= work.engine;
      continue;
    }
    if (key === 'data') {
      if (forced || !sameData(a.data, b.data)) work.data = true;
      continue;
    }
    if (!forced && equivalent(a[key], b[key])) continue;
    if (!PAINT_NEUTRAL.has(key)) work.marks = true;
    switch (key) {
      case 'x':
      case 'rowId': {
        const change = forced ? 'data' : reader(p[key], n[key]);
        if (change === 'data') work.data = true;
        else if (change === 'accessor')
          work.accessor ??= { id: n.series[0]?.id ?? key, field: key };
        break;
      }
      case 'axes': {
        const axes = new Set([...Object.keys(p.axes), ...Object.keys(n.axes)]);
        for (const axis of axes) {
          const before = p.axes[axis];
          const after = n.axes[axis];
          if (before?.type !== after?.type || !equivalent(before?.categories, after?.categories))
            work.data = true;
        }
        work.engine = true;
        break;
      }
      case 'streaming':
        if (p.engine.streaming?.maxPoints !== n.engine.streaming?.maxPoints) work.data = true;
        work.engine = true;
        break;
      case 'timeZone':
        // ISO-8601 strings without an offset are read in the time zone.
        work.data = true;
        break;
      case 'referenceLines':
      case 'referenceRegions':
        // Those on a vertical axis are in its automatic range.
        work.annotations = true;
        work.engine = true;
        break;
      case 'plugins':
        work.plugins = true;
        break;
      case 'group':
        work.group = true;
        break;
      case 'ariaLabel':
        work.aria = true;
        break;
      default:
        // theme, tooltip, cursor, legend, height, interaction, locale.
        work.engine = true;
    }
  }
  // A data change runs the same ingest, which re-extracts new accessors too: no separate pass.
  if (work.data) work.accessor = undefined;
  return work;
}
