/**
 * Reading values on a chart's axes from outside (plan D21, §4.4): the public `ChartScale` of an
 * axis, and a cursor X given as a number, a Date, a category label or an ISO date.
 */
import { fail, hint } from '../engine/errors';
import { createScale } from '../engine/scales/createScale';
import type { PointView } from './points';
import { parseIso } from './sources';
import type { ChartScale } from './types';

/** The public view of axis `key` (plan D21): its range, its categories and its pixel mapping. */
export function chartScale<Row>(view: PointView<Row>, key: string): ChartScale | undefined {
  const axis = view.engine.getAxis(key);
  if (!axis) return undefined;
  const registry = view.ingested.categories.get(key);
  const time = axis.type === 'time';
  const { min, max } = axis;
  const mapping = createScale(axis.type, key, min, max);
  mapping.setPixelRange(axis.dataToPixel(min), axis.dataToPixel(max));
  const read = (value: number | Date | string): number => {
    if (typeof value === 'number') return value;
    if (value instanceof Date) return value.getTime();
    if (typeof value !== 'string') return Number.NaN;
    if (registry) return registry.codes.get(value) ?? Number.NaN;
    return time ? parseIso(value, view.normalized.engine.timeZone) : Number.NaN;
  };
  return Object.freeze({
    type: registry ? ('category' as const) : axis.type,
    horizontal: view.engine.isHorizontalAxis(key),
    min,
    max,
    ...(registry ? { categories: Object.freeze(registry.list()) } : {}),
    toPixel: (value: number | Date | string) => mapping.dataToPixel(read(value)),
    fromPixel: (pixel: number) => mapping.pixelToData(pixel),
  });
}

/** A cursor X as the chart reads it: a number, a Date, a category label or an ISO date. */
export function cursorValue<Row>(
  view: PointView<Row>,
  x: number | Date | string | null,
): number | null {
  if (x === null || typeof x === 'number') return x;
  if (x instanceof Date) return x.getTime();
  if (typeof x !== 'string') fail('setCursor() takes a number, a Date, a category label or null.');
  const where = `setCursor() got "${x}"`;
  const registry = view.ingested.categories.get('x');
  if (registry) {
    const code = registry.codes.get(x);
    if (code === undefined)
      fail(`${where}, which is not a category of axis "x".${hint(x, registry.codes.keys())}`);
    return code;
  }
  if (view.ingested.kinds.get('x') === 'date' || view.ingested.spec.axes?.x?.type === 'time') {
    const ms = parseIso(x, view.normalized.engine.timeZone);
    if (Number.isFinite(ms)) return ms;
    fail(`${where}, which is not an ISO-8601 date for time axis "x".`);
  }
  return fail(`${where}, but axis "x" is numeric: give a number.`);
}
