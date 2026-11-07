/**
 * The heatmap's public half: its bins and colour options checked (normalize.ts calls
 * `normalizeHeatmap`), and the cell columns its rows fill, one per bin (ingest.ts and
 * describe.ts call `cellColumns`).
 */
import { fail, hint } from '../engine/errors';
import { spansFromCenters, spansFromEdges, spansFromStep } from '../engine/marks/heatmap/cells';
import {
  accessor,
  checkKeys,
  colorOption,
  compileFormat,
  describe,
  isPlain,
  toNumber,
} from './checks';
import type {
  AccessorLike,
  NormalizedBins,
  NormalizedHeatmap,
  NormalizedSeries,
} from './normalized';
import { BINS, COLOR_MAPS, COLOR_SCALE, GRID } from './option-keys';
import { cellValue, read, type SourceState } from './sources';

/** A Date or a finite number, as a number. */
function coordinate(value: unknown, path: string): number {
  return toNumber(value, path);
}

/** The cells along one axis of a heatmap: their spans, positions and whether they are dates. */
function normalizeBins(value: unknown, path: string): NormalizedBins {
  if (!isPlain(value))
    fail(
      `${path} must be { start, step, count }, { centers } or { edges }, not ${describe(value)}.`,
    );
  checkKeys(value, BINS, path);
  const list = (items: unknown, key: string, least: number) => {
    if (
      !items ||
      typeof items !== 'object' ||
      typeof (items as ArrayLike<unknown>).length !== 'number'
    )
      fail(`${path}.${key} must be an array of numbers or Dates.`);
    const array = items as ArrayLike<unknown>;
    if (array.length < least)
      fail(`${path}.${key} needs at least ${least} value${least > 1 ? 's' : ''}.`);
    const out = new Float64Array(array.length);
    let dates = false;
    for (let i = 0; i < array.length; i++) {
      if (array[i] instanceof Date) dates = true;
      out[i] = coordinate(array[i], `${path}.${key}[${i}]`);
      if (i > 0 && !(out[i] > out[i - 1]))
        fail(`${path}.${key} must be strictly increasing; value ${i} is ${out[i]}.`);
    }
    return { out, dates };
  };
  if (value.edges !== undefined) {
    const { out, dates } = list(value.edges, 'edges', 2);
    const { lo, hi } = spansFromEdges(out);
    const mid = lo.map((low, i) => (low + hi[i]) / 2);
    return { lo, hi, mid, dates };
  }
  if (value.centers !== undefined) {
    const { out, dates } = list(value.centers, 'centers', 1);
    const lo = new Float64Array(out.length);
    const hi = new Float64Array(out.length);
    spansFromCenters(out.length, (i) => out[i], lo, hi);
    // A lone centre has no neighbour to take a width from: a cell of 1 unit.
    if (out.length === 1) {
      lo[0] = out[0] - 0.5;
      hi[0] = out[0] + 0.5;
    }
    return { lo, hi, mid: out, dates };
  }
  if (value.start === undefined || value.step === undefined || value.count === undefined)
    fail(`${path} needs start, step and count, or centers, or edges.`);
  const start = coordinate(value.start, `${path}.start`);
  const step = value.step;
  if (typeof step !== 'number' || !Number.isFinite(step) || step <= 0)
    fail(`${path}.step must be a positive number, not ${describe(step)}.`);
  const count = value.count;
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1)
    fail(`${path}.count must be a whole number of at least 1, not ${describe(count)}.`);
  const { lo, hi } = spansFromStep(start, step, count);
  const mid = lo.map((low) => low + step / 2);
  return { lo, hi, mid, dates: value.start instanceof Date };
}

/** A heatmap's own options: its values and bins (or grid), and its colours. */
export function normalizeHeatmap(
  value: Record<string, unknown>,
  path: string,
  name: string,
  grid: boolean,
  locale: string | undefined,
): NormalizedHeatmap {
  const out: NormalizedHeatmap = {
    rows: grid || value.y === undefined ? 'x' : 'y',
    colors: 'sequential',
    clamp: true,
    colorScale: {},
  };
  if (grid) {
    const data = value.data as Record<string, unknown>;
    checkKeys(data, GRID, `${path}.data`);
    const x = normalizeBins(data.x, `${path}.data.x`);
    const y = normalizeBins(data.y, `${path}.data.y`);
    const values = data.values as ArrayLike<number | null>;
    if (!values || typeof values !== 'object' || typeof values.length !== 'number')
      fail(`${path}.data.values must be an array of numbers, one per cell.`);
    const cells = x.lo.length * y.lo.length;
    if (values.length !== cells)
      fail(
        `${name}'s grid has ${values.length} values for ${x.lo.length} × ${y.lo.length} cells: give one value per cell, row by row from the lowest y.`,
      );
    out.grid = { x, y, values };
  } else {
    out.values = accessor(value.values, `${path}.values`);
    out.bins = normalizeBins(value.bins, `${path}.bins`);
  }
  const colors = value.colors;
  if (colors !== undefined) {
    if (typeof colors === 'string') {
      if (!COLOR_MAPS.includes(colors))
        fail(
          `${path}.colors "${colors}" is not a colour map. Use one of: ${COLOR_MAPS.join(', ')}, or an array of colours.${hint(colors, new Set(COLOR_MAPS))}`,
        );
      out.colors = colors as NormalizedHeatmap['colors'];
    } else if (
      Array.isArray(colors) &&
      colors.length > 0 &&
      colors.every((c) => typeof c === 'string')
    ) {
      for (const [i, c] of colors.entries()) colorOption(c, `${path}.colors[${i}]`);
      out.colors = [...colors];
    } else
      fail(`${path}.colors must be 'sequential', 'diverging', 'cyclic' or an array of colours.`);
  }
  if (value.domain !== undefined) {
    const domain = value.domain;
    if (
      !Array.isArray(domain) ||
      domain.length !== 2 ||
      !domain.every((v) => typeof v === 'number' && Number.isFinite(v)) ||
      domain[0] === domain[1]
    )
      fail(
        `${path}.domain must be [low, high]: two different finite numbers, not ${describe(domain)}.`,
      );
    out.domain = [domain[0], domain[1]];
  }
  if (value.clamp !== undefined) {
    if (typeof value.clamp !== 'boolean') fail(`${path}.clamp must be true or false.`);
    out.clamp = value.clamp;
  }
  const empty = colorOption(value.emptyColor, `${path}.emptyColor`);
  if (empty !== undefined) out.emptyColor = empty;
  const scale = value.colorScale;
  if (scale === false) out.colorScale = false;
  else if (isPlain(scale)) {
    checkKeys(scale, COLOR_SCALE, `${path}.colorScale`);
    const options: Exclude<NormalizedHeatmap['colorScale'], false> = {};
    if (scale.title !== undefined) options.title = String(scale.title);
    if (scale.ticks !== undefined) {
      if (!Array.isArray(scale.ticks))
        fail(`${path}.colorScale.ticks must be an array of numbers.`);
      options.ticks = scale.ticks.map((tick, i) =>
        toNumber(tick, `${path}.colorScale.ticks[${i}]`),
      );
    }
    const format = compileFormat(
      scale.format,
      `${path}.colorScale.format`,
      'number',
      locale,
      'local',
    );
    if (format) options.format = format;
    out.colorScale = options;
  } else if (scale !== undefined && scale !== true)
    fail(
      `${path}.colorScale must be true, false or { title, ticks, format }, not ${describe(scale)}.`,
    );
  return out;
}

/**
 * The first of a heatmap's `count` cell columns, one per bin, adding them on first use: bin `b` of
 * each row is element `b` of the array `field` reads (a short or missing array leaves empty cells).
 */
export function cellColumns<Row>(
  state: SourceState<Row>,
  field: AccessorLike,
  s: NormalizedSeries,
  count: number,
): number {
  const existing = state.fields.findIndex(
    (f) => f.kind === 'cell' && f.read === field && f.bin === 0,
  );
  if (
    existing >= 0 &&
    state.fields.length >= existing + count &&
    (count === 1 || (state.fields[existing + count - 1] as { bin?: number }).bin === count - 1)
  )
    return existing;
  const path = `series "${s.id}"`;
  const rows = state.rows!;
  const values = rows.map((row, i) => read(field, row, state.index![i], `${path} values`));
  if (typeof field === 'string' && rows.length > 0 && values.every((v) => v === undefined))
    fail(
      `${path}: no row has a field "${field}" for values.${hint(field, Object.keys((rows.find((row) => row && typeof row === 'object') ?? {}) as object))}`,
    );
  const first = state.columns.length;
  for (let b = 0; b < count; b++) {
    const column = new Float64Array(rows.length);
    for (let i = 0; i < rows.length; i++)
      column[i] = cellValue(values[i], b, `${path}: values of row ${state.index![i]}`);
    state.columns.push(column);
    state.fields.push({ kind: 'cell', read: field, bin: b });
  }
  return first;
}
