/**
 * normalize(options) → the engine's view of them (plan §3.2, §5.9, D16, D24).
 *
 * The one validation layer: invalid input throws `snaplot: …` here, at the
 * call that passed it; unknown keys and suspicious values warn once per page.
 * Array- and object-valued options are copied on intake, so a caller who
 * mutates what they passed changes nothing until they pass it again. Data
 * is kept by reference; ingest reads it.
 */
import { DARK_THEME, DEFAULT_THEME } from '../constants';
import { createTheme } from '../config/theme';
import { fail, suggest, warnOnce } from '../engine/errors';
import { dateFormatter, type NumberFormatSpec, numberFormatter } from '../engine/format';
import type { AxisSpec, ChartSpec, SeriesSpec, ThemeConfig } from '../engine/spec';
import type {
  ChartGroup,
  ChartOptions,
  ChartPlugin,
  ChartPoint,
  DataSource,
  SelectionRange,
  SeriesType,
} from './types';
import {
  AXIS,
  AXIS_TYPES,
  type CallbackKey,
  CALLBACKS,
  COLOR_BY,
  DATE_KEYS,
  HINTS,
  INTERACTION,
  INTERPOLATIONS,
  type Keys,
  LEGEND,
  LINE,
  POSITIONS,
  REGION,
  REMOVED_VALUES,
  RENDER_MODES,
  SELECTION,
  SERIES,
  SERIES_TYPES,
  SIZE_BY,
  STREAMING,
  THEME_TOKENS,
  TOOLTIP,
  TOOLTIP_FIELD,
  TOP,
} from './option-keys';

// ─── Normalized shape ────────────────────────────────────────────────

/** A field read by a function or by name, as series and encodings give it. */
export type AccessorLike = string | ((row: any, index: number) => unknown);

/** A colour, size or tooltip encoding: its field and the engine options it carries. */
export interface NormalizedEncoding {
  field: AccessorLike;
  options: Record<string, unknown>;
}

/** One series, validated, with its style already in engine terms. */
export interface NormalizedSeries {
  index: number;
  id: string;
  label: string;
  type: SeriesType;
  /** The series' own data, by reference. */
  data?: DataSource<unknown>;
  x?: AccessorLike;
  y?: AccessorLike;
  lower?: AccessorLike;
  upper?: AccessorLike;
  rowId?: AccessorLike;
  xAxis: string;
  yAxis: string;
  /** Engine style fields: colour, dash, widths, opacity, interpolation, fill, render mode. */
  spec: Partial<SeriesSpec>;
  /** A colour per bar or point, from its value, row and original row index. */
  pointColor?: (value: number, row: unknown, index: number) => string;
  /** The series readout format. */
  format?: (value: number, point?: ChartPoint<any>) => string;
  colorBy?: NormalizedEncoding;
  sizeBy?: NormalizedEncoding;
  tooltipFields?: NormalizedEncoding[];
}

/** One axis: the kind the caller asked for, its categories and its engine fields. */
export interface NormalizedAxis {
  type?: (typeof AXIS_TYPES)[number];
  categories?: string[];
  /** The engine fields; ingest adds the type and the category geometry. */
  spec: AxisSpec;
}

/** A reference line or region with engine field names (values resolved by ingest). */
export interface NormalizedLine {
  axis: string;
  value: unknown;
  label?: string;
  color?: string;
  dash?: number[];
  lineWidth?: number;
}
export interface NormalizedRegion {
  axis: string;
  from: unknown;
  to: unknown;
  label?: string;
  fill?: string;
  opacity?: number;
  edges?: boolean;
  edgeColor?: string;
  edgeDash?: number[];
}

/** The state options an options object names (plan D3). */
export interface NormalizedState {
  viewport?: Record<string, { min: number; max: number }>;
  selection?: SelectionRange | null;
  hiddenSeries?: string[];
  highlight?: string | null;
}

/** normalize()'s result. */
export interface NormalizedOptions<Row> {
  /** The intake copy of the options, as the caller wrote them. */
  options: ChartOptions<Row>;
  data?: DataSource<Row>;
  x?: AccessorLike;
  rowId?: AccessorLike;
  series: NormalizedSeries[];
  axes: Record<string, NormalizedAxis>;
  /** Engine options other than series, axes and plugins. */
  engine: Omit<ChartSpec, 'series' | 'axes' | 'plugins'>;
  tooltip: {
    render?: (points: readonly ChartPoint<Row>[]) => string | Node;
  };
  referenceLines: NormalizedLine[];
  referenceRegions: NormalizedRegion[];
  plugins: ChartPlugin<Row>[];
  group?: ChartGroup;
  ariaLabel?: string;
  state: NormalizedState;
  callbacks: Partial<Record<CallbackKey, (value: never) => void>>;
  locale?: string;
  timeZone: 'local' | 'UTC';
  legend: boolean | 'auto' | { position: 'top' | 'bottom' };
  height?: number | string;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function isPlain(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

const describe = (value: unknown): string =>
  value === null
    ? 'null'
    : Array.isArray(value)
      ? 'an array'
      : typeof value === 'string'
        ? `"${value}"`
        : typeof value === 'object'
          ? 'an object'
          : String(value);

/**
 * Copy plain objects and arrays (D16 intake copies). Data, the group and plugin
 * objects, functions, Dates and typed arrays are kept by reference.
 */
export function intake<T>(value: T, key?: string): T {
  if (key === 'data' || key === 'group') return value;
  if (Array.isArray(value)) {
    return value.map((item) => (key === 'plugins' ? item : intake(item))) as T;
  }
  if (!isPlain(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [name, item] of Object.entries(value)) out[name] = intake(item, name);
  return out as T;
}

/** Warn about keys of `value` outside `known`, naming each path; returns the known keys' object. */
function checkKeys(value: Record<string, unknown>, known: Keys, path: string): void {
  for (const [name, item] of Object.entries(value)) {
    if (known.has(name) || item === undefined) continue;
    const full = path ? `${path}.${name}` : name;
    const general = full.replace(/\[\d+\]/g, '.*').replace(/^axes\.[^.]+/, 'axes.*');
    const hint =
      HINTS[full] ??
      HINTS[general] ??
      HINTS[name] ??
      (suggest(name, known) ? `Did you mean "${suggest(name, known)}"?` : '');
    warnOnce(
      'unknown-option',
      `"${full}" is not an option and is ignored.${hint ? ` ${hint}` : ''}`,
    );
    // A removed object can hold keys with their own hint (`zoom.onZoom`).
    if (isPlain(item))
      for (const child of Object.keys(item))
        if (HINTS[`${full}.${child}`])
          warnOnce(
            'unknown-option',
            `"${full}.${child}" is not an option and is ignored. ${HINTS[`${full}.${child}`]}`,
          );
  }
}

function warnValue(path: string, value: unknown, allowed: readonly string[], fallback: string) {
  warnOnce(
    'invalid-option',
    `${path} ${describe(value)} is not valid and is ignored; using ${fallback}. Use one of: ${allowed.join(', ')}.`,
  );
}

function enumValue<T extends string>(
  path: string,
  value: unknown,
  allowed: readonly T[],
  fallback: T | undefined,
): T | undefined {
  if (value === undefined) return fallback;
  if ((allowed as readonly unknown[]).includes(value)) return value as T;
  warnValue(path, value, allowed, fallback === undefined ? 'the default' : `'${fallback}'`);
  return fallback;
}

function toNumber(value: unknown, path: string): number {
  const n = value instanceof Date ? value.getTime() : value;
  if (typeof n !== 'number' || !Number.isFinite(n))
    fail(`${path} must be a finite number or a valid Date, not ${describe(value)}.`);
  return n;
}

function accessor(value: unknown, path: string): AccessorLike {
  if (typeof value === 'string' || typeof value === 'function') return value as AccessorLike;
  fail(`${path} must be a field name or a function of the row, not ${describe(value)}.`);
}

function finiteOption(value: unknown, path: string, min = 0, max = Infinity): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max)
    return value;
  warnOnce(
    'invalid-option',
    `${path} ${describe(value)} is not valid and is ignored; it must be a number from ${min}${max === Infinity ? ' up' : ` to ${max}`}.`,
  );
  return undefined;
}

function dashOption(value: unknown, path: string): number[] | undefined {
  if (value === undefined) return undefined;
  if (
    Array.isArray(value) &&
    value.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0)
  )
    return [...value];
  warnOnce('invalid-option', `${path} must be an array of non-negative numbers; it is ignored.`);
  return undefined;
}

function isDateFormat(value: Record<string, unknown>): boolean {
  return Object.keys(value).some((key) => DATE_KEYS.has(key));
}

/** A `format` option as a function, or `undefined`. */
function compileFormat(
  value: unknown,
  path: string,
  kind: 'number' | 'date' | 'auto',
  locale: string | undefined,
  timeZone: 'local' | 'UTC',
): ((value: number) => string) | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'function') return value as (value: number) => string;
  if (!isPlain(value))
    fail(`${path} must be a function or Intl format options, not ${describe(value)}.`);
  const date = kind === 'date' || (kind === 'auto' && isDateFormat(value));
  try {
    return date
      ? dateFormatter(value as Intl.DateTimeFormatOptions, locale, timeZone)
      : numberFormatter(value as NumberFormatSpec, locale);
  } catch (error) {
    fail(`${path} has invalid Intl options: ${(error as Error).message}`);
  }
}

// ─── normalize ───────────────────────────────────────────────────────

/** Validate and translate public options. Throws on invalid input; warns on suspicious input. */
export function normalize<Row>(input: ChartOptions<Row>): NormalizedOptions<Row> {
  if (!isPlain(input)) fail(`options must be an object, not ${describe(input)}.`);
  const options = intake(input);
  const raw = options as unknown as Record<string, unknown>;
  checkKeys(raw, TOP, '');

  const locale = raw.locale === undefined ? undefined : String(raw.locale);
  if (raw.locale !== undefined && typeof raw.locale !== 'string')
    fail(`locale must be a BCP 47 string such as 'en-GB', not ${describe(raw.locale)}.`);
  const timeZone = enumValue('timeZone', raw.timeZone, ['local', 'UTC'] as const, 'local')!;

  // Series.
  if (!Array.isArray(raw.series))
    fail(`series must be an array of series options, not ${describe(raw.series)}.`);
  const series = (raw.series as unknown[]).map((item, index) =>
    normalizeSeries(item, index, locale),
  );
  const ids = new Set<string>();
  for (const s of series) {
    if (ids.has(s.id)) fail(`series id "${s.id}" is used twice. Give each series a unique id.`);
    ids.add(s.id);
  }

  // Axes.
  const axes: Record<string, NormalizedAxis> = {};
  if (raw.axes !== undefined) {
    if (!isPlain(raw.axes))
      fail(`axes must be an object of axes by key, not ${describe(raw.axes)}.`);
    for (const [key, value] of Object.entries(raw.axes)) {
      if (value === undefined || value === null) continue;
      axes[key] = normalizeAxis(key, value, locale, timeZone);
    }
  }

  // Data and the shared accessors.
  const data = raw.data as DataSource<Row> | undefined;
  if (
    data !== undefined &&
    !Array.isArray(data) &&
    !(isPlain(data) && ('columns' in data || ('edges' in data && 'counts' in data)))
  )
    fail(`data must be an array of rows, { columns } or histogram() bins, not ${describe(data)}.`);
  const x = raw.x === undefined ? undefined : accessor(raw.x, 'x');
  const rowId = raw.rowId === undefined ? undefined : accessor(raw.rowId, 'rowId');

  const engine: Omit<ChartSpec, 'series' | 'axes' | 'plugins'> = {};
  const allScatter = series.length > 0 && series.every((s) => s.type === 'scatter');
  normalizeInteraction(raw, engine, allScatter);

  // Cursor and highlight: a boolean and a series id.
  if (raw.cursor !== undefined) {
    if (typeof raw.cursor === 'boolean') engine.cursor = { show: raw.cursor };
    else if (isPlain(raw.cursor)) removedValue('cursor');
    else fail(`cursor must be true or false, not ${describe(raw.cursor)}.`);
  }
  const state: NormalizedState = {};
  if (raw.highlight !== undefined) {
    if (raw.highlight === null || typeof raw.highlight === 'string')
      state.highlight = raw.highlight;
    else if (isPlain(raw.highlight)) removedValue('highlight');
    else fail(`highlight must be a series id or null, not ${describe(raw.highlight)}.`);
  }

  // Tooltip.
  const tooltip: NormalizedOptions<Row>['tooltip'] = {};
  if (raw.tooltip !== undefined) {
    if (typeof raw.tooltip === 'boolean') engine.tooltip = { show: raw.tooltip };
    else if (isPlain(raw.tooltip)) {
      const t = raw.tooltip;
      checkKeys(t, TOOLTIP, 'tooltip');
      const mode = enumValue('tooltip.mode', t.mode, ['index', 'nearest'] as const, undefined);
      engine.tooltip = mode === undefined ? {} : { mode };
      if (t.render !== undefined) {
        if (typeof t.render !== 'function') fail('tooltip.render must be a function.');
        tooltip.render = t.render as never;
      }
    } else fail(`tooltip must be true, false or tooltip options, not ${describe(raw.tooltip)}.`);
  }

  // Streaming.
  if (raw.streaming !== undefined) {
    if (!isPlain(raw.streaming))
      fail(`streaming must be an object, not ${describe(raw.streaming)}.`);
    checkKeys(raw.streaming, STREAMING, 'streaming');
    const { maxPoints, followWindow } = raw.streaming;
    if (maxPoints !== undefined && (!Number.isInteger(maxPoints) || (maxPoints as number) < 0))
      fail(`streaming.maxPoints must be a non-negative integer, not ${describe(maxPoints)}.`);
    if (
      followWindow !== undefined &&
      (typeof followWindow !== 'number' || !Number.isFinite(followWindow) || followWindow < 0)
    )
      fail(
        `streaming.followWindow must be a non-negative number of X units, not ${describe(followWindow)}.`,
      );
    engine.streaming = {
      ...(maxPoints === undefined ? {} : { maxPoints: maxPoints as number }),
      ...(followWindow === undefined ? {} : { followWindow: followWindow as number }),
    };
  }

  // Theme.
  if (raw.theme !== undefined) engine.theme = normalizeTheme(raw.theme);

  // Selection: a state option.
  if (raw.selection !== undefined) {
    if (raw.selection === null) state.selection = null;
    else if (isPlain(raw.selection) && ('x' in raw.selection || 'y' in raw.selection)) {
      checkKeys(raw.selection, SELECTION, 'selection');
      state.selection = {
        x: interval(raw.selection.x, 'selection.x'),
        ...(raw.selection.y === undefined ? {} : { y: interval(raw.selection.y, 'selection.y') }),
      };
    } else if (isPlain(raw.selection)) removedValue('selection');
    else fail(`selection must be { x: [from, to] } or null, not ${describe(raw.selection)}.`);
  }

  // The viewport and hidden series.
  if (raw.viewport !== undefined) {
    if (!isPlain(raw.viewport)) fail(`viewport must be an object of [from, to] by axis key.`);
    const viewport: Record<string, { min: number; max: number }> = {};
    for (const [key, value] of Object.entries(raw.viewport)) {
      if (value === undefined) continue;
      viewport[key] = interval(value, `viewport.${key}`);
    }
    state.viewport = viewport;
  }
  if (raw.hiddenSeries !== undefined) {
    if (!Array.isArray(raw.hiddenSeries) || raw.hiddenSeries.some((id) => typeof id !== 'string'))
      fail('hiddenSeries must be an array of series ids.');
    for (const id of raw.hiddenSeries as string[])
      if (!ids.has(id))
        fail(
          `hiddenSeries names "${id}", which is not a series id.${suggest(id, ids) ? ` Did you mean "${suggest(id, ids)}"?` : ''}`,
        );
    state.hiddenSeries = [...(raw.hiddenSeries as string[])];
  }

  // Annotations.
  const referenceLines = listOf(raw.referenceLines, 'referenceLines').map((item, i) =>
    normalizeLine(item, `referenceLines[${i}]`),
  );
  const referenceRegions = listOf(raw.referenceRegions, 'referenceRegions').map((item, i) =>
    normalizeRegion(item, `referenceRegions[${i}]`),
  );

  // Plugins.
  const plugins = listOf(raw.plugins, 'plugins').map((plugin, i) => {
    if (!plugin || typeof plugin !== 'object' || typeof (plugin as ChartPlugin).id !== 'string')
      fail(`plugins[${i}] must be a plugin object with a string id.`);
    return plugin as ChartPlugin<Row>;
  });

  // Callbacks.
  const callbacks: NormalizedOptions<Row>['callbacks'] = {};
  for (const name of CALLBACKS) {
    const fn = raw[name];
    if (fn === undefined) continue;
    if (typeof fn !== 'function') fail(`${name} must be a function, not ${describe(fn)}.`);
    callbacks[name] = fn as (value: never) => void;
  }

  // The rest.
  if (raw.ariaLabel !== undefined && typeof raw.ariaLabel !== 'string')
    fail(`ariaLabel must be a string, not ${describe(raw.ariaLabel)}.`);
  if (
    raw.height !== undefined &&
    !(typeof raw.height === 'string' || (typeof raw.height === 'number' && raw.height > 0))
  )
    fail(
      `height must be a positive number of pixels or a CSS length, not ${describe(raw.height)}.`,
    );
  let legend: NormalizedOptions<Row>['legend'] = 'auto';
  if (raw.legend !== undefined) {
    if (typeof raw.legend === 'boolean' || raw.legend === 'auto') legend = raw.legend;
    else if (isPlain(raw.legend)) {
      checkKeys(raw.legend, LEGEND, 'legend');
      legend = {
        position: enumValue(
          'legend.position',
          raw.legend.position,
          ['top', 'bottom'] as const,
          'top',
        )!,
      };
    } else fail(`legend must be true, false, 'auto' or { position }, not ${describe(raw.legend)}.`);
  }
  if (raw.group !== undefined && (raw.group === null || typeof raw.group !== 'object'))
    fail('group must be a createChartGroup() result.');

  return {
    options,
    data,
    x,
    rowId,
    series,
    axes,
    engine,
    tooltip,
    referenceLines,
    referenceRegions,
    plugins,
    group: raw.group as ChartGroup | undefined,
    ariaLabel: raw.ariaLabel as string | undefined,
    state,
    callbacks,
    locale,
    timeZone,
    legend,
    height: raw.height as number | string | undefined,
  };
}

/** Warn that an option's 0.12 object form was removed; the option keeps its default. */
function removedValue(name: keyof typeof REMOVED_VALUES, path: string = name): void {
  warnOnce('removed-option', `${path}: ${REMOVED_VALUES[name]} The object is ignored.`);
}

function listOf(value: unknown, path: string): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail(`${path} must be an array, not ${describe(value)}.`);
  return value;
}

function interval(value: unknown, path: string): { min: number; max: number } {
  if (!Array.isArray(value) || value.length !== 2)
    fail(`${path} must be [from, to], not ${describe(value)}.`);
  const min = toNumber(value[0], `${path}[0]`);
  const max = toNumber(value[1], `${path}[1]`);
  if (!(min < max)) fail(`${path} must have from < to, not [${min}, ${max}].`);
  return { min, max };
}

function normalizeInteraction(
  raw: Record<string, unknown>,
  engine: Omit<ChartSpec, 'series' | 'axes' | 'plugins'>,
  allScatter: boolean,
): void {
  let value = raw.interaction;
  if (value === 'timeseries' || value === 'analytical') {
    warnOnce(
      'removed-option',
      `interaction '${value}' was removed in 1.0 and is ignored. Use ${value === 'analytical' ? "interaction: { zoom: 'xy' }" : 'the default (no interaction option)'}.`,
    );
    value = undefined;
  }
  if (value === 'readonly') engine.interaction = 'readonly';
  else if (value === undefined || isPlain(value)) {
    const options = (value ?? {}) as Record<string, unknown>;
    checkKeys(options, INTERACTION, 'interaction');
    const zoom = enumValue(
      'interaction.zoom',
      options.zoom,
      ['x', 'xy', 'none'] as const,
      allScatter ? 'xy' : 'x',
    )!;
    const drag = enumValue(
      'interaction.drag',
      options.drag,
      ['zoom', 'select', 'pan'] as const,
      'zoom',
    )!;
    const bounds = enumValue(
      'interaction.bounds',
      options.bounds,
      ['data', 'none'] as const,
      'data',
    )!;
    engine.interaction = zoom === 'xy' ? 'analytical' : 'timeseries';
    if (zoom === 'none') {
      engine.zoom = { enabled: false };
      engine.pan = { enabled: false };
    }
    if (bounds === 'none') engine.zoom = { ...engine.zoom, bounds: false };
    if (drag === 'select') engine.selection = { ...engine.selection, mode: 'brush' };
    if (drag === 'pan') engine.touch = { ...engine.touch, drag: 'pan' };
  } else fail(`interaction must be 'readonly' or { zoom, drag, bounds }, not ${describe(value)}.`);
}

function normalizeTheme(value: unknown): Partial<ThemeConfig> | undefined {
  if (value === 'auto') return undefined;
  if (value === 'light') return { ...DEFAULT_THEME };
  if (value === 'dark') return { ...DARK_THEME };
  if (typeof value === 'string') {
    warnValue('theme', value, ['auto', 'light', 'dark'], "'auto'");
    return undefined;
  }
  if (!isPlain(value))
    fail(`theme must be 'auto', 'light', 'dark' or theme tokens, not ${describe(value)}.`);
  checkKeys(value, THEME_TOKENS, 'theme');
  const tokens: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value))
    if (item !== undefined && THEME_TOKENS.has(key)) tokens[key] = item;
  const mode = enumValue('theme.mode', tokens.mode, ['light', 'dark'] as const, undefined);
  const base = mode === 'dark' ? DARK_THEME : mode === 'light' ? DEFAULT_THEME : undefined;
  for (const key of ['categorical', 'sequential', 'diverging'] as const) {
    const list = tokens[key];
    if (list !== undefined && (!Array.isArray(list) || list.some((c) => typeof c !== 'string')))
      fail(`theme.${key} must be an array of CSS colours.`);
  }
  const fromTokens = createTheme({
    ...(base ? { base } : {}),
    ...(tokens as Record<string, never>),
    ...(tokens.categorical ? { categorical: [...(tokens.categorical as string[])] } : {}),
    ...(tokens.sequential ? { sequential: [...(tokens.sequential as string[])] } : {}),
    ...(tokens.diverging ? { diverging: [...(tokens.diverging as string[])] } : {}),
  });
  return fromTokens;
}

function normalizeAxis(
  key: string,
  value: unknown,
  locale: string | undefined,
  timeZone: 'local' | 'UTC',
): NormalizedAxis {
  const path = `axes.${key}`;
  if (!isPlain(value)) fail(`${path} must be an object, not ${describe(value)}.`);
  checkKeys(value, AXIS, path);
  const type = value.type;
  if (type !== undefined && !(AXIS_TYPES as readonly unknown[]).includes(type))
    fail(
      `${path}.type ${describe(type)} is not an axis type. Use one of: ${AXIS_TYPES.join(', ')}.`,
    );
  const categorical = type === 'category' || value.categories !== undefined;
  if (categorical && value.format !== undefined)
    fail(
      `${path}.format is not accepted on a category axis: category labels are shown as they are. Remove format, or map the labels in your data.`,
    );
  let categories: string[] | undefined;
  if (value.categories !== undefined) {
    if (type !== undefined && type !== 'category')
      fail(`${path}.categories need type: 'category' (or no type), not type ${describe(type)}.`);
    if (!Array.isArray(value.categories) || value.categories.some((c) => typeof c !== 'string'))
      fail(`${path}.categories must be an array of strings.`);
    if (new Set(value.categories).size !== value.categories.length)
      fail(`${path}.categories must not repeat a label.`);
    categories = [...(value.categories as string[])];
  }
  const spec: AxisSpec = {};
  if (type !== undefined && type !== 'category') spec.type = type as AxisSpec['type'];
  if (value.title !== undefined) spec.title = String(value.title);
  for (const bound of ['min', 'max'] as const) {
    if (value[bound] === undefined) continue;
    spec[bound] = toNumber(value[bound], `${path}.${bound}`);
    if (type === 'log' && (spec[bound] as number) <= 0)
      fail(`${path}.${bound} must be positive on a log axis.`);
  }
  if (spec.min !== undefined && spec.max !== undefined && spec.min >= spec.max)
    fail(`${path} needs min < max, not min ${spec.min} and max ${spec.max}.`);
  if (value.position !== undefined)
    spec.position = enumValue(
      `${path}.position`,
      value.position,
      POSITIONS,
      undefined,
    ) as AxisSpec['position'];
  if (value.nice !== undefined) spec.nice = value.nice !== false;
  if (value.ticks !== undefined) {
    if (!Array.isArray(value.ticks)) fail(`${path}.ticks must be an array of numbers or Dates.`);
    spec.ticks = value.ticks.map((tick, i) => toNumber(tick, `${path}.ticks[${i}]`));
  }
  if (value.grid !== undefined) {
    if (typeof value.grid === 'boolean') spec.grid = value.grid;
    else if (isPlain(value.grid)) removedValue('grid', `${path}.grid`);
    else fail(`${path}.grid must be true or false.`);
  }
  const format = compileFormat(
    value.format,
    `${path}.format`,
    type === 'time' ? 'date' : type === undefined ? 'auto' : 'number',
    locale,
    timeZone,
  );
  if (format) spec.format = format;
  return {
    ...(type === undefined ? {} : { type: type as NormalizedAxis['type'] }),
    categories,
    spec,
  };
}

function normalizeEncoding(value: unknown, path: string, known: Keys): NormalizedEncoding {
  if (typeof value === 'string' || typeof value === 'function')
    return { field: value as AccessorLike, options: {} };
  if (!isPlain(value))
    fail(`${path} must be a field, a function or { field, … }, not ${describe(value)}.`);
  checkKeys(value, known, path);
  const { field, ...options } = value;
  const copy: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(options)) {
    if (!known.has(key) || item === undefined) continue;
    copy[key] = Array.isArray(item) ? [...item] : item;
  }
  return { field: accessor(field, `${path}.field`), options: copy };
}

function normalizeSeries(
  value: unknown,
  index: number,
  locale: string | undefined,
): NormalizedSeries {
  const path = `series[${index}]`;
  if (!isPlain(value)) fail(`${path} must be an object, not ${describe(value)}.`);
  checkKeys(value, SERIES, path);
  const type = (value.type ?? 'line') as SeriesType;
  const name =
    typeof value.id === 'string'
      ? `"${value.id}"`
      : typeof value.y === 'string'
        ? `"${value.y}"`
        : path;
  if (!SERIES_TYPES.includes(type))
    fail(
      `series ${name} has unknown type ${describe(value.type)}. Use one of: ${SERIES_TYPES.join(', ')}.`,
    );
  const histogram = type === 'histogram';
  if (histogram) {
    const data = value.data as Record<string, unknown> | undefined;
    if (!data || !(data.edges instanceof Float64Array) || !(data.counts instanceof Float64Array))
      fail(
        `a histogram series takes histogram() bins as its data: { type: 'histogram', id, data: histogram(values) }.`,
      );
  } else if (value.y === undefined) {
    fail(`series ${name} needs y: the field name of its values, or a function of the row.`);
  }
  if (type === 'band' && (value.lower === undefined || value.upper === undefined))
    fail(`band series ${name} needs both lower and upper.`);
  const id = value.id !== undefined ? value.id : typeof value.y === 'string' ? value.y : undefined;
  if (typeof id !== 'string' || id.length === 0)
    fail(`series ${name} needs an id: its y is not a field name.`);

  const spec: Partial<SeriesSpec> = {};
  const color = value.color;
  let pointColor: NormalizedSeries['pointColor'];
  if (typeof color === 'function') {
    pointColor = color as NormalizedSeries['pointColor'];
  } else if (color !== undefined) {
    if (typeof color !== 'string') fail(`${path}.color must be a CSS colour string.`);
    spec.color = color;
  }
  if (typeof value.fill === 'function') {
    warnOnce(
      'removed-option',
      `${path}.fill as a function was removed in 1.0 and is ignored. Use color: (value, row, index) => …`,
    );
  } else if (value.fill !== undefined) {
    if (value.fill !== null && typeof value.fill !== 'string')
      fail(`${path}.fill must be a CSS colour or null.`);
    spec.fill = value.fill as string | null;
  }
  const dash = dashOption(value.dash, `${path}.dash`);
  if (dash) spec.dash = dash;
  const lineWidth = finiteOption(value.lineWidth, `${path}.lineWidth`);
  if (lineWidth !== undefined) spec.lineWidth = lineWidth;
  const opacity = finiteOption(value.opacity, `${path}.opacity`, 0, 1);
  if (opacity !== undefined) spec.opacity = opacity;
  const pointRadius = finiteOption(value.pointRadius, `${path}.pointRadius`);
  if (pointRadius !== undefined) spec.pointRadius = pointRadius;
  if (value.interpolation !== undefined)
    spec.interpolation = enumValue(
      `${path}.interpolation`,
      value.interpolation,
      INTERPOLATIONS,
      'linear',
    ) as SeriesSpec['interpolation'];
  if (value.spanGaps !== undefined) spec.spanGaps = value.spanGaps === true;
  if (value.renderMode !== undefined)
    spec.renderMode = enumValue(
      `${path}.renderMode`,
      value.renderMode,
      RENDER_MODES,
      'auto',
    ) as SeriesSpec['renderMode'];
  let format: NormalizedSeries['format'];
  if (value.format !== undefined) {
    format =
      typeof value.format === 'function'
        ? (value.format as NormalizedSeries['format'])
        : compileFormat(value.format, `${path}.format`, 'number', locale, 'local');
  }

  const normalized: NormalizedSeries = {
    index,
    id,
    label:
      typeof value.label === 'string' ? value.label : typeof value.y === 'string' ? value.y : id,
    type,
    xAxis: value.xAxis === undefined ? 'x' : String(value.xAxis),
    yAxis: value.yAxis === undefined ? 'y' : String(value.yAxis),
    spec,
    ...(pointColor ? { pointColor } : {}),
    ...(format ? { format } : {}),
  };
  if (value.data !== undefined) normalized.data = value.data as DataSource<unknown>;
  if (value.x !== undefined) normalized.x = accessor(value.x, `${path}.x`);
  if (value.rowId !== undefined) normalized.rowId = accessor(value.rowId, `${path}.rowId`);
  if (!histogram) normalized.y = accessor(value.y, `${path}.y`);
  if (type === 'band') {
    normalized.lower = accessor(value.lower, `${path}.lower`);
    normalized.upper = accessor(value.upper, `${path}.upper`);
  }
  if (
    value.colorBy !== undefined ||
    value.sizeBy !== undefined ||
    value.tooltipFields !== undefined
  ) {
    if (type !== 'scatter')
      fail(`series ${name} uses colorBy, sizeBy or tooltipFields, which need type: 'scatter'.`);
    if (value.colorBy !== undefined)
      normalized.colorBy = normalizeEncoding(value.colorBy, `${path}.colorBy`, COLOR_BY);
    if (value.sizeBy !== undefined)
      normalized.sizeBy = normalizeEncoding(value.sizeBy, `${path}.sizeBy`, SIZE_BY);
    if (value.tooltipFields !== undefined) {
      if (!Array.isArray(value.tooltipFields)) fail(`${path}.tooltipFields must be an array.`);
      normalized.tooltipFields = value.tooltipFields.map((field, i) =>
        normalizeEncoding(field, `${path}.tooltipFields[${i}]`, TOOLTIP_FIELD),
      );
    }
  }
  return normalized;
}

function normalizeLine(value: unknown, path: string): NormalizedLine {
  if (!isPlain(value)) fail(`${path} must be an object, not ${describe(value)}.`);
  checkKeys(value, LINE, path);
  if (typeof value.axis !== 'string') fail(`${path}.axis must be an axis key such as 'y'.`);
  if (value.value === undefined) fail(`${path} needs a value.`);
  const dash = dashOption(value.dash, `${path}.dash`);
  const lineWidth = finiteOption(value.lineWidth, `${path}.lineWidth`);
  return {
    axis: value.axis,
    value: value.value,
    ...(value.label === undefined ? {} : { label: String(value.label) }),
    ...(typeof value.color === 'string' ? { color: value.color } : {}),
    ...(dash ? { dash } : {}),
    ...(lineWidth === undefined ? {} : { lineWidth }),
  };
}

function normalizeRegion(value: unknown, path: string): NormalizedRegion {
  if (!isPlain(value)) fail(`${path} must be an object, not ${describe(value)}.`);
  checkKeys(value, REGION, path);
  if (typeof value.axis !== 'string') fail(`${path}.axis must be an axis key such as 'x'.`);
  if (value.from === undefined || value.to === undefined) fail(`${path} needs from and to.`);
  const opacity = finiteOption(value.opacity, `${path}.opacity`, 0, 1);
  const color = value.color;
  return {
    axis: value.axis,
    from: value.from,
    to: value.to,
    ...(value.label === undefined ? {} : { label: String(value.label) }),
    ...(typeof color === 'string' ? { fill: color } : {}),
    ...(opacity === undefined ? {} : { opacity }),
  };
}
