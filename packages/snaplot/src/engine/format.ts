/**
 * Value formatting, seeded in M1 (plan §5.2, P9). Every value readout (the
 * tooltip, the cursor snapshot and so the legend tables) goes through
 * `formatValue`, never through an axis tick formatter, so a readout never
 * loses precision to the tick step. M10 grows this module into the one
 * formatter (`formatTick`, `formatReadout`, `formatX`, axis `format`
 * precedence, locale and time zone).
 */
import { DEFAULT_TICK_COUNT } from '../constants';
import { niceStep, niceTicks } from '../scales/niceNumbers';

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
