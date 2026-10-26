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
 * `'slot'` ticks (bar and histogram X ticks from the data) take the X axis' `format`, else an
 * integer as is and anything else with one decimal.
 */
export function formatTick(
  ctx: FormatContext,
  axis: string,
  value: number,
  kind: 'axis' | 'slot' = 'axis',
): string {
  const format = ctx.config.axes?.[axis]?.format;
  if (format) return format(value);
  if (kind === 'slot') return Number.isInteger(value) ? String(value) : value.toFixed(1);
  const scale = ctx.scales.get(axis);
  return scale ? scale.tickFormat(value) : String(value);
}

/**
 * The readout of `value` for series `series` (an index): `tooltip.yFormat` (the series formats),
 * else its value axis' `format`, else the automatic readout on that axis (`axisReadout`).
 */
export function formatReadout(
  ctx: FormatContext,
  series: number,
  value: number,
  quirks?: FormatQuirks,
): string {
  const yFormat = ctx.config.tooltip?.yFormat;
  if (yFormat && quirks?.tooltipFormat !== false) return yFormat(value, series);
  const axis = ctx.config.series[series]?.yAxis ?? 'y';
  const format = quirks?.axisFormat !== false ? ctx.config.axes?.[axis]?.format : undefined;
  return format ? format(value) : axisReadout(ctx, axis, value);
}

/**
 * The X readout of `value` on axis `axis` (default `'x'`): `tooltip.xFormat`, else the axis
 * `format`, else the scale's tick format (`String(value)` without a scale).
 */
export function formatX(
  ctx: FormatContext,
  value: number,
  axis = 'x',
  quirks?: FormatQuirks,
): string {
  const xFormat = ctx.config.tooltip?.xFormat;
  if (xFormat && quirks?.tooltipFormat !== false) return xFormat(value);
  const format = quirks?.axisFormat !== false ? ctx.config.axes?.[axis]?.format : undefined;
  if (format) return format(value);
  return ctx.scales.get(axis)?.tickFormat(value) ?? String(value);
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
  if (!scale) return formatValue(value);
  if (scale.type === 'time') return scale.tickFormat(value);
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
  return formatValue(value, { stepDecimals: step.decimals });
}

/** A scatter tooltip field's value without a `format`: integers as is, else four significant places. */
export function formatFieldValue(value: number): string {
  if (value !== value) return '';
  if (!Number.isFinite(value)) return String(value);
  if (Number.isInteger(value)) return String(value);
  const abs = Math.abs(value);
  if ((abs !== 0 && abs < 0.001) || abs >= 10_000) return value.toPrecision(4);
  return value.toFixed(4).replace(/\.?0+$/, '');
}
