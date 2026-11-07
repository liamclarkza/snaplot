/**
 * The checks normalize() and the heatmap options share: plain objects, unknown keys, enums,
 * numbers, accessors, colours, dashes and formats. Invalid input throws `snaplot: …`; suspicious
 * input warns once.
 */
import { isCssColor } from '../engine/theme/color';
import { fail, hint, warnOnce } from '../engine/errors';
import { dateFormatter, type NumberFormatSpec, numberFormatter } from '../engine/format';
import { DATE_KEYS, HINTS, type Keys } from './option-keys';
import type { AccessorLike } from './normalized';

export function isPlain(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export const describe = (value: unknown): string =>
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
export function checkKeys(value: Record<string, unknown>, known: Keys, path: string): void {
  for (const [name, item] of Object.entries(value)) {
    if (known.has(name) || item === undefined) continue;
    const full = path ? `${path}.${name}` : name;
    const general = full.replace(/\[\d+\]/g, '.*').replace(/^axes\.[^.]+/, 'axes.*');
    const reason = HINTS[full] ?? HINTS[general] ?? HINTS[name];
    warnOnce(
      'unknown-option',
      `"${full}" is not an option and is ignored.${reason ? ` ${reason}` : hint(name, known)}`,
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

export function warnValue(
  path: string,
  value: unknown,
  allowed: readonly string[],
  fallback: string,
) {
  warnOnce(
    'invalid-option',
    `${path} ${describe(value)} is not valid and is ignored; using ${fallback}. Use one of: ${allowed.join(', ')}.`,
  );
}

export function enumValue<T extends string>(
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

export function toNumber(value: unknown, path: string): number {
  const n = value instanceof Date ? value.getTime() : value;
  if (typeof n !== 'number' || !Number.isFinite(n))
    fail(`${path} must be a finite number or a valid Date, not ${describe(value)}.`);
  return n;
}

export function accessor(value: unknown, path: string): AccessorLike {
  if (typeof value === 'string' || typeof value === 'function') return value as AccessorLike;
  fail(`${path} must be a field name or a function of the row, not ${describe(value)}.`);
}

export function finiteOption(
  value: unknown,
  path: string,
  min = 0,
  max = Infinity,
): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max)
    return value;
  warnOnce(
    'invalid-option',
    `${path} ${describe(value)} is not valid and is ignored; it must be a number from ${min}${max === Infinity ? ' up' : ` to ${max}`}.`,
  );
  return undefined;
}

/** An annotation colour: a string, or a warning (whether a string is a colour is M11's parser). */
export function colorOption(value: unknown, path: string): string | undefined {
  if (value === undefined) return value;
  if (typeof value === 'string') {
    if (!isCssColor(value))
      warnOnce(
        'invalid-option',
        `${path} "${value}" is not a CSS colour; the chart may not paint it.`,
      );
    return value;
  }
  warnOnce(
    'invalid-option',
    `${path} ${describe(value)} is not valid and is ignored; it must be a CSS colour string.`,
  );
  return undefined;
}

export function dashOption(value: unknown, path: string): number[] | undefined {
  if (value === undefined) return undefined;
  if (
    Array.isArray(value) &&
    value.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0)
  )
    return [...value];
  warnOnce('invalid-option', `${path} must be an array of non-negative numbers; it is ignored.`);
  return undefined;
}

export function isDateFormat(value: Record<string, unknown>): boolean {
  return Object.keys(value).some((key) => DATE_KEYS.has(key));
}

/** A `format` option as a function, or `undefined`. */
export function compileFormat(
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
