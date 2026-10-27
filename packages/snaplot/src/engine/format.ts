/**
 * The one formatter (plan §3.2, §5.2): every tick label, value readout and X readout of the
 * engine goes through this module. W5 contract, created by M9b over today's behaviour; M10 owns it
 * and implements §5.2 behind the same functions, and the other tracks only call them:
 *
 * - `formatTick(ctx, axis, value)`: an axis tick label (the axes, the layout's measurement);
 * - `formatReadout(ctx, series, value)`: a series' value readout (tooltip rows, the cursor
 *   snapshot, so the legend table);
 * - `formatX(ctx, value, axis)`: an X readout (the tooltip header, the snapshot's `formattedX`);
 * - `formatBinRange(ctx, min, max, series)`: a histogram bin's range.
 *
 * `ctx` is the engine (`FormatContext`: its options and scales). Today's call sites differ in
 * which formats apply (the `FormatQuirks` they pass); M10 replaces them with §5.2's one precedence
 * (series format > axis format > automatic, for ticks and readouts alike) and stops reading the
 * quirks, so their callers change no line. The automatic readout keeps value precision: never the
 * tick step's (P9, `formatValue`).
 */
import { DEFAULT_TICK_COUNT } from '../constants';
import { niceStep, niceTicks } from './scales/niceNumbers';
import type { ChartSpec, Scale } from './spec';

export interface ValueFormatOptions {
  /** Decimals of the axis tick step: 0 for an integer step, 1 for 0.2, 2 for 0.25. */
  stepDecimals?: number;
  /** BCP 47 locale; the runtime default when omitted. */
  locale?: string;
}

/** The most fraction digits a readout shows (plan P9). */
export const MAX_READOUT_DECIMALS = 6;

// Cached Intl instances: by slot for the default locale (the cursor hot
// path allocates nothing), by locale and slot otherwise. Slots 0–6 are
// fraction-digit counts; SIGNIFICANT is the two-significant-digit fallback.
const SIGNIFICANT = MAX_READOUT_DECIMALS + 1;
const defaultFormats: Intl.NumberFormat[] = [];
const localeFormats = new Map<string, Intl.NumberFormat>();

function createFormat(locale: string | undefined, slot: number): Intl.NumberFormat {
  return new Intl.NumberFormat(
    locale,
    slot === SIGNIFICANT ? { maximumSignificantDigits: 2 } : { maximumFractionDigits: slot },
  );
}

function numberFormat(locale: string | undefined, slot: number): Intl.NumberFormat {
  if (locale === undefined) return (defaultFormats[slot] ??= createFormat(undefined, slot));
  const key = `${locale}|${slot}`;
  let format = localeFormats.get(key);
  if (!format) {
    format = createFormat(locale, slot);
    localeFormats.set(key, format);
  }
  return format;
}

/**
 * Format a value readout at value precision: `maximumFractionDigits =
 * clamp(stepDecimals + 2, 0, 6)`, with grouping. A non-zero value that would
 * round to 0 shows two significant digits instead. So at an integer step
 * 0.4567 reads `0.46`, 0.0004567 reads `0.00046`, 39.27 reads `39.27` and
 * 1138371 reads `1,138,371`. NaN reads as an empty string.
 */
export function formatValue(value: number, options: ValueFormatOptions = {}): string {
  if (Number.isNaN(value)) return '';
  const digits = Math.min(
    MAX_READOUT_DECIMALS,
    Math.max(0, Math.round(options.stepDecimals ?? 0) + 2),
  );
  // -0 reads as 0.
  const number = value === 0 ? 0 : value;
  if (number !== 0 && Math.abs(number) < 0.5 * 10 ** -digits) {
    return numberFormat(options.locale, SIGNIFICANT).format(number);
  }
  return numberFormat(options.locale, digits).format(number);
}

/** Decimal places needed to write a tick step exactly (0.2 → 1, 0.25 → 2, 5 → 0). */
export function stepDecimals(step: number): number {
  const size = Math.abs(step);
  if (!Number.isFinite(size) || size === 0) return 0;
  for (let decimals = 0; decimals < 20; decimals++) {
    const scaled = size * 10 ** decimals;
    if (Math.abs(scaled - Math.round(scaled)) <= 1e-9 * scaled) return decimals;
  }
  return 20;
}

/**
 * The tick-step decimals of an axis, for its value readouts. Linear axes use
 * the step of the ticks the axis draws (explicit `ticks`, else nice ticks at
 * `tickCount`); log axes use the smallest visible decade below 1; other axes
 * use 0.
 */
export function scaleStepDecimals(
  scale: { readonly type: string; readonly min: number; readonly max: number },
  ticks?: readonly number[],
  tickCount: number = DEFAULT_TICK_COUNT,
): number {
  if (scale.type === 'log') {
    const low = Math.min(scale.min, scale.max);
    return low > 0 && low < 1 ? stepDecimals(10 ** Math.floor(Math.log10(low))) : 0;
  }
  if (scale.type !== 'linear') return 0;
  const values = ticks && ticks.length >= 2 ? ticks : niceTicks(scale.min, scale.max, tickCount);
  const step =
    values.length >= 2
      ? values[1] - values[0]
      : niceStep(scale.min, scale.max, Math.max(2, tickCount));
  return stepDecimals(step);
}

/** `Intl.NumberFormat` options plus text around the number, as an axis or series `format` gives them. */
export interface NumberFormatSpec extends Intl.NumberFormatOptions {
  prefix?: string;
  suffix?: string;
}

/**
 * A formatter for a `format` object: `prefix`, the number through one cached
 * `Intl.NumberFormat`, then `suffix`. NaN reads as an empty string.
 */
export function numberFormatter(
  spec: NumberFormatSpec,
  locale?: string,
): (value: number) => string {
  const { prefix = '', suffix = '', ...options } = spec;
  const format = new Intl.NumberFormat(locale, options);
  return (value) => (Number.isNaN(value) ? '' : `${prefix}${format.format(value)}${suffix}`);
}

/** Cached `Intl.NumberFormat`s: one per locale and options, for every number this engine writes. */
const numberFormats = new Map<string, Intl.NumberFormat>();

export function cachedNumberFormat(
  locale: string | undefined,
  options: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  const key = `${locale ?? ''}|${JSON.stringify(options)}`;
  let format = numberFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, options);
    numberFormats.set(key, format);
  }
  return format;
}

/**
 * Cached `Intl.DateTimeFormat`s, by locale, options and `zone` (a format without a `timeZone`
 * binds the runtime's zone when built, so the key names it: `runtimeTimeZone()`).
 */
const dateFormats = new Map<string, Intl.DateTimeFormat>();

export function cachedDateFormat(
  locale: string | undefined,
  options: Intl.DateTimeFormatOptions,
  zone: string,
): Intl.DateTimeFormat {
  const key = `${locale ?? ''}|${zone}|${JSON.stringify(options)}`;
  let format = dateFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, options);
    dateFormats.set(key, format);
  }
  return format;
}

/**
 * The runtime's time zone, read again only when its offsets in January and July change (a TZ
 * change), so labelling every frame constructs no formatter (gap-perf-gate-09).
 */
let runtimeZone: { january: number; july: number; name: string } | null = null;
const JANUARY = new Date(2026, 0, 1);
const JULY = new Date(2026, 6, 1);
export function runtimeTimeZone(): string {
  const january = JANUARY.getTimezoneOffset();
  const july = JULY.getTimezoneOffset();
  if (runtimeZone?.january !== january || runtimeZone.july !== july) {
    runtimeZone = {
      january,
      july,
      name: new Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'local',
    };
  }
  return runtimeZone.name;
}

/**
 * A formatter for a time `format` object (`Intl.DateTimeFormat` options) of
 * epoch milliseconds, in the viewer's zone or in UTC.
 */
export function dateFormatter(
  options: Intl.DateTimeFormatOptions,
  locale?: string,
  timeZone: 'local' | 'UTC' = 'local',
): (value: number) => string {
  const format = new Intl.DateTimeFormat(locale, {
    ...options,
    ...(timeZone === 'UTC' ? { timeZone: 'UTC' } : {}),
  });
  return (value) => (Number.isFinite(value) ? format.format(value) : '');
}

// ─── The contract ─────────────────────────────────────────────

/** What formatting reads of the engine (`ChartCore` is one): its options and scales. */
export interface FormatContext {
  readonly config: ChartSpec;
  readonly scales: ReadonlyMap<string, Scale>;
}

/**
 * Which formats a call site applies today, before M10's one precedence (backlog-01, dxtrial-03,
 * dataapi-09). Both default to true. M10 ignores them; M12a drops them from its calls.
 */
export interface FormatQuirks {
  /** false: skip the tooltip's formats (`tooltip.yFormat`, which carries the series formats, and `tooltip.xFormat`). */
  readonly tooltipFormat?: boolean;
  /** false: skip `axes.<k>.format` for the automatic readout. */
  readonly axisFormat?: boolean;
}

/** Tooltip rows of lines, areas, bands, scatter and bars, and the HitTester's X: no axis format. */
export const NO_AXIS_FORMAT: FormatQuirks = Object.freeze({ axisFormat: false });
/** Cursor snapshot rows and header of a chart with a row per series: no tooltip format. */
export const NO_TOOLTIP_FORMAT: FormatQuirks = Object.freeze({ tooltipFormat: false });
/** Cursor snapshot rows and header over one shared store: the automatic readout only. */
export const NO_FORMAT: FormatQuirks = Object.freeze({ tooltipFormat: false, axisFormat: false });

/**
 * The label of tick `value` on axis `axis`: the axis `format`, else the scale's tick format.
 * `'slot'` ticks (bar and histogram X ticks from the data) take the X axis' `format`, else a
 * time axis' tick format (render-01), else an integer as is and anything else with one decimal.
 */
export function formatTick(
  ctx: FormatContext,
  axis: string,
  value: number,
  kind: 'axis' | 'slot' = 'axis',
): string {
  const format = ctx.config.axes?.[axis]?.format;
  if (format) return format(value);
  const scale = ctx.scales.get(axis);
  if (kind === 'slot' && scale?.type !== 'time') {
    return Number.isInteger(value)
      ? formatValue(value, { stepDecimals: 0, locale: ctx.config.locale })
      : formatValue(value, { stepDecimals: 1, locale: ctx.config.locale });
  }
  return scale ? scale.tickFormat(value) : String(value);
}

/**
 * The readout of `value` for series `series` (an index), one precedence for every call site
 * (plan §5.2): the series `format`, else its value axis' `format`, else the automatic readout on
 * that axis at value precision (`axisReadout`). `quirks` are accepted and ignored (M10).
 */
export function formatReadout(
  ctx: FormatContext,
  series: number,
  value: number,
  _quirks?: FormatQuirks,
): string {
  const yFormat = ctx.config.tooltip?.yFormat;
  if (yFormat) return yFormat(value, series);
  const spec = ctx.config.series[series];
  if (spec?.format) return spec.format(value);
  const axis = spec?.yAxis ?? 'y';
  const format = ctx.config.axes?.[axis]?.format;
  return format ? format(value) : axisReadout(ctx, axis, value);
}

/**
 * The X readout of `value` on axis `axis` (default `'x'`): `tooltip.xFormat`, else the axis
 * `format` (a category axis' labels), else the automatic readout: a time axis' readout format
 * (date plus time of day), a number at value precision.
 */
export function formatX(
  ctx: FormatContext,
  value: number,
  axis = 'x',
  _quirks?: FormatQuirks,
): string {
  const xFormat = ctx.config.tooltip?.xFormat;
  if (xFormat) return xFormat(value);
  const format = ctx.config.axes?.[axis]?.format;
  if (format) return format(value);
  return axisReadout(ctx, axis, value);
}

/**
 * A histogram bin's range, `min – max`: `tooltip.rangeFormat`, else each edge through `formatX`
 * on the series' X axis. When a coarse format writes two different edges the same, both are
 * written with enough decimals to tell them apart.
 */
export function formatBinRange(ctx: FormatContext, min: number, max: number, series = 0): string {
  const tooltip = ctx.config.tooltip;
  if (tooltip?.rangeFormat) return tooltip.rangeFormat(min, max, series);

  const axis = ctx.config.series[series]?.xAxis ?? 'x';
  const format =
    tooltip?.xFormat ?? ((value: number) => formatX(ctx, value, axis, NO_TOOLTIP_FORMAT));
  let formattedMin = format(min);
  let formattedMax = format(max);

  // Coarse axis formatters can collapse two different bin edges to the same
  // label. Preserve an intelligible interval without forcing app code to
  // supply a histogram-only formatter.
  if (min !== max && formattedMin === formattedMax && !tooltip?.xFormat) {
    const width = Math.abs(max - min);
    const decimals = width > 0 ? Math.max(0, Math.min(6, Math.ceil(-Math.log10(width)))) : 0;
    formattedMin = min.toFixed(decimals);
    formattedMax = max.toFixed(decimals);
  }
  return `${formattedMin} \u2013 ${formattedMax}`;
}

// The readout step of each axis, recomputed when its domain or tick options change; read on the
// cursor hot path.
interface ReadoutStep {
  scale: Scale;
  min: number;
  max: number;
  ticks?: number[];
  count?: number;
  decimals: number;
}
const readoutSteps = new WeakMap<FormatContext, Map<string, ReadoutStep>>();

/**
 * The automatic readout of `value` on axis `axis`, at value precision (P9): `formatValue` with
 * the axis' tick-step decimals, never the tick format. A time axis reads through its tick format
 * until M10's time readout; without the axis, `formatValue` alone.
 */
export function axisReadout(ctx: FormatContext, axis: string, value: number): string {
  const scale = ctx.scales.get(axis);
  const locale = ctx.config.locale;
  if (!scale) return formatValue(value, { locale });
  if (scale.type === 'time') {
    const time = scale as Scale & { readoutFormat?: (value: number) => string };
    return time.readoutFormat ? time.readoutFormat(value) : scale.tickFormat(value);
  }
  const spec = ctx.config.axes?.[axis];
  let steps = readoutSteps.get(ctx);
  if (!steps) {
    steps = new Map();
    readoutSteps.set(ctx, steps);
  }
  let step = steps.get(axis);
  if (
    !step ||
    step.scale !== scale ||
    step.min !== scale.min ||
    step.max !== scale.max ||
    step.ticks !== spec?.ticks ||
    step.count !== spec?.tickCount
  ) {
    step = {
      scale,
      min: scale.min,
      max: scale.max,
      ticks: spec?.ticks,
      count: spec?.tickCount,
      decimals: scaleStepDecimals(scale, spec?.ticks, spec?.tickCount),
    };
    steps.set(axis, step);
  }
  return formatValue(value, { stepDecimals: step.decimals, locale });
}

/**
 * A scatter tooltip field's value without a `format`: grouped, integers whole, else up to four
 * decimals; a tiny value keeps four significant digits.
 */
export function formatFieldValue(value: number): string {
  if (value !== value) return '';
  if (!Number.isFinite(value)) return String(value);
  if (value !== 0 && Math.abs(value) < 0.001) return value.toPrecision(4);
  return formatValue(value, { stepDecimals: Number.isInteger(value) ? 0 : 2 });
}
